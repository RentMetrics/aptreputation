/**
 * The AptRep Score written as an email: the score report sits in the body of
 * the message, with no attachment, so it reaches the inbox and reads without a
 * click. Built from one free-check result. Every figure in it is from the
 * property's public Google listing, which the recipient can check.
 *
 * Pure text in, text out, so the admin screen and a sender can share it.
 */
import { POSTAL_ADDRESS, SENDER } from "./outreachCopy";

export type ScoreEmailInput = {
  name: string;
  rating: number | null;
  totalReviews: number;
  score: number | null;
  parts?: { label: string; points: number; max: number }[];
  market?: {
    radiusMiles: number;
    rank: number;
    of: number;
    averageRating: number;
    nearby: { name: string; rating: number; totalReviews: number }[];
  } | null;
  nextStep?: string | null;
};

/** "Bridgeside Landing Taylorsville UT" -> "bridgeside-landing-taylorsville-ut", the short-link form. */
export function reportSlug(text: string) {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const count = (n: number) => `${n.toLocaleString("en-US")} review${n === 1 ? "" : "s"}`;

/** This community and the ones around it, highest rating first, at most six rows. */
function standings(a: ScoreEmailInput) {
  if (!a.market || a.rating === null) return [];
  const rows = [
    ...a.market.nearby.map((n) => ({ name: n.name, rating: n.rating, reviews: n.totalReviews, self: false })),
    { name: a.name, rating: a.rating, reviews: a.totalReviews, self: true },
  ].sort((x, y) => y.rating - x.rating || Number(y.self) - Number(x.self));
  const top = rows.slice(0, 6);
  // Always show the property itself, even when it ranks below the rows shown.
  if (!top.some((r) => r.self)) top[top.length - 1] = rows.find((r) => r.self)!;
  return top;
}

export function scoreEmail(a: ScoreEmailInput, opts: { query: string; firstName?: string }) {
  const first = opts.firstName?.trim();
  const hello = first ? `Hi ${first},` : "Hello,";
  const link = `aptrep.com/${reportSlug(opts.query)}`;
  const url = `https://${link}`;
  const stars = a.rating?.toFixed(1) ?? null;
  const rows = standings(a);
  const m = a.market;

  const subject =
    a.score !== null
      ? `${a.name}: AptRep Score ${a.score} of 100`
      : stars
        ? `${a.name} is rated ${stars} on Google`
        : `${a.name} has no Google rating yet`;

  const intro =
    a.score !== null
      ? `I ran the AptRep Score for ${a.name}. It is a 0 to 100 measure of a community's Google reputation, built from the star rating, the number of reviews, the newest reviews, and how the rating compares with the communities nearby.`
      : `I looked up ${a.name} on Google. It doesn't have enough reviews yet for an AptRep Score, which measures a community's Google reputation from 0 to 100.`;
  const standing = m && stars
    ? `By Google rating, ${a.name} ranks ${m.rank} of ${m.of} apartment communities within ${m.radiusMiles} miles. The others average ${m.averageRating.toFixed(1)} stars.`
    : null;
  const close = `The full report, with what residents praise and raise in the newest reviews, is here: ${url}`;
  const offer = `AptReputation is how a community raises this number: an alert for each new review, a reply drafted and ready to edit, and tap cards that let your team ask a resident for a review on the spot. It is free for 14 days.`;
  const optOut = `If this isn't useful, reply "no thanks" and I won't write again.`;

  // ---- plain text ----
  const text = [
    hello,
    intro,
    [
      a.score !== null ? `AptRep Score: ${a.score} of 100` : null,
      stars ? `Google rating: ${stars} stars from ${count(a.totalReviews)}` : `Google rating: none yet`,
    ].filter(Boolean).join("\n"),
    a.score !== null && a.parts?.length ? a.parts.map((p) => `  ${p.label}: ${p.points} of ${p.max}`).join("\n") : null,
    standing,
    rows.length ? rows.map((r) => `  ${r.rating.toFixed(1)}  ${r.name}${r.self ? " (you)" : ""}, ${count(r.reviews)}`).join("\n") : null,
    a.nextStep ? `What would raise it most: ${a.nextStep}` : null,
    close,
    offer,
    `${SENDER.name}\nAptReputation\n${SENDER.email}`,
    optOut,
    POSTAL_ADDRESS,
  ].filter(Boolean).join("\n\n");

  // ---- HTML, written for mail programs: tables and inline styles only, no images ----
  const font = "font-family:Arial,Helvetica,sans-serif;";
  const p = (t: string) => `<p style="${font}font-size:15px;line-height:22px;color:#1e293b;margin:0 0 14px;">${t}</p>`;
  const tile = (label: string, big: string, small: string) =>
    `<td width="49%" valign="top" style="${font}background:#f1f5f9;border-radius:8px;padding:14px 16px;">` +
    `<div style="font-size:13px;color:#475569;">${label}</div>` +
    `<div style="font-size:30px;line-height:38px;font-weight:bold;color:#0f2a4a;">${big}</div>` +
    `<div style="font-size:13px;color:#475569;">${small}</div></td>`;
  const tiles =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0;margin:0 0 14px;"><tr>` +
    tile("AptRep Score", a.score !== null ? `${a.score} <span style="font-size:15px;font-weight:normal;color:#64748b;">of 100</span>` : "–", a.score !== null ? "Google reputation, 0 to 100" : "Not enough reviews yet") +
    `<td width="2%" style="font-size:0;line-height:0;">&nbsp;</td>` +
    tile("Google rating", stars ?? "–", stars ? count(a.totalReviews) : "No rating yet") +
    `</tr></table>`;
  const cell = `${font}font-size:14px;line-height:20px;padding:6px 0;border-bottom:1px solid #e2e8f0;`;
  const partsTable = a.score !== null && a.parts?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 14px;">` +
      a.parts.map((x) => `<tr><td style="${cell}color:#1e293b;">${esc(x.label)}</td><td align="right" style="${cell}color:#475569;white-space:nowrap;">${x.points} of ${x.max}</td></tr>`).join("") +
      `</table>`
    : "";
  const standingTable = rows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 14px;">` +
      rows.map((r) => {
        const w = r.self ? "font-weight:bold;color:#0f2a4a;" : "color:#334155;";
        return `<tr><td style="${cell}${w}">${esc(r.name)}${r.self ? " (you)" : ""}</td>` +
          `<td align="right" style="${cell}${w}white-space:nowrap;">${r.rating.toFixed(1)} <span style="font-weight:normal;color:#64748b;">&middot; ${r.reviews.toLocaleString("en-US")}</span></td></tr>`;
      }).join("") +
      `</table>`
    : "";
  const next = a.nextStep
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;"><tr><td style="${font}border-left:3px solid #1554c0;background:#f1f5f9;padding:10px 14px;font-size:15px;line-height:22px;color:#1e293b;"><strong>What would raise it most</strong><br>${esc(a.nextStep)}</td></tr></table>`
    : "";
  const html =
    `<div style="max-width:560px;">` +
    p(esc(hello)) +
    p(esc(intro)) +
    tiles +
    partsTable +
    (standing ? p(esc(standing)) : "") +
    standingTable +
    next +
    p(`The full report, with what residents praise and raise in the newest reviews, is here: <a href="${url}" style="color:#1554c0;">${link}</a>`) +
    p(esc(offer)) +
    p(`${esc(SENDER.name)}<br>AptReputation<br>${esc(SENDER.email)}`) +
    `<p style="${font}font-size:12px;line-height:18px;color:#64748b;margin:18px 0 0;">${esc(optOut)}<br>${esc(POSTAL_ADDRESS)}</p>` +
    `</div>`;

  return { subject, html, text, link };
}
