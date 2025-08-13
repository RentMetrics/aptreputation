import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query to get all properties for a user
export const getUserProperties = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const userProperties = await ctx.db
      .query("userProperties")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const propertyIds = userProperties.map((up) => up.propertyId);
    const properties = await Promise.all(
      propertyIds.map((id) => ctx.db.get(id))
    );

    return properties.filter(Boolean);
  },
});

// Query to get a single property by ID
export const getProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.propertyId);
  },
});

// Query to search properties by name or address
export const searchProperties = query({
  args: { searchTerm: v.string() },
  handler: async (ctx, args) => {
    const properties = await ctx.db.query("properties").collect();
    
    return properties.filter(property => 
      property.name.toLowerCase().includes(args.searchTerm.toLowerCase()) ||
      property.address.toLowerCase().includes(args.searchTerm.toLowerCase())
    );
  },
});

// Mutation to create a new property
export const createProperty = mutation({
  args: {
    propertyId: v.optional(v.string()),
    name: v.string(),
    address: v.string(),
    city: v.string(),
    state: v.string(),
    zipCode: v.string(),
    totalUnits: v.optional(v.number()),
    yearBuilt: v.optional(v.number()),
    averageUnitSize: v.optional(v.number()),
    subscriptionTier: v.union(v.literal("starter"), v.literal("pro"), v.literal("portfolio")),
  },
  handler: async (ctx, args) => {
    const propertyId = await ctx.db.insert("properties", {
      ...args,
      googlePlaceId: undefined,
      googleRating: undefined,
      totalReviews: undefined,
      aptReputationScore: undefined,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return propertyId;
  },
});

// Mutation to update a property
export const updateProperty = mutation({
  args: {
    propertyId: v.id("properties"),
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zipCode: v.optional(v.string()),
    totalUnits: v.optional(v.number()),
    yearBuilt: v.optional(v.number()),
    averageUnitSize: v.optional(v.number()),
    subscriptionTier: v.optional(v.union(v.literal("starter"), v.literal("pro"), v.literal("portfolio"))),
    googlePlaceId: v.optional(v.string()),
    googleRating: v.optional(v.number()),
    totalReviews: v.optional(v.number()),
    aptReputationScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { propertyId, ...updates } = args;
    
    await ctx.db.patch(propertyId, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

// Mutation to bulk upload properties (admin function)
export const bulkUploadProperties = mutation({
  args: {
    properties: v.array(v.object({
      propertyId: v.optional(v.string()),
      name: v.string(),
      address: v.string(),
      city: v.string(),
      state: v.string(),
      zipCode: v.string(),
      totalUnits: v.optional(v.number()),
      yearBuilt: v.optional(v.number()),
      averageUnitSize: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const propertyIds = [];
    
    for (const property of args.properties) {
      const propertyId = await ctx.db.insert("properties", {
        ...property,
        googlePlaceId: undefined,
        googleRating: undefined,
        totalReviews: undefined,
        aptReputationScore: undefined,
        subscriptionTier: "starter", // Default tier
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      
      propertyIds.push(propertyId);
    }
    
    return propertyIds;
  },
});

// Mutation to link a user to a property
export const linkUserToProperty = mutation({
  args: {
    userId: v.id("users"),
    propertyId: v.id("properties"),
    role: v.union(v.literal("owner"), v.literal("manager"), v.literal("viewer")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("userProperties", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// Mutation to unlink a user from a property
export const unlinkUserFromProperty = mutation({
  args: {
    userId: v.id("users"),
    propertyId: v.id("properties"),
  },
  handler: async (ctx, args) => {
    const userProperty = await ctx.db
      .query("userProperties")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("propertyId"), args.propertyId))
      .first();
    
    if (userProperty) {
      await ctx.db.delete(userProperty._id);
    }
  },
}); 