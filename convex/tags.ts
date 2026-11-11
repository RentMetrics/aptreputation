import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireAdmin, requireCommunity, requireResponder, requireUser, randomCode } from "./lib/auth";
import { writeReviewUrl } from "./lib/google";
import { Id } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";

function normalizeSerial(serial: string) {
  const hex = serial.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length < 8 || hex.length > 20 || hex.length % 2) throw new ConvexError(`"${serial}" is not a valid NFC serial number.`);
  return hex.match(/../g)!.join(":");
}

async function newCode(ctx: MutationCtx) {
  for (let i = 0; i < 5; i++) {
    const code = randomCode(7);
    const clash = await ctx.db.query("tags").withIndex("by_code", (q) => q.eq("code", code)).unique();
    if (!clash) return code;
  }
  throw new ConvexError("Could not generate a card code. Try again.");
}

async function requireTag(ctx: MutationCtx, tagId: Id<"tags">) {
  const user = await requireUser(ctx);
  const tag = await ctx.db.get(tagId);
  if (!tag) throw new ConvexError("Card not found.");
  // On a property: anyone who can act there. Not placed yet: whoever claimed it.
  if (tag.communityId) await requireResponder(ctx, tag.communityId);
  else if (tag.ownerId !== user._id && user.role !== "admin") throw new ConvexError("Card not found.");
  return { tag, user };
}

async function checkStaff(ctx: MutationCtx, communityId: Id<"communities">, staffId?: Id<"staff">) {
  if (!staffId) return;
  const staff = await ctx.db.get(staffId);
  if (!staff || staff.communityId !== communityId) throw new ConvexError("Team member not found.");
}

export const listForCommunity = query({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    const { user } = await requireCommunity(ctx, communityId);
    const tags = await ctx.db.query("tags").withIndex("by_community", (q) => q.eq("communityId", communityId)).collect();
    const mine = await ctx.db.query("tags").withIndex("by_owner", (q) => q.eq("ownerId", user._id)).collect();
    const staff = await ctx.db.query("staff").withIndex("by_community", (q) => q.eq("communityId", communityId)).collect();
    const names = new Map(staff.map((s) => [s._id, s.name]));
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const taps = await ctx.db
      .query("taps")
      .withIndex("by_community_at", (q) => q.eq("communityId", communityId).gte("at", since))
      .collect();
    return {
      tags: tags.map((t) => ({
        ...t,
        staffName: t.staffId ? names.get(t.staffId) : undefined,
        taps30d: taps.filter((x) => x.tagId === t._id).length,
      })),
      // Cards this account owns that are not on a property yet.
      unassigned: mine.filter((t) => !t.communityId && t.kind === "nfc"),
      taps30d: taps.length,
    };
  },
});

/** Printable QR / link, optionally credited to a team member. */
export const createLink = mutation({
  args: { communityId: v.id("communities"), label: v.string(), staffId: v.optional(v.id("staff")) },
  handler: async (ctx, { communityId, label, staffId }) => {
    const { user } = await requireResponder(ctx, communityId);
    await checkStaff(ctx, communityId, staffId);
    return await ctx.db.insert("tags", {
      code: await newCode(ctx),
      kind: "link",
      label: label.trim() || "Review link",
      ownerId: user._id,
      communityId,
      staffId,
      tapCount: 0,
      createdAt: Date.now(),
    });
  },
});

/**
 * Add a physical NFC card. Either type the code printed/programmed on a card
 * we shipped, or register a blank card (serial optional) and get a new code to
 * write onto it.
 */
