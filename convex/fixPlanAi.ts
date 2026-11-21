"use node";

import Anthropic from "@anthropic-ai/sdk";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import { requireActive } from "./lib/auth";

const MODEL = "claude-opus-5-5";

const WHO = {
  listing: "the support or account team at an apartment listing site",
  website: "the person or vendor who maintains the property's website",
  google:
    "the person at the management company who manages the property's Google Business Profile. Offer two ways to do it and let them choose: accept an invitation to this property in AptReputation and connect the profile there themselves, or add the sender's Google account as a manager on the profile so the sender can connect it",
} as const;

const SYSTEM = `You write short requests for an apartment property manager to send to someone else who has to make a change for them.
Write the message the manager will send: a subject line, a blank line, then the body. Plain text only, no markdown.
- Open with the request in one sentence. Then give exactly what to change and the correct details, as a short list where that helps.
- Use only the facts provided. Where a detail the recipient will need is missing, leave a clearly marked blank in square brackets for the manager to fill in. Never invent a phone number, price, date, policy or name.
- When the request is to a listing site, name no particular site unless one is given: the manager may send it to several.
- Ask for a date the change will be live. Keep it under 170 words, polite and direct, with no sales language.
- Sign off with a blank for the manager's name, as [Your name], and the property's name.`;

/** Drafts the message a manager sends to get one task done by someone else. */
export const draftRequest = action({
  args: { communityId: v.id("communities"), key: v.string() },
  handler: async (ctx, { communityId, key }): Promise<string> => {
    const { owner, spec, factSheet } = await ctx.runQuery(internal.fixPlan.requestContext, { communityId, key });
    requireActive(owner);
    if (!spec.request) throw new ConvexError("This task has no request to write.");
    if (!process.env.ANTHROPIC_API_KEY) throw new ConvexError("AI is not configured yet: set ANTHROPIC_API_KEY in the Convex environment.");
    let res;
    try {
      res = await new Anthropic().messages.create({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: "low" },
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: `The request goes to: ${WHO[spec.request]}.

What needs to change: ${spec.title}
Why: ${spec.why}

The property's correct facts:
${factSheet}`,
          },
        ],
      });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) throw new ConvexError("The AI service is busy. Try again in a minute.");
      if (e instanceof Anthropic.APIError) throw new ConvexError(`AI request failed (${e.status}).`);
      throw e;
    }
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    if (res.stop_reason === "refusal" || !text) throw new ConvexError("The request could not be written. Try again.");
    return text;
  },
});
