"use node";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { placeContact } from "./lib/google";
import {
  ASSISTANTS,
  blockedCrawlers,
  fixesFor,
  marketOf,
  questionsFor,
  readPage,
  type AssistantAnswer,
  type AssistantKey,
  type PromptResult,
  type SiteCheck,
  type VisibilityResult,
} from "./lib/visibility";

const CLAUDE_MODEL = "claude-opus-5-5";
// Overridable in the Convex environment when either provider renames its models.
const OPENAI_MODEL = () => process.env.OPENAI_MODEL || "gpt-6.2-astra";
const GEMINI_MODEL = () => process.env.GEMINI_MODEL || "gemini-3.8-flash";

// Each assistant is asked the way a renter would ask, with no mention of the
// property being checked, so the answer is the one a renter would get.
const RENTER_SYSTEM = `You are a general-purpose AI assistant. Someone looking for an apartment asks you a question. Search the web and answer as you normally would: name specific apartment communities and give the facts you found for each, such as rent, rating and anything notable. Keep the answer under 250 words.`;

type Answer = { text: string; sources: string[] };

function hosts(urls: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const u of urls) {
    try {
      out.add(new URL(u).hostname.replace(/^www\./, ""));
    } catch {
      // Not a usable address; leave it out.
    }
  }
  return [...out].slice(0, 12);
}

/** One more try when the provider has a passing server error; those clear within seconds. */
async function postJson(url: string, headers: Record<string, string>, body: unknown, provider: string): Promise<any> {
  try {
    return await postOnce(url, headers, body, provider);
  } catch (e) {
    if (!(e instanceof Error) || !/failed \(5\d\d\)/.test(e.message)) throw e;
    await new Promise((resolve) => setTimeout(resolve, 3000));
    return await postOnce(url, headers, body, provider);
  }
}

async function postOnce(url: string, headers: Record<string, string>, body: unknown, provider: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // The detail is for us; the person reading the result only needs to know there was no answer.
      console.warn(`${provider} request failed`, res.status, data?.error?.message);
      throw new Error(
        res.status === 429 ? `${provider} is over its usage allowance.`
        : res.status === 401 || res.status === 403 ? `${provider} did not accept the API key.`
        : `${provider} request failed (${res.status}).`,
      );
    }
    return data;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error(`${provider} took too long to answer.`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function askClaude(question: string): Promise<Answer> {
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  const text: string[] = [];
  const cited = new Set<string>();
  const searched = new Set<string>();
  try {
    // A long search turn can pause; sending it back lets the server continue.
    for (let round = 0; round < 4; round++) {
      const res = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 6000,
        output_config: { effort: "low" },
        system: RENTER_SYSTEM,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
        messages,
      });
      if (res.stop_reason === "refusal") throw new Error("Claude declined to answer.");
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
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw new Error(`Claude request failed (${e.status}).`);
    throw e;
  }
  // Prefer what the answer cited; fall back to what the search returned.
  return { text: text.join("").trim(), sources: hosts(cited.size ? cited : searched) };
}

async function askChatGpt(question: string): Promise<Answer> {
  const data = await postJson(
    "https://api.openai.com/v1/responses",
    { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    { model: OPENAI_MODEL(), instructions: RENTER_SYSTEM, tools: [{ type: "web_search" }], reasoning: { effort: "low" }, input: question },
    "ChatGPT",
  );
  const text: string[] = [];
  const cited: string[] = [];
  for (const item of data.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type !== "output_text") continue;
      text.push(part.text ?? "");
      for (const a of part.annotations ?? []) if (a.type === "url_citation" && a.url) cited.push(a.url);
    }
  }
  return { text: text.join("").trim(), sources: hosts(cited) };
}

