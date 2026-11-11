import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireCommunity, requireUser } from "./lib/auth";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

const HOUR = 60 * 60 * 1000;

const incoming = v.object({
  externalId: v.string(),
  reviewerName: v.string(),
  rating: v.number(),
  text: v.string(),
  reviewDate: v.number(),
  replyText: v.optional(v.string()),
  replyAt: v.optional(v.number()),
});

async function requireReview(ctx: QueryCtx | MutationCtx, reviewId: Id<"reviews">) {
  const review = await ctx.db.get(reviewId);
  if (!review) throw new ConvexError("Review not found.");
  const access = await requireCommunity(ctx, review.communityId);
  return { review, ...access };
}

export const list = query({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    const { community } = await requireCommunity(ctx, communityId);
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_community_date", (q) => q.eq("communityId", communityId))
      .order("desc")
      .take(500);
    const staff = await ctx.db
      .query("staff")
      .withIndex("by_community", (q) => q.eq("communityId", communityId))
      .collect();
    const names = new Map(staff.map((s) => [s._id, s.name]));
    return reviews.map((r) => ({
      ...r,
      sinceJoining: r.reviewDate >= community.createdAt,
      mentions: (r.mentions ?? []).map((m) => ({
        ...m,
        staffName: m.staffId ? names.get(m.staffId) : undefined,
      })),
      assistedStaffName: r.assistedStaffId ? names.get(r.assistedStaffId) : undefined,
    }));
  },
});

export const saveDraft = mutation({
  args: { reviewId: v.id("reviews"), text: v.string() },
  handler: async (ctx, { reviewId, text }) => {
    await requireReview(ctx, reviewId);
    await ctx.db.patch(reviewId, { draftReply: text, draftAt: Date.now() });
  },
});

/** For replies the manager posted on Google by hand (no Business Profile link). */
export const markReplied = mutation({
  args: { reviewId: v.id("reviews"), text: v.string() },
  handler: async (ctx, { reviewId, text }) => {
    await requireReview(ctx, reviewId);
    if (!text.trim()) throw new ConvexError("Reply text is empty.");
    await ctx.db.patch(reviewId, { replyText: text.trim(), replyAt: Date.now(), draftReply: undefined });
  },
});

/** A manager confirms or rejects that a review names one of their staff. */
export const setMention = mutation({
  args: {
    reviewId: v.id("reviews"),
    index: v.number(),
    status: v.union(v.literal("confirmed"), v.literal("rejected")),
    staffId: v.optional(v.id("staff")),
  },
  handler: async (ctx, { reviewId, index, status, staffId }) => {
    const { review } = await requireReview(ctx, reviewId);
    const mentions = [...(review.mentions ?? [])];
    const current = mentions[index];
    if (!current) throw new ConvexError("Mention not found.");
    const target = staffId ?? current.staffId;
    if (status === "confirmed") {
      if (!target) throw new ConvexError("Choose which team member this is.");
      const staff = await ctx.db.get(target);
      if (!staff || staff.communityId !== review.communityId) throw new ConvexError("Team member not found.");
    }
    mentions[index] = { ...current, status, staffId: target };
    await ctx.db.patch(reviewId, { mentions });
  },
});

// ---- internal -------------------------------------------------------------

export const forAction = internalQuery({
  args: { reviewId: v.id("reviews") },
  handler: async (ctx, { reviewId }) => await requireReview(ctx, reviewId),
});

export const setReply = internalMutation({
  args: { reviewId: v.id("reviews"), text: v.string() },
  handler: async (ctx, { reviewId, text }) => {
    await ctx.db.patch(reviewId, { replyText: text, replyAt: Date.now(), draftReply: undefined });
  },
});

export const setDraft = internalMutation({
  args: { reviewId: v.id("reviews"), text: v.string() },
  handler: async (ctx, { reviewId, text }) => {
    await ctx.db.patch(reviewId, { draftReply: text, draftAt: Date.now() });
  },
});