export const addCard = mutation({
  args: {
    communityId: v.id("communities"),
    code: v.optional(v.string()),
    serial: v.optional(v.string()),
    label: v.optional(v.string()),
    staffId: v.optional(v.id("staff")),
  },
  handler: async (ctx, { communityId, code, serial, label, staffId }) => {
    const { user } = await requireResponder(ctx, communityId);
    await checkStaff(ctx, communityId, staffId);
    const cleanCode = code?.trim().toLowerCase().replace(/^.*\/t\//, "");
    const cleanSerial = serial?.trim() ? normalizeSerial(serial) : undefined;

    // Claim a card that is already in inventory, by code or by serial.
    let existing = cleanCode
      ? await ctx.db.query("tags").withIndex("by_code", (q) => q.eq("code", cleanCode)).unique()
      : null;
    if (cleanCode && !existing) throw new ConvexError("No card with that code. Check the code on the card.");
    if (!existing && cleanSerial) {
      existing = await ctx.db.query("tags").withIndex("by_serial", (q) => q.eq("serial", cleanSerial)).unique();
    }
    if (existing) {
      if (existing.kind !== "nfc") throw new ConvexError("That code belongs to a link, not a card.");
      if (existing.ownerId && existing.ownerId !== user._id) throw new ConvexError("That card is registered to another account.");
      await ctx.db.patch(existing._id, {
        ownerId: user._id,
        communityId,
        staffId,
        label: label?.trim() || existing.label,
        disabled: false,
      });
      return existing._id;
    }
    return await ctx.db.insert("tags", {
      code: await newCode(ctx),
      kind: "nfc",
      serial: cleanSerial,
      label: label?.trim() || undefined,
      ownerId: user._id,
      communityId,
      staffId,
      tapCount: 0,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    tagId: v.id("tags"),
    label: v.optional(v.string()),
    staffId: v.optional(v.union(v.id("staff"), v.null())),
    disabled: v.optional(v.boolean()),
  },
  handler: async (ctx, { tagId, label, staffId, disabled }) => {
    const { tag } = await requireTag(ctx, tagId);
    if (staffId && tag.communityId) await checkStaff(ctx, tag.communityId, staffId);
    await ctx.db.patch(tagId, {
      ...(label !== undefined ? { label: label.trim() } : {}),
      ...(staffId !== undefined ? { staffId: staffId ?? undefined } : {}),
      ...(disabled !== undefined ? { disabled } : {}),
    });
  },
});

/** Links are deleted. Physical cards are detached so they can be reused. */
export const remove = mutation({
  args: { tagId: v.id("tags") },
  handler: async (ctx, { tagId }) => {
    const { tag } = await requireTag(ctx, tagId);
    if (tag.kind === "link") await ctx.db.delete(tagId);
    else await ctx.db.patch(tagId, { communityId: undefined, staffId: undefined });
  },
});

/**
 * Public: a resident tapped a card or scanned a QR. Logs the tap and returns
 * where to send them. Everyone goes to the same Google review form.
 */
export const recordTap = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const tag = await ctx.db
      .query("tags")
      .withIndex("by_code", (q) => q.eq("code", code.trim().toLowerCase()))
      .unique();
    if (!tag) return { status: "unknown" as const };
    if (!tag.communityId || tag.disabled) return { status: "inactive" as const };
    const community = await ctx.db.get(tag.communityId);
    if (!community) return { status: "inactive" as const };
    const now = Date.now();
    // Ignore a double-read of the same card within a few seconds.
    if (!tag.lastTapAt || now - tag.lastTapAt > 5000) {
      await ctx.db.insert("taps", { tagId: tag._id, communityId: community._id, staffId: tag.staffId, at: now });
      await ctx.db.patch(tag._id, { tapCount: tag.tapCount + 1, lastTapAt: now });
    }
    return { status: "ok" as const, url: writeReviewUrl(community.googlePlaceId) };
  },
});

// ---- admin: physical card inventory ---------------------------------------

export const adminInventory = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const cards = (await ctx.db.query("tags").collect()).filter((t) => t.kind === "nfc");
    return await Promise.all(
      cards.map(async (t) => ({
        ...t,
        ownerEmail: t.ownerId ? (await ctx.db.get(t.ownerId))?.email : undefined,
        communityName: t.communityId ? (await ctx.db.get(t.communityId))?.name : undefined,
      })),
    );
  },
});

