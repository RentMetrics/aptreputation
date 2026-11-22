import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { promoLine } from "./lib/promo";


function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function appUrl() {
  return process.env.APP_URL ?? "https://www.aptreputation.com";
}

export function emailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

/** Sends one email through Resend. Returns false when email is not set up. */
async function send(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = process.env.RESEND_FROM ?? "AptReputation <alerts@aptreputation.com>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new ConvexError(`Email could not be sent (${res.status}). ${detail.slice(0, 200)}`);
  }
  return true;
}

function layout(heading: string, body: string, footer: string) {
  return `<div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f2a4a">
<p style="font-size:14px;font-weight:700;color:#1554c0;margin:0 0 16px">AptReputation</p>
<h1 style="font-size:20px;line-height:1.3;margin:0 0 16px">${heading}</h1>
${body}
<p style="font-size:12px;line-height:1.5;color:#5b6b7f;border-top:1px solid #dbe3ec;margin:28px 0 0;padding-top:14px">${footer}</p>
</div>`;
}

function button(href: string, label: string) {
  return `<p style="margin:20px 0"><a href="${href}" style="background:#1554c0;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 18px;border-radius:8px;display:inline-block">${label}</a></p>`;
}

const stars = (n: number) => "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));

// ---- new-review alerts ------------------------------------------------------

export const pending = internalQuery({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }) => {
    const community = await ctx.db.get(communityId);
    if (!community) return null;
    const reviews = (
      await ctx.db.query("reviews").withIndex("by_community_date", (q) => q.eq("communityId", communityId)).order("desc").take(200)
    ).filter((r) => r.notifyState === "pending");
    const owner = await ctx.db.get(community.ownerId);
    const members = await ctx.db.query("members").withIndex("by_community", (q) => q.eq("communityId", communityId)).collect();
    const recipients = [
      ...(owner ? [{ email: owner.email, notify: community.ownerNotify ?? ("all" as const) }] : []),
      ...members.map((m) => ({ email: m.email, notify: m.notify })),
    ].filter((r) => r.email && r.notify !== "none");
    return { community, reviews, recipients };
  },
});

export const mark = internalMutation({
  args: { reviewIds: v.array(v.id("reviews")), state: v.union(v.literal("sent"), v.literal("skipped")) },
  handler: async (ctx, { reviewIds, state }) => {
    for (const id of reviewIds) await ctx.db.patch(id, { notifyState: state });
  },
});

/** Emails the property's people about reviews that arrived since the last check. */
export const flush = internalAction({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }): Promise<null> => {
    const data = await ctx.runQuery(internal.notify.pending, { communityId });
    if (!data || data.reviews.length === 0) return null;
    const { community, reviews, recipients } = data;
    const ids = reviews.map((r) => r._id);
    if (!emailConfigured()) {
      await ctx.runMutation(internal.notify.mark, { reviewIds: ids, state: "skipped" });
      return null;
    }
    const link = `${appUrl()}/dashboard/property/${communityId}`;
    for (const person of recipients) {
      // "negative" = only 1-3 star or urgent reviews.
      const mine = person.notify === "negative" ? reviews.filter((r) => r.rating <= 3 || r.urgent) : reviews;
      if (mine.length === 0) continue;
      const lowest = Math.min(...mine.map((r) => r.rating));
      const subject =
        mine.length === 1
          ? `New ${mine[0].rating}-star review for ${community.name}`
          : `${mine.length} new reviews for ${community.name}`;
      const cards = mine
        .map(
          (r) => `<div style="border:1px solid #dbe3ec;border-radius:10px;padding:14px 16px;margin:0 0 12px">
<p style="margin:0 0 6px;font-size:15px"><span style="color:#d98a00;letter-spacing:1px">${stars(r.rating)}</span> &nbsp;<strong>${esc(r.reviewerName)}</strong>${r.urgent ? ' &nbsp;<span style="color:#b42318;font-weight:700">Urgent</span>' : ""}</p>
<p style="margin:0;font-size:15px;line-height:1.5;white-space:pre-line">${r.text.trim() ? esc(r.text) : "<em>Star rating only, no written review.</em>"}</p>
${r.themes?.length ? `<p style="margin:8px 0 0;font-size:13px;color:#5b6b7f">Topics: ${esc(r.themes.join(", "))}</p>` : ""}
</div>`,
        )
        .join("");
      const html = layout(
        esc(subject),
        `${cards}${button(link, lowest <= 3 ? "Draft a reply" : "Open the review")}
<p style="font-size:14px;line-height:1.5;margin:0">${community.name} is at ${community.googleRating?.toFixed(1) ?? "–"} stars on Google with ${community.totalReviews ?? 0} reviews.</p>`,
        `You get these because you are on the team for ${esc(community.name)}. Change or turn off alerts in the property's Settings tab.`,
      );
      try {
        await send(person.email, subject, html);
      } catch (e) {
        console.error("New-review email failed for one recipient", e);
      }
    }
    await ctx.runMutation(internal.notify.mark, { reviewIds: ids, state: "sent" });
    return null;
  },
});

