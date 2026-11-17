import { action, internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { nearbyCommunities, placeDetails, searchPlaces, type NearbyCommunity } from "./lib/google";

const DAILY_CAP = 400; // free public audits per day, to bound Google + AI spend
const DAY = 24 * 60 * 60 * 1000;

/** Bumped when the result shape or the score changes, so older cached results are recomputed. */
const RESULT_VERSION = 2;
const MARKET_RADIUS_MILES = 3;

export type ScorePart = { key: "rating" | "volume" | "recent" | "market"; label: string; points: number; max: number; detail: string };

export type Market = {
  radiusMiles: number;
  /** 1 = highest Google rating among this community and the ones nearby. */
  rank: number;
  of: number;
  averageRating: number;
  nearby: NearbyCommunity[];
};

export type AuditResult = {
  v?: number;
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  totalReviews: number;
  score: number | null;
  /** How the score is made up. Absent on results cached before version 2. */
  parts?: ScorePart[];
  market?: Market | null;
  /** The one change that would raise the score most. */
  nextStep?: string | null;
  sampleSize: number;
  recentNegative: number;
  summary: string | null;
  praised: string[];
  concerns: string[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Where a rating stands among nearby communities. Needs at least three to mean anything. */
function marketOf(rating: number, nearby: NearbyCommunity[]): Market | null {
  if (nearby.length < 3) return null;
  const higher = nearby.filter((n) => n.rating > rating).length;
  const all = [rating, ...nearby.map((n) => n.rating)];
  return {
    radiusMiles: MARKET_RADIUS_MILES,
    rank: higher + 1,
    of: nearby.length + 1,
    averageRating: round1(nearby.reduce((sum, n) => sum + n.rating, 0) / nearby.length),
    nearby: [...nearby].sort((a, b) => b.rating - a.rating || b.totalReviews - a.totalReviews).slice(0, 8),
  };
}

/**
 * AptRep Score, 0-100, from public Google data only:
 *   50  Google star rating (1 star = 0, 5 stars = 50)
 *   15  review volume (full marks at 150 or more reviews)
 *   15  newest reviews Google shows publicly (share rated 4 or 5 stars)
 *   20  standing among apartment communities within three miles (share of them
 *       this community's rating beats; ties count half). Half marks when fewer
 *       than three rated communities are nearby.
 * Every part is counted, never judged, so the same listing always scores the same.
 */
function scoreOf(rating: number | undefined, total: number, recent: { rating: number }[], nearby: NearbyCommunity[]) {
  if (!rating) return { score: null, parts: [] as ScorePart[], market: null as Market | null };
  const market = marketOf(rating, nearby);
  const ratingPts = ((rating - 1) / 4) * 50;
  const volumePts = (Math.min(total, 150) / 150) * 15;
  const good = recent.filter((r) => r.rating >= 4).length;
  const recentPts = recent.length ? (good / recent.length) * 15 : 7.5;
  let marketPts = 10;
  if (market) {
    const lower = nearby.filter((n) => n.rating < rating).length;
    const tied = nearby.filter((n) => n.rating === rating).length;
    marketPts = ((lower + tied / 2) / nearby.length) * 20;
  }
  const parts: ScorePart[] = [
    { key: "rating", label: "Google rating", points: round1(ratingPts), max: 50, detail: `${rating.toFixed(1)} stars` },
    {
      key: "volume",
      label: "Review volume",
      points: round1(volumePts),
      max: 15,
      detail: `${total.toLocaleString("en-US")} review${total === 1 ? "" : "s"}; full marks at 150`,
    },
    {
      key: "recent",
      label: "Newest reviews",
      points: round1(recentPts),
      max: 15,
      detail: recent.length ? `${good} of the newest ${recent.length} rated 4 or 5 stars` : "No recent reviews shown",
    },
    {
      key: "market",
      label: "Standing nearby",
      points: round1(marketPts),
      max: 20,
      detail: market
        ? `Ranked ${market.rank} of ${market.of} communities within ${MARKET_RADIUS_MILES} miles; nearby average ${market.averageRating.toFixed(1)}`
        : "Too few rated communities nearby to compare",
    },
  ];
  return { score: Math.round(ratingPts + volumePts + recentPts + marketPts), parts, market };
}

/** The part with the most room left, turned into one thing a team can do. */
function nextStepOf(parts: ScorePart[], total: number, market: Market | null): string | null {
  const room = (key: ScorePart["key"]) => {
    const p = parts.find((x) => x.key === key);
    return p ? p.max - p.points : 0;
  };
  const options: [number, string][] = [
    [
      room("recent"),
      "Your newest reviews are holding the score back. Reply to each one, fix the issue residents raise most, and ask residents for a review right after good service so newer reviews replace them.",
    ],
    [
      room("volume"),
      `More reviews would lift the score: ${Math.max(0, 150 - total).toLocaleString("en-US")} more reach full marks. Asking every resident after a finished work order or move-in is the steadiest way to get them.`,
    ],
    [
      room("market"),
      // Nothing to pass when this community already has the highest rating nearby.
      market && market.rank > 1
        ? `Communities within ${market.radiusMiles} miles average ${market.averageRating.toFixed(1)} stars. Passing the ones just above you is what moves this part.`
        : "",
    ],
  ];
  const best = options.filter(([gap, text]) => gap >= 1.5 && text).sort((a, b) => b[0] - a[0])[0];
  if (best) return best[1];
  return market?.rank === 1
    ? "This community has the highest Google rating nearby. Keep replying to every review and asking for new ones so it stays there."
    : "This listing is close to full marks. Keep replying to every review and asking for new ones so it stays there.";
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
    if (cachedJson) {
      const prior = JSON.parse(cachedJson) as AuditResult;
      if (prior.v === RESULT_VERSION) return prior;
    }

    const place = await placeDetails(hit.placeId);
    const written = place.reviews.filter((r) => r.text.trim());
    const ai = await ctx.runAction(internal.ai.auditSummary, {
      name: place.name,
      reviews: written.map((r) => ({ rating: r.rating, text: r.text })),
    });
    // One extra search for the communities around it. If it fails the audit
    // still returns, with the nearby part left neutral.
    let nearby: NearbyCommunity[] = [];
    if (place.location && place.rating) {
      try {
        nearby = await nearbyCommunities(place.location, place.placeId, MARKET_RADIUS_MILES);
      } catch (e) {
        console.warn("Nearby search failed", e);
      }
    }
    const scored = scoreOf(place.rating, place.totalReviews ?? 0, place.reviews, nearby);
    const result: AuditResult = {
      v: RESULT_VERSION,
      placeId: place.placeId,
      name: place.name,
      address: place.address,
      rating: place.rating ?? null,
      totalReviews: place.totalReviews ?? 0,
      score: scored.score,
      parts: scored.parts,
      market: scored.market,
      nextStep: scored.score === null ? null : nextStepOf(scored.parts, place.totalReviews ?? 0, scored.market),
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
