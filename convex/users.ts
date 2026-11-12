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
    let existing = await getUser(ctx);
    // Sign-in moved to a new Clerk instance (Nov 2026). An account created on the
    // old one is picked up by its verified email, so its properties, trial and
    // subscription carry over instead of being orphaned behind a duplicate.
    const issuer = process.env.CLERK_JWT_ISSUER_DOMAIN ?? "";
    if (!existing && email && identity.emailVerified && issuer) {
      const legacy = (await ctx.db.query("users").collect()).find(
        (u) => u.email.toLowerCase() === email.toLowerCase() && !u.tokenIdentifier.startsWith(issuer),
      );
      if (legacy) {
        await ctx.db.patch(legacy._id, { tokenIdentifier: identity.tokenIdentifier });
        existing = { ...legacy, tokenIdentifier: identity.tokenIdentifier };
      }
    }
    let userId = existing?._id;
    if (existing) {
      if (existing.role !== role || existing.email !== email) {
        await ctx.db.patch(existing._id, { role, email });
      }
    } else {
      userId = await ctx.db.insert("users", {
        tokenIdentifier: identity.tokenIdentifier,
        email,
        name: identity.name ?? email,
        role,
        createdAt: Date.now(),
      });
    }
    // Accept any property invitations sent to this (verified) email address.
    if (email && identity.emailVerified) {
      const invites = await ctx.db
        .query("members")
        .withIndex("by_email", (q) => q.eq("email", email.toLowerCase()))
        .collect();
      for (const invite of invites) {
        if (!invite.userId) await ctx.db.patch(invite._id, { userId });
      }
    }
    return userId;
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
