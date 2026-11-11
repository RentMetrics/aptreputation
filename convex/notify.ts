import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";

const ADDRESS = "AptReputation, 30 E Broadway, Suite 203 #1053, Salt Lake City, UT 84111";

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
<p style="font-size:12px;line-height:1.5;color:#5b6b7f;border-top:1px solid #dbe3ec;margin:28px 0 0;padding-top:14px">${footer}<br>${ADDRESS}</p>
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

// ---- invitations and test ---------------------------------------------------

export const sendInvite = internalAction({
  args: { email: v.string(), communityName: v.string(), inviterName: v.string(), hasAccount: v.boolean() },
  handler: async (_ctx, { email, communityName, inviterName, hasAccount }): Promise<null> => {
    const link = `${appUrl()}/${hasAccount ? "dashboard" : "sign-up"}`;
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
