/**
 * BusinessSignal — AptReputation's totals for AI Marketing Hub.
 *
 * GET /business-signal/snapshot (see http.ts) is signed by the hub and answered
 * by `collect`. AGGREGATES ONLY: counts, sums and averages. Never emails, names,
 * property names or addresses, review text, or one customer's figures.
 *
 * `reviews` and `prospects` can grow large, so they are read in pages.
 */
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { windows, DAY_MS, SnapshotInput } from "./lib/businessSignal";
import { accessState } from "./lib/auth";
import type { RevenueReport } from "./billing";

const PAGE = 2000;

export const _reviewsPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const res = await ctx.db.query("reviews").paginate(args.paginationOpts);
    return {
      isDone: res.isDone,
      continueCursor: res.continueCursor,
      rows: res.page.map((r) => ({
        found: r.createdAt,
        rating: r.rating,
        negative: r.rating <= 3,
        replied: !!r.replyText,
        // Replies posted through AptReputation (not ones typed on Google directly).
        repliedHereAt: r.replyBy && r.replyAt ? r.replyAt : null,
        alerted: r.notifyState === "sent" ? r.createdAt : null,
      })),
    };
  },
});

export const _prospectsPage = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const res = await ctx.db.query("prospects").paginate(args.paginationOpts);
    return { isDone: res.isDone, continueCursor: res.continueCursor, count: res.page.length };
  },
});

export const _core = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const since30 = now - 30 * DAY_MS;
    const users = await ctx.db.query("users").take(5000);
    const communities = await ctx.db.query("communities").take(5000);
    const leads = await ctx.db.query("leads").withIndex("by_created").order("desc").take(5000);
    const scans = await ctx.db.query("visibilityScans").order("desc").take(3000);
    const fixes = await ctx.db.query("fixTasks").take(5000);
    const taps = await ctx.db.query("taps").order("desc").take(5000);
    const tags = await ctx.db.query("tags").take(5000);
    const sends = await ctx.db.query("outreachSends").withIndex("by_at", (q) => q.gte("at", since30)).take(5000);
    const batch = await ctx.db.query("reportBatch").withIndex("by_created", (q) => q.gte("createdAt", since30)).take(2000);
    const usage = await ctx.db.query("usage").order("desc").take(400);
    const day = (offset: number) => new Date(now - offset * DAY_MS).toISOString().slice(0, 10);
    const last30Days = new Set(Array.from({ length: 30 }, (_, i) => day(i)));
    const usageSum = (prefix: string, days: Set<string>) =>
      usage.filter((u) => u.key.startsWith(`${prefix}:`) && days.has(u.key.slice(prefix.length + 1))).reduce((n, u) => n + u.count, 0);

    // Customers only: the admin account is not a client.
    const customers = users.filter((u) => u.role !== "admin");
    const ownerIds = new Set(communities.map((c) => c.ownerId as string));
    const userEmails = new Set(users.map((u) => u.email.toLowerCase()));
    const states = customers.map((u) => accessState(u, now));
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
    const withScore = communities.filter((c) => c.aptScore !== undefined && c.baselineScore !== undefined);
    const withRating = communities.filter((c) => c.googleRating !== undefined && c.baselineRating !== undefined);
    const customerScans = scans.filter((s) => s.communityId);
    const prospectScans = scans.filter((s) => !s.communityId);

    return {
      signups: customers.map((u) => u.createdAt),
      withProperty: customers.filter((u) => ownerIds.has(u._id as string)).length,
      inTrial: states.filter((s) => s.inTrial && !s.subscribed && !s.free).length,
      freeAccounts: states.filter((s) => s.free).length,
      trialEnded: states.filter((s) => !s.active).length,
      propertiesCreated: communities.map((c) => c.createdAt),
      propertiesGoogleConnected: communities.filter((c) => !!c.gbpLocation).length,
      propertiesWithFacts: communities.filter((c) => !!c.facts).length,
      avgGoogleRating: avg(communities.filter((c) => c.googleRating !== undefined).map((c) => c.googleRating!)),
      avgAptScore: avg(communities.filter((c) => c.aptScore !== undefined).map((c) => c.aptScore!)),
      avgScoreChange: avg(withScore.map((c) => c.aptScore! - c.baselineScore!)),
      avgRatingChange: avg(withRating.map((c) => c.googleRating! - c.baselineRating!)),
      leads: leads.map((l) => l.createdAt),
      leadsAi: leads.filter((l) => l.aiReport).map((l) => l.createdAt),
      leadsConverted: new Set(leads.map((l) => l.email.toLowerCase()).filter((e) => userEmails.has(e))).size,
      scoreChecks30d: usageSum("audit", last30Days),
      customerChecks30d: customerScans.filter((s) => s.startedAt >= since30 && s.status === "done").length,
      monthlyChecks30d: customerScans.filter((s) => s.startedAt >= since30 && s.auto).length,
      prospectReports30d: prospectScans.filter((s) => s.startedAt >= since30 && s.status === "done").length,
      prospectReportsTotal: prospectScans.filter((s) => s.status === "done").length,
      fixesOpen: fixes.filter((f) => f.status === "open").length,
      fixesDone30d: fixes.filter((f) => (f.doneAt ?? 0) >= since30).length,
      fixesCleared30d: fixes.filter((f) => (f.clearedAt ?? 0) >= since30).length,
      taps30d: taps.filter((t) => t.at >= since30).length,
      cardsAssigned: tags.filter((t) => !!t.communityId && !t.disabled).length,
      outreachSent30d: sends.filter((s) => !s.test).length,
      batchReports30d: batch.length,
    };
  },
});

