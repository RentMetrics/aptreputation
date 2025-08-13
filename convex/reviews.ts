import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query to get reviews for a property
export const getPropertyReviews = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reviews")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .order("desc")
      .collect();
  },
});

// Query to get reviews that need responses
export const getReviewsNeedingResponse = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reviews")
      .withIndex("by_needs_response", (q) => 
        q.eq("propertyId", args.propertyId).eq("needsResponse", true)
      )
      .order("desc")
      .collect();
  },
});

// Query to get a single review by ID
export const getReview = query({
  args: { reviewId: v.id("reviews") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.reviewId);
  },
});

// Mutation to create a new review
export const createReview = mutation({
  args: {
    propertyId: v.id("properties"),
    googleReviewId: v.string(),
    reviewerName: v.string(),
    rating: v.number(),
    reviewText: v.string(),
    reviewDate: v.number(),
    sentiment: v.union(v.literal("positive"), v.literal("neutral"), v.literal("negative")),
    themes: v.array(v.string()),
    needsResponse: v.boolean(),
  },
  handler: async (ctx, args) => {
    const reviewId = await ctx.db.insert("reviews", {
      ...args,
      hasResponse: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return reviewId;
  },
});

// Mutation to update a review
export const updateReview = mutation({
  args: {
    reviewId: v.id("reviews"),
    sentiment: v.optional(v.union(v.literal("positive"), v.literal("neutral"), v.literal("negative"))),
    themes: v.optional(v.array(v.string())),
    needsResponse: v.optional(v.boolean()),
    hasResponse: v.optional(v.boolean()),
    responseText: v.optional(v.string()),
    responseDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { reviewId, ...updates } = args;
    
    await ctx.db.patch(reviewId, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

// Mutation to add AI-generated response to a review
export const addAIResponse = mutation({
  args: {
    reviewId: v.id("reviews"),
    responseText: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reviewId, {
      responseText: args.responseText,
      hasResponse: true,
      responseDate: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

// Mutation to mark a review as responded to
export const markReviewResponded = mutation({
  args: {
    reviewId: v.id("reviews"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reviewId, {
      needsResponse: false,
      hasResponse: true,
      updatedAt: Date.now(),
    });
  },
});

// Mutation to bulk import reviews from Google API
export const bulkImportReviews = mutation({
  args: {
    propertyId: v.id("properties"),
    reviews: v.array(v.object({
      googleReviewId: v.string(),
      reviewerName: v.string(),
      rating: v.number(),
      reviewText: v.string(),
      reviewDate: v.number(),
      sentiment: v.union(v.literal("positive"), v.literal("neutral"), v.literal("negative")),
      themes: v.array(v.string()),
      needsResponse: v.boolean(),
    })),
  },
  handler: async (ctx, args) => {
    const reviewIds = [];
    
    for (const review of args.reviews) {
      const reviewId = await ctx.db.insert("reviews", {
        propertyId: args.propertyId,
        ...review,
        hasResponse: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      
      reviewIds.push(reviewId);
    }
    
    return reviewIds;
  },
});

// Mutation to update review sentiment and themes (AI analysis)
export const updateReviewAnalysis = mutation({
  args: {
    reviewId: v.id("reviews"),
    sentiment: v.union(v.literal("positive"), v.literal("neutral"), v.literal("negative")),
    themes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reviewId, {
      sentiment: args.sentiment,
      themes: args.themes,
      updatedAt: Date.now(),
    });
  },
});

// Query to get reviews by property (for webhook handler)
export const getReviewsByProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("reviews")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .collect();
  },
}); 