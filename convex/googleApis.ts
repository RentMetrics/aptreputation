import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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