/** Removes the 5-review public sample once the full owner feed is linked. */
export const clearPlacesSample = internalMutation({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    const rows = await ctx.db
      .query("reviews")
      .withIndex("by_community_date", (q) => q.eq("communityId", communityId))
      .collect();
    for (const r of rows) if (r.source === "places") await ctx.db.delete(r._id);
  },
});

export const upsertBatch = internalMutation({
  args: {
    communityId: v.id("communities"),
    source: v.union(v.literal("places"), v.literal("business")),
    reviews: v.array(incoming),
    rating: v.optional(v.number()),
    totalReviews: v.optional(v.number()),
    // False for a first import, so a new customer is not emailed their whole history.
    notify: v.optional(v.boolean()),
  },
  handler: async (ctx, { communityId, source, reviews, rating, totalReviews, notify }) => {
    const community = await ctx.db.get(communityId);
    if (!community) return { inserted: 0 };
    let inserted = 0;
    let toNotify = 0;
    const recentCutoff = Date.now() - 14 * 24 * HOUR;
    for (const rv of reviews) {
      const existing = await ctx.db
        .query("reviews")
        .withIndex("by_community_external", (q) =>
          q.eq("communityId", communityId).eq("externalId", rv.externalId),
        )
        .unique();
      if (existing) {
        const changed = existing.text !== rv.text || existing.rating !== rv.rating;
        await ctx.db.patch(existing._id, {
          text: rv.text,
          rating: rv.rating,
          reviewerName: rv.reviewerName,
          // Google is the source of truth for replies when we have the owner feed.
          ...(source === "business" ? { replyText: rv.replyText, replyAt: rv.replyAt } : {}),
          ...(changed ? { analyzedAt: undefined } : {}),
        });
        continue;
      }
      // Credit the staff member whose card was tapped in the 48h before the review.
      const taps = await ctx.db
        .query("taps")
        .withIndex("by_community_at", (q) =>
          q.eq("communityId", communityId).gte("at", rv.reviewDate - 48 * HOUR).lte("at", rv.reviewDate),
        )
        .order("desc")
        .take(20);
      const assisted = taps.find((t) => t.staffId)?.staffId;
      const alert = notify === true && rv.reviewDate >= recentCutoff;
      await ctx.db.insert("reviews", {
        communityId,
        source,
        ...rv,
        assistedStaffId: assisted,
        notifyState: alert ? "pending" : undefined,
        createdAt: Date.now(),
      });
      inserted++;
      if (alert) toNotify++;
    }
    // Wait briefly so the email can include the AI's read of the review.
    if (toNotify > 0) await ctx.scheduler.runAfter(90_000, internal.notify.flush, { communityId });
    if (rating !== undefined && totalReviews !== undefined) {
      await ctx.db.patch(communityId, { googleRating: rating, totalReviews });
      const last = await ctx.db
        .query("ratingSnapshots")
        .withIndex("by_community_at", (q) => q.eq("communityId", communityId))
        .order("desc")
        .first();
      const stale = !last || Date.now() - last.at > 20 * HOUR;
      if (stale || last.rating !== rating || last.totalReviews !== totalReviews) {
        await ctx.db.insert("ratingSnapshots", { communityId, rating, totalReviews, at: Date.now() });
      }
    }
    return { inserted };
  },
});

export const pendingAnalysis = internalQuery({
  args: { communityId: v.id("communities"), limit: v.number() },
  handler: async (ctx, { communityId, limit }) => {
    const rows = await ctx.db
      .query("reviews")
      .withIndex("by_community_date", (q) => q.eq("communityId", communityId))
      .order("desc")
      .collect();
    return rows.filter((r) => r.analyzedAt === undefined).slice(0, limit);
  },
});

export function matchStaff(staff: Doc<"staff">[], name: string): Id<"staff"> | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").trim();
  const target = norm(name);
  if (!target) return undefined;
  const full = staff.filter((s) => norm(s.name) === target);
  if (full.length === 1) return full[0]._id;
  // Reviews usually use a first name only; match it if exactly one person has it.
  const first = staff.filter((s) => norm(s.name).split(" ")[0] === target.split(" ")[0]);
  return first.length === 1 ? first[0]._id : undefined;
}

