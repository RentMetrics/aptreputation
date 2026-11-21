import { internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireCommunity, requireResponder } from "./lib/auth";
import { factSheetText, factsComplete, tasksFor, titleOf, type Facts } from "./lib/fixPlan";
import type { VisibilityResult } from "./lib/visibility";

const DAY = 24 * 60 * 60 * 1000;
export const CHECK_EVERY_DAYS = 30;
// Habits and set-up steps: their state is read from the property, never stored.
const SELF_CLEARING = ["fact-sheet", "connect-google", "google-rating", "reply-reviews"];

function parse(json: string | undefined): VisibilityResult | null {
  if (!json) return null;
  try {
    const r = JSON.parse(json) as VisibilityResult;
    return r.v === 2 ? r : null;
  } catch {
    return null;
  }
}

async function latestCheck(ctx: QueryCtx | MutationCtx, communityId: Id<"communities">) {
  const rows = await ctx.db
    .query("visibilityScans")
    .withIndex("by_community", (q) => q.eq("communityId", communityId))
    .order("desc")
    .take(10);
  for (const row of rows) {
    if (row.status !== "done") continue;
    const result = parse(row.result);
    if (result) return { at: row.finishedAt ?? row.startedAt, result };
  }
  return null;
}

const specsFor = (community: Doc<"communities">, result: VisibilityResult | null) =>
  tasksFor(result, { hasGoogle: !!community.gbpLocation, facts: community.facts });

/** Everything the Fix plan tab shows for one property. */
export const get = query({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    const { community } = await requireCommunity(ctx, communityId);
    const check = await latestCheck(ctx, communityId);
    const rows = await ctx.db.query("fixTasks").withIndex("by_community", (q) => q.eq("communityId", communityId)).collect();
    const rowOf = new Map(rows.map((r) => [r.key, r]));
    const specs = specsFor(community, check?.result ?? null);

    const tasks = specs.map((spec) => {
      const row = rowOf.get(spec.key);
      // A habit is never done, and a task AptReputation can see for itself is open for as long as it is listed.
      const done = spec.verify !== "ongoing" && spec.verify !== "auto" && row?.status === "done";
      return {
        ...spec,
        status: done ? ("done" as const) : ("open" as const),
        reopened: !done && !!row?.reopenedAt,
        assignee: row?.assignee ?? null,
        doneAt: done ? row?.doneAt ?? null : null,
      };
    });

    const listed = new Set(specs.map((s) => s.key));
    const cleared = rows
      .filter((r) => r.status === "cleared" && !listed.has(r.key))
      .map((r) => ({ key: r.key, title: titleOf(r.key), at: r.clearedAt ?? null, how: "No longer found by the check" }));
    // Set-up steps AptReputation can see are finished.
    if (factsComplete(community.facts)) cleared.push({ key: "fact-sheet", title: titleOf("fact-sheet"), at: community.facts?.updatedAt ?? null, how: "Filled in" });
    if (community.gbpLocation) cleared.push({ key: "connect-google", title: titleOf("connect-google"), at: null, how: "Connected" });

    const facts: Facts = Object.fromEntries(Object.entries(community.facts ?? {}).filter(([k]) => k !== "updatedAt"));
    const countable = tasks.filter((t) => t.verify !== "ongoing");
    return {
      name: community.name,
      address: community.address,
      hasGoogle: !!community.gbpLocation,
      tasks,
      cleared,
      open: countable.filter((t) => t.status === "open").length,
      waiting: countable.filter((t) => t.status === "done").length,
      facts,
      // What Google shows, offered as a starting point for an empty fact sheet.
      suggested: check ? { phone: check.result.google.phone, website: check.result.site?.url ?? check.result.google.website } : null,
      factSheet: factSheetText(community.name, community.address, community.facts),
      lastCheckAt: check?.at ?? null,
      nextCheckAt: check ? check.at + CHECK_EVERY_DAYS * DAY : null,
      shown: check ? { shown: check.result.shown, outOf: check.result.outOf } : null,
    };
  },
});

