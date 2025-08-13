import { v } from "convex/values";
import { query } from "./_generated/server";

// Query to get user properties
export const getUserProperties = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userProperties")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .collect();
  },
});

// Query to get properties for a user
export const getPropertiesForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userProperties")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});
