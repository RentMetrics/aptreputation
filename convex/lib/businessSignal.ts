/**
 * BusinessSignal SDK v2 — for a business's own Convex backend.
 *
 * Vendor this ONE file into each business as `convex/lib/businessSignal.ts`.
 * It runs in Convex's default (V8) runtime: Web Crypto only, no Node APIs.
 *
 * The hub (aimarketinghub.com) polls every 15 minutes:
 *   GET https://<deployment>.convex.site/business-signal/snapshot
 * signed with the shared secret (HMAC-SHA256). Same header contract and
 * canonical message as v1, so the hub's signer is unchanged:
 *   message = `${business}.${timestampMs}.${bodyHash}`   (bodyHash "" for GET)
 *   x-signal-business / x-signal-timestamp / x-signal-body-hash / x-signal-signature
 *
 * PRIVACY RULE: a snapshot carries AGGREGATES ONLY — counts, sums, labels.
 * Never names, emails, phone numbers, addresses, health data, children's data,
 * or per-customer financials. Lead lists are reported as sizes plus a link to
 * the list inside the business's own admin.
 *
 * Wiring (in the business):
 *
 *   // convex/http.ts
 *   import { httpRouter } from "convex/server";
 *   import { httpAction } from "./_generated/server";
 *   import { internal } from "./_generated/api";
 *   import { handleSnapshotRequest } from "./lib/businessSignal";
 *   const http = httpRouter();
 *   http.route({
 *     path: "/business-signal/snapshot",
 *     method: "GET",
 *     handler: httpAction(async (ctx, req) =>
 *       handleSnapshotRequest(req, {
 *         business: "ballrstat",
 *         secret: process.env.BUSINESS_SIGNAL_SECRET,
 *         collect: () => ctx.runQuery(internal.businessSignal.collect, {}),
 *       })
 *     ),
 *   });
 *   export default http;
 */

/* ================================ Types ================================ */

export type SnapshotInput = {
  health?: { ok?: boolean; p95LatencyMs?: number; errorRate?: number };
  /** Accounts. active* = did something meaningful in the window (not just exist). */
  users?: { total?: number; new24h?: number; active7d?: number; active30d?: number };
  /** Money. mrr in whole dollars; paying = customers currently paying. */
  revenue?: { mrr?: number; arr?: number; paying?: number; ltv?: number; churn30d?: number };
  growth?: { signups24h?: number; signups7d?: number; signups30d?: number; conversions24h?: number; conversions30d?: number };
  traffic?: { sessions24h?: number; pageviews24h?: number };

  /** Ordered funnel for the last 30 days, e.g. leads → signed up → activated → paying. */
  funnel?: { key: string; label: string; count: number }[];
  /** Every lead / waitlist / prospect list the business keeps. Sizes only. */
  leads?: {
    key: string;
    label: string;
    total: number;
    new7d?: number;
    new30d?: number;
    /** How many on this list became users/customers. */
    converted?: number;
    /** Path inside the business's app where the list lives, e.g. "/admin/leads". */
    adminPath?: string;
  }[];
  /** Where sign-ups came from (utm_source / referrer / "direct"), last 30 days. */
  acquisition?: { source: string; signups30d: number; paying30d?: number }[];
  /** Paying customers per plan. */
  plans?: { plan: string; customers: number; mrr?: number }[];
  /** Product usage that shows customers getting value. */
  usage?: { key: string; label: string; value: number; window?: "24h" | "7d" | "30d" | "total" }[];
  /** Daily new sign-ups, oldest → newest, last 30 days. */
  signupsDaily?: number[];
  /** Anything else worth a number. Scalars only. */
  custom?: Record<string, number | string | null>;
  /** Notes on metrics the app can't compute yet (e.g. "no utm capture"). */
  gaps?: string[];
};

export type Snapshot = SnapshotInput & { business: string; schemaVersion: 1; capturedAt: number };

/* ============================ Web Crypto HMAC ============================ */

