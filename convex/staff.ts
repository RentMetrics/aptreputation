import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireCommunity, randomCode } from "./lib/auth";
import { staffRole } from "./schema";
import { rematchMentions } from "./reviews";
import { Doc, Id } from "./_generated/dataModel";
import { QueryCtx, MutationCtx } from "./_generated/server";

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${base || "team"}-${randomCode(5)}`;
}

function firstNameLastInitial(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}

async function requireStaff(ctx: QueryCtx | MutationCtx, staffId: Id<"staff">) {
  const staff = await ctx.db.get(staffId);
  if (!staff) throw new ConvexError("Team member not found.");
  const { community } = await requireCommunity(ctx, staff.communityId);
  return { staff, community };
}

/** Everything a profile is built from. Only confirmed mentions count. */
async function record(ctx: QueryCtx, staff: Doc<"staff">) {
  const reviews = await ctx.db
    .query("reviews")
    .withIndex("by_community_date", (q) => q.eq("communityId", staff.communityId))
    .order("desc")
    .collect();
  const named = reviews.filter((r) =>
    r.mentions?.some((m) => m.staffId === staff._id && m.status === "confirmed"),
  );
  const suggested = reviews.filter((r) =>
    r.mentions?.some((m) => m.staffId === staff._id && m.status === "suggested"),
  );
  const praise = named.filter((r) =>
    r.rating >= 4 && r.mentions!.some((m) => m.staffId === staff._id && m.status === "confirmed" && m.sentiment === "positive"),
  );
  const assisted = reviews.filter((r) => r.assistedStaffId === staff._id);
  const tags = await ctx.db.query("tags").withIndex("by_staff", (q) => q.eq("staffId", staff._id)).collect();
  const taps = tags.reduce((n, t) => n + t.tapCount, 0);
  const avg = (rows: Doc<"reviews">[]) =>
    rows.length ? Math.round((rows.reduce((n, r) => n + r.rating, 0) / rows.length) * 10) / 10 : null;
  return { named, suggested, praise, assisted, tags, taps, namedAvg: avg(named), assistedAvg: avg(assisted) };
}

export const list = query({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    await requireCommunity(ctx, communityId);
    const staff = await ctx.db.query("staff").withIndex("by_community", (q) => q.eq("communityId", communityId)).collect();
    return await Promise.all(
      staff.map(async (s) => {
        const r = await record(ctx, s);
        return {
          ...s,
          namedCount: r.named.length,
          praiseCount: r.praise.length,
          suggestedCount: r.suggested.length,
          assistedCount: r.assisted.length,
          taps: r.taps,
          namedAvg: r.namedAvg,
        };
      }),
    );
  },
});

export const get = query({
  args: { staffId: v.id("staff") },
  handler: async (ctx, { staffId }) => {
    const { staff, community } = await requireStaff(ctx, staffId);
    const r = await record(ctx, staff);
    const slim = (rv: Doc<"reviews">) => ({
      _id: rv._id, reviewerName: rv.reviewerName, rating: rv.rating, text: rv.text, reviewDate: rv.reviewDate,
      mentionIndex: rv.mentions?.findIndex((m) => m.staffId === staff._id) ?? -1,
      mentionSentiment: rv.mentions?.find((m) => m.staffId === staff._id)?.sentiment,
    });
    return {
      staff,
      communityName: community.name,
      named: r.named.map(slim),
      suggested: r.suggested.map(slim),
      assisted: r.assisted.map(slim),
      taps: r.taps,
      namedAvg: r.namedAvg,
      assistedAvg: r.assistedAvg,
      praiseCount: r.praise.length,
      tags: r.tags.map((t) => ({ _id: t._id, code: t.code, kind: t.kind, label: t.label, tapCount: t.tapCount })),
    };
  },
});

export const create = mutation({
  args: {
    communityId: v.id("communities"),
    name: v.string(),
    role: staffRole,
    title: v.optional(v.string()),
    startDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCommunity(ctx, args.communityId);
    const name = args.name.trim();
    if (name.length < 2) throw new ConvexError("Enter the team member's name.");
    const staffId = await ctx.db.insert("staff", {
      ownerId: user._id,
      communityId: args.communityId,
      name,
      role: args.role,
      title: args.title?.trim() || undefined,
      startDate: args.startDate || undefined,
      slug: slugify(name),
      isPublic: false,
      active: true,
      createdAt: Date.now(),
    });
    // Every team member gets a personal review link (QR) from day one.
    await ctx.db.insert("tags", {
      code: randomCode(7),
      kind: "link",
      label: `${name} – personal link`,
      ownerId: user._id,
      communityId: args.communityId,
      staffId,
      tapCount: 0,
      createdAt: Date.now(),
    });
    await rematchMentions(ctx, args.communityId);
    return staffId;
  },
});

export const update = mutation({
  args: {
    staffId: v.id("staff"),
    name: v.optional(v.string()),
    role: v.optional(staffRole),
    title: v.optional(v.string()),
    startDate: v.optional(v.string()),
    bio: v.optional(v.string()),
    skills: v.optional(v.array(v.string())),
    isPublic: v.optional(v.boolean()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, { staffId, ...patch }) => {
    const { staff } = await requireStaff(ctx, staffId);
    if (patch.name !== undefined && patch.name.trim().length < 2) throw new ConvexError("Enter a name.");
    if (patch.bio && patch.bio.length > 1200) throw new ConvexError("Keep the summary under 1,200 characters.");
    await ctx.db.patch(staffId, {
      ...patch,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.skills ? { skills: patch.skills.map((s) => s.trim()).filter(Boolean).slice(0, 12) } : {}),
    });
    if (patch.name !== undefined && patch.name.trim() !== staff.name) await rematchMentions(ctx, staff.communityId);
  },
});

export const remove = mutation({
  args: { staffId: v.id("staff") },
  handler: async (ctx, { staffId }) => {
    const { staff } = await requireStaff(ctx, staffId);
    const tags = await ctx.db.query("tags").withIndex("by_staff", (q) => q.eq("staffId", staffId)).collect();
    for (const t of tags) {
      if (t.kind === "link") await ctx.db.delete(t._id);
      else await ctx.db.patch(t._id, { staffId: undefined });
    }
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_community_date", (q) => q.eq("communityId", staff.communityId))
      .collect();
    for (const r of reviews) {
      const touched = r.assistedStaffId === staffId || r.mentions?.some((m) => m.staffId === staffId);
      if (!touched) continue;
      await ctx.db.patch(r._id, {
        assistedStaffId: r.assistedStaffId === staffId ? undefined : r.assistedStaffId,
        mentions: r.mentions?.map((m) => (m.staffId === staffId ? { ...m, staffId: undefined, status: "suggested" as const } : m)),
      });
    }
    await ctx.db.delete(staffId);
  },
});

/**
 * The shareable "mini resume". Public, no sign-in. Shows only what the manager
 * confirmed and only positive, already-public Google reviews.
 */
export const publicProfile = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const staff = await ctx.db.query("staff").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!staff || !staff.isPublic) return null;
    const community = await ctx.db.get(staff.communityId);
    const r = await record(ctx, staff);
    return {
      name: staff.name,
      role: staff.role,
      title: staff.title ?? null,
      startDate: staff.startDate ?? null,
      bio: staff.bio ?? null,
      skills: staff.skills ?? [],
      active: staff.active,
      communityName: community?.name ?? "",
      communityAddress: community?.address ?? "",
      communityRating: community?.googleRating ?? null,
      praiseCount: r.praise.length,
      praiseAvg: r.praise.length
        ? Math.round((r.praise.reduce((n, x) => n + x.rating, 0) / r.praise.length) * 10) / 10
        : null,
      invitations: r.taps,
      assistedCount: r.assisted.length,
      assistedAvg: r.assistedAvg,
      quotes: r.praise.slice(0, 8).map((rv) => ({
        reviewer: firstNameLastInitial(rv.reviewerName),
        rating: rv.rating,
        text: rv.text,
        date: rv.reviewDate,
      })),
    };
  },
});
