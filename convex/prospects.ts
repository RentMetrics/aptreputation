import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { Doc } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { matchProspect } from "./lib/google";
import { outreachStatus, prospectGroupKind, prospectStatus } from "./schema";

/**
 * The marketing list: apartment communities, who manages them, and their
 * public Google rating. Everything here is admin-only.
 */

const BATCH = 20; // properties looked up per job step
const MAX_PER_JOB = 5000;

const scope = {
  kind: v.union(v.literal("all"), prospectGroupKind),
  key: v.optional(v.string()),
};

export function companyKey(name?: string | null) {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoped(
  ctx: QueryCtx | MutationCtx,
  kind: "all" | "metro" | "state" | "management",
  key: string | undefined,
  status: Doc<"prospects">["rateStatus"],
) {
  const table = ctx.db.query("prospects");
  if (kind === "all") return table.withIndex("by_status", (q) => q.eq("rateStatus", status));
  if (!key) throw new ConvexError("Choose a filter value.");
  if (kind === "metro") return table.withIndex("by_metro", (q) => q.eq("metro", key).eq("rateStatus", status));
  if (kind === "state") return table.withIndex("by_state", (q) => q.eq("state", key).eq("rateStatus", status));
  return table.withIndex("by_management", (q) => q.eq("managementKey", key).eq("rateStatus", status));
}

// ---- reading the list -------------------------------------------------------

export const summary = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const states = await ctx.db
      .query("prospectGroups")
      .withIndex("by_kind_size", (q) => q.eq("kind", "state"))
      .order("desc")
      .collect();
    const metros = await ctx.db
      .query("prospectGroups")
      .withIndex("by_kind_size", (q) => q.eq("kind", "metro"))
      .order("desc")
      .collect();
    const jobs = await ctx.db.query("ratingJobs").withIndex("by_started").order("desc").take(5);
    const sum = (f: (g: Doc<"prospectGroups">) => number) => states.reduce((n, g) => n + f(g), 0);
    return {
      total: sum((g) => g.properties),
      units: sum((g) => g.units),
      rated: sum((g) => g.rated),
      averageRating: sum((g) => g.rated) ? sum((g) => g.ratingSum) / sum((g) => g.rated) : null,
      states: states.map((g) => ({ key: g.key, name: g.name, properties: g.properties, rated: g.rated })),
      metros: metros.map((g) => ({ key: g.key, name: g.name, properties: g.properties, rated: g.rated })),
      jobs,
    };
  },
});

/** Management companies, largest first, optionally filtered by name. */
export const companies = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, { search }) => {
    await requireAdmin(ctx);
    const needle = companyKey(search);
    const rows = ctx.db
      .query("prospectGroups")
      .withIndex("by_kind_size", (q) => q.eq("kind", "management"))
      .order("desc");
    const out: Doc<"prospectGroups">[] = [];
    let scanned = 0;
    for await (const g of rows) {
      if (++scanned > 12000 || out.length >= 150) break;
      if (!needle || g.key.includes(needle)) out.push(g);
    }
    return out.map((g) => ({
      key: g.key,
      name: g.name,
      properties: g.properties,
      units: g.units,
      rated: g.rated,
      averageRating: g.rated ? g.ratingSum / g.rated : null,
    }));
  },
});

export const list = query({
  args: {
    ...scope,
    status: prospectStatus,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { kind, key, status, paginationOpts }) => {
    await requireAdmin(ctx);
    // Rated properties come lowest rating first: the strongest sales case.
    return await scoped(ctx, kind, key, status).order("asc").paginate(paginationOpts);
  },
});

export const searchByName = query({
  args: { text: v.string(), state: v.optional(v.string()) },
  handler: async (ctx, { text, state }) => {
    await requireAdmin(ctx);
    if (text.trim().length < 2) return [];
    return await ctx.db
      .query("prospects")
      .withSearchIndex("search_name", (q) => {
        const s = q.search("name", text);
        return state ? s.eq("state", state) : s;
      })
      .take(40);
  },
});