const DRIFT_MS = 5 * 60_000;
const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(data)));
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

/* ============================ Snapshot endpoint ============================ */

export async function handleSnapshotRequest(
  req: Request,
  opts: { business: string; secret: string | undefined; collect: () => Promise<SnapshotInput> }
): Promise<Response> {
  if (!opts.secret) return json(503, { error: `BUSINESS_SIGNAL_SECRET not set on ${opts.business}` });

  const h = req.headers;
  const business = h.get("x-signal-business") ?? "";
  const ts = Number(h.get("x-signal-timestamp"));
  const bodyHash = h.get("x-signal-body-hash") ?? "";
  const sig = h.get("x-signal-signature") ?? "";
  if (business !== opts.business) return json(401, { error: "business mismatch" });
  if (!sig || !Number.isFinite(ts) || Math.abs(Date.now() - ts) > DRIFT_MS) return json(401, { error: "stale or missing signature" });
  if (!safeEqual(await hmacHex(opts.secret, `${business}.${ts}.${bodyHash}`), sig)) return json(401, { error: "invalid signature" });

  try {
    const collected = await opts.collect();
    const snapshot: Snapshot = { ...collected, health: { ok: true, ...collected.health }, business: opts.business, schemaVersion: 1, capturedAt: Date.now() };
    return json(200, snapshot);
  } catch (err) {
    return json(500, { error: "collect_failed", message: String((err as Error)?.message ?? err).slice(0, 300) });
  }
}

/* ============================ Event push (actions only) ============================ */

/**
 * Push a live event to the hub (sign-up, new paying customer, cancellation…).
 * Call from an ACTION (mutations can't fetch) — typically
 * `ctx.scheduler.runAfter(0, internal.businessSignal.emit, { kind, payload })`.
 * Payload is aggregate/label data only (plan name, amount) — never PII.
 */
export async function emitEvent(opts: {
  business: string;
  secret: string | undefined;
  hubUrl?: string;
  kind: string;
  payload?: Record<string, string | number | boolean | null>;
}): Promise<{ ok: boolean; status?: number }> {
  if (!opts.secret) return { ok: false };
  const hubUrl = (opts.hubUrl ?? "https://aimarketinghub.com").replace(/\/$/, "");
  const body = JSON.stringify({ business: opts.business, occurredAt: Date.now(), kind: opts.kind, payload: opts.payload ?? {} });
  const ts = Date.now();
  const bodyHash = await sha256Hex(body);
  const res = await fetch(`${hubUrl}/api/webhooks/business-event`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signal-business": opts.business,
      "x-signal-timestamp": String(ts),
      "x-signal-body-hash": bodyHash,
      "x-signal-signature": await hmacHex(opts.secret, `${opts.business}.${ts}.${bodyHash}`),
    },
    body,
  });
  return { ok: res.ok, status: res.status };
}

/* ============================ Helpers for collect() ============================ */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Count rows by a timestamp field into windows + a 30-day daily series. */
export function windows(timestamps: number[], now = Date.now()) {
  const d1 = now - DAY_MS, d7 = now - 7 * DAY_MS, d30 = now - 30 * DAY_MS;
  const daily = new Array(30).fill(0);
  let n1 = 0, n7 = 0, n30 = 0;
  for (const t of timestamps) {
    if (t >= d1) n1++;
    if (t >= d7) n7++;
    if (t >= d30) {
      n30++;
      const idx = 29 - Math.floor((now - t) / DAY_MS);
      if (idx >= 0 && idx < 30) daily[idx]++;
    }
  }
  return { total: timestamps.length, last24h: n1, last7d: n7, last30d: n30, daily };
}

/** Group counts by a label (e.g. utm_source), largest first, "direct" for empty. */
export function tally(labels: (string | undefined | null)[], top = 12): { label: string; count: number }[] {
  const m = new Map<string, number>();
  for (const l of labels) {
    const k = (l ?? "").trim().toLowerCase() || "direct";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([label, count]) => ({ label, count }));
}