async function askGemini(question: string): Promise<Answer> {
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL()}:generateContent`,
    { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    {
      system_instruction: { parts: [{ text: RENTER_SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: question }] }],
      tools: [{ google_search: {} }],
    },
    "Gemini",
  );
  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((p: any) => typeof p.text === "string" && !p.thought)
    .map((p: any) => p.text)
    .join("")
    .trim();
  if (!text) throw new Error(candidate?.finishReason ? `Gemini returned no answer (${candidate.finishReason}).` : "Gemini returned no answer.");
  // Gemini's source links are redirects; the title carries the site's name.
  const sites = new Set<string>();
  for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
    const title = chunk?.web?.title;
    if (typeof title === "string" && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(title.trim())) sites.add(title.trim().toLowerCase().replace(/^www\./, ""));
  }
  return { text, sources: [...sites].slice(0, 12) };
}

const ASK: Record<AssistantKey, { ready: () => boolean; ask: (question: string) => Promise<Answer> }> = {
  chatgpt: { ready: () => !!process.env.OPENAI_API_KEY, ask: askChatGpt },
  gemini: { ready: () => !!process.env.GEMINI_API_KEY, ask: askGemini },
  claude: { ready: () => !!process.env.ANTHROPIC_API_KEY, ask: askClaude },
};

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

const READING_SYSTEM = `You read answers that AI assistants gave to renter questions and record how one apartment community, the target, appears in each. Work only from the answer text.
For each answer return:
- index: the answer's index, unchanged.
- communities: the apartment communities the answer recommends or lists, in the order given, by name only.
- mentioned: true if the answer names the target. Match on the address or on an obvious former or alternate name for the same property too, but not a different community with a similar name at another address.
- position: where the target falls in the answer's list, 1 for first. Null if it is not named or the answer is not a list.
- namedAs: the name the answer used for the target when it differs from the target's name, otherwise null.
- statedPhone, statedRent: what the answer states for the target, copied as written, otherwise null.
- statedRating: the rating the answer gives for the target, starting with the number, for example "1.0 from 3 reviews on Apartments.com". If it gives several, use the one it leads with. Otherwise null.
- tone: how the answer describes the target. "none" when it is not named.
- note: one plain sentence. If the target is named, how it is described. If not, what the answer recommended instead.
Return one reading per answer.`;

async function readAnswers(target: { name: string; address: string }, answers: { index: number; question: string; text: string }[]) {
  const body = answers.map((a) => `<answer index="${a.index}">\n<question>${a.question}</question>\n${a.text}\n</answer>`).join("\n\n");
  const res = await new Anthropic().messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
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
    // The target is a customer's property, or any Google listing for an admin report.
    const community = await ctx.runQuery(internal.visibility.scanContext, { scanId });
    if (!community) return null;
    try {
      // The answers are read into a table by Claude, so its key is needed whichever assistants are asked.
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("AI is not configured yet (ANTHROPIC_API_KEY).");
      const market = marketOf(community.address);
      if (!market) throw new Error("This property's address has no city and ZIP code, so renter questions cannot be written for it.");
      const questions = questionsFor(community.name, market);
      const active = ASSISTANTS.filter((a) => ASK[a.key].ready());

      const contact = await placeContact(community.placeId).catch(() => ({ website: undefined, phone: undefined }));
      // One cell per question and assistant, all asked at once.
      const cells = questions.flatMap((q, qi) => active.map((a) => ({ qi, key: a.key, question: q.question })));
      const [raw, siteRaw] = await Promise.all([
        Promise.all(
          cells.map((c) =>
            ASK[c.key].ask(c.question).then(
              (a) => ({ ...a, error: a.text ? undefined : "No answer came back." }),
              (e) => ({ text: "", sources: [] as string[], error: String(e instanceof Error ? e.message : e).slice(0, 200) }),
            ),
          ),
        ),
        contact.website ? checkSite(contact.website, contact.phone ?? null).catch(() => null) : Promise.resolve(null),
      ]);

      const answered = cells.map((c, index) => ({ index, question: c.question, text: raw[index].text })).filter((a) => a.text);
      if (answered.length === 0) throw new Error(raw.find((r) => r.error)?.error ?? "No assistant returned an answer.");
      const readings = await readAnswers({ name: community.name, address: community.address }, answered);

      const prompts: PromptResult[] = questions.map((q, qi) => ({
        kind: q.kind,
        question: q.question,
        answers: cells
          .map((c, index) => ({ c, index }))
          .filter(({ c }) => c.qi === qi)
          .map(({ c, index }): AssistantAnswer => {
            const a = raw[index];
            const r = readings.find((x) => x.index === index);
            return {
              assistant: c.key,
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
              error: a.error ?? (r ? undefined : "This answer could not be read."),
            };
          }),
      }));

      const needAnswers = prompts.filter((p) => p.kind === "need").flatMap((p) => p.answers).filter((a) => !a.error);
      const counts = new Map<string, { name: string; count: number }>();
      for (const a of needAnswers) {
        for (const name of new Set(a.communities.map((n) => n.trim()))) {
          const key = name.toLowerCase();
          if (key === community.name.toLowerCase() || (a.namedAs && key === a.namedAs.toLowerCase())) continue;
          counts.set(key, { name: counts.get(key)?.name ?? name, count: (counts.get(key)?.count ?? 0) + 1 });
        }
      }
      let site = siteRaw;
      if (site) {
        const host = new URL(site.url).hostname.replace(/^www\./, "");
        site = { ...site, citedByAssistant: prompts.some((p) => p.answers.some((a) => a.sources.includes(host))) };
      }
      const base: Omit<VisibilityResult, "fixes"> = {
        v: 2,
        assistants: active
          .map((a) => {
            const mine = needAnswers.filter((x) => x.assistant === a.key);
            return { key: a.key, label: a.label, shown: mine.filter((x) => x.mentioned).length, outOf: mine.length };
          })
          .filter((a) => a.outOf > 0),
        market,
        google: {
          name: community.name,
          address: community.address,
          rating: community.rating,
          totalReviews: community.totalReviews,
          phone: contact.phone ?? null,
          website: contact.website ?? null,
        },
        factPhone: community.factPhone,
        prompts,
        shown: needAnswers.filter((a) => a.mentioned).length,
        outOf: needAnswers.length,
        competitors: [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 10),
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
