import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { api } from "./_generated/api";

// Sync a property with Google Maps to get Place ID and basic info
export const syncPropertyWithGoogle = mutation({
  args: {
    propertyId: v.id("properties"),
    googleMapsApiKey: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Get the property
      const property = await ctx.db.get(args.propertyId);
      if (!property) {
        throw new Error("Property not found");
      }

      // Search for the property using Google Places API
      const searchQuery = `${property.name} ${property.address} ${property.city} ${property.state}`;
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&type=establishment&key=${args.googleMapsApiKey}`
      );

      if (!response.ok) {
        throw new Error(`Google Places API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.status !== "OK" || !data.results || data.results.length === 0) {
        throw new Error("Property not found in Google Places");
      }

      const place = data.results[0]; // Use the first result

      // Update the property with Google data
      await ctx.db.patch(args.propertyId, {
        googlePlaceId: place.place_id,
        googleRating: place.rating,
        totalReviews: place.user_ratings_total,
        updatedAt: Date.now(),
      });

      return {
        success: true,
        placeId: place.place_id,
        rating: place.rating,
        totalReviews: place.user_ratings_total,
      };
    } catch (error) {
      console.error("Error syncing property with Google:", error);
      throw error;
    }
  },
});

// Sync all properties without Google Place IDs
export const syncAllPropertiesWithGoogle = mutation({
  args: {
    googleMapsApiKey: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      // Get all properties without Google Place IDs
      const properties = await ctx.db
        .query("properties")
        .filter((q) => q.eq(q.field("googlePlaceId"), undefined))
        .collect();

      const results = [];
      let successCount = 0;
      let errorCount = 0;

      for (const property of properties) {
        try {
          const result = await ctx.scheduler.runAfter(0, api.propertySync.syncPropertyWithGoogle, {
            propertyId: property._id,
            googleMapsApiKey: args.googleMapsApiKey,
          });
          results.push({ propertyId: property._id, success: true });
          successCount++;
        } catch (error) {
          results.push({ 
            propertyId: property._id, 
            success: false, 
            error: error instanceof Error ? error.message : "Unknown error" 
          });
          errorCount++;
        }
      }

      return {
        total: properties.length,
        successCount,
        errorCount,
        results,
      };
    } catch (error) {
      console.error("Error syncing all properties:", error);
      throw error;
    }
  },
});

// Get properties that need Google sync
export const getPropertiesNeedingSync = query({
  args: {},
  handler: async (ctx, args) => {
    return await ctx.db
      .query("properties")
      .filter((q) => q.eq(q.field("googlePlaceId"), undefined))
      .collect();
  },
});

// Get sync status for all properties
export const getSyncStatus = query({
  args: {},
  handler: async (ctx, args) => {
    const allProperties = await ctx.db.query("properties").collect();
    
    const synced = allProperties.filter(p => p.googlePlaceId);
    const unsynced = allProperties.filter(p => !p.googlePlaceId);
    
    return {
      total: allProperties.length,
      synced: synced.length,
      unsynced: unsynced.length,
      syncPercentage: allProperties.length > 0 ? Math.round((synced.length / allProperties.length) * 100) : 0,
    };
  },
}); 