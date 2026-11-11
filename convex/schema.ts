import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const staffRole = v.union(
  v.literal("manager"),
  v.literal("leasing"),
  v.literal("maintenance"),
  v.literal("other"),
);

export const notifyPref = v.union(v.literal("all"), v.literal("negative"), v.literal("none"));
export const memberRole = v.union(v.literal("manager"), v.literal("responder"));

export const mention = v.object({
  name: v.string(),
  staffId: v.optional(v.id("staff")),
  // suggested = AI matched a name, a manager has not confirmed it yet
  status: v.union(v.literal("suggested"), v.literal("confirmed"), v.literal("rejected")),
  sentiment: v.union(v.literal("positive"), v.literal("neutral"), v.literal("negative")),
});

export default defineSchema({
  // Legacy pre-loaded catalog from the 2025 prototype. Not used by the app;
  // kept so the existing rows are not lost.
  properties: defineTable({
    propertyId: v.optional(v.string()),
    name: v.string(),
    address: v.string(),
    city: v.string(),
    state: v.string(),
    zipCode: v.string(),
    totalUnits: v.optional(v.number()),
    yearBuilt: v.optional(v.number()),
    averageUnitSize: v.optional(v.number()),
    googlePlaceId: v.optional(v.string()),
    googleRating: v.optional(v.number()),
    totalReviews: v.optional(v.number()),
    aptReputationScore: v.optional(v.number()),
    subscriptionTier: v.union(v.literal("starter"), v.literal("pro"), v.literal("portfolio")),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_google_place_id", ["googlePlaceId"]).index("by_property_id", ["propertyId"]),

  users: defineTable({
    tokenIdentifier: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("customer"), v.literal("admin")),
    stripeCustomerId: v.optional(v.string()),
    subscriptionId: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_stripe_customer", ["stripeCustomerId"]),

  // A managed apartment community ("property" in the UI).
  communities: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    address: v.string(),
    googlePlaceId: v.string(),
    googleRating: v.optional(v.number()),
    totalReviews: v.optional(v.number()),
    baselineRating: v.optional(v.number()),
    baselineReviews: v.optional(v.number()),
    // Google Business Profile location, e.g. "accounts/123/locations/456"
    gbpLocation: v.optional(v.string()),
    gbpLocationTitle: v.optional(v.string()),
    // Whose Google connection is used to read reviews and post replies.
    gbpConnectedBy: v.optional(v.id("users")),
    ownerNotify: v.optional(notifyPref),
    lastSyncAt: v.optional(v.number()),
    lastSyncSource: v.optional(v.union(v.literal("places"), v.literal("business"))),
    lastSyncError: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_place", ["googlePlaceId"]),

  // People who can work on a property besides its owner. A row with no userId
  // is an invitation waiting for that email address to sign up.
  members: defineTable({
    communityId: v.id("communities"),
    email: v.string(),
    userId: v.optional(v.id("users")),
    role: memberRole,
    notify: notifyPref,
    invitedBy: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_user", ["userId"])
    .index("by_email", ["email"]),

  // One Google account connection per user. Never returned to the client.
  googleConnections: defineTable({
    userId: v.id("users"),
    googleEmail: v.optional(v.string()),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    expiresAt: v.number(),
    scope: v.string(),
  }).index("by_user", ["userId"]),

  oauthStates: defineTable({
    userId: v.id("users"),
    state: v.string(),
    createdAt: v.number(),
  }).index("by_state", ["state"]),

  reviews: defineTable({
    communityId: v.id("communities"),
    source: v.union(v.literal("places"), v.literal("business")),
    externalId: v.string(),
    reviewerName: v.string(),
    rating: v.number(),
    text: v.string(),
    reviewDate: v.number(),
    // AI analysis
    analyzedAt: v.optional(v.number()),
    sentiment: v.optional(v.union(v.literal("positive"), v.literal("neutral"), v.literal("negative"))),
    themes: v.optional(v.array(v.string())),
    urgent: v.optional(v.boolean()),
    mentions: v.optional(v.array(mention)),
    // Reply workflow
    replyText: v.optional(v.string()), // reply live on Google
    replyAt: v.optional(v.number()),
    draftReply: v.optional(v.string()),
    draftAt: v.optional(v.number()),
    // Staff whose card/link was tapped shortly before this review appeared
    assistedStaffId: v.optional(v.id("staff")),
    // New-review email: pending until sent (or skipped when email is not set up).
    notifyState: v.optional(v.union(v.literal("pending"), v.literal("sent"), v.literal("skipped"))),
    createdAt: v.number(),
  })
    .index("by_community_date", ["communityId", "reviewDate"])
    .index("by_community_external", ["communityId", "externalId"]),

  staff: defineTable({
    ownerId: v.id("users"),
    communityId: v.id("communities"),
    name: v.string(),
    role: staffRole,
    title: v.optional(v.string()),
    startDate: v.optional(v.string()), // YYYY-MM
    bio: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    slug: v.string(),
    isPublic: v.boolean(),
    active: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_slug", ["slug"]),

  // Anything a resident can tap or scan: a physical NFC card or a printable
  // QR/link. Each has a short code served at /t/<code>.
  tags: defineTable({
    code: v.string(),
    kind: v.union(v.literal("nfc"), v.literal("link")),
    serial: v.optional(v.string()), // NFC chip UID, e.g. 04:C2:88:D2:5F:61:80
    label: v.optional(v.string()),
    ownerId: v.optional(v.id("users")),
    communityId: v.optional(v.id("communities")),
    staffId: v.optional(v.id("staff")),
    disabled: v.optional(v.boolean()),
    tapCount: v.number(),
    lastTapAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_serial", ["serial"])
    .index("by_community", ["communityId"])
    .index("by_owner", ["ownerId"])
    .index("by_staff", ["staffId"]),

  taps: defineTable({
    tagId: v.id("tags"),
    communityId: v.id("communities"),
    staffId: v.optional(v.id("staff")),
    at: v.number(),
  })
    .index("by_community_at", ["communityId", "at"])
    .index("by_staff_at", ["staffId", "at"]),

  insights: defineTable({
    communityId: v.id("communities"),
    generatedAt: v.number(),
    reviewCount: v.number(),
    summary: v.string(),
    strengths: v.array(v.object({ theme: v.string(), detail: v.string(), reviewCount: v.number() })),
    problems: v.array(v.object({
      theme: v.string(),
      detail: v.string(),
      reviewCount: v.number(),
      recommendation: v.string(),
    })),
    actions: v.array(v.object({
      priority: v.union(v.literal("now"), v.literal("next"), v.literal("ongoing")),
      action: v.string(),
      why: v.string(),
    })),
  }).index("by_community", ["communityId", "generatedAt"]),

  ratingSnapshots: defineTable({
    communityId: v.id("communities"),
    rating: v.number(),
    totalReviews: v.number(),
    at: v.number(),
  }).index("by_community_at", ["communityId", "at"]),

  // Public audit (lead magnet)
  auditCache: defineTable({
    placeId: v.string(),
    at: v.number(),
    result: v.string(), // JSON
  }).index("by_place", ["placeId"]),

  leads: defineTable({
    email: v.string(),
    propertyName: v.string(),
    address: v.optional(v.string()),
    placeId: v.optional(v.string()),
    rating: v.optional(v.number()),
    totalReviews: v.optional(v.number()),
    score: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  usage: defineTable({
    key: v.string(), // e.g. "audit:2026-11-10"
    count: v.number(),
  }).index("by_key", ["key"]),
});
