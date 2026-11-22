import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { requireAdmin } from "./lib/auth";
import { NEVER_CONTACT } from "./lib/outreachCopy";
import { reportState } from "./visibility";
import type { AuditResult } from "./audit";

const MAX_LINES = 100;
// Each report asks three AI services fifteen questions, so the batch starts one every 20 seconds.
const GAP_MS = 20 * 1000;

/** The do-not-contact term this text matches, if any. */
function blockedBy(...texts: (string | undefined)[]) {
  const hay = texts.filter(Boolean).join(" | ").toLowerCase();
  const squeezed = hay.replace(/[^a-z0-9|@.]/g, "");
  const terms = [...NEVER_CONTACT, ...(process.env.OUTREACH_EXCLUDE ?? "").split(",")].map((t) => t.trim().toLowerCase()).filter(Boolean);
  return terms.find((t) => hay.includes(t) || squeezed.includes(t.replace(/\s+/g, ""))) ?? null;
}

/**
 * Admin: paste a list of properties, one per line, as
 *   Property name City ST | First name | email@company.com
 * (the first name and email are optional). Each is scored, checked against the
 * do-not-contact list, and has its AI search report run.
 */
export const add = mutation({
  args: { text: v.string() },
  handler: async (ctx, { text }) => {
    const admin = await requireAdmin(ctx);
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= 3);
    if (lines.length === 0) throw new ConvexError("Paste at least one property, one per line.");
    if (lines.length > MAX_LINES) throw new ConvexError(`Up to ${MAX_LINES} properties at a time.`);
    const now = Date.now();
    for (const [i, line] of lines.entries()) {
      const [q, first, email] = line.split("|").map((part) => part.trim());
      await ctx.db.insert("reportBatch", {
        createdBy: admin._id,
        query: q.slice(0, 200),
        firstName: first ? first.slice(0, 60) : undefined,
        email: email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email.toLowerCase().slice(0, 200) : undefined,
        status: "queued",
        // Keeps the pasted order.
        createdAt: now + i,
      });
    }
    await ctx.scheduler.runAfter(0, internal.batch.processNext, {});
    return lines.length;
  },
});

export const claimNext = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Only one item is worked on at a time.
    const all = await ctx.db.query("reportBatch").withIndex("by_created").collect();
    if (all.some((r) => r.status === "scoring")) return null;
    const next = all.find((r) => r.status === "queued");
    if (!next) return null;
    await ctx.db.patch(next._id, { status: "scoring" });
    return next;
  },
});

export const settle = internalMutation({
  args: {
    id: v.id("reportBatch"),
    status: v.union(v.literal("started"), v.literal("blocked"), v.literal("notfound"), v.literal("failed")),
    placeId: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, placeId, note }) => {
    await ctx.db.patch(id, { status, placeId, note });
  },
});

export const processNext = internalAction({
  args: {},
  handler: async (ctx): Promise<null> => {
    const item = await ctx.runMutation(internal.batch.claimNext, {});
    if (!item) return null;
    let gap = 2000;
    try {
      const audit: AuditResult | null = await ctx.runAction(api.audit.run, { query: item.query });
      if (!audit) {
        await ctx.runMutation(internal.batch.settle, { id: item._id, status: "notfound", note: "Google has no listing that matches. Add the city and state, or use the street address." });
      } else {
        const blocked = blockedBy(audit.name, audit.address, item.email, item.query);
        if (blocked) {
          await ctx.runMutation(internal.batch.settle, { id: item._id, status: "blocked", placeId: audit.placeId, note: `Matches "${blocked}" on the do-not-contact list. No report was run.` });
        } else {
          const out = await ctx.runMutation(internal.visibility.startOrReuseReport, {
            placeId: audit.placeId,
            name: audit.name,
            address: audit.address,
            rating: audit.rating ?? undefined,
            totalReviews: audit.totalReviews,
            startedBy: item.createdBy,
          });
          await ctx.runMutation(internal.batch.settle, { id: item._id, status: "started", placeId: audit.placeId, note: out.reused ? "Used a report from the last 45 days." : undefined });
          if (!out.reused) gap = GAP_MS;
        }
      }
    } catch (e) {
      await ctx.runMutation(internal.batch.settle, { id: item._id, status: "failed", note: e instanceof Error ? e.message.slice(0, 200) : "Scoring failed." });
    }
    await ctx.scheduler.runAfter(gap, internal.batch.processNext, {});
    return null;
  },
});

/** Admin: the batch with each property's score and report, for writing the emails. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = (await ctx.db.query("reportBatch").withIndex("by_created").order("desc").take(200)).reverse();
    return await Promise.all(
      rows.map(async (r) => {
        let audit: (AuditResult & { ai?: unknown }) | null = null;
        let report: Awaited<ReturnType<typeof reportState>> | null = null;
        if (r.placeId) {
          const cached = await ctx.db.query("auditCache").withIndex("by_place", (q) => q.eq("placeId", r.placeId!)).unique();
          audit = cached ? (JSON.parse(cached.result) as AuditResult) : null;
          if (r.status === "started") report = await reportState(ctx, r.placeId);
        }
        return {
          _id: r._id,
          query: r.query,
          firstName: r.firstName ?? null,
          email: r.email ?? null,
          status: r.status,
          note: r.note ?? null,
          audit: audit ? { ...audit, ai: report?.ai ?? null } : null,
          report: report ? { state: report.state, error: "error" in report ? report.error : null } : null,
        };
      }),
    );
  },
});

/** Admin: clear the list. Reports already run stay on their public score pages. */
export const clear = mutation({
  args: { onlyFinished: v.boolean() },
  handler: async (ctx, { onlyFinished }) => {
    await requireAdmin(ctx);
    for (const r of await ctx.db.query("reportBatch").collect()) {
      if (onlyFinished && (r.status === "queued" || r.status === "scoring")) continue;
      await ctx.db.delete(r._id);
    }
  },
});
