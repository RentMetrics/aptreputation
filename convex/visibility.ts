import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { accessState, requireAdmin, requireCommunity, requireResponder } from "./lib/auth";
import { CHECK_EVERY_DAYS, syncAfterCheck } from "./fixPlan";
import { summaryOf, type AiSummary, type VisibilityResult } from "./lib/visibility";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
// The action is given ten minutes; a row still "running" after that has died.
const STALE_AFTER = 12 * MINUTE;
/** On top of the automatic monthly check, a paying property can be checked again this many times a month. */
export const RECHECKS_PER_MONTH = 2;
// Automatic checks are spread out: a few properties each day.
const AUTO_PER_DAY = 6;
// A report run for a prospect stays on its public score page this long.
const REPORT_FRESH_DAYS = 45;

const counts = (row: Doc<"visibilityScans">) => row.status !== "failed";

async function scansOf(ctx: QueryCtx | MutationCtx, communityId: Id<"communities">, since: number) {
  return await ctx.db
    .query("visibilityScans")
    .withIndex("by_community", (q) => q.eq("communityId", communityId).gte("startedAt", since))
    .collect();
}

/**
 * Whether this person may start a check on this property now. Each check costs
 * real money across three AI services, so:
 *  - admins and free accounts: no limit;
 *  - subscribers: the automatic monthly check plus a few re-checks a month per property;
 *  - free trial: one check in all, on one property.
 */
async function allowance(ctx: QueryCtx | MutationCtx, user: Doc<"users">, owner: Doc<"users">, communityId: Id<"communities">) {
  const now = Date.now();
  const state = accessState(owner, now);
  if (!state.active) return { allowed: false, reason: "Your free trial has ended. The account owner can add a subscription in Billing to continue." };
  const recent = await scansOf(ctx, communityId, now - 30 * DAY);
  if (recent.some((r) => r.status === "running" && now - r.startedAt < STALE_AFTER)) {
    return { allowed: false, reason: "A check is already running for this property." };
  }
  if (user.role === "admin" || owner.role === "admin" || state.free) return { allowed: true, reason: null };
  if (state.subscribed) {
    const used = recent.filter((r) => counts(r) && !r.auto).length;
    return used < RECHECKS_PER_MONTH
      ? { allowed: true, reason: `${RECHECKS_PER_MONTH - used} of ${RECHECKS_PER_MONTH} re-checks left this month, on top of the automatic monthly check.` }
      : { allowed: false, reason: `This property has used its ${RECHECKS_PER_MONTH} re-checks for this month. The automatic monthly check still runs.` };
  }
  // Free trial: one check, on one property.
  const owned = await ctx.db.query("communities").withIndex("by_owner", (q) => q.eq("ownerId", owner._id)).collect();
  for (const c of owned) {
    if ((await scansOf(ctx, c._id, 0)).some(counts)) {
      return { allowed: false, reason: "The free trial includes one AI search check on one property. Subscribe to check every property each month." };
    }
  }
  return { allowed: true, reason: "The free trial includes one AI search check." };
}

/** The newest AI search check for a property, and the one before it for comparison. */
export const latest = query({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    const { user, owner } = await requireCommunity(ctx, communityId);
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
      allowance: await allowance(ctx, user, owner, communityId),
    };
  },
});

export const start = mutation({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    const { user, owner } = await requireResponder(ctx, communityId);
    const may = await allowance(ctx, user, owner, communityId);
    if (!may.allowed) throw new ConvexError(may.reason ?? "A check cannot be started right now.");
    const scanId = await ctx.db.insert("visibilityScans", { communityId, startedBy: user._id, startedAt: Date.now(), status: "running" });
    await ctx.scheduler.runAfter(0, internal.visibilityScan.run, { scanId });
    return scanId;
  },
});

/** What the check needs to know about its target: a customer's property, or any Google listing for an admin report. */
export const scanContext = internalQuery({
  args: { scanId: v.id("visibilityScans") },
  handler: async (ctx, { scanId }) => {
    const scan = await ctx.db.get(scanId);
    if (!scan) return null;
    if (scan.communityId) {
      const c = await ctx.db.get(scan.communityId);
      return c ? { name: c.name, address: c.address, placeId: c.googlePlaceId, rating: c.googleRating ?? null, totalReviews: c.totalReviews ?? 0 } : null;
    }
    if (!scan.placeId || !scan.target) return null;
    return { name: scan.target.name, address: scan.target.address, placeId: scan.placeId, rating: scan.target.rating ?? null, totalReviews: scan.target.totalReviews ?? 0 };
  },
});

export const finish = internalMutation({
  args: { scanId: v.id("visibilityScans"), result: v.optional(v.string()), error: v.optional(v.string()) },
  handler: async (ctx, { scanId, result, error }) => {
    await ctx.db.patch(scanId, { status: result ? "done" : "failed", finishedAt: Date.now(), result, error });
    const scan = await ctx.db.get(scanId);
    if (!scan || !result || !scan.communityId) return;
    // The check opens and clears tasks on the property's fix plan.
    await syncAfterCheck(ctx, scan.communityId, JSON.parse(result) as VisibilityResult);
    if (scan.auto) await ctx.scheduler.runAfter(0, internal.notify.checkSummary, { scanId });
  },
});

