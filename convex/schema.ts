import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Properties table - stores apartment properties
  properties: defineTable({
    propertyId: v.optional(v.string()), // Excel Property ID
    name: v.string(),
    address: v.string(),
    city: v.string(),
    state: v.string(),
    zipCode: v.string(),
    totalUnits: v.optional(v.number()), // Excel Total Units
    yearBuilt: v.optional(v.number()), // Excel Year Built
    averageUnitSize: v.optional(v.number()), // Excel Average Unit Size
    googlePlaceId: v.optional(v.string()), // Google Maps Place ID
    googleRating: v.optional(v.number()),
    totalReviews: v.optional(v.number()),
    aptReputationScore: v.optional(v.number()),
    subscriptionTier: v.union(v.literal("starter"), v.literal("pro"), v.literal("portfolio")),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_google_place_id", ["googlePlaceId"]).index("by_property_id", ["propertyId"]),

  // Users table - property managers/owners
  users: defineTable({
    email: v.string(),
    name: v.string(),
    company: v.optional(v.string()),
    subscriptionTier: v.union(v.literal("starter"), v.literal("pro"), v.literal("portfolio")),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),

  // User-Property relationships (many-to-many)
  userProperties: defineTable({
    userId: v.id("users"),
    propertyId: v.id("properties"),
    role: v.union(v.literal("owner"), v.literal("manager"), v.literal("viewer")),
    createdAt: v.number(),
  }).index("by_user", ["userId"]).index("by_property", ["propertyId"]),

  // Google OAuth tokens - for Business Information API access
  googleOAuthTokens: defineTable({
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    scope: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Google My Business accounts
  googleMyBusinessAccounts: defineTable({
    userId: v.id("users"),
    accountName: v.string(), // e.g., "accounts/123456789"
    accountId: v.string(), // e.g., "123456789"
    accountType: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_user", ["userId"]).index("by_account_name", ["accountName"]),

  // Google My Business locations
  googleMyBusinessLocations: defineTable({
    accountId: v.id("googleMyBusinessAccounts"),
    locationName: v.string(), // e.g., "accounts/123456789/locations/987654321"
    locationId: v.string(), // e.g., "987654321"
    title: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    rating: v.optional(v.number()),
    reviewCount: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_account", ["accountId"]).index("by_location_name", ["locationName"]),

  // Property-Google location mapping
  propertyGoogleMapping: defineTable({
    propertyId: v.id("properties"),
    googleLocationId: v.id("googleMyBusinessLocations"),
    startingRating: v.optional(v.number()),
    webhookUrl: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
  }).index("by_property", ["propertyId"]).index("by_location", ["googleLocationId"]),

  // Reviews table - Google reviews for properties
  reviews: defineTable({
    propertyId: v.id("properties"),
    googleReviewId: v.string(), // Google's review ID
    reviewerName: v.string(),
    rating: v.number(), // 1-5 stars
    reviewText: v.string(),
    reviewDate: v.number(), // timestamp
    sentiment: v.union(v.literal("positive"), v.literal("neutral"), v.literal("negative")),
    themes: v.array(v.string()), // AI-extracted themes
    needsResponse: v.boolean(),
    hasResponse: v.boolean(),
    responseText: v.optional(v.string()),
    responseDate: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_property", ["propertyId"])
    .index("by_google_review_id", ["googleReviewId"])
    .index("by_needs_response", ["propertyId", "needsResponse"]),

  // AI Analysis table - stores AI-generated insights
  aiAnalysis: defineTable({
    propertyId: v.id("properties"),
    period: v.string(), // e.g., "July 2025"
    overallSentimentTrend: v.string(),
    topPositiveThemes: v.array(v.string()),
    topNegativeThemes: v.array(v.string()),
    actionableRecommendations: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_property", ["propertyId"]),

  // NFC Cards table - for NFC review generation
  nfcCards: defineTable({
    propertyId: v.id("properties"),
    cardId: v.string(), // Unique NFC card identifier
    isActive: v.boolean(),
    lastUsed: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_property", ["propertyId"]).index("by_card_id", ["cardId"]),

  // Audit Logs table - for tracking reputation audits
  auditLogs: defineTable({
    propertyName: v.string(),
    propertyAddress: v.string(),
    googleRating: v.optional(v.number()),
    totalReviews: v.optional(v.number()),
    aptReputationScore: v.optional(v.number()),
    sentiment: v.optional(v.string()),
    topThemes: v.optional(v.array(v.string())),
    concerns: v.optional(v.array(v.string())),
    recommendations: v.optional(v.array(v.string())),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_created_at", ["createdAt"]),
}); 