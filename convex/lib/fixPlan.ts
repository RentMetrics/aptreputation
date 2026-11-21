// The fix plan: turns what the AI search check found into tasks a property's
// team can work through. Pure code, shared by the server and the browser.

import type { VisibilityResult } from "./visibility";

/** Where the work happens. */
export type Place = "aptreputation" | "google" | "listing" | "website";

/**
 * How a task ends:
 *  - "check": the next AI search check stops finding the problem.
 *  - "auto": AptReputation can see the result itself (a connection made, a form filled in).
 *  - "manual": only the person who did it can say; their word closes it.
 *  - "ongoing": a habit, never finished.
 */
export type Verify = "check" | "auto" | "manual" | "ongoing";

/** A tab on the property page a task can open. */
export type TabLink = "reviews" | "requests" | "settings" | "facts";

export type TaskSpec = {
  key: string;
  place: Place;
  verify: Verify;
  priority: "now" | "next";
  title: string;
  why: string;
  steps: string[];
  /** Opens the part of AptReputation where the work is done. */
  link?: { tab: TabLink; label: string };
  /** True when a written request to someone else is part of the work, so one can be drafted. */
  request?: "listing" | "website" | "google";
};

export type Facts = {
  phone?: string;
  website?: string;
  hours?: string;
  bedrooms?: string;
  rent?: string;
  special?: string;
  pets?: string;
  formerNames?: string;
};

export const FACT_FIELDS: { key: keyof Facts; label: string; hint: string; required?: boolean }[] = [
  { key: "phone", label: "Leasing phone", hint: "The one number every listing should show", required: true },
  { key: "website", label: "Website", hint: "The property's own site", required: true },
  { key: "hours", label: "Office hours", hint: "Mon–Fri 9–6, Sat 10–5" },
  { key: "bedrooms", label: "Homes offered", hint: "Studios, 1, 2 and 3 bedrooms", required: true },
  { key: "rent", label: "Rent", hint: "1 bed from $1,360, 2 bed from $1,755", required: true },
  { key: "special", label: "Current special", hint: "One month free on 12-month leases through Dec 31, or None" },
  { key: "pets", label: "Pet policy", hint: "Cats and dogs, 2 per home, $300 deposit, $50 a month", required: true },
  { key: "formerNames", label: "Former names", hint: "Any name the property used before, or None" },
];

export const factsComplete = (f: Facts | null | undefined) => FACT_FIELDS.every((x) => !x.required || !!f?.[x.key]?.trim());

/** Listing sites grouped by the company that runs them: one manager account usually covers the group. */
export const NETWORKS: { key: string; name: string; sites: string[]; account: string }[] = [
  { key: "costar", name: "Apartments.com", sites: ["apartments.com", "apartmentfinder.com", "forrent.com", "homes.com", "apartmenthomeliving.com"], account: "the Apartments.com (CoStar) manager account" },
  { key: "zillow", name: "Zillow", sites: ["zillow.com", "trulia.com", "hotpads.com"], account: "the Zillow Rentals manager account" },
  { key: "rent", name: "Rent.", sites: ["rent.com", "apartmentguide.com", "redfin.com"], account: "the Rent. manager account" },
  { key: "rentcafe", name: "RentCafe", sites: ["rentcafe.com"], account: "the RentCafe (Yardi) marketing account" },
  { key: "apartmentlist", name: "Apartment List", sites: ["apartmentlist.com"], account: "the Apartment List partner account" },
  { key: "zumper", name: "Zumper", sites: ["zumper.com", "padmapper.com"], account: "the Zumper manager account" },
  { key: "yelp", name: "Yelp", sites: ["yelp.com", "m.yelp.com"], account: "the Yelp for Business account" },
  { key: "apartmentratings", name: "ApartmentRatings", sites: ["apartmentratings.com"], account: "the ApartmentRatings manager account" },
];

const PLACE_ORDER: Place[] = ["aptreputation", "google", "listing", "website"];

export const PLACE_LABEL: Record<Place, { title: string; blurb: string }> = {
  aptreputation: { title: "Do here in AptReputation", blurb: "Work you can finish without leaving this page." },
  google: { title: "On Google, Bing and Apple Maps", blurb: "The map listings that assistants and phones look the property up in." },
  listing: { title: "On listing sites", blurb: "Each site has its own manager sign-in. We give you the steps and the wording; you or whoever holds the sign-in makes the change." },
  website: { title: "On the property website", blurb: "Requests for whoever runs the property's website." },
};

type Context = { hasGoogle: boolean; facts: Facts | null | undefined };