/** Starts a check without a signed-in user: for the command line. */
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

/** Daily: starts the monthly check for properties that are due. */
export const monthlyTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Set MONTHLY_CHECKS=off on a test deployment so it does not spend on AI calls by itself.
    if (process.env.MONTHLY_CHECKS === "off") return 0;
    const now = Date.now();
    const communities = await ctx.db.query("communities").collect();
    // A trial account's one check is given to one property, the first one found.
    const trialUsed = new Set<Id<"users">>();
    let started = 0;
    for (const community of communities) {
      if (started >= AUTO_PER_DAY) break;
      const owner = await ctx.db.get(community.ownerId);
      if (!owner) continue;
      const state = accessState(owner, now);
      if (!state.active) continue;
      const last = await ctx.db
        .query("visibilityScans")
        .withIndex("by_community", (q) => q.eq("communityId", community._id))
        .order("desc")
        .first();
      if (last && now - last.startedAt < CHECK_EVERY_DAYS * DAY) continue;
      const paying = owner.role === "admin" || state.free || state.subscribed;
      if (!paying) {
        if (trialUsed.has(owner._id)) continue;
        const owned = await ctx.db.query("communities").withIndex("by_owner", (q) => q.eq("ownerId", owner._id)).collect();
        let used = false;
        for (const c of owned) used = used || (await scansOf(ctx, c._id, 0)).some(counts);
        trialUsed.add(owner._id);
        if (used) continue;
      }
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
    if (!scan || scan.status !== "done" || !scan.result || !scan.communityId) return null;
    const communityId = scan.communityId;
    const community = await ctx.db.get(communityId);
    if (!community) return null;
    const earlier = await ctx.db
      .query("visibilityScans")
      .withIndex("by_community", (q) => q.eq("communityId", communityId).lt("startedAt", scan.startedAt))
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

// ---- reports for prospects ---------------------------------------------------

const parseV2 = (json: string | undefined): VisibilityResult | null => {
  if (!json) return null;
  try {
    const r = JSON.parse(json) as VisibilityResult;
    return r.v === 2 ? r : null;
  } catch {
    return null;
  }
};

async function reportRows(ctx: QueryCtx | MutationCtx, placeId: string) {
  // Reports are the rows with no property attached; a customer's own checks stay private to them.
  return (await ctx.db.query("visibilityScans").withIndex("by_place", (q) => q.eq("placeId", placeId)).order("desc").take(10)).filter((r) => !r.communityId);
}

/** Admin: run the AI search check on any Google listing, to add to the AptRep Score report sent to a prospect. */
export const startReport = mutation({
  args: { placeId: v.string(), name: v.string(), address: v.string(), rating: v.optional(v.number()), totalReviews: v.optional(v.number()) },
  handler: async (ctx, { placeId, name, address, rating, totalReviews }) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    if ((await reportRows(ctx, placeId)).some((r) => r.status === "running" && now - r.startedAt < STALE_AFTER)) {
      throw new ConvexError("A report is already running for this property.");
    }
    const scanId = await ctx.db.insert("visibilityScans", {
      placeId,
      target: { name: name.slice(0, 200), address: address.slice(0, 300), rating, totalReviews },
      startedBy: admin._id,
      startedAt: now,
      status: "running",
    });
    await ctx.scheduler.runAfter(0, internal.visibilityScan.run, { scanId });
    return scanId;
  },
});

/** Admin: where the report for a listing stands. */
export const reportStatus = query({
  args: { placeId: v.string() },
  handler: async (ctx, { placeId }) => {
    await requireAdmin(ctx);
    const rows = await reportRows(ctx, placeId);
    const now = Date.now();
    const done = rows.find((r) => r.status === "done" && parseV2(r.result));
    return {
      running: rows.some((r) => r.status === "running" && now - r.startedAt < STALE_AFTER),
      failed: rows[0]?.status === "failed" ? rows[0].error ?? "The report did not finish." : null,
      doneAt: done ? done.finishedAt ?? done.startedAt : null,
    };
  },
});

/** The AI search part of a public score report, when an admin has run one recently for this listing. */
export const publicSummary = internalQuery({
  args: { placeId: v.string() },
  handler: async (ctx, { placeId }): Promise<AiSummary | null> => {
    for (const row of await reportRows(ctx, placeId)) {
      if (row.status !== "done") continue;
      const at = row.finishedAt ?? row.startedAt;
      if (Date.now() - at > REPORT_FRESH_DAYS * DAY) return null;
      const result = parseV2(row.result);
      if (result) return summaryOf(result, at);
    }
    return null;
  },
});
