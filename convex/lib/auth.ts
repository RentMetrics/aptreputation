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

export type Access = {
  user: Doc<"users">;
  community: Doc<"communities">;
  /** The account that pays for the property; its trial/subscription gates features. */
  owner: Doc<"users">;
  role: "owner" | "manager" | "responder";
};

/** The signed-in user must own the property or be on its team (admins can open any). */
export async function requireCommunity(
  ctx: QueryCtx | MutationCtx,
  communityId: Id<"communities">,
): Promise<Access> {
  const user = await requireUser(ctx);
  const community = await ctx.db.get(communityId);
  if (!community) throw new ConvexError("Property not found.");
  if (community.ownerId === user._id) return { user, community, owner: user, role: "owner" };
  const owner = await ctx.db.get(community.ownerId);
  if (!owner) throw new ConvexError("Property not found.");
  if (user.role === "admin") return { user, community, owner, role: "owner" };
  const memberships = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  const member = memberships.find((m) => m.communityId === communityId);
  if (!member) throw new ConvexError("Property not found.");
  return { user, community, owner, role: member.role };
}

/** Owners and managers only: people, Google connection, removing the property. */
export async function requireManager(ctx: QueryCtx | MutationCtx, communityId: Id<"communities">): Promise<Access> {
  const access = await requireCommunity(ctx, communityId);
  if (access.role === "responder") throw new ConvexError("Only the owner or a manager can change this.");
  return access;
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
    throw new ConvexError("Your free trial has ended. The account owner can add a subscription in Billing to continue.");
  }
}

export function randomCode(length = 7): string {
  // No look-alike characters, so codes can be read off a card and typed.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
