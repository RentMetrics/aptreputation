"use node";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { requireActive } from "./lib/auth";
import { ActionCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

const MODEL = "claude-opus-5-5";

export const THEMES = [
  "Maintenance", "Office Staff", "Leasing Process", "Communication", "Cleanliness",
  "Noise", "Safety & Security", "Pests", "Parking", "Amenities", "Value & Rent",
  "Move-In / Move-Out", "Billing & Fees", "Neighbors", "Management", "Other",
] as const;

const sentiment = z.enum(["positive", "neutral", "negative"]);

function client() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ConvexError("AI is not configured yet: set ANTHROPIC_API_KEY in the Convex environment.");
  }
  return new Anthropic();
}

async function ask<T extends z.ZodType>(schema: T, system: string, user: string, maxTokens = 16000): Promise<z.infer<T>> {
  let response;
  try {
    response = await client().messages.parse({
      model: MODEL,
      max_tokens: maxTokens,
      output_config: { effort: "low", format: zodOutputFormat(schema) },
      system,
      messages: [{ role: "user", content: user }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ConvexError("The Anthropic API key was rejected.");
    if (e instanceof Anthropic.RateLimitError) throw new ConvexError("The AI service is busy. Try again in a minute.");
    if (e instanceof Anthropic.APIError) throw new ConvexError(`AI request failed (${e.status}).`);
    throw e;
  }
  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new ConvexError("The AI could not process this request.");
  }
  return response.parsed_output;
}

// ---- per-review analysis ---------------------------------------------------

const AnalysisSchema = z.object({
  results: z.array(z.object({
    id: z.string(),
    sentiment,
    themes: z.array(z.enum(THEMES)),
    urgent: z.boolean(),
    staff: z.array(z.object({ name: z.string(), sentiment })),
  })),
});

const ANALYSIS_SYSTEM = `You analyze resident reviews of apartment communities for the property's management team.
For each review return:
- sentiment: the reviewer's overall view of the community.
- themes: every topic the review actually discusses, from the allowed list. Use "Other" only when nothing else fits.
- urgent: true only for safety hazards, habitability failures (no heat/water, mold, flooding, pests left untreated), alleged discrimination or harassment, or threats of legal action.
- staff: each employee of the property the review names (office, leasing, maintenance, management). Give the name exactly as written and whether the reviewer speaks of that person positively, neutrally or negatively. Do not include the reviewer, other residents, or companies. If no employee is named, return an empty list.
Return one result per review, using the review's id unchanged.`;

export const analyzePending = internalAction({
  args: { communityId: v.id("communities"), round: v.optional(v.number()) },
  handler: async (ctx, { communityId, round = 0 }): Promise<null> => {
    const pending = await ctx.runQuery(internal.reviews.pendingAnalysis, { communityId, limit: 25 });
    if (pending.length === 0) {
      if (round > 0) await ctx.scheduler.runAfter(0, internal.ai.refreshInsights, { communityId });
      return null;
    }
    // Star-only reviews need no model call.
    const blank = pending.filter((r) => !r.text.trim());
    const withText = pending.filter((r) => r.text.trim());
    const results = blank.map((r) => ({
      reviewId: r._id,
      sentiment: r.rating >= 4 ? "positive" as const : r.rating <= 2 ? "negative" as const : "neutral" as const,
      themes: [] as string[],
      urgent: false,
      staff: [] as { name: string; sentiment: "positive" | "neutral" | "negative" }[],
    }));
    if (withText.length > 0) {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.warn("ANTHROPIC_API_KEY is not set; skipping review analysis.");
        if (results.length) await ctx.runMutation(internal.reviews.applyAnalysis, { communityId, results });
        return null;
      }
      const prompt = withText
        .map((r) => `<review id="${r._id}" stars="${r.rating}">\n${r.text}\n</review>`)
        .join("\n\n");
      const out = await ask(AnalysisSchema, ANALYSIS_SYSTEM, prompt);
      const byId = new Map(withText.map((r) => [String(r._id), r]));
      for (const res of out.results) {
        const review = byId.get(res.id);
        if (!review) continue;
        results.push({
          reviewId: review._id,
          sentiment: res.sentiment,
          themes: res.themes,
          urgent: res.urgent,
          staff: res.staff.filter((s) => s.name.trim()).map((s) => ({ name: s.name.trim(), sentiment: s.sentiment })),
        });
      }
    }
    await ctx.runMutation(internal.reviews.applyAnalysis, { communityId, results });
    if (round < 80) {
      await ctx.scheduler.runAfter(0, internal.ai.analyzePending, { communityId, round: round + 1 });
    }
    return null;
  },
});

// ---- reply drafts ----------------------------------------------------------

const ReplySchema = z.object({ reply: z.string() });

const REPLY_SYSTEM = `You draft public replies to Google reviews on behalf of an apartment community's management team. A manager will read and edit your draft before it is posted.
Write the way a capable, warm community manager would:
- Respond to the specific things this reviewer said. Thank them for specific praise; for complaints, acknowledge the experience plainly without arguing or making excuses.
- Never confirm or reveal anything about the reviewer's lease, unit, payments or account, even if they mention it. Never promise a specific remedy, refund or timeline, and never admit legal fault.
- For problems, invite them to contact the office so the team can follow up directly. Do not invent a phone number, email address or person's name; say "our office" unless contact details are provided.
- Do not ask the reviewer to change or remove the review, and offer nothing in exchange for a review.
- Plain text only, 40 to 110 words, no placeholders in brackets, no hashtags or emoji. Sign off as "The <community name> Team".`;

export const draftReply = action({
  args: { reviewId: v.id("reviews") },
  handler: async (ctx, { reviewId }): Promise<string> => {
    const { review, owner, community } = await ctx.runQuery(internal.reviews.forAction, { reviewId });
    requireActive(owner);
    const prompt = `Community: ${community.name}
Reviewer: ${review.reviewerName}
Rating: ${review.rating} of 5 stars
Review:
${review.text.trim() || "(The reviewer left a star rating with no text.)"}`;
    const { reply } = await ask(ReplySchema, REPLY_SYSTEM, prompt, 2000);
    await ctx.runMutation(internal.reviews.setDraft, { reviewId, text: reply.trim() });
    return reply.trim();
  },
});

// ---- property insights -----------------------------------------------------

const InsightSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.object({ theme: z.string(), detail: z.string(), reviewCount: z.number() })),
  problems: z.array(z.object({
    theme: z.string(), detail: z.string(), reviewCount: z.number(), recommendation: z.string(),
  })),
  actions: z.array(z.object({ priority: z.enum(["now", "next", "ongoing"]), action: z.string(), why: z.string() })),
});