/** Rows for a CSV download of one filter (rated properties only). */
export const exportRows = query({
  args: { ...scope },
  handler: async (ctx, { kind, key }) => {
    await requireAdmin(ctx);
    return await scoped(ctx, kind, key, "rated").order("asc").take(4000);
  },
});

export const setOutreach = mutation({
  args: {
    prospectId: v.id("prospects"),
    outreach: v.optional(v.union(outreachStatus, v.null())),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { prospectId, outreach, note }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(prospectId, {
      ...(outreach !== undefined ? { outreach: outreach ?? undefined } : {}),
      ...(note !== undefined ? { note: note.trim().slice(0, 500) || undefined } : {}),
    });
  },
});

// ---- Google rating runs -----------------------------------------------------

async function groupName(ctx: QueryCtx, kind: "metro" | "state" | "management", key: string) {
  const g = await ctx.db
    .query("prospectGroups")
    .withIndex("by_kind_key", (q) => q.eq("kind", kind).eq("key", key))
    .unique();
  return g?.name ?? key;
}

export const startRating = mutation({
  args: { ...scope, limit: v.number() },
  handler: async (ctx, { kind, key, limit }) => {
    await requireAdmin(ctx);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PER_JOB) {
      throw new ConvexError(`Choose between 1 and ${MAX_PER_JOB} properties per run.`);
    }
    const latest = await ctx.db.query("ratingJobs").withIndex("by_started").order("desc").first();
    if (latest?.status === "running") throw new ConvexError("A rating run is already in progress.");
    const first = await scoped(ctx, kind, key, "new").first();
    if (!first) throw new ConvexError("Every property in this group has already been looked up.");
    const jobId = await ctx.db.insert("ratingJobs", {
      scopeKind: kind,
      scopeKey: key,
      scopeName: kind === "all" ? "All properties" : await groupName(ctx, kind, key!),
      limit,
      done: 0,
      rated: 0,
      noMatch: 0,
      status: "running",
      startedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.prospects.runJob, { jobId });
    return jobId;
  },
});

export const stopRating = mutation({
  args: { jobId: v.id("ratingJobs") },
  handler: async (ctx, { jobId }) => {
    await requireAdmin(ctx);
    const job = await ctx.db.get(jobId);
    if (job?.status === "running") await ctx.db.patch(jobId, { status: "stopped", finishedAt: Date.now() });
  },
});

