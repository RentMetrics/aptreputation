import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Query to get AI analysis for a property
export const getPropertyAnalysis = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("aiAnalysis")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .order("desc")
      .collect();
  },
});

// Query to get the latest AI analysis for a property
export const getLatestAnalysis = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const analyses = await ctx.db
      .query("aiAnalysis")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .order("desc")
      .collect();
    
    return analyses[0] || null;
  },
});

// Mutation to create AI analysis
export const createAnalysis = mutation({
  args: {
    propertyId: v.id("properties"),
    period: v.string(),
    overallSentimentTrend: v.string(),
    topPositiveThemes: v.array(v.string()),
    topNegativeThemes: v.array(v.string()),
    actionableRecommendations: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const analysisId = await ctx.db.insert("aiAnalysis", {
      ...args,
      createdAt: Date.now(),
    });

    return analysisId;
  },
});

// Mutation to update AI analysis
export const updateAnalysis = mutation({
  args: {
    analysisId: v.id("aiAnalysis"),
    overallSentimentTrend: v.optional(v.string()),
    topPositiveThemes: v.optional(v.array(v.string())),
    topNegativeThemes: v.optional(v.array(v.string())),
    actionableRecommendations: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { analysisId, ...updates } = args;
    
    await ctx.db.patch(analysisId, updates);
  },
});

// Mutation to generate AI response for a review
export const generateAIResponse = mutation({
  args: {
    reviewId: v.id("reviews"),
    reviewText: v.string(),
    rating: v.number(),
    themes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // This would integrate with Google Gemini API
    // For now, return a placeholder response
    const responseText = `Thank you for your feedback. We appreciate you taking the time to share your experience. ${
      args.rating <= 2 
        ? "We sincerely apologize for the issues you encountered and are committed to addressing them immediately." 
        : "We're glad you had a positive experience and look forward to serving you again."
    } Please contact our office directly if you need any further assistance.`;
    
    await ctx.db.patch(args.reviewId, {
      responseText,
      hasResponse: true,
      responseDate: Date.now(),
      updatedAt: Date.now(),
    });

    return responseText;
  },
});

// Mutation to analyze reviews and generate insights
export const analyzeReviews = mutation({
  args: {
    propertyId: v.id("properties"),
    period: v.string(),
  },
  handler: async (ctx, args) => {
    // Get reviews for the property
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_property", (q) => q.eq("propertyId", args.propertyId))
      .collect();

    if (reviews.length === 0) {
      return null;
    }

    // Calculate sentiment trends
    const positiveReviews = reviews.filter(r => r.sentiment === "positive").length;
    const negativeReviews = reviews.filter(r => r.sentiment === "negative").length;
    const totalReviews = reviews.length;
    
    const sentimentTrend = positiveReviews > negativeReviews ? "Improving" : 
                          negativeReviews > positiveReviews ? "Declining" : "Stable";

    // Extract themes
    const allThemes = reviews.flatMap(r => r.themes);
    const themeCounts = allThemes.reduce((acc, theme) => {
      acc[theme] = (acc[theme] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topPositiveThemes = Object.entries(themeCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([theme]) => theme);

    const topNegativeThemes = reviews
      .filter(r => r.sentiment === "negative")
      .flatMap(r => r.themes)
      .reduce((acc, theme) => {
        acc[theme] = (acc[theme] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    const negativeThemes = Object.entries(topNegativeThemes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([theme]) => theme);

    // Generate recommendations
    const recommendations = [];
    if (negativeReviews > positiveReviews) {
      recommendations.push("Focus on addressing negative feedback promptly");
    }
    if (negativeThemes.includes("Maintenance")) {
      recommendations.push("Improve maintenance response times and communication");
    }
    if (negativeThemes.includes("Noise")) {
      recommendations.push("Consider soundproofing improvements and noise policies");
    }
    if (topPositiveThemes.includes("Staff")) {
      recommendations.push("Highlight staff friendliness in marketing materials");
    }

    // Create analysis record
    const analysisId = await ctx.db.insert("aiAnalysis", {
      propertyId: args.propertyId,
      period: args.period,
      overallSentimentTrend: sentimentTrend,
      topPositiveThemes,
      topNegativeThemes: negativeThemes,
      actionableRecommendations: recommendations,
      createdAt: Date.now(),
    });

    return analysisId;
  },
}); 