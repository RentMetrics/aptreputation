import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { accessState, requireActive, requireCommunity, requireResponder } from "./lib/auth";
import { CHECK_EVERY_DAYS, syncAfterCheck } from "./fixPlan";
import type { VisibilityResult } from "./lib/visibility";

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
    const scan = await ctx.db.get(scanId);
    if (!scan || !result) return;
    // The check opens and clears tasks on the property's fix plan.
    await syncAfterCheck(ctx, scan.communityId, JSON.parse(result) as VisibilityResult);
    if (scan.auto) await ctx.scheduler.runAfter(0, internal.notify.checkSummary, { scanId });
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

const DAY = 24 * 60 * MINUTE;
// Automatic checks are spread out: a few properties each day.
const AUTO_PER_DAY = 6;

/** Daily: starts the monthly check for properties that are due. Paid, trial and free accounts only. */
export const monthlyTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Set MONTHLY_CHECKS=off on a test deployment so it does not spend on AI calls by itself.
    if (process.env.MONTHLY_CHECKS === "off") return 0;
    const now = Date.now();
    const communities = await ctx.db.query("communities").collect();
    let started = 0;
    for (const community of communities) {
      if (started >= AUTO_PER_DAY) break;
      const owner = await ctx.db.get(community.ownerId);
      if (!owner || !accessState(owner, now).active) continue;
      const last = await ctx.db
        .query("visibilityScans")
        .withIndex("by_community", (q) => q.eq("communityId", community._id))
        .order("desc")
        .first();
      if (last && now - last.startedAt < CHECK_EVERY_DAYS * DAY) continue;
      const scanId = await ctx.db.insert("visibilityScans", { communityId: community._id, startedBy: community.ownerId, startedAt: now, status: "running", auto: true });
      await ctx.scheduler.runAfter(started * 2 * MINUTE, internal.visibilityScan.run, { scanId });
      started++;
    }
    return started;
  },
});

/** What the monthly summary email needs. */
export const summaryContext = internalQuery({
  args: { scanId: v.id("visibilityScans") },
  handler: async (ctx, { scanId }) => {
    const scan = await ctx.db.get(scanId);
    if (!scan || scan.status !== "done" || !scan.result) return null;
    const community = await ctx.db.get(scan.communityId);
    if (!community) return null;
    const earlier = await ctx.db
      .query("visibilityScans")
      .withIndex("by_community", (q) => q.eq("communityId", scan.communityId).lt("startedAt", scan.startedAt))
      .order("desc")
      .take(5);
    const previous = earlier.find((r) => r.status === "done" && r.result)?.result ?? null;
    const owner = await ctx.db.get(community.ownerId);
    const members = await ctx.db.query("members").withIndex("by_community", (q) => q.eq("communityId", community._id)).collect();
    // The monthly summary goes to the owner and managers who have alerts on.
    const recipients = [
      ...(owner && (community.ownerNotify ?? "all") !== "none" ? [owner.email] : []),
      ...members.filter((m) => m.role === "manager" && m.notify !== "none").map((m) => m.email),
    ].filter(Boolean);
    const open = (await ctx.db.query("fixTasks").withIndex("by_community", (q) => q.eq("communityId", community._id)).collect()).filter((t) => t.status === "open").length;
    return { communityId: community._id, name: community.name, result: scan.result, previous, recipients: [...new Set(recipients)], open };
  },
});