/** A person says their part of a task is finished, or takes that back. */
export const setDone = mutation({
  args: { communityId: v.id("communities"), key: v.string(), done: v.boolean() },
  handler: async (ctx, { communityId, key, done }) => {
    const { user, community } = await requireResponder(ctx, communityId);
    const check = await latestCheck(ctx, communityId);
    const spec = specsFor(community, check?.result ?? null).find((s) => s.key === key);
    if (!spec) throw new ConvexError("That task is no longer on the plan.");
    if (spec.verify === "ongoing" || spec.verify === "auto") throw new ConvexError("This task clears itself.");
    const row = (await ctx.db.query("fixTasks").withIndex("by_community", (q) => q.eq("communityId", communityId)).collect()).find((r) => r.key === key);
    const patch = done
      ? { status: "done" as const, doneAt: Date.now(), doneBy: user._id, reopenedAt: undefined }
      : { status: "open" as const, doneAt: undefined, doneBy: undefined };
    if (row) await ctx.db.patch(row._id, patch);
    else await ctx.db.insert("fixTasks", { communityId, key, createdAt: Date.now(), ...patch });
  },
});

/** Notes who is handling a task: a name or an email, as free text. */
export const assign = mutation({
  args: { communityId: v.id("communities"), key: v.string(), assignee: v.string() },
  handler: async (ctx, { communityId, key, assignee }) => {
    await requireResponder(ctx, communityId);
    const name = assignee.trim().slice(0, 80) || undefined;
    const row = (await ctx.db.query("fixTasks").withIndex("by_community", (q) => q.eq("communityId", communityId)).collect()).find((r) => r.key === key);
    if (row) await ctx.db.patch(row._id, { assignee: name });
    else await ctx.db.insert("fixTasks", { communityId, key, status: "open", assignee: name, createdAt: Date.now() });
  },
});

const fact = v.optional(v.string());

export const saveFacts = mutation({
  args: {
    communityId: v.id("communities"),
    facts: v.object({ phone: fact, website: fact, hours: fact, bedrooms: fact, rent: fact, special: fact, pets: fact, formerNames: fact }),
  },
  handler: async (ctx, { communityId, facts }) => {
    await requireResponder(ctx, communityId);
    const clean = Object.fromEntries(
      Object.entries(facts)
        .map(([k, value]) => [k, value?.trim().slice(0, 300)])
        .filter(([, value]) => value),
    ) as Facts;
    await ctx.db.patch(communityId, { facts: { ...clean, updatedAt: Date.now() } });
  },
});

/**
 * Called when a check finishes. Tasks the check can confirm are cleared when it
 * no longer finds the problem, and reopened when it still does after someone
 * marked them done.
 */
export async function syncAfterCheck(ctx: MutationCtx, communityId: Id<"communities">, result: VisibilityResult) {
  const community = await ctx.db.get(communityId);
  if (!community) return;
  const now = Date.now();
  const found = new Set(specsFor(community, result).filter((s) => s.verify === "check").map((s) => s.key));
  const rows = await ctx.db.query("fixTasks").withIndex("by_community", (q) => q.eq("communityId", communityId)).collect();
  const rowOf = new Map(rows.map((r) => [r.key, r]));
  // Every problem the check found gets a row, so a later check can show it as cleared.
  for (const key of found) {
    const row = rowOf.get(key);
    if (!row) await ctx.db.insert("fixTasks", { communityId, key, status: "open", createdAt: now });
    else if (row.status !== "open") await ctx.db.patch(row._id, { status: "open", reopenedAt: now, clearedAt: undefined });
  }
  for (const row of rows) {
    // Rows for manual and listing-site tasks are closed by people, not by the check.
    if (found.has(row.key) || row.status === "cleared" || row.key.startsWith("listing:") || row.key.startsWith("claim-")) continue;
    if (SELF_CLEARING.includes(row.key)) continue;
    await ctx.db.patch(row._id, { status: "cleared", clearedAt: now, reopenedAt: undefined });
  }
}

/** What an AI-written request needs to know about one task. */
export const requestContext = internalQuery({
  args: { communityId: v.id("communities"), key: v.string() },
  handler: async (ctx, { communityId, key }) => {
    const { community, owner } = await requireResponder(ctx, communityId);
    const check = await latestCheck(ctx, communityId);
    const spec = specsFor(community, check?.result ?? null).find((s) => s.key === key);
    if (!spec) throw new ConvexError("That task is no longer on the plan.");
    return { owner, spec, factSheet: factSheetText(community.name, community.address, community.facts) };
  },
});
