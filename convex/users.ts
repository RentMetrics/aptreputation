import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { accessState, getUser, requireUser } from "./lib/auth";

function isAdminEmail(email: string) {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** Called once after sign-in: creates the user row on first visit. */
export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const email = identity.email ?? "";
    // Only a verified email can grant the admin role.
    const role = email && identity.emailVerified && isAdminEmail(email) ? "admin" : "customer";
    const existing = await getUser(ctx);
    if (existing) {
      if (existing.role !== role || existing.email !== email) {
        await ctx.db.patch(existing._id, { role, email });
      }
      return existing._id;
    }
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      email,
      name: identity.name ?? email,
      role,
      createdAt: Date.now(),
    });
  },
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getUser(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      subscriptionStatus: user.subscriptionStatus ?? null,
      ...accessState(user, Date.now()),
    };
  },
});

export const current = internalQuery({
  args: {},
  handler: async (ctx) => await requireUser(ctx),
});

export const byId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => await ctx.db.get(userId),
});