// ---- monthly AI search check -------------------------------------------------

/** After an automatic monthly check: how often the property was named, what changed, and what is open. */
export const checkSummary = internalAction({
  args: { scanId: v.id("visibilityScans") },
  handler: async (ctx, { scanId }): Promise<null> => {
    const data = await ctx.runQuery(internal.visibility.summaryContext, { scanId });
    if (!data || data.recipients.length === 0 || !emailConfigured()) return null;
    const counts = (json: string | null) => {
      try {
        const r = json ? JSON.parse(json) : null;
        return r?.v === 2 ? { shown: r.shown as number, outOf: r.outOf as number, assistants: r.assistants as { label: string; shown: number; outOf: number }[] } : null;
      } catch {
        return null;
      }
    };
    const now = counts(data.result);
    if (!now) return null;
    const before = counts(data.previous);
    const subject = `${data.name}: named in ${now.shown} of ${now.outOf} AI searches this month`;
    const rows = now.assistants
      .map((a) => `<tr><td style="padding:6px 16px 6px 0;font-size:15px">${esc(a.label)}</td><td style="padding:6px 0;font-size:15px;font-weight:600">${a.shown} of ${a.outOf}</td></tr>`)
      .join("");
    const html = layout(
      esc(subject),
      `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">We asked AI assistants the questions renters ask about apartments near ${esc(data.name)}. ${
        before ? `Last time it was named in ${before.shown} of ${before.outOf}.` : "This is the first check, so it is your starting point."
      }</p>
<table style="border-collapse:collapse;margin:0 0 12px">${rows}</table>
<p style="font-size:15px;line-height:1.5;margin:0">${
        data.open > 0 ? `${data.open} fix${data.open === 1 ? " is" : "es are"} open on the plan, each with the steps to take.` : "Nothing new to fix came out of this check."
      } Answers vary from one run to the next, so judge the trend over a few months.</p>
${button(`${appUrl()}/dashboard/property/${data.communityId}`, "Open the fix plan")}`,
      `You get this monthly summary because you own or manage ${esc(data.name)}. Change or turn off alerts in the property's Settings tab.`,
    );
    for (const to of data.recipients) {
      try {
        await send(to, subject, html);
      } catch (e) {
        console.error("Monthly check email failed for one recipient", e);
      }
    }
    return null;
  },
});

// ---- AI search report a visitor asked for ------------------------------------

