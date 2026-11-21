// Shared shapes and pure helpers for the AI search check. No Node or Convex
// APIs here, so the browser can import the types and the tests can run the helpers.

export type PromptKind = "need" | "name";

export type PromptResult = {
  kind: PromptKind;
  question: string;
  /** The assistant's answer, trimmed for display. */
  answer: string;
  /** True when the answer names this property. */
  mentioned: boolean;
  /** 1 = named first. Null when not named or when the answer is not a list. */
  position: number | null;
  /** Communities the answer recommends, in order. */
  communities: string[];
  /** The name the answer used for this property, when it differs from the Google name. */
  namedAs: string | null;
  statedPhone: string | null;
  statedRent: string | null;
  statedRating: string | null;
  tone: "positive" | "neutral" | "mixed" | "negative" | "none";
  note: string;
  /** Websites the answer cited. */
  sources: string[];
  error?: string;
};

export type SiteCheck = {
  url: string;
  /** "ok", "blocked" (the site refused an automated reader) or "failed". */
  status: "ok" | "blocked" | "failed";
  httpStatus?: number;
  title?: string;
  description?: string;
  /** schema.org types found in the page's structured data. */
  schemaTypes: string[];
  textLength: number;
  showsRent: boolean;
  mentionsPets: boolean;
  showsPhone: boolean;
  hasLlmsTxt: boolean;
  /** AI crawlers the site's robots.txt turns away. */
  blockedCrawlers: string[];
};

export type Fix = { priority: "now" | "next"; title: string; why: string };

export type VisibilityResult = {
  v: 1;
  assistant: string;
  market: { city: string; state: string; zip: string } | null;
  google: { name: string; address: string; rating: number | null; totalReviews: number; phone: string | null; website: string | null };
  prompts: PromptResult[];
  /** Of the searches by need, how many named this property. */
  shown: number;
  outOf: number;
  /** Communities named most often across the searches by need, with a count. */
  competitors: { name: string; count: number }[];
  site: SiteCheck | null;
  fixes: Fix[];
};

export const AI_CRAWLERS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot", "Google-Extended"];

/** "2277 Arbour Walk Cir, Naples, FL 34109, USA" → Naples / FL / 34109. */
export function marketOf(address: string): VisibilityResult["market"] {
  const m = address.match(/,\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})/);
  return m ? { city: m[1].trim(), state: m[2], zip: m[3] } : null;
}

export function questionsFor(name: string, market: NonNullable<VisibilityResult["market"]>): { kind: PromptKind; question: string }[] {
  const place = `${market.city}, ${market.state}`;
  return [
    { kind: "need", question: `Best apartments in ${place}` },
    { kind: "need", question: `Pet friendly apartments in ${place}` },
    { kind: "need", question: `2 bedroom apartments in ${market.city} ${market.state} ${market.zip}` },
    { kind: "need", question: `Which apartments in ${place} have move-in specials right now?` },
    { kind: "name", question: `Tell me about ${name} in ${place}: rent, reviews, pet policy and phone number` },
  ];
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");

export function samePhone(a: string | null | undefined, b: string | null | undefined) {
  const x = digits(a);
  return x.length === 10 && x === digits(b);
}

/** Which AI crawlers a robots.txt turns away from the whole site. */
export function blockedCrawlers(robots: string): string[] {
  const groups: { agents: string[]; disallowAll: boolean; allowsRoot: boolean }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], disallowAll: false, allowsRoot: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "disallow" && value === "/") current.disallowAll = true;
    if (key === "allow" && value === "/") current.allowsRoot = true;
  }
  const blocks = (g: (typeof groups)[number] | undefined) => !!g && g.disallowAll && !g.allowsRoot;
  const everyone = groups.find((g) => g.agents.includes("*"));
  return AI_CRAWLERS.filter((bot) => {
    const own = groups.find((g) => g.agents.includes(bot.toLowerCase()));
    return own ? blocks(own) : blocks(everyone);
  });
}

