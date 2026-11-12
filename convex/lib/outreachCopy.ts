/**
 * Outreach copy. Shared by the admin screens and the sender, so what an admin
 * previews is exactly what goes out. Every figure in it is the property's
 * public Google rating, which the recipient can check for themselves.
 */

export const PUBLIC_SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.aptreputation.com").replace(/\/$/, "");
export const POSTAL_ADDRESS = "Apartment Reputation, 30 E Broadway, Suite 203 #1053, Salt Lake City, UT 84111";

export type PitchInput = {
  name: string;
  city: string;
  state: string;
  googleRating?: number;
  googleReviews?: number;
};

/** A landing-page link that opens this property's free audit. */
export function auditLink(p: PitchInput) {
  return `${PUBLIC_SITE}/?audit=${encodeURIComponent(`${p.name} ${p.city} ${p.state}`)}`;
}

/** Subject and opening for a property, with no link. */
function opening(p: PitchInput) {
  const rating = p.googleRating;
  const reviews = p.googleReviews ?? 0;
  const count = `${reviews.toLocaleString("en-US")} review${reviews === 1 ? "" : "s"}`;
  if (typeof rating !== "number") {
    return {
      subject: `${p.name} has no Google rating yet`,
      text: `${p.name} doesn't have a Google rating yet, so prospects searching for apartments in ${p.city} see nothing next to your name. AptReputation gives your team tap cards and links that make it easy for happy residents to leave a first review.`,
    };
  }
  const stars = rating.toFixed(1);
  let middle: string;
  if (rating < 3.5) {
    middle = `Prospective residents see that number before they see a floor plan. AptReputation helps your on-site team answer every review, fix what residents complain about most, and ask satisfied residents for a review at the right moment.`;
  } else if (rating < 4.3) {
    middle = `That is a few tenths away from standing out against the communities around you. AptReputation helps your on-site team reply to every review, see which complaints repeat, and collect more reviews from the residents who are happy.`;
  } else if (reviews < 50) {
    middle = `That is a strong score, but with ${count} a couple of bad weeks can move it. AptReputation helps your team keep new reviews coming so the rating holds.`;
  } else {
    middle = `That is a rating worth protecting. AptReputation alerts your team to every new review, drafts replies, and credits the staff residents name so the service behind that score keeps going.`;
  }
  return {
    subject: `${p.name} is rated ${stars} on Google`,
    text: `${p.name} has a ${stars}-star Google rating from ${count}. ${middle}`,
  };
}

/** One-paragraph message for copying into a letter, call note or mail merge. */
export function pitch(p: PitchInput) {
  const o = opening(p);
  return { subject: o.subject, body: `${o.text} See what residents are saying about ${p.name}, free: ${auditLink(p)}` };
}

/** Days after the previous email that each follow-up goes out. */
export const STEP_GAP_DAYS = [0, 4, 5];

export type SequenceEmail = { subject: string; paragraphs: string[] };

/** The three emails a property receives once an admin approves it. */
export function sequence(p: PitchInput): SequenceEmail[] {
  const first = opening(p);
  const link = auditLink(p);
  return [
    {
      subject: first.subject,
      paragraphs: [
        `Hello,`,
        first.text,
        `Here is a free look at what residents are saying about ${p.name}. It reads your newest Google reviews and lists what they praise and what they raise:`,
        link,
        `If someone else looks after reviews for ${p.name}, I'd be grateful if you passed this along.`,
      ],
    },
    {
      subject: `Following up on ${p.name}'s Google reviews`,
      paragraphs: [
        `Hello,`,
        `A quick follow-up on my note about ${p.name}'s Google reviews. The free audit takes a few seconds and needs no account:`,
        link,
        `Communities use AptReputation to get an alert for each new review, reply from one place with a draft ready to edit, and hand staff a tap card so a happy resident can leave a review on the spot. It is $99 a month per property after a 14-day free trial.`,
      ],
    },
    {
      subject: `Last note about ${p.name}'s Google rating`,
      paragraphs: [
        `Hello,`,
        `This is my last note about ${p.name}. If raising the Google rating is on your list this year, the free audit is here whenever it's useful:`,
        link,
        `And if this isn't relevant, no reply needed. You won't hear from us again about this property.`,
      ],
    },
  ];
}
