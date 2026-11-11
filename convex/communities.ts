import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { requireActive, requireCommunity, requireManager, requireResponder, requireUser } from "./lib/auth";
import { placeDetails, searchPlaces, suggestPlaces, PlaceHit, PlaceSuggestion, writeReviewUrl } from "./lib/google";
import { Id } from "./_generated/dataModel";

const DAY = 24 * 60 * 60 * 1000;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const owned = await ctx.db
      .query("communities")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
    const memberships = await ctx.db.query("members").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
    const shared = (await Promise.all(memberships.map((m) => ctx.db.get(m.communityId)))).filter(
      (c): c is NonNullable<typeof c> => c !== null && c.ownerId !== user._id,
    );
    const communities = [...owned, ...shared];
    const since = Date.now() - 30 * DAY;
    return await Promise.all(
      communities.map(async (c) => {
        const reviews = await ctx.db
          .query("reviews")
          .withIndex("by_community_date", (q) => q.eq("communityId", c._id))
          .collect();
        const taps = await ctx.db
          .query("taps")
          .withIndex("by_community_at", (q) => q.eq("communityId", c._id).gte("at", since))
          .collect();
        const sinceJoining = reviews.filter((r) => r.reviewDate >= c.createdAt);
        return {
          ...c,
          isOwner: c.ownerId === user._id,
          positiveSinceJoining: sinceJoining.filter((r) => r.rating >= 4).length,
          loadedReviews: reviews.length,
          needsReply: reviews.filter((r) => !r.replyText).length,
          urgent: reviews.filter((r) => r.urgent && !r.replyText).length,
          newReviews30d: reviews.filter((r) => r.reviewDate >= since).length,
          taps30d: taps.length,
        };
      }),
    );
  },
});

export const get = query({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    const { community, role } = await requireCommunity(ctx, communityId);
    return { ...community, role, reviewUrl: writeReviewUrl(community.googlePlaceId) };
  },
});

/** Ownership check for actions. */
export const access = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => await requireCommunity(ctx, communityId),
});

/** Same, for actions a viewer may not start. */
export const actingAccess = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => await requireResponder(ctx, communityId),
});

export const byId = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => await ctx.db.get(communityId),
});

export const allIds = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("communities").collect()).map((c) => c._id),
});

export const search = action({
  args: { query: v.string() },
  handler: async (ctx, { query }): Promise<PlaceHit[]> => {
    await ctx.runQuery(internal.users.current, {});
    if (query.trim().length < 3) return [];
    return await searchPlaces(query.trim());
  },
});

/** Type-ahead while the manager is typing a property name. */
export const suggest = action({
  args: { query: v.string(), sessionToken: v.optional(v.string()) },
  handler: async (ctx, { query, sessionToken }): Promise<PlaceSuggestion[]> => {
    await ctx.runQuery(internal.users.current, {});
    const q = query.trim().slice(0, 120);
    if (q.length < 3) return [];
    return await suggestPlaces(q, sessionToken);
  },
});

export const add = action({
  args: { placeId: v.string() },
  handler: async (ctx, { placeId }): Promise<Id<"communities">> => {
    const user = await ctx.runQuery(internal.users.current, {});
    requireActive(user);
    const place = await placeDetails(placeId);
    const communityId: Id<"communities"> = await ctx.runMutation(internal.communities.insert, {
      ownerId: user._id,
      name: place.name,
      address: place.address,
      googlePlaceId: place.placeId,
      rating: place.rating,
      totalReviews: place.totalReviews,
    });
    await ctx.runMutation(internal.reviews.upsertBatch, {
      communityId,
      source: "places",
      reviews: place.reviews,
      rating: place.rating,
      totalReviews: place.totalReviews,
    });
    await ctx.scheduler.runAfter(0, internal.ai.analyzePending, { communityId });
    await ctx.scheduler.runAfter(0, internal.billing.syncQuantity, { userId: user._id });
    return communityId;
  },
});

