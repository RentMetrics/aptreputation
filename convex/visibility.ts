import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { requireActive, requireCommunity, requireResponder } from "./lib/auth";

const MINUTE = 60 * 1000;
// A scan makes several AI calls with web search, so each property gets a few a day.
const DAILY_LIMIT = 3;
// The action is given ten minutes; a row still "running" after that has died.
const STALE_AFTER = 12 * MINUTE;

/** The newest AI search check for a property, and the one before it for comparison. */
export const latest = query({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    await requireCommunity(ctx, communityId);
    const rows = await ctx.db
      .query("visibilityScans")
      .withIndex("by_community", (q) => q.eq("communityId", communityId))
      .order("desc")
      .take(10);
    const running = rows.find((r) => r.status === "running" && Date.now() - r.startedAt < STALE_AFTER) ?? null;
    const done = rows.filter((r) => r.status === "done");
    const failed = rows[0]?.status === "failed" ? rows[0] : null;
    return {
      running: running ? { startedAt: running.startedAt } : null,
      failed: failed ? { at: failed.finishedAt ?? failed.startedAt, error: failed.error ?? "The check did not finish." } : null,
      current: done[0] ? { at: done[0].finishedAt ?? done[0].startedAt, result: done[0].result ?? null } : null,
      previous: done[1] ? { at: done[1].finishedAt ?? done[1].startedAt, result: done[1].result ?? null } : null,
    };
  },
});

export const start = mutation({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    const { user, owner } = await requireResponder(ctx, communityId);
    requireActive(owner);
    const now = Date.now();
    const recent = await ctx.db
      .query("visibilityScans")
      .withIndex("by_community", (q) => q.eq("communityId", communityId).gte("startedAt", now - 24 * 60 * MINUTE))
      .collect();
    if (recent.some((r) => r.status === "running" && now - r.startedAt < STALE_AFTER)) {
      throw new ConvexError("A check is already running for this property.");
    }
    if (user.role !== "admin" && recent.filter((r) => r.status !== "failed").length >= DAILY_LIMIT) {
      throw new ConvexError(`This property has had ${DAILY_LIMIT} checks in the last day. Answers change slowly, so try again tomorrow.`);
    }
    const scanId = await ctx.db.insert("visibilityScans", { communityId, startedBy: user._id, startedAt: now, status: "running" });
    await ctx.scheduler.runAfter(0, internal.visibilityScan.run, { scanId });
    return scanId;
  },
});

export const scanContext = internalQuery({
  args: { scanId: v.id("visibilityScans") },
  handler: async (ctx, { scanId }) => {
    const scan = await ctx.db.get(scanId);
    if (!scan) return null;
    const community = await ctx.db.get(scan.communityId);
    return community ? { scan, community } : null;
  },
});

export const finish = internalMutation({
  args: { scanId: v.id("visibilityScans"), result: v.optional(v.string()), error: v.optional(v.string()) },
  handler: async (ctx, { scanId, result, error }) => {
    await ctx.db.patch(scanId, { status: result ? "done" : "failed", finishedAt: Date.now(), result, error });
  },
});

/** Starts a check without a signed-in user: for the command line and scheduled re-checks. */
export const startFor = internalMutation({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    const community = await ctx.db.get(communityId);
    if (!community) throw new ConvexError("Property not found.");
    const scanId = await ctx.db.insert("visibilityScans", { communityId, startedBy: community.ownerId, startedAt: Date.now(), status: "running" });
    await ctx.scheduler.runAfter(0, internal.visibilityScan.run, { scanId });
    return scanId;
  },
});
