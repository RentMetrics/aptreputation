"use node";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { placeContact } from "./lib/google";
import {
  blockedCrawlers,
  fixesFor,
  marketOf,
  questionsFor,
  readPage,
  type PromptKind,
  type PromptResult,
  type SiteCheck,
  type VisibilityResult,
} from "./lib/visibility";

const MODEL = "claude-opus-5-5";
const ASSISTANT_LABEL = "Claude with web search";

// The assistant is asked the way a renter would ask, with no mention of the
// property being checked, so the answer is the one a renter would get.
const RENTER_SYSTEM = `You are a general-purpose AI assistant. Someone looking for an apartment asks you a question. Search the web and answer as you normally would: name specific apartment communities and give the facts you found for each, such as rent, rating and anything notable. Keep the answer under 250 words.`;

type Answer = { text: string; sources: string[] };

async function askAsRenter(client: Anthropic, question: string): Promise<Answer> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  const text: string[] = [];
  const cited = new Set<string>();
  const searched = new Set<string>();
  // A long search turn can pause; sending it back lets the server continue.
  for (let round = 0; round < 4; round++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 6000,
      output_config: { effort: "low" },
      system: RENTER_SYSTEM,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
      messages,
    });
    if (res.stop_reason === "refusal") throw new Error("The assistant declined to answer.");
    for (const block of res.content) {
      // Text written before a search is the assistant thinking aloud, not the answer.
      if (block.type === "server_tool_use" || block.type === "web_search_tool_result") text.length = 0;
      if (block.type === "text") {
        text.push(block.text);
        for (const c of block.citations ?? []) {
          if (c.type === "web_search_result_location") cited.add(c.url);
        }
      } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) searched.add(r.url);
      }
    }
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  const hosts = (urls: Set<string>) => {
    const out = new Set<string>();
    for (const u of urls) {
      try {
        out.add(new URL(u).hostname.replace(/^www\./, ""));
      } catch {
        // Not a usable address; leave it out.
      }
    }
    return [...out];
  };
  // Prefer what the answer cited; fall back to what the search returned.
  const sources = hosts(cited.size ? cited : searched).slice(0, 12);
  return { text: text.join("").trim(), sources };
}

const ReadingSchema = z.object({
  readings: z.array(
    z.object({
      index: z.number(),
      communities: z.array(z.string()),
      mentioned: z.boolean(),
      position: z.number().nullable(),
      namedAs: z.string().nullable(),
      statedPhone: z.string().nullable(),
      statedRent: z.string().nullable(),
      statedRating: z.string().nullable(),
      tone: z.enum(["positive", "neutral", "mixed", "negative", "none"]),
      note: z.string(),
    }),
  ),
});

const READING_SYSTEM = `You read answers an AI assistant gave to renter questions and record how one apartment community, the target, appears in each. Work only from the answer text.
For each answer return:
- index: the answer's index, unchanged.
- communities: the apartment communities the answer recommends or lists, in the order given, by name only.
- mentioned: true if the answer names the target. Match on the address or on an obvious former or alternate name for the same property too, but not a different community with a similar name at another address.
- position: where the target falls in the answer's list, 1 for first. Null if it is not named or the answer is not a list.
- namedAs: the name the answer used for the target when it differs from the target's name, otherwise null.
- statedPhone, statedRent, statedRating: what the answer states for the target, copied as written, otherwise null.
- tone: how the answer describes the target. "none" when it is not named.
- note: one plain sentence. If the target is named, how it is described. If not, what the answer recommended instead.
Return one reading per answer.`;

async function readAnswers(client: Anthropic, target: { name: string; address: string }, answers: { index: number; question: string; text: string }[]) {
  const body = answers.map((a) => `<answer index="${a.index}">\n<question>${a.question}</question>\n${a.text}\n</answer>`).join("\n\n");
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "low", format: zodOutputFormat(ReadingSchema) },
    system: READING_SYSTEM,
    messages: [{ role: "user", content: `Target: ${target.name}\nTarget address: ${target.address}\n\n${body}` }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("The answers could not be read.");
  return res.parsed_output.readings;
}

