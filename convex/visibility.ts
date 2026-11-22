import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { accessState, requireAdmin, requireCommunity, requireResponder } from "./lib/auth";
import { CHECK_EVERY_DAYS, syncAfterCheck } from "./fixPlan";
import { summaryOf, type AiSummary, type VisibilityResult } from "./lib/visibility";
import { activityFor, outcomesFor } from "./results";

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
    const { user, owner, community } = await requireCommunity(ctx, communityId);
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
      sinceJoining: (() => {
        const now = done[0] ? parseV2(done[0].result) : null;
        return now ? aiSinceJoining(community.aiBaseline, now.assistants) : null;
      })(),
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
      return c ? { name: c.name, address: c.address, placeId: c.googlePlaceId, rating: c.googleRating ?? null, totalReviews: c.totalReviews ?? 0, factPhone: c.facts?.phone ?? null } : null;
    }
    if (!scan.placeId || !scan.target) return null;
    return { name: scan.target.name, address: scan.target.address, placeId: scan.placeId, rating: scan.target.rating ?? null, totalReviews: scan.target.totalReviews ?? 0, factPhone: null };
  },
});

export const finish = internalMutation({
  args: { scanId: v.id("visibilityScans"), result: v.optional(v.string()), error: v.optional(v.string()) },
  handler: async (ctx, { scanId, result, error }) => {
    await ctx.db.patch(scanId, { status: result ? "done" : "failed", finishedAt: Date.now(), result, error });
    const scan = await ctx.db.get(scanId);
    // Visitors who asked for this report get it by email, or a note that it did not finish.
    if (scan?.notifyEmails?.length) await ctx.scheduler.runAfter(0, internal.notify.aiReportReady, { scanId });
    if (!scan || !result || !scan.communityId) return;
    await recordAiBaseline(ctx, scan.communityId, JSON.parse(result) as VisibilityResult, scan.finishedAt ?? Date.now());
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
    const current = parseV2(scan.result);
    const sinceJoining = current ? aiSinceJoining(community.aiBaseline, current.assistants) : null;
    return {
      communityId: community._id,
      name: community.name,
      result: scan.result,
      previous,
      recipients: [...new Set(recipients)],
      open,
      sinceJoining,
      joined: community.createdAt,
      month: await activityFor(ctx, community, Math.max(community.createdAt, Date.now() - 30 * DAY)),
      outcomes: await outcomesFor(ctx, community),
    };
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

/**
 * Runs the first AI search check as soon as a property is added, so a new
 * account sees it in minutes instead of waiting for the daily run. It counts as
 * the property's monthly check, and as a trial's one check.
 */
export const firstCheck = internalMutation({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    if (process.env.MONTHLY_CHECKS === "off") return null;
    const community = await ctx.db.get(communityId);
    if (!community) return null;
    const owner = await ctx.db.get(community.ownerId);
    if (!owner) return null;
    const state = accessState(owner, Date.now());
    if (!state.active) return null;
    if ((await scansOf(ctx, communityId, 0)).length) return null;
    const paying = owner.role === "admin" || state.free || state.subscribed;
    if (!paying) {
      const owned = await ctx.db.query("communities").withIndex("by_owner", (q) => q.eq("ownerId", owner._id)).collect();
      for (const c of owned) if ((await scansOf(ctx, c._id, 0)).some(counts)) return null;
    }
    const scanId = await ctx.db.insert("visibilityScans", { communityId, startedBy: owner._id, startedAt: Date.now(), status: "running", auto: true });
    // A minute's head start lets the review import finish first.
    await ctx.scheduler.runAfter(60 * 1000, internal.visibilityScan.run, { scanId });
    return scanId;
  },
});

// ---- reports visitors ask for -------------------------------------------------

/** Free AI search reports a day across all visitors, to bound what they cost. */
const PUBLIC_REPORTS_PER_DAY = () => Math.max(0, Number(process.env.AI_REPORTS_PER_DAY ?? 20) || 0);
const PER_EMAIL_PER_DAY = 2;

/**
 * A visitor on the score page asks for the AI search report for a property they
 * just scored. The property must have been scored on the public page, so its
 * name and address come from that result, not from the browser.
 */
export const requestReport = mutation({
  args: { placeId: v.string(), email: v.string() },
  handler: async (ctx, { placeId, email }) => {
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean) || clean.length > 200) throw new ConvexError("Enter a valid email address.");
    const cached = await ctx.db.query("auditCache").withIndex("by_place", (q) => q.eq("placeId", placeId)).unique();
    if (!cached) throw new ConvexError("Check the property's score first, then ask for its AI search report.");
    const audit = JSON.parse(cached.result) as { name: string; address: string; rating: number | null; totalReviews: number; score: number | null };
    const now = Date.now();

    const recent = await ctx.db.query("leads").withIndex("by_created", (q) => q.gte("createdAt", now - DAY)).collect();
    if (recent.filter((l) => l.aiReport && l.email === clean).length >= PER_EMAIL_PER_DAY) {
      throw new ConvexError("You've asked for two reports today. Please try again tomorrow.");
    }
    await ctx.db.insert("leads", {
      email: clean,
      propertyName: audit.name.slice(0, 200),
      address: audit.address,
      placeId,
      rating: audit.rating ?? undefined,
      totalReviews: audit.totalReviews,
      score: audit.score ?? undefined,
      aiReport: true,
      createdAt: now,
    });

    const rows = await reportRows(ctx, placeId);
    // A recent report is reused: the visitor gets it by email straight away.
    const fresh = rows.find((r) => r.status === "done" && now - (r.finishedAt ?? r.startedAt) < REPORT_FRESH_DAYS * DAY && parseV2(r.result));
    if (fresh) {
      await ctx.db.patch(fresh._id, { notifyEmails: [...new Set([...(fresh.notifyEmails ?? []), clean])] });
      await ctx.scheduler.runAfter(0, internal.notify.aiReportReady, { scanId: fresh._id, only: clean });
      return { state: "ready" as const };
    }
    const running = rows.find((r) => r.status === "running" && now - r.startedAt < STALE_AFTER);
    if (running) {
      await ctx.db.patch(running._id, { notifyEmails: [...new Set([...(running.notifyEmails ?? []), clean])] });
      return { state: "running" as const };
    }

    const key = `aireport:${new Date(now).toISOString().slice(0, 10)}`;
    const usage = await ctx.db.query("usage").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if ((usage?.count ?? 0) >= PUBLIC_REPORTS_PER_DAY()) {
      throw new ConvexError("Today's free AI search reports have all been used. We've noted your request; please try again tomorrow.");
    }
    if (usage) await ctx.db.patch(usage._id, { count: usage.count + 1 });
    else await ctx.db.insert("usage", { key, count: 1 });

    const scanId = await ctx.db.insert("visibilityScans", {
      placeId,
      target: { name: audit.name.slice(0, 200), address: audit.address.slice(0, 300), rating: audit.rating ?? undefined, totalReviews: audit.totalReviews },
      notifyEmails: [clean],
      startedAt: now,
      status: "running",
    });
    await ctx.scheduler.runAfter(0, internal.visibilityScan.run, { scanId });
    return { state: "started" as const };
  },
});