export const collect = internalAction({
  args: {},
  handler: async (ctx): Promise<SnapshotInput> => {
    const now = Date.now();
    const since30 = now - 30 * DAY_MS;

    type RRow = { found: number; rating: number; negative: boolean; replied: boolean; repliedHereAt: number | null; alerted: number | null };
    const reviews: RRow[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page: { isDone: boolean; continueCursor: string; rows: RRow[] } = await ctx.runQuery(
        internal.businessSignal._reviewsPage,
        { paginationOpts: { numItems: PAGE, cursor } },
      );
      reviews.push(...page.rows);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    let prospects = 0;
    cursor = null;
    for (;;) {
      const page: { isDone: boolean; continueCursor: string; count: number } = await ctx.runQuery(
        internal.businessSignal._prospectsPage,
        { paginationOpts: { numItems: PAGE * 4, cursor } },
      );
      prospects += page.count;
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    const core = await ctx.runQuery(internal.businessSignal._core, { now });
    let money: RevenueReport | null = null;
    try {
      money = await ctx.runAction(internal.billing.revenueReport, {});
      if (money.stripeError) money = null;
    } catch {
      money = null;
    }

    const uw = windows(core.signups, now);
    const pw = windows(core.propertiesCreated, now);
    const lw = windows(core.leads, now);
    const aw = windows(core.leadsAi, now);
    const rw = windows(reviews.map((r) => r.found), now);
    const recent = reviews.filter((r) => r.found >= since30);
    const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
    const negatives = reviews.filter((r) => r.negative);

    return {
      users: { total: uw.total, new24h: uw.last24h },
      ...(money
        ? {
            revenue: {
              mrr: Math.round(money.mrr),
              arr: Math.round(money.mrr * 12),
              paying: money.payingAccounts,
            },
            plans: money.payingAccounts
              ? [{ plan: "Monthly, per property", customers: money.payingAccounts, mrr: Math.round(money.mrr) }]
              : [],
          }
        : {}),
      growth: { signups24h: uw.last24h, signups7d: uw.last7d, signups30d: uw.last30d },
      funnel: [
        { key: "score_checks", label: "Free AptRep Score checks", count: core.scoreChecks30d },
        { key: "emails_left", label: "Emails left on the score page", count: lw.last30d },
        { key: "ai_requests", label: "Free AI search reports requested", count: aw.last30d },
        { key: "signed_up", label: "Accounts created", count: uw.last30d },
        { key: "property_added", label: "Properties added", count: pw.last30d },
      ],
      leads: [
        {
          key: "score_page",
          label: "Emails left on the score page",
          total: lw.total,
          new7d: lw.last7d,
          new30d: lw.last30d,
          converted: core.leadsConverted,
          adminPath: "/admin",
        },
        { key: "prospects", label: "Outreach prospect list (apartment communities)", total: prospects, adminPath: "/admin" },
      ],
      usage: [
        { key: "properties", label: "Properties", value: pw.total, window: "total" },
        { key: "google_connected", label: "Properties with Google profile connected", value: core.propertiesGoogleConnected, window: "total" },
        { key: "reviews_found", label: "New reviews picked up", value: rw.last30d, window: "30d" },
        { key: "review_alerts", label: "Reviews emailed to property teams", value: reviews.filter((r) => (r.alerted ?? 0) >= since30).length, window: "30d" },
        { key: "replies", label: "Replies posted through AptReputation", value: reviews.filter((r) => (r.repliedHereAt ?? 0) >= since30).length, window: "30d" },
        { key: "ai_checks", label: "AI search checks on customer properties", value: core.customerChecks30d, window: "30d" },
        { key: "fixes_done", label: "Fix plan steps marked done", value: core.fixesDone30d, window: "30d" },
        { key: "card_taps", label: "Review card taps", value: core.taps30d, window: "30d" },
      ],
      signupsDaily: uw.daily,
      custom: {
        accountsWithProperty: core.withProperty,
        accountsInFreeTrial: core.inTrial,
        accountsFree: core.freeAccounts,
        accountsTrialEnded: core.trialEnded,
        payingProperties: money?.payingProperties ?? null,
        collectedThisMonth: money ? Math.round(money.collectedThisMonth) : null,
        collectedAllTime: money ? Math.round(money.collectedAllTime) : null,
        propertiesAdded30d: pw.last30d,
        propertiesWithFactSheet: core.propertiesWithFacts,
        avgGoogleRating: core.avgGoogleRating,
        avgGoogleRatingChangeSinceJoining: core.avgRatingChange,
        avgAptRepScore: core.avgAptScore,
        avgAptRepScoreChangeSinceJoining: core.avgScoreChange,
        reviewsTotal: rw.total,
        reviewsNewIn30d: recent.length,
        negativeReviewsRepliedPct: pct(negatives.filter((r) => r.replied).length, negatives.length),
        reviewsRepliedPct: pct(reviews.filter((r) => r.replied).length, reviews.length),
        monthlyAiChecks30d: core.monthlyChecks30d,
        fixPlanStepsOpen: core.fixesOpen,
        fixPlanStepsClearedByCheck30d: core.fixesCleared30d,
        reviewCardsAssigned: core.cardsAssigned,
        prospectAiReports30d: core.prospectReports30d,
        prospectAiReportsTotal: core.prospectReportsTotal,
        batchReports30d: core.batchReports30d,
        outreachEmailsSent30d: core.outreachSent30d,
        aiReportRequestsTotal: aw.total,
      },
      gaps: [
        ...(money ? [] : ["Stripe could not be read, so revenue is left out of this snapshot."]),
        "Sign-in activity is not recorded, so active users (7 and 30 days) are left out.",
        "Where sign-ups came from (utm/referrer) is not captured, so acquisition is left out.",
        "Prospect outreach emails are copied and sent by hand from Gmail; only emails sent by AptReputation's own outreach sequence are counted.",
      ],
    };
  },
});