export const insert = internalMutation({
  args: {
    ownerId: v.id("users"),
    name: v.string(),
    address: v.string(),
    googlePlaceId: v.string(),
    rating: v.optional(v.number()),
    totalReviews: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const mine = await ctx.db
      .query("communities")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId))
      .collect();
    if (mine.some((c) => c.googlePlaceId === args.googlePlaceId)) {
      throw new ConvexError("That property is already in your portfolio.");
    }
    return await ctx.db.insert("communities", {
      ownerId: args.ownerId,
      name: args.name,
      address: args.address,
      googlePlaceId: args.googlePlaceId,
      googleRating: args.rating,
      totalReviews: args.totalReviews,
      baselineRating: args.rating,
      baselineReviews: args.totalReviews,
      createdAt: Date.now(),
    });
  },
});

export const setSyncResult = internalMutation({
  args: {
    communityId: v.id("communities"),
    source: v.union(v.literal("places"), v.literal("business")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { communityId, source, error }) => {
    await ctx.db.patch(communityId, {
      lastSyncAt: Date.now(),
      lastSyncSource: source,
      lastSyncError: error,
    });
  },
});

export const remove = mutation({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    const { owner: user } = await requireManager(ctx, communityId);
    const members = await ctx.db.query("members").withIndex("by_community", (q) => q.eq("communityId", communityId)).collect();
    for (const m of members) await ctx.db.delete(m._id);
    for (const table of ["reviews", "insights", "ratingSnapshots", "taps"] as const) {
      const index = table === "reviews" ? "by_community_date" : table === "insights" ? "by_community" : "by_community_at";
      const rows = await (ctx.db.query(table) as any)
        .withIndex(index, (q: any) => q.eq("communityId", communityId))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }
    const staff = await ctx.db.query("staff").withIndex("by_community", (q) => q.eq("communityId", communityId)).collect();
    for (const s of staff) await ctx.db.delete(s._id);
    const tags = await ctx.db.query("tags").withIndex("by_community", (q) => q.eq("communityId", communityId)).collect();
    for (const t of tags) {
      // Physical cards go back to the owner's unassigned pile; links are deleted.
      if (t.kind === "nfc") await ctx.db.patch(t._id, { communityId: undefined, staffId: undefined });
      else await ctx.db.delete(t._id);
    }
    await ctx.db.delete(communityId);
    await ctx.scheduler.runAfter(0, internal.billing.syncQuantity, { userId: user._id });
  },
});

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Progress since the property joined. The Google rating and review total are
 * exact. Star-by-star counts come from the reviews we have loaded, so they are
 * complete only once the Business Profile is linked.
 */
export const progress = query({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    const { community } = await requireCommunity(ctx, communityId);
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_community_date", (q) => q.eq("communityId", communityId))
      .collect();
    const snapshots = await ctx.db
      .query("ratingSnapshots")
      .withIndex("by_community_at", (q) => q.eq("communityId", communityId))
      .collect();
    const taps = await ctx.db
      .query("taps")
      .withIndex("by_community_at", (q) => q.eq("communityId", communityId))
      .collect();

    const joined = community.createdAt;
    const summarize = (rows: typeof reviews) => ({
      count: rows.length,
      positive: rows.filter((r) => r.rating >= 4).length,
      negative: rows.filter((r) => r.rating <= 2).length,
      average: rows.length ? Math.round((rows.reduce((n, r) => n + r.rating, 0) / rows.length) * 100) / 100 : null,
      replied: rows.filter((r) => r.replyText).length,
    });
    const since = reviews.filter((r) => r.reviewDate >= joined);
    const before = reviews.filter((r) => r.reviewDate < joined);

    // Last 12 calendar months of 4-5 star reviews, oldest first.
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
      const inMonth = reviews.filter((r) => r.reviewDate >= d.getTime() && r.reviewDate < end);
      return {
        label: `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        start: d.getTime(),
        // A review counts as "since joining" by its own date, so the joining month can hold both.
        positiveBefore: inMonth.filter((r) => r.rating >= 4 && r.reviewDate < joined).length,
        positiveSince: inMonth.filter((r) => r.rating >= 4 && r.reviewDate >= joined).length,
        total: inMonth.length,
      };
    });

    return {
      joined,
      fullHistory: community.lastSyncSource === "business",
      baseline: { rating: community.baselineRating ?? null, reviews: community.baselineReviews ?? null },
      current: { rating: community.googleRating ?? null, reviews: community.totalReviews ?? null },
      since: summarize(since),
      before: summarize(before),
      tapsSinceJoining: taps.length,
      snapshots: snapshots.map((s) => ({ at: s.at, rating: s.rating, totalReviews: s.totalReviews })),
      months,
    };
  },
});