/** Titles for tasks that have been cleared and no longer appear in the latest check. */
const TITLES: Record<string, string> = {
  "google-rating": "Raise the Google rating and keep new reviews coming",
  "reply-reviews": "Reply to every review",
  "connect-google": "Connect the Google Business Profile",
  "fact-sheet": "Fill in the fact sheet",
  phone: "Make the leasing phone number the same everywhere",
  names: "Retire the other names this property is listed under",
  "low-rating": "Fix the low rating assistants are quoting",
  "current-story": "Give assistants something current to quote",
  "google-website": "Add the website to the Google listing",
  "claim-bing": "Claim the property on Bing Places",
  "claim-apple": "Claim the property on Apple Maps",
  "site-blocked": "Confirm the website lets AI crawlers in",
  "site-robots": "Stop turning AI crawlers away",
  "site-text": "Put the page's content in plain text",
  "site-rent": "Show rent on the website",
  "site-pets": "State the pet policy on the website",
  "site-description": "Add a page description",
  "site-schema": "Add apartment structured data",
};

export function titleOf(key: string) {
  if (key.startsWith("listing:")) {
    const n = NETWORKS.find((x) => `listing:${x.key}` === key);
    return `Correct the ${n?.name ?? "listing site"} listing`;
  }
  return TITLES[key] ?? "Fix";
}

const WEBSITE_STEPS = [
  "Find out who updates the website: the management company's marketing team or an outside web vendor.",
  "Send them the request below. \"Write the request for me\" drafts it with this property's details.",
  "Ask for a date and mark this done when they confirm the change is live.",
];

