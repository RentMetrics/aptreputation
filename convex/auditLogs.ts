import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// Mutation to log a reputation audit
export const logAudit = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const auditId = await ctx.db.insert("auditLogs", {
      ...args,
      createdAt: Date.now(),
    });

    return auditId;
  },
});

// Query to get recent audit logs (admin function)
export const getRecentAudits = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit || 50;
    
    return await ctx.db
      .query("auditLogs")
      .withIndex("by_created_at", (q) => q)
      .order("desc")
      .take(limit);
  },
});

// Query to get audit statistics
export const getAuditStats = query({
  args: {},
  handler: async (ctx, args) => {
    const audits = await ctx.db.query("auditLogs").collect();
    
    const totalAudits = audits.length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayAudits = audits.filter(audit => 
      new Date(audit.createdAt) >= today
    ).length;
    
    const averageScore = audits
      .filter(audit => audit.aptReputationScore !== undefined)
      .reduce((sum, audit) => sum + (audit.aptReputationScore || 0), 0) / 
      audits.filter(audit => audit.aptReputationScore !== undefined).length;
    
    return {
      totalAudits,
      todayAudits,
      averageScore: isNaN(averageScore) ? 0 : Math.round(averageScore),
    };
  },
});

// Query to search audit logs
export const searchAudits = query({
  args: { searchTerm: v.string() },
  handler: async (ctx, args) => {
    const audits = await ctx.db.query("auditLogs").collect();
    
    return audits.filter(audit => 
      audit.propertyName.toLowerCase().includes(args.searchTerm.toLowerCase()) ||
      audit.propertyAddress.toLowerCase().includes(args.searchTerm.toLowerCase())
    );
  },
}); 