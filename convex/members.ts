import { mutation, query, type MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { canManage as isManager, requireCommunity, requireManager } from "./lib/auth";
import { memberRole, notifyPref } from "./schema";

/** Everyone who can work on a property, and how each is alerted. */
export const list = query({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    const { user, community, owner, role } = await requireCommunity(ctx, communityId);
    const members = await ctx.db.query("members").withIndex("by_community", (q) => q.eq("communityId", communityId)).collect();
    const people = [
      {
        key: "owner",
        memberId: null as null | (typeof members)[number]["_id"],
        name: owner.name,
        email: owner.email,
        role: "owner" as "owner" | "manager" | "responder" | "viewer",
        notify: community.ownerNotify ?? ("all" as const),
        accountManager: false,
        pending: false,
        isYou: owner._id === user._id,
      },
      ...(await Promise.all(
        members.map(async (m) => {
          const u = m.userId ? await ctx.db.get(m.userId) : null;
          return {
            key: m._id as string,
            memberId: m._id,
            name: u?.name ?? m.email,
            email: m.email,
            role: m.role as "owner" | "manager" | "responder" | "viewer",
            notify: m.notify,
            accountManager: !!m.accountManager,
            pending: !m.userId,
            isYou: m.userId === user._id,
          };
        }),
      )),
    ];
    return { people, canManage: isManager(role), emailReady: !!process.env.RESEND_API_KEY, googleConnected: !!community.gbpLocation };
  },
});

export const invite = mutation({
  args: { communityId: v.id("communities"), email: v.string(), role: memberRole, accountManager: v.optional(v.boolean()) },
  handler: async (ctx, { communityId, email, role, accountManager }) => {
    const { user, community, owner } = await requireManager(ctx, communityId);
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) throw new ConvexError("Enter a valid email address.");
    if (clean === owner.email.toLowerCase()) throw new ConvexError("That is the account owner, who already has access.");
    const existing = await ctx.db.query("members").withIndex("by_community", (q) => q.eq("communityId", communityId)).collect();
    if (existing.some((m) => m.email === clean)) throw new ConvexError("That person already has access.");
    if (existing.length >= 50) throw new ConvexError("A property can have up to 50 people.");
    // If they already have an account, access starts immediately.
    const users = await ctx.db.query("users").collect();
    const match = users.find((u) => u.email.toLowerCase() === clean);
    await ctx.db.insert("members", {
      communityId,
      email: clean,
      userId: match?._id,
      // Connecting Google needs the manager role.
      role: accountManager ? "manager" : role,
      accountManager: accountManager || undefined,
      notify: "all",
      invitedBy: user._id,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.notify.sendInvite, {
      email: clean,
      communityName: community.name,
      inviterName: user.name,
      hasAccount: !!match,
      accountManager: !!accountManager && !community.gbpLocation,
      communityId,
    });
    if (accountManager) await handConnectTask(ctx, communityId, clean);
  },
});

/** The account manager is shown as handling the "Connect the Google Business Profile" task on the fix plan. */
async function handConnectTask(ctx: MutationCtx, communityId: Id<"communities">, email: string) {
  const rows = await ctx.db.query("fixTasks").withIndex("by_community", (q) => q.eq("communityId", communityId)).collect();
  const row = rows.find((r) => r.key === "connect-google");
  if (row) await ctx.db.patch(row._id, { assignee: email });
  else await ctx.db.insert("fixTasks", { communityId, key: "connect-google", status: "open", assignee: email, createdAt: Date.now() });
}

/**
 * Names someone already on the property as its account manager, or takes that
 * away. Naming them makes them a manager and emails them the steps to connect
 * the Google Business Profile; "resend" sends those steps again.
 */
export const setAccountManager = mutation({
  args: { communityId: v.id("communities"), memberId: v.id("members"), on: v.boolean() },
  handler: async (ctx, { communityId, memberId, on }) => {
    const { user, community } = await requireManager(ctx, communityId);
    const member = await ctx.db.get(memberId);
    if (!member || member.communityId !== communityId) throw new ConvexError("Person not found.");
    await ctx.db.patch(memberId, on ? { accountManager: true, role: "manager" } : { accountManager: undefined });
    if (!on) return;
    await handConnectTask(ctx, communityId, member.email);
    if (community.gbpLocation) return;
    await ctx.scheduler.runAfter(0, internal.notify.sendInvite, {
      email: member.email,
      communityName: community.name,
      inviterName: user.name,
      hasAccount: !!member.userId,
      accountManager: true,
      communityId,
    });
  },
});

/** Managers can change anyone; each person can change their own alerts. */
export const update = mutation({
  args: {
    communityId: v.id("communities"),
    memberId: v.union(v.id("members"), v.null()), // null = the account owner
    role: v.optional(memberRole),
    notify: v.optional(notifyPref),
  },
  handler: async (ctx, { communityId, memberId, role, notify }) => {
    const access = await requireCommunity(ctx, communityId);
    const canManage = isManager(access.role);
    if (memberId === null) {
      if (access.user._id !== access.owner._id && !canManage) throw new ConvexError("Only the owner or a manager can change this.");
      if (notify) await ctx.db.patch(communityId, { ownerNotify: notify });
      return;
    }
    const member = await ctx.db.get(memberId);
    if (!member || member.communityId !== communityId) throw new ConvexError("Person not found.");
    const isSelf = member.userId === access.user._id;
    if (role !== undefined && !canManage) throw new ConvexError("Only the owner or a manager can change roles.");
    if (!canManage && !isSelf) throw new ConvexError("You can only change your own alerts.");
    await ctx.db.patch(memberId, { ...(role ? { role } : {}), ...(notify ? { notify } : {}) });
  },
});

export const remove = mutation({
  args: { communityId: v.id("communities"), memberId: v.id("members") },
  handler: async (ctx, { communityId, memberId }) => {
    await requireManager(ctx, communityId);
    const member = await ctx.db.get(memberId);
    if (!member || member.communityId !== communityId) throw new ConvexError("Person not found.");
    await ctx.db.delete(memberId);
  },
});