const INSIGHT_SYSTEM = `You are briefing the owner and on-site manager of an apartment community on what their residents are saying in reviews.
Work only from the reviews provided. Count carefully: reviewCount is the number of provided reviews that support the point, and you must not state percentages or predict star-rating changes.
- summary: two or three sentences a busy owner can act on.
- strengths: what residents praise, most frequent first (up to 5).
- problems: what residents complain about, most frequent first (up to 6), each with one concrete operational recommendation the on-site team could carry out.
- actions: up to 6 next steps. "now" for safety, habitability or issues raised repeatedly in the newest reviews; "next" for the following 90 days; "ongoing" for strengths to protect.
If there are too few reviews to see a pattern, say so in the summary and keep the lists short.`;

async function buildInsights(ctx: ActionCtx, communityId: Id<"communities">): Promise<boolean> {
  const community = await ctx.runQuery(internal.communities.byId, { communityId });
  if (!community) return false;
  // Newest 400 written reviews. Older ones are left out so the brief reflects the property today.
  const reviews = await ctx.runQuery(internal.reviews.analyzedForInsights, { communityId, limit: 400 });
  if (reviews.length < 3) return false;
  const body = reviews
    .map((r) => `<review date="${new Date(r.reviewDate).toISOString().slice(0, 10)}" stars="${r.rating}">\n${r.text}\n</review>`)
    .join("\n\n");
  const out = await ask(InsightSchema, INSIGHT_SYSTEM, `Community: ${community.name}\nReviews provided: ${reviews.length} (newest first)\n\n${body}`);
  await ctx.runMutation(internal.reviews.saveInsight, { communityId, reviewCount: reviews.length, ...out });
  return true;
}

export const refreshInsights = internalAction({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }): Promise<null> => {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    await buildInsights(ctx, communityId);
    return null;
  },
});

export const generateInsights = action({
  args: { communityId: v.id("communities") },
  handler: async (ctx, { communityId }): Promise<null> => {
    const { owner } = await ctx.runQuery(internal.communities.actingAccess, { communityId });
    requireActive(owner);
    const made = await buildInsights(ctx, communityId);
    if (!made) throw new ConvexError("At least 3 written reviews are needed to generate insights.");
    return null;
  },
});

// ---- public audit summary --------------------------------------------------

const AuditSchema = z.object({
  summary: z.string(),
  praised: z.array(z.string()),
  concerns: z.array(z.string()),
});

export const auditSummary = internalAction({
  args: { name: v.string(), reviews: v.array(v.object({ rating: v.number(), text: v.string() })) },
  handler: async (_ctx, { name, reviews }): Promise<z.infer<typeof AuditSchema> | null> => {
    if (!process.env.ANTHROPIC_API_KEY || reviews.length === 0) return null;
    try {
      return await ask(
        AuditSchema,
        `You summarize the most recent public Google reviews of an apartment community for its manager. Work only from the reviews given. summary: two sentences. praised and concerns: up to 3 short phrases each, empty if none. Do not give percentages.`,
        `Community: ${name}\n\n${reviews.map((r) => `<review stars="${r.rating}">\n${r.text}\n</review>`).join("\n\n")}`,
        2000,
      );
    } catch (e) {
      console.warn("Audit summary failed", e);
      return null;
    }
  },
});
