import { query } from "./_generated/server";
import { requireAdmin, accessState } from "./lib/auth";

export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    const communities = await ctx.db.query("communities").collect();
    const leads = await ctx.db.query("leads").withIndex("by_created").order("desc").take(200);
    const now = Date.now();
    return {
      customers: users.map((u) => {
        const mine = communities.filter((c) => c.ownerId === u._id);
        const a = accessState(u, now);
        return {
          _id: u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          createdAt: u.createdAt,
          status: u.subscriptionStatus ?? (a.inTrial ? "free trial" : "trial ended"),
          properties: mine.map((c) => ({ _id: c._id, name: c.name, rating: c.googleRating, linked: !!c.gbpLocation })),
        };
      }),
      leads,
      totals: {
        customers: users.length,
        properties: communities.length,
        subscribed: users.filter((u) => u.subscriptionStatus === "active" || u.subscriptionStatus === "trialing").length,
      },
    };
  },
});
