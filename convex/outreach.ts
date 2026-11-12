import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";
import { requireAdmin, randomCode } from "./lib/auth";
import { POSTAL_ADDRESS, PUBLIC_SITE, STEP_GAP_DAYS, sequence } from "./lib/outreachCopy";

/**
 * Outreach to properties on the marketing list.
 *
 *   1. Ratings are looked up (prospects.ts), which also saves each property's
 *      own website from its Google listing.
 *   2. findContacts reads that website for a published contact email.
 *   3. An admin reviews each property and its emails, then approves it.
 *   4. A cron sends the three-email sequence on weekdays, within a daily cap.
 *
 * Nothing is sent to a property an admin has not approved. Unsubscribes,
 * bounces and complaints suppress the address for good.
 */

const DAY = 24 * 60 * 60 * 1000;
const CONTACT_BATCH = 12;
const SENDS_PER_TICK = 5;
const BOT = "Mozilla/5.0 (compatible; AptReputationBot/1.0; +https://www.aptreputation.com)";

function dailyCap() {
  const n = Number(process.env.OUTREACH_DAILY_CAP ?? 40);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 500) : 40;
}

/** live = real recipients. test = everything goes to OUTREACH_TEST_TO. off = nothing is sent. */
function sendMode(): "live" | "test" | "off" {
  if (!process.env.RESEND_API_KEY) return "off";
  if (process.env.OUTREACH_LIVE === "on") return "live";
  return process.env.OUTREACH_TEST_TO ? "test" : "off";
}

// ---- finding a contact email on the property's own website -----------------

const EMAIL = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}\b/gi;
const JUNK_DOMAIN = /(example\.|sentry|wixpress|godaddy|squarespace|wordpress|cloudflare|google\.|gstatic|schema\.org|w3\.org|domain\.com|email\.com|yourdomain|sample\.|^property\.com$|^company\.com$|^website\.com$|^mail\.com$|^test\.com$)/i;
// Addresses that feed a leasing CRM or chatbot. Mail sent there is logged as a
// rental enquiry, so they are never used for outreach.
const LEAD_ROUTING = /(^|\.)(leads?|lead-?mail|inbound|prospects?)\.|eliseai|assist\.rent|knock(crm|rentals|app)|hyly|funnelleasing|rentgrata|leasehawk|anyonehome|entrata|rentcafe|yardi|realpage|zillow|apartments\.com/i;
const JUNK_LOCAL = /^(no-?reply|donotreply|do-not-reply|privacy|legal|dmca|abuse|postmaster|webmaster|careers|jobs|hr|recruiting|press|media|investor|accessibility|unsubscribe)\b/i;
// Sample addresses left in website templates.
const PLACEHOLDER = /^(jon|john|jane)\.?doe|^(name|email|your\.?email|you|your|user|username|test|someone|example|firstname|first\.last)$/i;
const GOOD_LOCAL = /(leasing|office|manager|mgmt|pm$|info|contact|hello|live|rent|apartments?|community|property)/i;

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function decodeEntities(html: string) {
  return html
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&commat;/gi, "@")
    .replace(/&period;/gi, ".")
    .replace(/%40/g, "@");
}

function usable(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain || email.length > 100) return false;
  if (/\.(png|jpe?g|gif|svg|webp|css|js|json)$/i.test(domain)) return false;
  if (JUNK_DOMAIN.test(domain) || LEAD_ROUTING.test(domain) || JUNK_LOCAL.test(local) || PLACEHOLDER.test(local)) return false;
  if (/^[0-9a-f]{16,}$/i.test(local) || /\d{5,}/.test(local)) return false; // tracking and routing ids
  return true;
}

/**
 * Best published address on a page, or null. Only addresses a visitor could
 * see count: mailto links, visible text, and the site's structured contact
 * data. Script and style blocks are ignored, since they are full of strings
 * that only look like addresses (package@version and the like).
 */
