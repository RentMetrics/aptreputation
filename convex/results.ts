import { query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { requireCommunity, requireUser } from "./lib/auth";
import { aiSinceJoining } from "./visibility";
import type { VisibilityResult } from "./lib/visibility";

const DAY = 24 * 60 * 60 * 1000;

/** What AptReputation and the property's team did in a window, and what came of it in reviews. */
export async function activityFor(ctx: QueryCtx, community: Doc<"communities">, from: number) {
  const reviews = await ctx.db.query("reviews").withIndex("by_community_date", (q) => q.eq("communityId", community._id)).collect();
  const fresh = reviews.filter((r) => r.reviewDate >= from);
  const replied = reviews.filter((r) => r.replyBy && (r.replyAt ?? 0) >= from);
  const waits = replied.map((r) => (r.replyAt ?? 0) - r.reviewDate).filter((ms) => ms >= 0);
  const taps = await ctx.db.query("taps").withIndex("by_community_at", (q) => q.eq("communityId", community._id).gte("at", from)).collect();
  const checks = await ctx.db.query("visibilityScans").withIndex("by_community", (q) => q.eq("communityId", community._id).gte("startedAt", from)).collect();
  const tasks = await ctx.db.query("fixTasks").withIndex("by_community", (q) => q.eq("communityId", community._id)).collect();
  return {
    newReviews: fresh.length,
    positive: fresh.filter((r) => r.rating >= 4).length,
    negative: fresh.filter((r) => r.rating <= 2).length,
    repliesPosted: replied.length,
    // Median hours from a review to the reply posted through AptReputation.
    replyHours: waits.length ? Math.round([...waits].sort((a, b) => a - b)[Math.floor(waits.length / 2)] / 3600000) : null,
    draftsWritten: reviews.filter((r) => (r.draftAt ?? 0) >= from).length,
    cardTaps: taps.length,
    reviewsAfterTap: fresh.filter((r) => r.assistedStaffId).length,
    aiChecks: checks.filter((c) => c.status === "done").length,
    fixesCleared: tasks.filter((t) => t.status === "cleared" && (t.clearedAt ?? 0) >= from).length,
    fixesDone: tasks.filter((t) => t.status === "done" && (t.doneAt ?? 0) >= from).length,
    fixesOpen: tasks.filter((t) => t.status === "open").length,
  };
}

async function latestResult(ctx: QueryCtx, community: Doc<"communities">): Promise<VisibilityResult | null> {
  const rows = await ctx.db.query("visibilityScans").withIndex("by_community", (q) => q.eq("communityId", community._id)).order("desc").take(10);
  for (const r of rows) {
    if (r.status !== "done" || !r.result) continue;
    try {
      const parsed = JSON.parse(r.result) as VisibilityResult;
      if (parsed.v === 2) return parsed;
    } catch {
      // Unreadable rows are skipped.
    }
  }
  return null;
}

/** Where the property started and where it is now, on every measure we track. */
export async function outcomesFor(ctx: QueryCtx, community: Doc<"communities">) {
  const latest = await latestResult(ctx, community);
  return {
    rating: { start: community.baselineRating ?? null, now: community.googleRating ?? null },
    reviews: { start: community.baselineReviews ?? null, now: community.totalReviews ?? null },
    score: { start: community.baselineScore ?? null, now: community.aptScore ?? null },
    ai: latest ? aiSinceJoining(community.aiBaseline, latest.assistants) : null,
  };
}

/** The Results tab: outcomes since joining, and the work behind them, since joining and in the last 30 days. */
export const get = query({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    const { community } = await requireCommunity(ctx, communityId);
    return {
      joined: community.createdAt,
      outcomes: await outcomesFor(ctx, community),
      sinceJoining: await activityFor(ctx, community, community.createdAt),
      // Work before the property joined is not ours to count, so the window never starts before joining.
      last30: await activityFor(ctx, community, Math.max(community.createdAt, Date.now() - 30 * DAY)),
    };
  },
});

/** The dashboard's portfolio line: every property this person can see, added up. */
export const portfolio = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const owned = await ctx.db.query("communities").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    const memberships = await ctx.db.query("members").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
    const shared = (await Promise.all(memberships.map((m) => ctx.db.get(m.communityId)))).filter(
      (c): c is Doc<"communities"> => c !== null && c.ownerId !== user._id,
    );
    const all = [...owned, ...shared];
    if (all.length === 0) return null;
    let newReviews = 0, positive = 0, repliesPosted = 0, cardTaps = 0, fixesCleared = 0;
    let scoreChange = 0, scored = 0, aiThen = 0, aiNow = 0, aiOutOf = 0;
    for (const c of all) {
      const a = await activityFor(ctx, c, c.createdAt);
      newReviews += a.newReviews;
      positive += a.positive;
      repliesPosted += a.repliesPosted;
      cardTaps += a.cardTaps;
      fixesCleared += a.fixesCleared;
      const o = await outcomesFor(ctx, c);
      if (o.score.start !== null && o.score.now !== null) {
        scoreChange += o.score.now - o.score.start;
        scored++;
      }
      if (o.ai) {
        aiThen += o.ai.then.shown;
        aiNow += o.ai.now.shown;
        aiOutOf += o.ai.now.outOf;
      }
    }
    return {
      properties: all.length,
      since: Math.min(...all.map((c) => c.createdAt)),
      newReviews,
      positive,
      repliesPosted,
      cardTaps,
      fixesCleared,
      averageScoreChange: scored ? Math.round((scoreChange / scored) * 10) / 10 : null,
      ai: aiOutOf ? { then: aiThen, now: aiNow, outOf: aiOutOf } : null,
    };
  },
});
