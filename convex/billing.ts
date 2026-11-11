import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";

export const PRICE_PER_PROPERTY_CENTS = 9900;

async function stripe(path: string, params?: Record<string, string>, method = "POST") {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new ConvexError("Billing is not configured (STRIPE_SECRET_KEY).");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new ConvexError(`Stripe: ${data?.error?.message ?? res.status}`);
  return data;
}

function appUrl() {
  const url = process.env.APP_URL;
  if (!url) throw new ConvexError("APP_URL is not configured.");
  return url;
}

export const propertyCount = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) =>
    (await ctx.db.query("communities").withIndex("by_owner", (q) => q.eq("ownerId", userId)).collect()).length,
});

export const setCustomer = internalMutation({
  args: { userId: v.id("users"), stripeCustomerId: v.string() },
  handler: async (ctx, { userId, stripeCustomerId }) => {
    await ctx.db.patch(userId, { stripeCustomerId });
  },
});

/** Stripe Checkout for $99 per property per month. The price is set here, never by the browser. */
export const createCheckout = action({
  args: {},
  handler: async (ctx): Promise<string> => {
    const user = await ctx.runQuery(internal.users.current, {});
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe("customers", {
        email: user.email,
        name: user.name,
        "metadata[userId]": user._id,
      });
      customerId = customer.id as string;
      await ctx.runMutation(internal.billing.setCustomer, { userId: user._id, stripeCustomerId: customerId });
    }
    const quantity = Math.max(1, await ctx.runQuery(internal.billing.propertyCount, { userId: user._id }));
    const params: Record<string, string> = {
      mode: "subscription",
      customer: customerId,
      "line_items[0][quantity]": String(quantity),
      success_url: `${appUrl()}/dashboard/billing?checkout=success`,
      cancel_url: `${appUrl()}/dashboard/billing`,
      "subscription_data[metadata][userId]": user._id,
    };
    const priceId = process.env.STRIPE_PRICE_ID;
    if (priceId) {
      params["line_items[0][price]"] = priceId;
    } else {
      params["line_items[0][price_data][currency]"] = "usd";
      params["line_items[0][price_data][unit_amount]"] = String(PRICE_PER_PROPERTY_CENTS);
      params["line_items[0][price_data][recurring][interval]"] = "month";
      params["line_items[0][price_data][product_data][name]"] = "AptReputation – per property";
    }
    const session = await stripe("checkout/sessions", params);
    return session.url as string;
  },
});

export const createPortal = action({
  args: {},
  handler: async (ctx): Promise<string> => {
    const user = await ctx.runQuery(internal.users.current, {});
    if (!user.stripeCustomerId) throw new ConvexError("No billing account yet. Start a subscription first.");
    const session = await stripe("billing_portal/sessions", {
      customer: user.stripeCustomerId,
      return_url: `${appUrl()}/dashboard/billing`,
    });
    return session.url as string;
  },
});

/** Called by the Stripe webhook after its signature is verified. */
export const applySubscription = internalMutation({
  args: { stripeCustomerId: v.string(), subscriptionId: v.string(), status: v.string() },
  handler: async (ctx, { stripeCustomerId, subscriptionId, status }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_stripe_customer", (q) => q.eq("stripeCustomerId", stripeCustomerId))
      .unique();
    if (!user) return;
    // Ignore events for an old subscription once a newer one is active.
    if (user.subscriptionId && user.subscriptionId !== subscriptionId && status === "canceled") return;
    await ctx.db.patch(user._id, { subscriptionId, subscriptionStatus: status });
  },
});

/** Keep the billed quantity equal to the number of properties. */
export const syncQuantity = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<null> => {
    const user = await ctx.runQuery(internal.users.byId, { userId });
    if (!user?.subscriptionId || !["active", "trialing", "past_due"].includes(user.subscriptionStatus ?? "")) return null;
    const quantity = Math.max(1, await ctx.runQuery(internal.billing.propertyCount, { userId }));
    try {
      const sub = await stripe(`subscriptions/${user.subscriptionId}`, undefined, "GET");
      const item = sub.items?.data?.[0];
      if (item && item.quantity !== quantity) {
        await stripe(`subscription_items/${item.id}`, { quantity: String(quantity) });
      }
    } catch (e) {
      console.error("Could not update subscription quantity", e);
    }
    return null;
  },
});