export function pickEmail(html: string, siteHost: string): string | null {
  const structured: string[] = [];
  // Contact fields in the page's own data (structured data, or the JSON a site renders from).
  for (const block of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const m of block[1].matchAll(/\\?"[a-z_]*e-?mail[a-z_]*\\?"\s*:\s*\\?"(?:mailto:)?([^"\\]+)\\?"/gi)) {
      structured.push(m[1].toLowerCase());
    }
  }
  const visible = decodeEntities(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " "));
  const mailto = new Set<string>();
  for (const m of visible.matchAll(/mailto:([^"'?\s>]+)/gi)) mailto.add(m[1].toLowerCase());
  const scored = new Map<string, number>();
  const consider = (raw: string, bonus: number) => {
    const email = raw.trim().toLowerCase().replace(/\.$/, "");
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,24}$/.test(email) || !usable(email)) return;
    const [local, domain] = email.split("@");
    let score = 1 + bonus;
    if (GOOD_LOCAL.test(local)) score += 2;
    if (siteHost && (domain === siteHost || siteHost.endsWith(`.${domain}`) || domain.endsWith(`.${siteHost}`))) score += 2;
    scored.set(email, Math.max(scored.get(email) ?? 0, score));
  };
  for (const raw of visible.match(EMAIL) ?? []) consider(raw, mailto.has(raw.toLowerCase()) ? 3 : 0);
  for (const raw of structured) consider(raw, 2);
  const best = [...scored.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

async function getPage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BOT, Accept: "text/html,*/*;q=0.5" },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (type && !/html|text/i.test(type)) return null;
    return (await res.text()).slice(0, 600_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** True when the site's robots.txt asks all crawlers to stay out entirely. */
async function blockedByRobots(origin: string) {
  const robots = await getPage(`${origin}/robots.txt`);
  if (!robots) return false;
  let applies = false;
  for (const line of robots.split(/\r?\n/)) {
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (/^user-agent$/i.test(key.trim())) applies = value === "*" || /aptreputation/i.test(value);
    else if (applies && /^disallow$/i.test(key.trim()) && value === "/") return true;
  }
  return false;
}

/** Looks on the home page, then on one contact page, for a published address. */
async function findEmail(website: string): Promise<{ email: string; source: string } | "none" | "error"> {
  let origin: string;
  try {
    const u = new URL(website);
    if (!/^https?:$/.test(u.protocol)) return "none";
    origin = u.origin;
  } catch {
    return "none";
  }
  if (await blockedByRobots(origin)) return "none";
  const host = hostOf(website);
  const home = await getPage(website);
  if (home === null) return "error";
  const onHome = pickEmail(home, host);
  if (onHome) return { email: onHome, source: website };
  // One more page: the first same-site link that looks like a contact page.
  const link = [...home.matchAll(/href=["']([^"'#]+)["']/gi)]
    .map((m) => m[1])
    .find((href) => /contact/i.test(href) && !/^(mailto|tel|javascript):/i.test(href));
  if (!link) return "none";
  let contactUrl: string;
  try {
    const u = new URL(link, website);
    if (hostOf(u.href) !== host) return "none";
    contactUrl = u.href;
  } catch {
    return "none";
  }
  const page = await getPage(contactUrl);
  const found = page ? pickEmail(page, host) : null;
  return found ? { email: found, source: contactUrl } : "none";
}

async function createContactJob(ctx: MutationCtx, metro: string, limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new ConvexError("Choose between 1 and 5,000 properties.");
  const latest = await ctx.db.query("contactJobs").withIndex("by_started").order("desc").first();
  if (latest?.status === "running") throw new ConvexError("A contact search is already running.");
  const jobId = await ctx.db.insert("contactJobs", { metro, limit, done: 0, found: 0, status: "running", startedAt: Date.now() });
  await ctx.scheduler.runAfter(0, internal.outreach.contactStep, { jobId });
  return jobId;
}

export const startContacts = mutation({
  args: { metro: v.string(), limit: v.number() },
  handler: async (ctx, { metro, limit }) => {
    await requireAdmin(ctx);
    return await createContactJob(ctx, metro, limit);
  },
});

/** Same, from the command line. */
export const startContactsCli = internalMutation({
  args: { metro: v.string(), limit: v.number() },
  handler: async (ctx, { metro, limit }) => await createContactJob(ctx, metro, limit),
});

/** Clears contact results for a metro so its websites are read again (never touches approved properties). */
export const resetContactsCli = internalMutation({
  args: { metro: v.string() },
  handler: async (ctx, { metro }) => {
    const all = await ctx.db.query("prospects").withIndex("by_metro", (q) => q.eq("metro", metro)).collect();
    let n = 0;
    for (const p of all) {
      if (!p.contactStatus || p.seq) continue;
      await ctx.db.patch(p._id, { contactStatus: undefined, contactEmail: undefined, contactSource: undefined, contactCheckedAt: undefined });
      n++;
    }
    return n;
  },
});

/** Quality check from the command line: what the contact search found in a metro. */
export const contactReport = internalQuery({
  args: { metro: v.string() },
  handler: async (ctx, { metro }) => {
    const all = await ctx.db.query("prospects").withIndex("by_metro", (q) => q.eq("metro", metro)).collect();
    const checked = all.filter((p) => p.contactStatus);
    return {
      job: await ctx.db.query("contactJobs").withIndex("by_started").order("desc").first(),
      lookedUp: all.filter((p) => p.rateStatus !== "new").length,
      rated: all.filter((p) => p.rateStatus === "rated").length,
      withWebsite: all.filter((p) => p.website).length,
      checked: checked.length,
      found: checked.filter((p) => p.contactStatus === "found").length,
      none: checked.filter((p) => p.contactStatus === "none").length,
      error: checked.filter((p) => p.contactStatus === "error").length,
      sample: checked
        .filter((p) => p.contactStatus === "found")
        .slice(0, 60)
        .map((p) => ({ id: p._id, name: p.name, site: p.website, email: p.contactEmail, source: p.contactSource })),
      noneSample: checked.filter((p) => p.contactStatus !== "found").slice(0, 25).map((p) => ({ site: p.website, status: p.contactStatus })),
    };
  },
});

export const stopContacts = mutation({
  args: { jobId: v.id("contactJobs") },
  handler: async (ctx, { jobId }) => {
    await requireAdmin(ctx);
    const job = await ctx.db.get(jobId);
    if (job?.status === "running") await ctx.db.patch(jobId, { status: "stopped", finishedAt: Date.now() });
  },
});

export const contactBatch = internalQuery({
  args: { jobId: v.id("contactJobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || job.status !== "running") return null;
    const left = job.limit - job.done;
    if (left <= 0) return { rows: [] };
    // Unchecked properties in the metro that have a website from their Google listing.
    const rows = await ctx.db
      .query("prospects")
      .withIndex("by_metro_contact", (q) => q.eq("metro", job.metro).eq("contactStatus", undefined))
      .filter((q) => q.neq(q.field("website"), undefined))
      .take(Math.min(CONTACT_BATCH, left));
    return { rows: rows.map((p) => ({ _id: p._id, website: p.website! })) };
  },
});

export const saveContacts = internalMutation({
  args: {
    jobId: v.id("contactJobs"),
    results: v.array(
      v.object({
        prospectId: v.id("prospects"),
        status: v.union(v.literal("found"), v.literal("none"), v.literal("error")),
        email: v.optional(v.string()),
        source: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { jobId, results }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return false;
    let found = 0;
    for (const r of results) {
      await ctx.db.patch(r.prospectId, {
        contactStatus: r.status,
        contactEmail: r.email,
        contactSource: r.source,
        contactCheckedAt: Date.now(),
      });
      if (r.status === "found") found++;
    }
    const done = job.done + results.length;
    const finished = done >= job.limit || results.length === 0;
    await ctx.db.patch(jobId, {
      done,
      found: job.found + found,
      ...(finished && job.status === "running" ? { status: "done" as const, finishedAt: Date.now() } : {}),
    });
    return !finished && job.status === "running";
  },
});

export const contactStep = internalAction({
  args: { jobId: v.id("contactJobs") },
  handler: async (ctx, { jobId }) => {
    const next = await ctx.runQuery(internal.outreach.contactBatch, { jobId });
    if (!next) return;
    const results: { prospectId: Id<"prospects">; status: "found" | "none" | "error"; email?: string; source?: string }[] = [];
    for (let i = 0; i < next.rows.length; i += 4) {
      const settled = await Promise.all(
        next.rows.slice(i, i + 4).map(async (p) => {
          const r = await findEmail(p.website).catch(() => "error" as const);
          return typeof r === "string"
            ? { prospectId: p._id, status: r }
            : { prospectId: p._id, status: "found" as const, email: r.email, source: r.source };
        }),
      );
      results.push(...settled);
    }
    const more = await ctx.runMutation(internal.outreach.saveContacts, { jobId, results });
    if (more) await ctx.scheduler.runAfter(300, internal.outreach.contactStep, { jobId });
  },
});

// ---- the admin's view -------------------------------------------------------

export const overview = query({
  args: { metro: v.string() },
  handler: async (ctx, { metro }) => {
    await requireAdmin(ctx);
    const all = await ctx.db.query("prospects").withIndex("by_metro", (q) => q.eq("metro", metro)).collect();
    const suppressed = new Set((await ctx.db.query("outreachSuppressions").collect()).map((s) => s.email));
    const located = all.filter((p) => p.rateStatus === "rated" || p.rateStatus === "noreviews");
    const withEmail = all.filter((p) => p.contactStatus === "found" && p.contactEmail);
    // Several properties can publish the same address (one management office).
    // Only one of them is offered for approval, so nobody gets duplicate mail.
    const taken = new Set(all.filter((p) => p.seq && p.contactEmail).map((p) => p.contactEmail!));
    const ready: Doc<"prospects">[] = [];
    for (const p of withEmail.sort((a, b) => (a.googleRating ?? 9) - (b.googleRating ?? 9))) {
      if (p.seq || p.outreach || suppressed.has(p.contactEmail!) || taken.has(p.contactEmail!)) continue;
      taken.add(p.contactEmail!);
      ready.push(p);
    }
    const today = `outreach:${new Date().toISOString().slice(0, 10)}`;
    const used = await ctx.db.query("usage").withIndex("by_key", (q) => q.eq("key", today)).unique();
    const sends = await ctx.db.query("outreachSends").withIndex("by_at").order("desc").take(40);
    const names = new Map(all.map((p) => [p._id, p.name]));
    return {
      counts: {
        properties: all.length,
        lookedUp: all.filter((p) => p.rateStatus !== "new").length,
        located: located.length,
        withWebsite: located.filter((p) => p.website).length,
        checked: all.filter((p) => p.contactStatus).length,
        withEmail: withEmail.length,
        inSequence: all.filter((p) => p.seq === "active").length,
        finished: all.filter((p) => p.seq === "done").length,
        stopped: all.filter((p) => p.seq === "stopped").length,
        replied: all.filter((p) => p.outreach === "replied" || p.outreach === "customer").length,
      },
      ready: ready.slice(0, 200),
      readyTotal: ready.length,
      active: all
        .filter((p) => p.seq)
        .sort((a, b) => (a.seqNextAt ?? Infinity) - (b.seqNextAt ?? Infinity))
        .slice(0, 100),
      sends: sends.map((s) => ({ ...s, name: names.get(s.prospectId) ?? "Another metro" })),
      contactJob: await ctx.db.query("contactJobs").withIndex("by_started").order("desc").first(),
      sending: { mode: sendMode(), cap: dailyCap(), sentToday: used?.count ?? 0, testTo: process.env.OUTREACH_TEST_TO ?? null },
    };
  },
});

async function isSuppressed(ctx: MutationCtx, email: string) {
  return !!(await ctx.db.query("outreachSuppressions").withIndex("by_email", (q) => q.eq("email", email)).first());
}

/** Approve properties: they start the three-email sequence at the next send window. */
export const approve = mutation({
  args: { prospectIds: v.array(v.id("prospects")) },
  handler: async (ctx, { prospectIds }) => {
    await requireAdmin(ctx);
    if (prospectIds.length > 200) throw new ConvexError("Approve at most 200 at a time.");
    let approved = 0;
    for (const id of prospectIds) {
      const p = await ctx.db.get(id);
      if (!p || p.seq || !p.contactEmail || (await isSuppressed(ctx, p.contactEmail))) continue;
      const others = await ctx.db.query("prospects").withIndex("by_email", (q) => q.eq("contactEmail", p.contactEmail)).collect();
      if (others.some((o) => o.seq)) continue; // that address is already in a sequence
      await ctx.db.patch(id, { seq: "active", seqStep: 0, seqNextAt: Date.now(), unsubToken: randomCode(24) });
      approved++;
    }
    return approved;
  },
});

/** Take a property out: skipped before approval, or stopped mid-sequence. */
export const stop = mutation({
  args: { prospectIds: v.array(v.id("prospects")) },
  handler: async (ctx, { prospectIds }) => {
    await requireAdmin(ctx);
    for (const id of prospectIds) {
      const p = await ctx.db.get(id);
      if (!p) continue;
      await ctx.db.patch(id, { seq: "stopped", seqNextAt: undefined, stopReason: p.seq ? "stopped by admin" : "skipped", outreach: p.outreach ?? "skip" });
    }
  },
});

/** Change the address before approving, when the one found is wrong. */
export const setContact = mutation({
  args: { prospectId: v.id("prospects"), email: v.string() },
  handler: async (ctx, { prospectId, email }) => {
    await requireAdmin(ctx);
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) throw new ConvexError("Enter a valid email address.");
    await ctx.db.patch(prospectId, { contactEmail: clean, contactStatus: "found", contactSource: "entered by admin", contactCheckedAt: Date.now() });
  },
});

// ---- suppression ------------------------------------------------------------

async function suppress(ctx: MutationCtx, email: string, reason: string) {
  const clean = email.toLowerCase();
  if (!(await isSuppressed(ctx, clean))) await ctx.db.insert("outreachSuppressions", { email: clean, reason, at: Date.now() });
  const rows = await ctx.db.query("prospects").withIndex("by_email", (q) => q.eq("contactEmail", clean)).collect();
  for (const p of rows) {
    if (p.seq === "active" || !p.seq) await ctx.db.patch(p._id, { seq: "stopped", seqNextAt: undefined, stopReason: reason });
  }
}

/** Public: the link at the bottom of every outreach email. */
export const unsubscribe = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const p = token.length >= 16 ? await ctx.db.query("prospects").withIndex("by_token", (q) => q.eq("unsubToken", token)).unique() : null;
    if (!p?.contactEmail) return { ok: false };
    await suppress(ctx, p.contactEmail, "unsubscribed");
    return { ok: true };
  },
});

/** Bounces and spam complaints reported by the email provider. */
export const providerEvent = internalMutation({
  args: { resendId: v.string(), reason: v.string() },
  handler: async (ctx, { resendId, reason }) => {
    const send = await ctx.db.query("outreachSends").withIndex("by_resend", (q) => q.eq("resendId", resendId)).first();
    if (send && !send.test) await suppress(ctx, send.to, reason);
  },
});

// ---- sending ----------------------------------------------------------------

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function render(paragraphs: string[], p: { name: string; contactEmail: string; unsubToken: string }) {
  const unsub = `${PUBLIC_SITE}/u/${p.unsubToken}`;
  const signature = ["The AptReputation team", "contact@aptreputation.com", PUBLIC_SITE.replace(/^https?:\/\//, "")];
  const why = `You are receiving this because ${p.contactEmail} is published as a contact for ${p.name}. This is a business message from Apartment Reputation about our review-management service.`;
  const html = `<div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1c2b3a;max-width:580px">
${paragraphs
  .map((t) => (/^https?:\/\/\S+$/.test(t) ? `<p><a href="${esc(t)}">${esc(t)}</a></p>` : `<p>${esc(t)}</p>`))
  .join("\n")}
<p>${signature.map(esc).join("<br>")}</p>
<p style="font-size:12px;line-height:1.5;color:#6b7a8c;border-top:1px solid #dde4ec;padding-top:12px;margin-top:28px">${esc(why)}<br>${esc(POSTAL_ADDRESS)}<br><a href="${unsub}" style="color:#6b7a8c">Unsubscribe</a> and you will not hear from us again.</p>
</div>`;
  const text = [...paragraphs, signature.join("\n"), `${why}\n${POSTAL_ADDRESS}\nUnsubscribe: ${unsub}`].join("\n\n");
  return { html, text, unsub };
}

/** Weekdays, 9am to 4pm Central: when a leasing office reads its inbox. */
function inSendWindow(now: number) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "numeric", hour12: false }).formatToParts(now);
  const day = parts.find((x) => x.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((x) => x.type === "hour")?.value ?? -1);
  return !["Sat", "Sun"].includes(day) && hour >= 9 && hour < 16;
}

export const due = internalMutation({
  args: {},
  handler: async (ctx) => {
    const key = `outreach:${new Date().toISOString().slice(0, 10)}`;
    const used = await ctx.db.query("usage").withIndex("by_key", (q) => q.eq("key", key)).unique();
    const room = Math.min(SENDS_PER_TICK, dailyCap() - (used?.count ?? 0));
    if (room <= 0) return [];
    const now = Date.now();
    const rows = await ctx.db
      .query("prospects")
      .withIndex("by_seq", (q) => q.eq("seq", "active").lte("seqNextAt", now))
      .take(room);
    const out = [];
    for (const p of rows) {
      if (!p.contactEmail || !p.unsubToken || (await isSuppressed(ctx, p.contactEmail))) {
        await ctx.db.patch(p._id, { seq: "stopped", seqNextAt: undefined, stopReason: "no usable address" });
        continue;
      }
      // Claim it for an hour so an overlapping run cannot send it twice.
      await ctx.db.patch(p._id, { seqNextAt: now + 60 * 60 * 1000 });
      out.push(p);
    }
    return out;
  },
});

export const recordSend = internalMutation({
  args: {
    prospectId: v.id("prospects"),
    step: v.number(),
    to: v.string(),
    subject: v.string(),
    resendId: v.optional(v.string()),
    test: v.boolean(),
    failed: v.optional(v.string()),
  },
  handler: async (ctx, { prospectId, step, to, subject, resendId, test, failed }) => {
    const p = await ctx.db.get(prospectId);
    if (!p) return;
    if (failed) {
      // A rejected address ends the sequence; anything else is retried tomorrow.
      const permanent = /invalid|not valid|does not exist|suppress/i.test(failed);
      await ctx.db.patch(prospectId, permanent
        ? { seq: "stopped", seqNextAt: undefined, stopReason: `send failed: ${failed.slice(0, 120)}` }
        : { seqNextAt: Date.now() + DAY });
      return;
    }
    const now = Date.now();
    await ctx.db.insert("outreachSends", { prospectId, step, to, subject, resendId, test, at: now });
    const sent = step + 1;
    const last = sent >= STEP_GAP_DAYS.length;
    await ctx.db.patch(prospectId, {
      seqStep: sent,
      seq: last ? "done" : "active",
      seqNextAt: last ? undefined : now + STEP_GAP_DAYS[sent] * DAY,
      outreach: p.outreach ?? "contacted",
    });
    const key = `outreach:${new Date(now).toISOString().slice(0, 10)}`;
    const used = await ctx.db.query("usage").withIndex("by_key", (q) => q.eq("key", key)).unique();
    if (used) await ctx.db.patch(used._id, { count: used.count + 1 });
    else await ctx.db.insert("usage", { key, count: 1 });
  },
});

type Sendable = Pick<Doc<"prospects">, "name" | "city" | "state" | "googleRating" | "googleReviews"> & {
  contactEmail: string;
  unsubToken: string;
};

/** Sends one step of the sequence. `to` differs from the property's address only for tests. */
async function deliver(p: Sendable, step: number, to: string, test: boolean) {
  const email = sequence(p)[step];
  const { html, text, unsub } = render(email.paragraphs, p);
  const subject = test ? `[TEST, would go to ${p.contactEmail}] ${email.subject}` : email.subject;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.OUTREACH_FROM ?? "AptReputation <contact@aptreputation.com>",
        to: [to],
        reply_to: process.env.OUTREACH_REPLY_TO ?? "contact@aptreputation.com",
        subject,
        html,
        text,
        headers: {
          "List-Unsubscribe": `<${(process.env.CONVEX_SITE_URL ?? "").replace(/\/$/, "")}/outreach/unsubscribe?t=${p.unsubToken}>, <${unsub}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    return res.ok
      ? { subject: email.subject, resendId: body.id as string | undefined }
      : { subject: email.subject, failed: String(body?.message ?? res.status) };
  } catch {
    return { subject: email.subject, failed: "network error" };
  }
}

/** Runs every 15 minutes: sends the next few approved emails that are due. */
export const tick = internalAction({
  args: {},
  handler: async (ctx) => {
    const mode = sendMode();
    if (mode === "off" || !inSendWindow(Date.now())) return;
    const rows = await ctx.runMutation(internal.outreach.due, {});
    for (const p of rows) {
      const step = p.seqStep ?? 0;
      const to = mode === "live" ? p.contactEmail! : process.env.OUTREACH_TEST_TO!;
      const sent = await deliver({ ...p, contactEmail: p.contactEmail!, unsubToken: p.unsubToken! }, step, to, mode !== "live");
      await ctx.runMutation(internal.outreach.recordSend, {
        prospectId: p._id, step, to, subject: sent.subject, resendId: sent.resendId, test: mode !== "live", failed: sent.failed,
      });
    }
  },
});

export const forPreview = internalQuery({
  args: { prospectId: v.id("prospects") },
  handler: async (ctx, { prospectId }) => {
    const admin = await requireAdmin(ctx);
    return { prospect: await ctx.db.get(prospectId), to: admin.email };
  },
});

export const byIdInternal = internalQuery({
  args: { prospectId: v.id("prospects") },
  handler: async (ctx, { prospectId }) => await ctx.db.get(prospectId),
});

async function sendAllThree(p: Doc<"prospects"> | null, to: string) {
  if (!p?.contactEmail) throw new ConvexError("That property has no contact email yet.");
  if (!process.env.RESEND_API_KEY) throw new ConvexError("Email is not set up (RESEND_API_KEY).");
  for (let step = 0; step < STEP_GAP_DAYS.length; step++) {
    // The unsubscribe link in a test goes nowhere, so a test can never unsubscribe a real contact.
    const sent = await deliver({ ...p, contactEmail: p.contactEmail, unsubToken: "test-preview-link" }, step, to, true);
    if (sent.failed) throw new ConvexError(`Email could not be sent: ${sent.failed}`);
  }
  return to;
}

/** Sends the admin all three emails for one property, exactly as the property would get them. */
export const sendPreview = action({
  args: { prospectId: v.id("prospects") },
  handler: async (ctx, { prospectId }): Promise<string> => {
    const { prospect, to } = await ctx.runQuery(internal.outreach.forPreview, { prospectId });
    return await sendAllThree(prospect, to);
  },
});

/** Same, from the command line, to a chosen address. */
export const sendPreviewCli = internalAction({
  args: { prospectId: v.id("prospects"), to: v.string() },
  handler: async (ctx, { prospectId, to }): Promise<string> =>
    await sendAllThree(await ctx.runQuery(internal.outreach.byIdInternal, { prospectId }), to),
});
