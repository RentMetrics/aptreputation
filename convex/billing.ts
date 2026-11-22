import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { accessState } from "./lib/auth";

import { LIST_PRICE, PROMO, promoActive } from "./lib/promo";

export const PRICE_PER_PROPERTY_CENTS = LIST_PRICE * 100;

/** The sign-up offer as a Stripe coupon, created the first time it is needed. */
async function promoCoupon(): Promise<string> {
  try {
    await stripe(`coupons/${PROMO.couponId}`, undefined, "GET");
  } catch {
    await stripe("coupons", {
      id: PROMO.couponId,
      name: `${PROMO.name}: $${PROMO.price} per property`,
      percent_off: PROMO.percentOff,
      duration: "repeating",
      duration_in_months: String(PROMO.months),
    });
  }
  return PROMO.couponId;
}

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
    // The offer applies to a first subscription only, not to someone coming back after cancelling.
    if (promoActive(Date.now()) && !user.subscriptionId) params["discounts[0][coupon]"] = await promoCoupon();
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

// ---- admin revenue -----------------------------------------------------------

type StripeList<T> = { data: T[]; has_more: boolean };

/** Every page of a Stripe list, up to a safe limit. */
async function stripeAll<T extends { id: string }>(path: string, params: Record<string, string>, max = 2000): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  while (out.length < max) {
    const q = new URLSearchParams({ limit: "100", ...params, ...(after ? { starting_after: after } : {}) });
    const page = (await stripe(`${path}?${q}`, undefined, "GET")) as StripeList<T>;
    out.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    after = page.data[page.data.length - 1].id;
  }
  return out;
}

export const revenueAccounts = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const communities = await ctx.db.query("communities").collect();
    const now = Date.now();
    return users.map((u) => {
      const a = accessState(u, now);
      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        stripeCustomerId: u.stripeCustomerId ?? null,
        subscriptionStatus: u.subscriptionStatus ?? null,
        free: a.free,
        inTrial: a.inTrial,
        trialEndsAt: a.trialEndsAt,
        properties: communities.filter((c) => c.ownerId === u._id).length,
      };
    });
  },
});

export type RevenueReport = {
  stripeError: string | null;
  mrr: number;
  payingAccounts: number;
  payingProperties: number;
  collectedThisMonth: number;
  collectedAllTime: number;
  accounts: {
    _id: string;
    name: string;
    email: string;
    plan: string;
    properties: number;
    monthly: number | null;
    discounted: boolean;
    nextBill: number | null;
    paidToDate: number;
    lastPaid: number | null;
  }[];
};

/** Admin: who the clients are, what each pays, and what the business has collected. Read live from Stripe. */
export const revenue = action({
  args: {},
  handler: async (ctx): Promise<RevenueReport> => {
    const me = await ctx.runQuery(internal.users.current, {});
    if (me.role !== "admin") throw new ConvexError("Admins only.");
    const accounts = await ctx.runQuery(internal.billing.revenueAccounts, {});

    type Sub = {
      id: string;
      customer: string;
      status: string;
      discount?: unknown;
      discounts?: unknown[];
      current_period_end?: number;
      items: { data: { quantity?: number; current_period_end?: number; price: { unit_amount: number | null } }[] };
      latest_invoice?: { total?: number; amount_paid?: number } | string | null;
    };
    type Invoice = { id: string; customer: string; amount_paid: number; created: number; status: string };
    let subs: Sub[] = [];
    let invoices: Invoice[] = [];
    let stripeError: string | null = null;
    try {
      subs = await stripeAll<Sub>("subscriptions", { status: "all", "expand[]": "data.latest_invoice" });
      invoices = await stripeAll<Invoice>("invoices", { status: "paid" });
    } catch (e) {
      stripeError = e instanceof Error ? e.message : "Stripe could not be read.";
    }

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const live = ["active", "trialing", "past_due"];
    const byCustomer = new Map<string, Sub>();
    for (const s of subs) {
      // The customer's most relevant subscription: a live one beats an ended one.
      const prev = byCustomer.get(s.customer);
      if (!prev || (live.includes(s.status) && !live.includes(prev.status))) byCustomer.set(s.customer, s);
    }

    const rows = accounts.map((a) => {
      const sub = a.stripeCustomerId ? byCustomer.get(a.stripeCustomerId) : undefined;
      const paid = a.stripeCustomerId ? invoices.filter((i) => i.customer === a.stripeCustomerId) : [];
      const list = sub ? sub.items.data.reduce((n, it) => n + (it.price.unit_amount ?? 0) * (it.quantity ?? 1), 0) : 0;
      const invoice = sub && typeof sub.latest_invoice === "object" && sub.latest_invoice ? sub.latest_invoice : null;
      const discounted = !!sub && (!!sub.discount || (sub.discounts?.length ?? 0) > 0);
      // The last invoice's total reflects any discount; while trialing it is $0, so the list price is shown.
      const monthly =
        sub && live.includes(sub.status)
          ? (sub.status !== "trialing" && invoice?.total !== undefined ? invoice.total : list) / 100
          : null;
      const plan =
        a.role === "admin" ? "Admin"
        : a.free ? "Free account"
        : sub ? (sub.status === "active" ? "Paying" : sub.status === "trialing" ? "Paid trial" : sub.status === "past_due" ? "Past due" : `Ended (${sub.status})`)
        : a.inTrial ? "Free trial"
        : "Trial ended";
      return {
        _id: a._id as string,
        name: a.name,
        email: a.email,
        plan,
        properties: a.properties,
        monthly,
        discounted,
        nextBill: sub && live.includes(sub.status) ? (sub.current_period_end ?? sub.items.data[0]?.current_period_end ?? null) : null,
        paidToDate: paid.reduce((n, i) => n + i.amount_paid, 0) / 100,
        lastPaid: paid.length ? Math.max(...paid.map((i) => i.created)) * 1000 : null,
      };
    });

    const paying = rows.filter((r) => r.plan === "Paying" || r.plan === "Past due");
    return {
      stripeError,
      mrr: paying.reduce((n, r) => n + (r.monthly ?? 0), 0),
      payingAccounts: paying.length,
      payingProperties: paying.reduce((n, r) => n + r.properties, 0),
      collectedThisMonth: invoices.filter((i) => i.created * 1000 >= monthStart.getTime()).reduce((n, i) => n + i.amount_paid, 0) / 100,
      collectedAllTime: invoices.reduce((n, i) => n + i.amount_paid, 0) / 100,
      accounts: rows.sort((x, y) => (y.monthly ?? -1) - (x.monthly ?? -1) || y.paidToDate - x.paidToDate),
    };
  },
});