/** Load physical cards into inventory. One line per card serial, or a blank count. */
export const adminAddCards = mutation({
  args: { serials: v.array(v.string()), blankCount: v.optional(v.number()) },
  handler: async (ctx, { serials, blankCount = 0 }) => {
    await requireAdmin(ctx);
    if (serials.length + blankCount > 500) throw new ConvexError("Add at most 500 cards at a time.");
    let added = 0;
    let skipped = 0;
    for (const raw of serials) {
      const serial = normalizeSerial(raw);
      const dupe = await ctx.db.query("tags").withIndex("by_serial", (q) => q.eq("serial", serial)).unique();
      if (dupe) { skipped++; continue; }
      await ctx.db.insert("tags", { code: await newCode(ctx), kind: "nfc", serial, tapCount: 0, createdAt: Date.now() });
      added++;
    }
    for (let i = 0; i < blankCount; i++) {
      await ctx.db.insert("tags", { code: await newCode(ctx), kind: "nfc", tapCount: 0, createdAt: Date.now() });
      added++;
    }
    return { added, skipped };
  },
});

export const adminRelease = mutation({
  args: { tagId: v.id("tags") },
  handler: async (ctx, { tagId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(tagId, { ownerId: undefined, communityId: undefined, staffId: undefined, shippedAt: undefined });
  },
});

/**
 * Put inventory cards on a customer's property before mailing them. The cards
 * work as soon as they are assigned: a tap opens that property's Google review
 * form, and the customer sees them under Get reviews.
 */
export const adminAssign = mutation({
  args: {
    communityId: v.id("communities"),
    tagIds: v.optional(v.array(v.id("tags"))),
    count: v.optional(v.number()),
    label: v.optional(v.string()),
  },
  handler: async (ctx, { communityId, tagIds, count, label }) => {
    await requireAdmin(ctx);
    const community = await ctx.db.get(communityId);
    if (!community) throw new ConvexError("Property not found.");
    let cards = [];
    if (tagIds?.length) {
      for (const id of tagIds) {
        const tag = await ctx.db.get(id);
        if (!tag || tag.kind !== "nfc") throw new ConvexError("Card not found.");
        if (tag.communityId && tag.communityId !== communityId) {
          throw new ConvexError(`Card ${tag.code} is already on another property. Return it to inventory first.`);
        }
        cards.push(tag);
      }
    } else {
      if (!count || !Number.isInteger(count) || count < 1 || count > 100) {
        throw new ConvexError("Choose between 1 and 100 cards.");
      }
      const all = await ctx.db.query("tags").withIndex("by_owner", (q) => q.eq("ownerId", undefined)).collect();
      cards = all.filter((t) => t.kind === "nfc" && !t.communityId).slice(0, count);
      if (cards.length < count) {
        throw new ConvexError(`Only ${cards.length} card${cards.length === 1 ? "" : "s"} left in inventory. Add more first.`);
      }
    }
    const existing = await ctx.db.query("tags").withIndex("by_community", (q) => q.eq("communityId", communityId)).collect();
    let n = existing.filter((t) => t.kind === "nfc").length;
    for (const tag of cards) {
      await ctx.db.patch(tag._id, {
        ownerId: community.ownerId,
        communityId,
        staffId: undefined,
        disabled: false,
        label: label?.trim() || tag.label || `Card ${++n}`,
      });
    }
    return cards.map((t) => t.code);
  },
});

export const adminMarkShipped = mutation({
  args: { tagIds: v.array(v.id("tags")), shipped: v.boolean() },
  handler: async (ctx, { tagIds, shipped }) => {
    await requireAdmin(ctx);
    for (const id of tagIds) {
      const tag = await ctx.db.get(id);
      if (!tag || tag.kind !== "nfc") continue;
      if (shipped && !tag.communityId) throw new ConvexError(`Assign card ${tag.code} to a property before marking it mailed.`);
      await ctx.db.patch(id, { shippedAt: shipped ? Date.now() : undefined });
    }
  },
});

/** Permanently removes a card and its tap history (lost or damaged cards). */
export const adminDelete = mutation({
  args: { tagId: v.id("tags") },
  handler: async (ctx, { tagId }) => {
    await requireAdmin(ctx);
    const tag = await ctx.db.get(tagId);
    if (!tag || tag.kind !== "nfc") throw new ConvexError("Card not found.");
    if (tag.communityId) {
      const taps = await ctx.db
        .query("taps")
        .withIndex("by_community_at", (q) => q.eq("communityId", tag.communityId!))
        .collect();
      for (const t of taps) if (t.tagId === tagId) await ctx.db.delete(t._id);
    }
    await ctx.db.delete(tagId);
  },
});
