import { v } from "convex/values";
import { mutation, query, action } from "./_generated/server";

// Store OAuth tokens for a user
export const storeOAuthTokens = mutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    scope: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, accessToken, refreshToken, expiresAt, scope } = args;
    
    // Check if user already has tokens
    const existingToken = await ctx.db
      .query("googleOAuthTokens")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existingToken) {
      // Update existing token
      return await ctx.db.patch(existingToken._id, {
        accessToken,
        refreshToken,
        expiresAt,
        scope,
        updatedAt: Date.now(),
      });
    } else {
      // Create new token record
      return await ctx.db.insert("googleOAuthTokens", {
        userId,
        accessToken,
        refreshToken,
        expiresAt,
        scope,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

// Get OAuth tokens for a user
export const getOAuthTokens = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleOAuthTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

// Store Google My Business accounts
export const storeMyBusinessAccounts = mutation({
  args: {
    userId: v.id("users"),
    accounts: v.array(v.object({
      accountName: v.string(),
      accountId: v.string(),
      accountType: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const { userId, accounts } = args;
    
    // Delete existing accounts for this user
    const existingAccounts = await ctx.db
      .query("googleMyBusinessAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const account of existingAccounts) {
      await ctx.db.delete(account._id);
    }

    // Insert new accounts
    const accountIds = [];
    for (const account of accounts) {
      const accountId = await ctx.db.insert("googleMyBusinessAccounts", {
        userId,
        accountName: account.accountName,
        accountId: account.accountId,
        accountType: account.accountType,
        createdAt: Date.now(),
      });
      accountIds.push(accountId);
    }

    return accountIds;
  },
});

// Store Google My Business locations
export const storeMyBusinessLocations = mutation({
  args: {
    accountId: v.id("googleMyBusinessAccounts"),
    locations: v.array(v.object({
      locationName: v.string(),
      locationId: v.string(),
      title: v.optional(v.string()),
      address: v.optional(v.string()),
      phone: v.optional(v.string()),
      website: v.optional(v.string()),
      rating: v.optional(v.number()),
      reviewCount: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const { accountId, locations } = args;
    
    // Delete existing locations for this account
    const existingLocations = await ctx.db
      .query("googleMyBusinessLocations")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();

    for (const location of existingLocations) {
      await ctx.db.delete(location._id);
    }

    // Insert new locations
    const locationIds = [];
    for (const location of locations) {
      const locationId = await ctx.db.insert("googleMyBusinessLocations", {
        accountId,
        locationName: location.locationName,
        locationId: location.locationId,
        title: location.title,
        address: location.address,
        phone: location.phone,
        website: location.website,
        rating: location.rating,
        reviewCount: location.reviewCount,
        createdAt: Date.now(),
      });
      locationIds.push(locationId);
    }

    return locationIds;
  },
});

// Get My Business accounts for a user
export const getMyBusinessAccounts = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleMyBusinessAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

// Get My Business locations for an account
export const getMyBusinessLocations = query({
  args: { accountId: v.id("googleMyBusinessAccounts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("googleMyBusinessLocations")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
  },
});

// Link property to Google location
export const linkPropertyToGoogleLocation = mutation({
  args: {
    propertyId: v.id("properties"),
    googleLocationId: v.id("googleMyBusinessLocations"),
    startingRating: v.optional(v.number()),
    webhookUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { propertyId, googleLocationId, startingRating, webhookUrl } = args;
    
    // Check if mapping already exists
    const existingMapping = await ctx.db
      .query("propertyGoogleMapping")
      .withIndex("by_property", (q) => q.eq("propertyId", propertyId))
      .first();

    if (existingMapping) {
      // Update existing mapping
      return await ctx.db.patch(existingMapping._id, {
        googleLocationId,
        startingRating,
        webhookUrl,
      });
    } else {
      // Create new mapping
      return await ctx.db.insert("propertyGoogleMapping", {
        propertyId,
        googleLocationId,
        startingRating,
        webhookUrl,
        isActive: true,
        createdAt: Date.now(),
      });
    }
  },
});

// Get property Google mapping
export const getPropertyGoogleMapping = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("propertyGoogleMapping")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .first();
  },
});

// Get all properties with Google mappings
export const getPropertiesWithGoogleMappings = query({
  handler: async (ctx) => {
    const mappings = await ctx.db.query("propertyGoogleMapping").collect();
    
    const propertiesWithMappings = await Promise.all(
      mappings.map(async (mapping) => {
        const property = await ctx.db.get(mapping.propertyId);
        const googleLocation = await ctx.db.get(mapping.googleLocationId);
        
        return {
          property,
          googleLocation,
          mapping,
        };
      })
    );

    return propertiesWithMappings.filter(item => item.property && item.googleLocation);
  },
});

// Gemini AI Functions
export const analyzeReviewWithGemini = action({
  args: {
    reviewText: v.string(),
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${args.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Analyze this review and provide: 1) Sentiment (positive/negative/neutral), 2) Key themes, 3) Whether it needs a response (true/false). Review: ${args.reviewText}`
              }]
            }]
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      console.error("Error analyzing review with Gemini:", error);
      throw error;
    }
  },
});

export const generateAIResponseWithGemini = action({
  args: {
    reviewText: v.string(),
    propertyName: v.string(),
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${args.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Generate a professional, empathetic response to this negative review for ${args.propertyName}. Keep it under 200 words and be helpful. Review: ${args.reviewText}`
              }]
            }]
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      console.error("Error generating AI response with Gemini:", error);
      throw error;
    }
  },
});

export const generatePropertyAnalysisWithGemini = action({
  args: {
    reviews: v.array(v.object({
      reviewText: v.string(),
      rating: v.number(),
      sentiment: v.string(),
    })),
    propertyName: v.string(),
    apiKey: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const reviewsText = args.reviews.map(r => `${r.rating}/5 - ${r.sentiment}: ${r.reviewText}`).join('\n');
      
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${args.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Analyze these reviews for ${args.propertyName} and provide: 1) Overall sentiment analysis, 2) Key themes and patterns, 3) Areas for improvement, 4) Positive aspects to highlight. Reviews:\n${reviewsText}`
              }]
            }]
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      console.error("Error generating property analysis with Gemini:", error);
      throw error;
    }
  },
}); 