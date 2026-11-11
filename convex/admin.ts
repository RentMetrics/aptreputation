import { query } from "./_generated/server";
import { requireAdmin, accessState } from "./lib/auth";

/** Everything the admin tracker shows: accounts, properties, who is on each. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    const communities = await ctx.db.query("communities").collect();
    const members = await ctx.db.query("members").collect();
    const tags = await ctx.db.query("tags").collect();
    const leads = await ctx.db.query("leads").withIndex("by_created").order("desc").take(200);
    const now = Date.now();
    const userById = new Map(users.map((u) => [u._id, u]));
    const nameOf = new Map(communities.map((c) => [c._id, c.name]));

    const status = (u: (typeof users)[number]) => {
      if (u.role === "admin") return "admin";
      const a = accessState(u, now);
      if (u.subscriptionStatus) return u.subscriptionStatus;
      return a.inTrial ? "free trial" : "trial ended";
    };

    const properties = communities
      .map((c) => {
        const owner = userById.get(c.ownerId);
        const team = members.filter((m) => m.communityId === c._id);
        const cards = tags.filter((t) => t.communityId === c._id && t.kind === "nfc");
        const all = tags.filter((t) => t.communityId === c._id);
        return {
          _id: c._id,
          name: c.name,
          address: c.address,
          createdAt: c.createdAt,
          ownerName: owner?.name ?? "Unknown",
          ownerEmail: owner?.email ?? "",
          ownerStatus: owner ? status(owner) : "unknown",
          team: team.map((m) => ({ email: m.email, role: m.role, joined: !!m.userId })),
          rating: c.googleRating ?? null,
          baselineRating: c.baselineRating ?? null,
          totalReviews: c.totalReviews ?? null,
          baselineReviews: c.baselineReviews ?? null,
          linked: !!c.gbpLocation,
          lastSyncAt: c.lastSyncAt ?? null,
          lastSyncError: c.lastSyncError ?? null,
          cards: cards.length,
          cardsMailed: cards.filter((t) => t.shippedAt).length,
          taps: all.reduce((n, t) => n + t.tapCount, 0),
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    const accounts = users
      .map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        status: status(u),
        trialEndsAt: accessState(u, now).trialEndsAt,
        owns: communities.filter((c) => c.ownerId === u._id).map((c) => ({ _id: c._id, name: c.name })),
        worksOn: members
          .filter((m) => m.userId === u._id && nameOf.has(m.communityId))
          .map((m) => ({ _id: m.communityId, name: nameOf.get(m.communityId)!, role: m.role })),
      }))
      .sort((a, b) => b.createdAt - a.createdAt);

    const paying = users.filter((u) => u.subscriptionStatus === "active" || u.subscriptionStatus === "trialing");
    return {
      accounts,
      properties,
      leads,
      totals: {
        accounts: users.length,
        subscribed: paying.length,
        properties: communities.length,
        paidProperties: communities.filter((c) => paying.some((u) => u._id === c.ownerId)).length,
        linked: communities.filter((c) => c.gbpLocation).length,
        invitesPending: members.filter((m) => !m.userId).length,
      },
    };
  },
});
