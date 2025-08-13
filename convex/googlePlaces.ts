import { v } from "convex/values";
import { action } from "./_generated/server";

// Google Maps Places API - Search for properties
export const searchGooglePlaces = action({
  args: { 
    query: v.string(),
    apiKey: v.string()
  },
  handler: async (ctx, args) => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(args.query)}&type=establishment&key=${args.apiKey}`
      );
      
      if (!response.ok) {
        throw new Error(`Google Places API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.status !== "OK") {
        throw new Error(`Google Places API error: ${data.status}`);
      }
      
      return data.results.map((place: any) => ({
        placeId: place.place_id,
        name: place.name,
        address: place.formatted_address,
        rating: place.rating,
        totalReviews: place.user_ratings_total,
        location: place.geometry?.location,
        types: place.types,
      }));
    } catch (error) {
      console.error("Error searching Google Places:", error);
      throw error;
    }
  },
});

// Google My Business API - Get reviews for a place
export const getGoogleReviews = action({
  args: { 
    placeId: v.string(),
    apiKey: v.string()
  },
  handler: async (ctx, args) => {
    try {
      // First get the place details to find the business account
      const placeResponse = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${args.placeId}&fields=reviews,rating,user_ratings_total&key=${args.apiKey}`
      );
      
      if (!placeResponse.ok) {
        throw new Error(`Google Places API error: ${placeResponse.status}`);
      }
      
      const placeData = await placeResponse.json();
      
      if (placeData.status !== "OK") {
        throw new Error(`Google Places API error: ${placeData.status}`);
      }
      
      const reviews = placeData.result.reviews || [];
      
      return {
        rating: placeData.result.rating,
        totalReviews: placeData.result.user_ratings_total,
        reviews: reviews.map((review: any) => ({
          googleReviewId: review.time.toString(), // Use timestamp as ID
          reviewerName: review.author_name,
          rating: review.rating,
          reviewText: review.text,
          reviewDate: review.time * 1000, // Convert to milliseconds
          profilePhoto: review.profile_photo_url,
        })),
      };
    } catch (error) {
      console.error("Error fetching Google reviews:", error);
      throw error;
    }
  },
});