/** Emails the AI search report to the visitors who asked for it (or one of them, when it was already done). */
export const aiReportReady = internalAction({
  args: { scanId: v.id("visibilityScans"), only: v.optional(v.string()) },
  handler: async (ctx, { scanId, only }): Promise<null> => {
    const data = await ctx.runQuery(internal.visibility.reportEmailContext, { scanId });
    if (!data || !emailConfigured()) return null;
    const to = only ? [only] : data.recipients;
    if (to.length === 0) return null;
    const m = data.address.match(/,\s*([^,]+),\s*([A-Z]{2})\s+\d{5}/);
    const q = [data.name, m?.[1], m?.[2]].filter(Boolean).join(" ");
    const link = `${appUrl()}/score?q=${encodeURIComponent(q)}`;
    const s = data.summary;
    let subject: string;
    let body: string;
    if (!s) {
      subject = `We couldn't finish the AI search report for ${data.name}`;
      body = `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">The AI assistants didn't answer when we ran the report for ${esc(data.name)}. This usually clears within the hour. Open the property's score page and ask again.</p>${button(link, "Open the score page")}`;
    } else {
      subject = `${data.name}: named in ${s.shown} of ${s.outOf} AI searches`;
      const row = (a: string, b: string) => `<tr><td style="padding:6px 16px 6px 0;font-size:15px">${a}</td><td style="padding:6px 0;font-size:15px;font-weight:600">${b}</td></tr>`;
      const labels: Record<string, string> = { chatgpt: "ChatGPT", gemini: "Gemini", claude: "Claude" };
      const quotes = s.byName.filter((b) => b.statedRating).map((b) => `${esc(labels[b.assistant] ?? b.assistant)} quoted ${esc(b.statedRating!)}.`);
      body = `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">You asked how AI assistants answer renters about ${esc(data.name)}. We asked ${esc(s.assistants.map((a) => a.label).join(", "))} the questions renters ask about apartments nearby. They named ${esc(data.name)} in <strong>${s.shown} of ${s.outOf}</strong> answers.</p>
<table style="border-collapse:collapse;margin:0 0 12px">${s.assistants.map((a) => row(esc(a.label), `${a.shown} of ${a.outOf}`)).join("")}</table>
${quotes.length ? `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">Asked about it by name: ${quotes.join(" ")}</p>` : ""}
${s.competitors.length ? `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">Named most often instead: ${esc(s.competitors.slice(0, 4).map((c) => c.name).join(", "))}.</p>` : ""}
${s.findings.length ? `<p style="font-size:15px;line-height:1.5;margin:0 0 4px"><strong>What is holding it back</strong></p><ul style="font-size:15px;line-height:1.5;margin:0 0 12px;padding-left:20px">${s.findings.slice(0, 4).map((f) => `<li>${esc(f.title)}</li>`).join("")}</ul>` : ""}
${button(link, "See the full report")}
<p style="font-size:14px;line-height:1.5;margin:0 0 12px">AptReputation turns each of these into a step-by-step task for your team, writes the requests to listing sites and web vendors for you, and checks again every month. The first 14 days are free: ${esc(appUrl().replace(/^https?:\/\//, ""))}.${promoLine(Date.now()) ? ` ${esc(promoLine(Date.now())!)}` : ""}</p>
<p style="font-size:13px;line-height:1.5;color:#5b6b7f;margin:0">Each question was asked once per assistant, and their answers vary from day to day, so read this as a sample.</p>`;
    }
    const html = layout(esc(subject), body, `Sent because this address asked for the AI search report for ${esc(data.name)} on aptreputation.com.`);
    for (const email of to) {
      try {
        await send(email, subject, html);
      } catch (e) {
        console.error("AI report email failed for one recipient", e);
      }
    }
    return null;
  },
});

// ---- invitations and test ---------------------------------------------------

export const sendInvite = internalAction({
  args: {
    email: v.string(),
    communityName: v.string(),
    inviterName: v.string(),
    hasAccount: v.boolean(),
    // True when this person is asked to connect the property's Google Business Profile.
    accountManager: v.optional(v.boolean()),
    communityId: v.optional(v.id("communities")),
  },
  handler: async (_ctx, { email, communityName, inviterName, hasAccount, accountManager, communityId }): Promise<null> => {
    const link = `${appUrl()}/${hasAccount ? (communityId ? `dashboard/property/${communityId}` : "dashboard") : "sign-up"}`;
    if (accountManager) {
      const li = (t: string) => `<li style="margin:0 0 8px">${t}</li>`;
      const html = layout(
        `${esc(inviterName)} asked you to connect ${esc(communityName)}'s Google profile`,
        `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${esc(inviterName)} uses AptReputation to keep up with ${esc(communityName)}'s Google reviews and how the property shows up in AI search, and named you as its account manager because you manage its Google Business Profile.</p>
<p style="font-size:15px;line-height:1.5;margin:0 0 8px">Connecting takes about two minutes, once:</p>
<ol style="font-size:15px;line-height:1.5;margin:0 0 4px;padding-left:20px">
${li(hasAccount ? "Open the property with the button below." : `Create your login with this email address (${esc(email)}). ${esc(communityName)} will be waiting for you.`)}
${li("Open the property's <strong>Settings</strong> tab and choose <strong>Connect Google</strong>.")}
${li("Sign in with the Google account that is an owner or manager of the property's Business Profile, and approve the request.")}
${li(`Choose <strong>${esc(communityName)}</strong> from the list of locations.`)}
</ol>
${button(link, hasAccount ? "Open the property" : "Create your login")}
<p style="font-size:14px;line-height:1.5;margin:0">After that, every review loads in full and the team can reply from one place. AptReputation posts a reply or changes the listing only when someone on the team chooses to. You can disconnect at any time in Settings.</p>`,
        `Sent because ${esc(inviterName)} named this address as the account manager for ${esc(communityName)}.`,
      );
      try {
        await send(email, `Please connect ${communityName}'s Google profile to AptReputation`, html);
      } catch (e) {
        console.error("Account manager email failed", e);
      }
      return null;
    }
    const html = layout(
      `${esc(inviterName)} added you to ${esc(communityName)}`,
      `<p style="font-size:15px;line-height:1.5;margin:0">You can now read and reply to ${esc(communityName)}'s Google reviews, see what residents are saying, and manage review cards in AptReputation.</p>
${button(link, hasAccount ? "Open the property" : "Create your login")}
${hasAccount ? "" : `<p style="font-size:14px;line-height:1.5;margin:0">Sign up with this email address (${esc(email)}) and the property will be waiting for you.</p>`}`,
      `Sent because ${esc(inviterName)} invited this address.`,
    );
    try {
      await send(email, `You've been added to ${communityName} on AptReputation`, html);
    } catch (e) {
      console.error("Invite email failed", e);
    }
    return null;
  },
});

/** Lets a signed-in person confirm that alert emails reach them. */
export const sendTest = action({
  args: {},
  handler: async (ctx): Promise<null> => {
    const user = await ctx.runQuery(internal.users.current, {});
    if (!emailConfigured()) throw new ConvexError("Email is not set up yet (RESEND_API_KEY is missing).");
    await send(
      user.email,
      "Test alert from AptReputation",
      layout(
        "Alerts are working",
        `<p style="font-size:15px;line-height:1.5;margin:0">This is a test. When a new Google review is posted for one of your properties, it will arrive like this, with the review text and a link to reply.</p>${button(`${appUrl()}/dashboard`, "Open AptReputation")}`,
        "Sent because you asked for a test email.",
      ),
    );
    return null;
  },
});
