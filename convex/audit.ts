import { action, internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { placeDetails, searchPlaces } from "./lib/google";

const DAILY_CAP = 400; // free public audits per day, to bound Google + AI spend
const DAY = 24 * 60 * 60 * 1000;

export type AuditResult = {
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  totalReviews: number;
  score: number | null;
  sampleSize: number;
  recentNegative: number;
  summary: string | null;
  praised: string[];
  concerns: string[];
};

/**
 * AptReputation Score, 0-100. 70 points from the Google star rating, 15 from
 * review volume (full marks at 150+ reviews), 15 from the newest reviews Google
 * shows publicly (share rated 4-5 stars).
 */
function score(rating: number | undefined, total: number, recent: { rating: number }[]) {
  if (!rating) return null;
  const ratingPts = ((rating - 1) / 4) * 70;
  const volumePts = (Math.min(total, 150) / 150) * 15;
  const recentPts = recent.length ? (recent.filter((r) => r.rating >= 4).length / recent.length) * 15 : 7.5;
  return Math.round(ratingPts + volumePts + recentPts);
}

export const cached = internalQuery({
  args: { placeId: v.string() },
  handler: async (ctx, { placeId }) => {
    const row = await ctx.db.query("auditCache").withIndex("by_place", (q) => q.eq("placeId", placeId)).unique();
    return row && Date.now() - row.at < DAY ? row.result : null;
  },
});

export const store = internalMutation({
  args: { placeId: v.string(), result: v.string() },
  handler: async (ctx, { placeId, result }) => {
    const row = await ctx.db.query("auditCache").withIndex("by_place", (q) => q.eq("placeId", placeId)).unique();
    if (row) await ctx.db.patch(row._id, { result, at: Date.now() });
    else await ctx.db.insert("auditCache", { placeId, result, at: Date.now() });
  },
});

export const countUse = internalMutation({
  args: {},
  handler: async (ctx) => {
    const key = `audit:${new Date().toISOString().slice(0, 10)}`;
    const row = await ctx.db.query("usage").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (row && row.count >= DAILY_CAP) return false;
    if (row) await ctx.db.patch(row._id, { count: row.count + 1 });
    else await ctx.db.insert("usage", { key, count: 1 });
    return true;
  },
});

/** Public free audit from the landing page. */
export const run = action({
  args: { query: v.string() },
  handler: async (ctx, { query }): Promise<AuditResult | null> => {
    const q = query.trim().slice(0, 200);
    if (q.length < 3) throw new ConvexError("Enter a property name or address.");
    if (!(await ctx.runMutation(internal.audit.countUse, {}))) {
      throw new ConvexError("The free audit is at capacity for today. Please try again tomorrow, or sign up for a full report.");
    }
    // Prefer a place with reviews. A bare name can match a street or a
    // neighbourhood first, so retry as an apartment search when it does.
    const best = (list: Awaited<ReturnType<typeof searchPlaces>>) => list.find((h) => h.rating) ?? null;
    let hits = await searchPlaces(q);
    let hit = best(hits);
    if (!hit && !/apartment/i.test(q)) {
      const retry = await searchPlaces(`${q} apartments`);
      hit = best(retry);
      if (retry.length) hits = retry;
    }
    hit = hit ?? hits[0] ?? null;
    if (!hit) return null;
    const cachedJson = await ctx.runQuery(internal.audit.cached, { placeId: hit.placeId });
    if (cachedJson) return JSON.parse(cachedJson) as AuditResult;

    const place = await placeDetails(hit.placeId);
    const written = place.reviews.filter((r) => r.text.trim());
    const ai = await ctx.runAction(internal.ai.auditSummary, {
      name: place.name,
      reviews: written.map((r) => ({ rating: r.rating, text: r.text })),
    });
    const result: AuditResult = {
      placeId: place.placeId,
      name: place.name,
      address: place.address,
      rating: place.rating ?? null,
      totalReviews: place.totalReviews ?? 0,
      score: score(place.rating, place.totalReviews ?? 0, place.reviews),
      sampleSize: place.reviews.length,
      recentNegative: place.reviews.filter((r) => r.rating <= 2).length,
      summary: ai?.summary ?? null,
      praised: ai?.praised ?? [],
      concerns: ai?.concerns ?? [],
    };
    await ctx.runMutation(internal.audit.store, { placeId: place.placeId, result: JSON.stringify(result) });
    return result;
  },
});

/** Public: the visitor asked to be emailed about their audit. */
export const saveLead = mutation({
  args: {
    email: v.string(),
    propertyName: v.string(),
    address: v.optional(v.string()),
    placeId: v.optional(v.string()),
    rating: v.optional(v.number()),
    totalReviews: v.optional(v.number()),
    score: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) {
      throw new ConvexError("Enter a valid email address.");
    }
    await ctx.db.insert("leads", { ...args, email, propertyName: args.propertyName.slice(0, 200), createdAt: Date.now() });
  },
});