/** Public: whether a report for this listing is running or ready, so the score page can show it when it lands. */
export const publicReportStatus = query({
  args: { placeId: v.string() },
  handler: async (ctx, { placeId }) => {
    const rows = await reportRows(ctx, placeId);
    const now = Date.now();
    const done = rows.find((r) => r.status === "done" && now - (r.finishedAt ?? r.startedAt) < REPORT_FRESH_DAYS * DAY);
    return {
      running: rows.some((r) => r.status === "running" && now - r.startedAt < STALE_AFTER),
      doneAt: done ? done.finishedAt ?? done.startedAt : null,
      failed: rows[0]?.status === "failed",
    };
  },
});

/** What the report email needs. */
export const reportEmailContext = internalQuery({
  args: { scanId: v.id("visibilityScans") },
  handler: async (ctx, { scanId }) => {
    const scan = await ctx.db.get(scanId);
    if (!scan || scan.communityId || !scan.target) return null;
    const result = scan.status === "done" ? parseV2(scan.result) : null;
    return {
      name: scan.target.name,
      address: scan.target.address,
      rating: scan.target.rating ?? null,
      totalReviews: scan.target.totalReviews ?? 0,
      status: scan.status,
      summary: result ? summaryOf(result, scan.finishedAt ?? scan.startedAt) : null,
      recipients: scan.notifyEmails ?? [],
    };
  },
});