function schemaTypesOf(html: string): string[] {
  const found = new Set<string>();
  const add = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(add);
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const t = obj["@type"];
    if (typeof t === "string") found.add(t);
    else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && found.add(x));
    if (obj["@graph"]) add(obj["@graph"]);
  };
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      add(JSON.parse(m[1]));
    } catch {
      // Malformed structured data is the same as none for a reader.
    }
  }
  return [...found];
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** What a text-only reader gets from a property's home page. */
export function readPage(html: string, phone: string | null): Pick<SiteCheck, "title" | "description" | "schemaTypes" | "textLength" | "showsRent" | "mentionsPets" | "showsPhone"> {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const metaTag = html.match(/<meta[^>]+name=["']description["'][^>]*>/i)?.[0];
  const description = metaTag?.match(/content=["']([^"']*)["']/i)?.[1];
  const text = decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
  const phoneDigits = digits(phone);
  return {
    title: title ? decode(title).slice(0, 200) : undefined,
    description: description ? decode(description).slice(0, 300) : undefined,
    schemaTypes: schemaTypesOf(html),
    textLength: text.length,
    showsRent: /\$\s?\d{1,2},?\d{3}\b/.test(text),
    mentionsPets: /\bpets?\b|\bdogs?\b|\bcats?\b/i.test(text),
    showsPhone: phoneDigits.length === 10 && text.replace(/\D/g, "").includes(phoneDigits),
  };
}

/** The changes most likely to get the property named more often, from what the check found. */
export function fixesFor(r: Omit<VisibilityResult, "fixes">): Fix[] {
  const fixes: Fix[] = [];
  const byName = r.prompts.find((p) => p.kind === "name" && !p.error);
  const g = r.google;

  if (r.outOf > 0 && r.shown < r.outOf) {
    const rated = g.rating !== null ? `${g.rating.toFixed(1)} stars from ${g.totalReviews.toLocaleString("en-US")} Google reviews` : "no Google rating yet";
    fixes.push({
      priority: "now",
      title: "Raise the Google rating and keep new reviews coming",
      why: `This property was named in ${r.shown} of ${r.outOf} searches by need and has ${rated}. Assistants lean on star ratings and recent reviews when they pick a short list.`,
    });
  }
  if (byName?.statedPhone && g.phone && !samePhone(byName.statedPhone, g.phone)) {
    fixes.push({
      priority: "now",
      title: "Make the leasing phone number the same everywhere",
      why: `Asked about the property by name, the assistant gave ${byName.statedPhone}. Google shows ${g.phone}. Listing sites often assign their own numbers, and assistants repeat them.`,
    });
  }
  const otherNames = [...new Set(r.prompts.map((p) => p.namedAs).filter((n): n is string => !!n))];
  if (otherNames.length) {
    fixes.push({
      priority: "now",
      title: "Retire the other names this property is listed under",
      why: `Answers referred to it as ${otherNames.join(", ")}. Ask each listing site to rename or redirect old pages, and state the former name once on the website so readers connect the two.`,
    });
  }
  if (byName && (byName.tone === "negative" || byName.tone === "mixed")) {
    fixes.push({
      priority: "next",
      title: "Give assistants something current to quote",
      why: `Asked by name, the description was ${byName.tone}: ${byName.note} Recent reviews and a dated page on what has been repaired or improved replace older complaints over time.`,
    });
  }
  const s = r.site;
  if (!g.website) {
    fixes.push({ priority: "now", title: "Add the website to the Google listing", why: "Google shows no website for this property, so assistants have no official page to read." });
  } else if (s) {
    if (s.status === "blocked") {
      fixes.push({
        priority: "next",
        title: "Confirm the website lets AI crawlers in",
        why: "The site turned away our automated reader. That is often a bot shield that also turns away AI crawlers. Ask the web vendor to allow GPTBot, OAI-SearchBot, ClaudeBot and PerplexityBot.",
      });
    }
    if (s.blockedCrawlers.length) {
      fixes.push({ priority: "now", title: "Stop turning AI crawlers away", why: `The site's robots.txt blocks ${s.blockedCrawlers.join(", ")}, so those assistants cannot read the property's own page.` });
    }
    if (s.status === "ok") {
      if (s.textLength < 600) {
        fixes.push({ priority: "now", title: "Put the page's content in plain text", why: "A text-only reader gets almost nothing from the home page, which usually means the content is drawn by scripts. Assistants read the plain text." });
      }
      if (!s.showsRent) fixes.push({ priority: "next", title: "Show rent on the website", why: "No rent figure appears in the home page text. Assistants answer price questions from listing sites instead, which are often out of date." });
      if (!s.mentionsPets) fixes.push({ priority: "next", title: "State the pet policy on the website", why: "The home page says nothing about pets, a common filter in renter questions." });
      if (!s.description) fixes.push({ priority: "next", title: "Add a page description", why: "The home page has no description tag, the one-line summary search engines and assistants show." });
      if (!s.schemaTypes.some((t) => /Apartment|Residence|LocalBusiness|Place/i.test(t))) {
        fixes.push({ priority: "next", title: "Add apartment structured data", why: "The home page has no structured data naming it as an apartment community with its address and phone." });
      }
    }
  }
  return fixes;
}