/** Every task for a property, from the latest check (null when none has run) and what the team has set up. */
export function tasksFor(result: VisibilityResult | null, ctx: Context): TaskSpec[] {
  const tasks: TaskSpec[] = [];
  const fix = (key: string) => result?.fixes.find((f) => f.key === key);

  // --- in AptReputation -----------------------------------------------------
  if (!factsComplete(ctx.facts)) {
    tasks.push({
      key: "fact-sheet",
      place: "aptreputation",
      verify: "auto",
      priority: "now",
      title: TITLES["fact-sheet"],
      why: "Every other fix depends on one agreed set of facts: the phone number, rent, pet policy and special that each listing should show. Requests we write for you are filled in from it.",
      steps: ["Open the fact sheet at the bottom of this page.", "Fill in each line as it should appear everywhere.", "Save. This task clears itself."],
      link: { tab: "facts", label: "Open the fact sheet" },
    });
  }
  const rating = fix("google-rating");
  tasks.push({
    key: "google-rating",
    place: "aptreputation",
    verify: "ongoing",
    priority: "now",
    title: TITLES["google-rating"],
    why: rating?.why ?? "Assistants lean on star ratings and recent reviews when they pick a short list. A steady flow of new reviews is the most reliable way to be named.",
    steps: [
      "Give each leasing and maintenance team member a review card or link from Get reviews.",
      "Ask every resident at the moments that go well: a finished work order, a renewal, a move-in.",
      "Send every resident to the same Google form. Never screen who is asked and never offer anything in return.",
    ],
    link: { tab: "requests", label: "Open Get reviews" },
  });
  tasks.push({
    key: "reply-reviews",
    place: "aptreputation",
    verify: "ongoing",
    priority: "next",
    title: TITLES["reply-reviews"],
    why: "Replies show renters, and the assistants that read reviews, that the team responds. AptReputation drafts each reply for you to approve.",
    steps: ["Open Reviews and start with the newest review that has no reply.", "Read the draft, edit it so it sounds like you, and post it.", "Aim to reply within two working days."],
    link: { tab: "reviews", label: "Open Reviews" },
  });

  // --- Google ---------------------------------------------------------------
  if (!ctx.hasGoogle) {
    tasks.push({
      key: "connect-google",
      place: "google",
      verify: "auto",
      priority: "now",
      title: TITLES["connect-google"],
      why: "Until the profile is connected, AptReputation sees only the five newest reviews Google shows publicly and cannot post replies.",
      steps: [
        "Find out who manages the property's Google Business Profile. It is usually the management company's marketing team.",
        "If that is you, open Settings and choose Connect Google.",
        "If it is someone else, invite them to this property in Team, or ask them to add you as a manager on the Google profile, then connect it.",
        "This task clears itself once the profile is connected.",
      ],
      link: { tab: "settings", label: "Open Settings" },
      request: "google",
    });
  }
  const gw = fix("google-website");
  if (gw) {
    tasks.push({
      key: gw.key,
      place: "google",
      verify: "check",
      priority: gw.priority,
      title: gw.title,
      why: gw.why,
      steps: ["Sign in to the Google Business Profile for this property.", "Choose Edit profile, then Contact, and add the website from the fact sheet.", "Save. Google can take a few days to show it."],
    });
  }
  tasks.push({
    key: "claim-bing",
    place: "google",
    verify: "manual",
    priority: "next",
    title: TITLES["claim-bing"],
    why: "ChatGPT draws on Bing for local results, and most properties have never claimed their Bing listing.",
    steps: [
      "Go to bingplaces.com and sign in with a Microsoft or Google account that belongs to the business.",
      "Search for the property. Claim the listing if it exists, or add it if it does not.",
      "Enter the name, address, phone, website and hours exactly as on the fact sheet.",
      "Complete Bing's verification. It is sent to the property by phone, email or post, so someone on site must take it.",
    ],
  });
  tasks.push({
    key: "claim-apple",
    place: "google",
    verify: "manual",
    priority: "next",
    title: TITLES["claim-apple"],
    why: "Apple Maps answers Siri and iPhone searches, and its listing is edited separately from Google's.",
    steps: [
      "Go to businessconnect.apple.com and sign in with an Apple Account that belongs to the business.",
      "Search for the property and claim its place card, or add it.",
      "Enter the name, address, phone, website and hours exactly as on the fact sheet.",
      "Complete Apple's verification, which goes to the property's phone or documents.",
    ],
  });

  // --- listing sites --------------------------------------------------------
  const phone = fix("phone");
  const names = fix("names");
  const low = fix("low-rating");
  if (phone) {
    tasks.push({
      key: phone.key,
      place: "listing",
      verify: "check",
      priority: phone.priority,
      title: phone.title,
      why: phone.why,
      steps: [
        "Check the phone number on the fact sheet is the one you want renters to call.",
        "On each listing site below, compare the number shown with the fact sheet.",
        "Where a site assigns its own tracking number, call it once to confirm it rings the leasing office.",
        "Ask each site to show the fact sheet number where it allows that.",
      ],
      request: "listing",
    });
  }
  if (names) {
    tasks.push({
      key: names.key,
      place: "listing",
      verify: "check",
      priority: names.priority,
      title: names.title,
      why: names.why,
      steps: [
        "List the old names on the fact sheet under Former names.",
        "On each listing site below, search for the old name as well as the current one.",
        "Ask the site to rename the old page or merge it into the current one, so reviews and photos are kept.",
        "Add one line to the website: the current name, \"formerly\" the old name.",
      ],
      request: "listing",
    });
  }
  if (low) {
    tasks.push({
      key: low.key,
      place: "listing",
      verify: "check",
      priority: low.priority,
      title: low.title,
      why: low.why,
      steps: [
        "Open the listing site named above and read the reviews behind that rating.",
        "Reply to each one from the manager account.",
        "For the next month, invite residents who offer to leave a review to post on that site as well as Google. Ask everyone the same way.",
        "Re-run the check after a few new reviews appear.",
      ],
    });
  }
  if (result && (phone || names || low)) {
    // One task per listing company that the assistants actually read about this property.
    const cited = new Set(result.prompts.flatMap((p) => p.answers.flatMap((a) => (a.mentioned ? a.sources : []))));
    for (const n of NETWORKS) {
      const seen = n.sites.filter((s) => cited.has(s));
      if (!seen.length) continue;
      tasks.push({
        key: `listing:${n.key}`,
        place: "listing",
        verify: "manual",
        priority: "next",
        title: `Correct the ${n.name} listing`,
        why: `Assistants read ${seen.join(", ")} when they described this property.`,
        steps: [
          `Find out who holds ${n.account}. It is usually the management company's marketing team or its agency.`,
          `Open the property's page${n.sites.length > 1 ? ` on ${n.sites.slice(0, 3).join(", ")}` : ""} and compare each line with the fact sheet: name, phone, rent, special, bedrooms and pet policy.`,
          "Correct what differs in the manager account. If rent and specials are fed from the property management system, correct them there so every site updates.",
          "Search the site for any old name and ask support to merge or remove that page.",
          "Mark this done when the page matches the fact sheet.",
        ],
        request: "listing",
      });
    }
  }

  // --- website --------------------------------------------------------------
  const story = fix("current-story");
  if (story) {
    tasks.push({
      key: story.key,
      place: "website",
      verify: "check",
      priority: story.priority,
      title: story.title,
      why: story.why,
      steps: [
        "Write a short page for the website: what has been repaired, replaced or improved, with dates, and how maintenance requests are handled now.",
        "Keep it factual. Name the change, not the complaint.",
        "Link to it from the home page so readers find it.",
        "Keep new reviews coming so recent ones outnumber the old.",
      ],
      request: "website",
    });
  }
  for (const key of ["site-blocked", "site-robots", "site-text", "site-rent", "site-pets", "site-description", "site-schema"]) {
    const f = fix(key);
    if (f) tasks.push({ key, place: "website", verify: "check", priority: f.priority, title: f.title, why: f.why, steps: WEBSITE_STEPS, request: "website" });
  }

  return tasks.sort((a, b) => PLACE_ORDER.indexOf(a.place) - PLACE_ORDER.indexOf(b.place));
}

export function factSheetText(name: string, address: string, f: Facts | null | undefined) {
  const line = (label: string, value?: string) => (value?.trim() ? `${label}: ${value.trim()}` : null);
  return [
    `Name: ${name}`,
    `Address: ${address.replace(/, USA$/, "")}`,
    ...FACT_FIELDS.map((x) => line(x.label, f?.[x.key])),
  ]
    .filter(Boolean)
    .join("\n");
}
