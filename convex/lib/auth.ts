import { ConvexError } from "convex/values";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

export const TRIAL_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

export async function getUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const user = await getUser(ctx);
  if (!user) throw new ConvexError("Please sign in.");
  return user;
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw new ConvexError("Admins only.");
  return user;
}

/** The signed-in user must own the community (admins can open any). */
export async function requireCommunity(
  ctx: QueryCtx | MutationCtx,
  communityId: Id<"communities">,
): Promise<{ user: Doc<"users">; community: Doc<"communities"> }> {
  const user = await requireUser(ctx);
  const community = await ctx.db.get(communityId);
  if (!community || (community.ownerId !== user._id && user.role !== "admin")) {
    throw new ConvexError("Property not found.");
  }
  return { user, community };
}

export function accessState(user: Doc<"users">, now: number) {
  const trialEndsAt = user.createdAt + TRIAL_DAYS * DAY;
  const subscribed = user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing";
  const inTrial = now < trialEndsAt;
  return {
    subscribed,
    inTrial,
    trialEndsAt,
    active: user.role === "admin" || subscribed || inTrial,
  };
}

/** Paid features (sync, AI, replies) need a subscription or an unexpired trial. */
export function requireActive(user: Doc<"users">) {
  if (!accessState(user, Date.now()).active) {
    throw new ConvexError("Your free trial has ended. Add a subscription in Billing to continue.");
  }
}

export function randomCode(length = 7): string {
  // No look-alike characters, so codes can be read off a card and typed.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