export const nextBatch = internalQuery({
  args: { jobId: v.id("ratingJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.status !== "running") return null;
    const left = job.limit - job.done;
    if (left <= 0) return { job, rows: [] };
    const rows = await scoped(ctx, job.scopeKind, job.scopeKey, "new").take(Math.min(BATCH, left));
    return { job, rows };
  },
});

async function bumpGroup(
  ctx: MutationCtx,
  kind: "metro" | "state" | "management",
  key: string,
  rating: number,
) {
  if (!key) return;
  const g = await ctx.db
    .query("prospectGroups")
    .withIndex("by_kind_key", (q) => q.eq("kind", kind).eq("key", key))
    .unique();
  if (g) await ctx.db.patch(g._id, { rated: g.rated + 1, ratingSum: g.ratingSum + rating });
}

export const saveBatch = internalMutation({
  args: {
    jobId: v.id("ratingJobs"),
    results: v.array(
      v.object({
        prospectId: v.id("prospects"),
        placeId: v.optional(v.string()),
        name: v.optional(v.string()),
        rating: v.optional(v.number()),
        totalReviews: v.optional(v.number()),
      }),
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { jobId, results, error }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return false;
    let rated = 0;
    let noMatch = 0;
    for (const r of results) {
      const p = await ctx.db.get(r.prospectId);
      if (!p || p.rateStatus !== "new") continue;
      const status = !r.placeId ? "nomatch" : typeof r.rating === "number" ? "rated" : "noreviews";
      await ctx.db.patch(p._id, {
        rateStatus: status,
        googlePlaceId: r.placeId,
        googleName: r.name,
        googleRating: r.rating,
        googleReviews: r.totalReviews ?? (r.placeId ? 0 : undefined),
        ratedAt: Date.now(),
      });
      if (status === "rated") {
        rated++;
        await bumpGroup(ctx, "metro", p.metro, r.rating!);
        await bumpGroup(ctx, "state", p.state, r.rating!);
        await bumpGroup(ctx, "management", p.managementKey, r.rating!);
      } else if (status === "nomatch") noMatch++;
    }
    const done = job.done + results.length;
    const finished = error ? "failed" : done >= job.limit || results.length === 0 ? "done" : job.status;
    await ctx.db.patch(jobId, {
      done,
      rated: job.rated + rated,
      noMatch: job.noMatch + noMatch,
      ...(finished !== "running" ? { status: finished, finishedAt: job.finishedAt ?? Date.now() } : {}),
      ...(error ? { error } : {}),
    });
    return finished === "running";
  },
});

/** One step of a rating run: looks up a batch, saves it, then schedules the next. */
export const runJob = internalAction({
  args: { jobId: v.id("ratingJobs") },
  handler: async (ctx, { jobId }) => {
    const next = await ctx.runQuery(internal.prospects.nextBatch, { jobId });
    if (!next) return;
    const results: {
      prospectId: Doc<"prospects">["_id"];
      placeId?: string;
      name?: string;
      rating?: number;
      totalReviews?: number;
    }[] = [];
    let error: string | undefined;
    // Five at a time keeps well inside Google's per-minute quota.
    for (let i = 0; i < next.rows.length && !error; i += 5) {
      const settled = await Promise.allSettled(
        next.rows.slice(i, i + 5).map(async (p) => {
          const m = await matchProspect(p);
          return { prospectId: p._id, placeId: m?.placeId, name: m?.name, rating: m?.rating, totalReviews: m?.totalReviews };
        }),
      );
      for (const s of settled) {
        if (s.status === "fulfilled") results.push(s.value);
        // A Google error (key, billing, quota) stops the run rather than
        // marking real properties as not found.
        else error = s.reason instanceof ConvexError ? String(s.reason.data) : "Google lookup failed.";
      }
    }
    const more = await ctx.runMutation(internal.prospects.saveBatch, { jobId, results, error });
    if (more) await ctx.scheduler.runAfter(500, internal.prospects.runJob, { jobId });
  },
});

// ---- loading the list (scripts/prospects-load.mjs, via `npx convex run`) ----

const incoming = v.object({
  sourceId: v.string(),
  name: v.string(),
  address: v.optional(v.string()),
  city: v.string(),
  state: v.string(),
  zip: v.optional(v.string()),
  phone: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  metro: v.string(),
  units: v.optional(v.number()),
  owner: v.optional(v.string()),
  management: v.optional(v.string()),
});

export const importBatch = internalMutation({
  args: { rows: v.array(incoming) },
  handler: async (ctx, { rows }) => {
    let added = 0;
    for (const row of rows) {
      const doc = { ...row, managementKey: companyKey(row.management) };
      const existing = await ctx.db
        .query("prospects")
        .withIndex("by_source", (q) => q.eq("sourceId", row.sourceId))
        .unique();
      // A reload refreshes names and managers but keeps ratings and notes.
      if (existing) await ctx.db.patch(existing._id, doc);
      else {
        await ctx.db.insert("prospects", { ...doc, rateStatus: "new" });
        added++;
      }
    }
    return { added, updated: rows.length - added };
  },
});

export const importGroups = internalMutation({
  args: {
    groups: v.array(
      v.object({ kind: prospectGroupKind, key: v.string(), name: v.string(), properties: v.number(), units: v.number() }),
    ),
  },
  handler: async (ctx, { groups }) => {
    for (const g of groups) {
      const existing = await ctx.db
        .query("prospectGroups")
        .withIndex("by_kind_key", (q) => q.eq("kind", g.kind).eq("key", g.key))
        .unique();
      if (existing) await ctx.db.patch(existing._id, { name: g.name, properties: g.properties, units: g.units });
      else await ctx.db.insert("prospectGroups", { ...g, rated: 0, ratingSum: 0 });
    }
    return groups.length;
  },
});