/** For the admin batch: start the AI search report for a listing, or reuse one from the last 45 days. */
export const startOrReuseReport = internalMutation({
  args: { placeId: v.string(), name: v.string(), address: v.string(), rating: v.optional(v.number()), totalReviews: v.optional(v.number()), startedBy: v.id("users") },
  handler: async (ctx, { placeId, name, address, rating, totalReviews, startedBy }) => {
    const now = Date.now();
    const rows = await reportRows(ctx, placeId);
    const reuse = rows.find(
      (r) => (r.status === "running" && now - r.startedAt < STALE_AFTER) || (r.status === "done" && now - (r.finishedAt ?? r.startedAt) < REPORT_FRESH_DAYS * DAY && parseV2(r.result)),
    );
    if (reuse) return { scanId: reuse._id, reused: true };
    const scanId = await ctx.db.insert("visibilityScans", {
      placeId,
      target: { name: name.slice(0, 200), address: address.slice(0, 300), rating, totalReviews },
      startedBy,
      startedAt: now,
      status: "running",
    });
    await ctx.scheduler.runAfter(0, internal.visibilityScan.run, { scanId });
    return { scanId, reused: false };
  },
});

/** For the admin batch: where a listing's report stands, with its summary when done. */
export async function reportState(ctx: QueryCtx | MutationCtx, placeId: string) {
  const rows = await reportRows(ctx, placeId);
  const now = Date.now();
  const done = rows.find((r) => r.status === "done" && parseV2(r.result));
  if (rows[0]?.status === "running" && now - rows[0].startedAt < STALE_AFTER) return { state: "running" as const, ai: null };
  if (done) return { state: "done" as const, ai: summaryOf(parseV2(done.result)!, done.finishedAt ?? done.startedAt) };
  return { state: "failed" as const, ai: null, error: rows[0]?.error ?? "The report did not finish." };
}

// ---- the starting point ------------------------------------------------------

/**
 * Locks in each assistant's count the first time it answers for a property.
 * Later checks never change it, so progress is always measured from sign-up.
 */
async function recordAiBaseline(ctx: MutationCtx, communityId: Id<"communities">, result: VisibilityResult, at: number) {
  const community = await ctx.db.get(communityId);
  if (!community) return;
  const have = community.aiBaseline?.assistants ?? [];
  const add = result.assistants.filter((a) => a.outOf > 0 && !have.some((h) => h.key === a.key)).map((a) => ({ key: a.key, label: a.label, shown: a.shown, outOf: a.outOf, at }));
  if (add.length === 0) return;
  await ctx.db.patch(communityId, { aiBaseline: { at: community.aiBaseline?.at ?? at, assistants: [...have, ...add] } });
}

/** One-time: sets starting points for properties added before they were recorded, from their earliest saved check. */
export const backfillBaselines = internalMutation({
  args: {},
  handler: async (ctx) => {
    let ai = 0;
    let scores = 0;
    for (const c of await ctx.db.query("communities").collect()) {
      if (!c.aiBaseline) {
        const rows = await ctx.db.query("visibilityScans").withIndex("by_community", (q) => q.eq("communityId", c._id)).order("asc").collect();
        for (const r of rows) {
          const result = r.status === "done" ? parseV2(r.result) : null;
          if (result) await recordAiBaseline(ctx, c._id, result, r.finishedAt ?? r.startedAt);
        }
        if ((await ctx.db.get(c._id))?.aiBaseline) ai++;
      }
      if (c.baselineScore === undefined) {
        await ctx.scheduler.runAfter(scores * 3000, internal.audit.scoreProperty, { communityId: c._id });
        scores++;
      }
    }
    return { ai, scores };
  },
});

/** Change since joining for the AI count, over the assistants measured both then and now. */
export function aiSinceJoining(
  baseline: { at: number; assistants: { key: string; label: string; shown: number; outOf: number }[] } | undefined,
  now: { key: string; shown: number; outOf: number }[],
) {
  if (!baseline) return null;
  const pairs = now
    .map((a) => ({ now: a, then: baseline.assistants.find((b) => b.key === a.key) }))
    .filter((p): p is { now: (typeof now)[number]; then: NonNullable<(typeof baseline.assistants)[number]> } => !!p.then);
  if (pairs.length === 0) return null;
  return {
    at: baseline.at,
    then: { shown: pairs.reduce((s, p) => s + p.then.shown, 0), outOf: pairs.reduce((s, p) => s + p.then.outOf, 0) },
    now: { shown: pairs.reduce((s, p) => s + p.now.shown, 0), outOf: pairs.reduce((s, p) => s + p.now.outOf, 0) },
    assistants: pairs.map((p) => ({ key: p.now.key, label: p.then.label, then: p.then.shown, thenOutOf: p.then.outOf, now: p.now.shown, nowOutOf: p.now.outOf })),
  };
}