async function get(url: string): Promise<{ status: number; body: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "AptReputationBot/1.0 (+https://www.aptreputation.com)", Accept: "text/html,text/plain,*/*" },
    });
    return { status: res.status, body: (await res.text()).slice(0, 1_500_000) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function checkSite(website: string, phone: string | null): Promise<SiteCheck> {
  const parsed = new URL(website);
  const origin = parsed.origin;
  // Google's link often carries tracking parameters; the page itself is what gets read and shown.
  website = origin + parsed.pathname;
  const empty = { schemaTypes: [], textLength: 0, showsRent: false, mentionsPets: false, showsPhone: false, hasLlmsTxt: false, blockedCrawlers: [] };
  const [page, robots, llms] = await Promise.all([get(website), get(`${origin}/robots.txt`), get(`${origin}/llms.txt`)]);
  const blocked = robots && robots.status === 200 && !/<html/i.test(robots.body) ? blockedCrawlers(robots.body) : [];
  const hasLlmsTxt = !!llms && llms.status === 200 && !/<html/i.test(llms.body) && llms.body.trim().length > 20;
  if (!page) return { url: website, status: "failed", ...empty, blockedCrawlers: blocked, hasLlmsTxt };
  if (page.status === 401 || page.status === 403 || page.status === 429 || page.status === 503) {
    return { url: website, status: "blocked", httpStatus: page.status, ...empty, blockedCrawlers: blocked, hasLlmsTxt };
  }
  if (page.status >= 400) return { url: website, status: "failed", httpStatus: page.status, ...empty, blockedCrawlers: blocked, hasLlmsTxt };
  return { url: website, status: "ok", httpStatus: page.status, ...readPage(page.body, phone), blockedCrawlers: blocked, hasLlmsTxt };
}

export const run = internalAction({
  args: { scanId: v.id("visibilityScans") },
  handler: async (ctx, { scanId }): Promise<null> => {
    const found = await ctx.runQuery(internal.visibility.scanContext, { scanId });
    if (!found) return null;
    const { community } = found;
    try {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("AI is not configured yet (ANTHROPIC_API_KEY).");
      const market = marketOf(community.address);
      if (!market) throw new Error("This property's address has no city and ZIP code, so renter questions cannot be written for it.");
      const client = new Anthropic();
      const questions = questionsFor(community.name, market);

      const contact = await placeContact(community.googlePlaceId).catch(() => ({ website: undefined, phone: undefined }));
      const [answers, site] = await Promise.all([
        Promise.all(
          questions.map((q) =>
            askAsRenter(client, q.question).then(
              (a) => ({ ...a, error: undefined as string | undefined }),
              (e) => ({ text: "", sources: [] as string[], error: e instanceof Anthropic.APIError ? `AI request failed (${e.status}).` : String(e?.message ?? e) }),
            ),
          ),
        ),
        contact.website ? checkSite(contact.website, contact.phone ?? null).catch(() => null) : Promise.resolve(null),
      ]);

      const answered = answers.map((a, index) => ({ index, question: questions[index].question, text: a.text })).filter((a) => a.text);
      if (answered.length === 0) throw new Error(answers[0]?.error ?? "The assistant returned no answers.");
      const readings = await readAnswers(client, { name: community.name, address: community.address }, answered);

      const prompts: PromptResult[] = questions.map((q, index) => {
        const a = answers[index];
        const r = readings.find((x) => x.index === index);
        const kind: PromptKind = q.kind;
        return {
          kind,
          question: q.question,
          answer: a.text.slice(0, 2500),
          mentioned: r?.mentioned ?? false,
          position: r?.position ?? null,
          communities: (r?.communities ?? []).slice(0, 12),
          namedAs: r?.namedAs ?? null,
          statedPhone: r?.statedPhone ?? null,
          statedRent: r?.statedRent ?? null,
          statedRating: r?.statedRating ?? null,
          tone: r?.tone ?? "none",
          note: r?.note ?? "",
          sources: a.sources,
          error: a.error ?? (a.text && !r ? "This answer could not be read." : undefined),
        };
      });

      const need = prompts.filter((p) => p.kind === "need" && !p.error);
      const counts = new Map<string, { name: string; count: number }>();
      for (const p of need) {
        for (const name of new Set(p.communities)) {
          const key = name.toLowerCase();
          if (key === community.name.toLowerCase() || (p.namedAs && key === p.namedAs.toLowerCase())) continue;
          counts.set(key, { name, count: (counts.get(key)?.count ?? 0) + 1 });
        }
      }
      const base: Omit<VisibilityResult, "fixes"> = {
        v: 1,
        assistant: ASSISTANT_LABEL,
        market,
        google: {
          name: community.name,
          address: community.address,
          rating: community.googleRating ?? null,
          totalReviews: community.totalReviews ?? 0,
          phone: contact.phone ?? null,
          website: contact.website ?? null,
        },
        prompts,
        shown: need.filter((p) => p.mentioned).length,
        outOf: need.length,
        competitors: [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 8),
        site,
      };
      const result: VisibilityResult = { ...base, fixes: fixesFor(base) };
      await ctx.runMutation(internal.visibility.finish, { scanId, result: JSON.stringify(result) });
    } catch (e) {
      console.warn("AI search check failed", e);
      const message =
        e instanceof Anthropic.AuthenticationError ? "The Anthropic API key was rejected."
        : e instanceof Anthropic.RateLimitError ? "The AI service is busy. Try again in a minute."
        : e instanceof Anthropic.APIError ? `AI request failed (${e.status}).`
        : e instanceof Error ? e.message
        : "The check did not finish.";
      await ctx.runMutation(internal.visibility.finish, { scanId, error: message.slice(0, 300) });
    }
    return null;
  },
});