export const applyAnalysis = internalMutation({
  args: {
    communityId: v.id("communities"),
    results: v.array(v.object({
      reviewId: v.id("reviews"),
      sentiment: v.union(v.literal("positive"), v.literal("neutral"), v.literal("negative")),
      themes: v.array(v.string()),
      urgent: v.boolean(),
      staff: v.array(v.object({
        name: v.string(),
        sentiment: v.union(v.literal("positive"), v.literal("neutral"), v.literal("negative")),
      })),
    })),
  },
  handler: async (ctx, { communityId, results }) => {
    const staff = await ctx.db
      .query("staff")
      .withIndex("by_community", (q) => q.eq("communityId", communityId))
      .collect();
    for (const r of results) {
      const review = await ctx.db.get(r.reviewId);
      if (!review || review.communityId !== communityId) continue;
      await ctx.db.patch(r.reviewId, {
        analyzedAt: Date.now(),
        sentiment: r.sentiment,
        themes: r.themes,
        urgent: r.urgent,
        mentions: r.staff.map((m) => ({
          name: m.name,
          sentiment: m.sentiment,
          staffId: matchStaff(staff, m.name),
          status: "suggested" as const,
        })),
      });
    }
  },
});

export const analyzedForInsights = internalQuery({
  args: { communityId: v.id("communities"), limit: v.number() },
  handler: async (ctx, { communityId, limit }) => {
    const rows = await ctx.db
      .query("reviews")
      .withIndex("by_community_date", (q) => q.eq("communityId", communityId))
      .order("desc")
      .take(limit);
    return rows.filter((r) => r.text.trim().length > 0);
  },
});

/** Re-run name matching for unconfirmed mentions after the team list changes. */
export async function rematchMentions(ctx: MutationCtx, communityId: Id<"communities">) {
  const staff = await ctx.db
    .query("staff")
    .withIndex("by_community", (q) => q.eq("communityId", communityId))
    .collect();
  const rows = await ctx.db
    .query("reviews")
    .withIndex("by_community_date", (q) => q.eq("communityId", communityId))
    .collect();
  for (const r of rows) {
    if (!r.mentions?.some((m) => m.status === "suggested")) continue;
    await ctx.db.patch(r._id, {
      mentions: r.mentions.map((m) =>
        m.status === "suggested" ? { ...m, staffId: matchStaff(staff, m.name) } : m,
      ),
    });
  }
}

export const insightsLatest = query({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    await requireCommunity(ctx, communityId);
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_community_date", (q) => q.eq("communityId", communityId))
      .collect();
    const themeCounts = new Map<string, { positive: number; negative: number; total: number }>();
    for (const r of reviews) {
      for (const t of r.themes ?? []) {
        const c = themeCounts.get(t) ?? { positive: 0, negative: 0, total: 0 };
        c.total++;
        if (r.sentiment === "positive") c.positive++;
        if (r.sentiment === "negative") c.negative++;
        themeCounts.set(t, c);
      }
    }
    const insight = await ctx.db
      .query("insights")
      .withIndex("by_community", (q) => q.eq("communityId", communityId))
      .order("desc")
      .first();
    return {
      insight,
      analyzed: reviews.filter((r) => r.analyzedAt !== undefined).length,
      loaded: reviews.length,
      replied: reviews.filter((r) => r.replyText).length,
      themes: [...themeCounts.entries()]
        .map(([theme, c]) => ({ theme, ...c }))
        .sort((a, b) => b.total - a.total),
    };
  },
});

export const saveInsight = internalMutation({
  args: {
    communityId: v.id("communities"),
    reviewCount: v.number(),
    summary: v.string(),
    strengths: v.array(v.object({ theme: v.string(), detail: v.string(), reviewCount: v.number() })),
    problems: v.array(v.object({
      theme: v.string(), detail: v.string(), reviewCount: v.number(), recommendation: v.string(),
    })),
    actions: v.array(v.object({
      priority: v.union(v.literal("now"), v.literal("next"), v.literal("ongoing")),
      action: v.string(),
      why: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("insights", { ...args, generatedAt: Date.now() });
  },
});

// requireUser is re-exported for callers that only need a signed-in check.
export { requireUser };
