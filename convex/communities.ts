import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { requireActive, requireCommunity, requireUser } from "./lib/auth";
import { placeDetails, searchPlaces, PlaceHit, writeReviewUrl } from "./lib/google";
import { Id } from "./_generated/dataModel";

const DAY = 24 * 60 * 60 * 1000;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const communities = await ctx.db
      .query("communities")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .collect();
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
        return {
          ...c,
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
    const { community } = await requireCommunity(ctx, communityId);
    const snapshots = await ctx.db
      .query("ratingSnapshots")
      .withIndex("by_community_at", (q) => q.eq("communityId", communityId))
      .collect();
    return { ...community, reviewUrl: writeReviewUrl(community.googlePlaceId), snapshots };
  },
});

/** Ownership check for actions. */
export const access = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => await requireCommunity(ctx, communityId),
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
    const { user } = await requireCommunity(ctx, communityId);
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
