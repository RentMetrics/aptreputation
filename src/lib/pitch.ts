/** Public address used on anything that leaves the app: card links, outreach. */
export const PUBLIC_SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.aptreputation.com").replace(/\/$/, "")

export type PitchInput = {
  name: string
  city: string
  state: string
  googleRating?: number
  googleReviews?: number
}

/** A landing-page link that opens this property's free audit. */
export function auditLink(p: PitchInput) {
  return `${PUBLIC_SITE}/?audit=${encodeURIComponent(`${p.name} ${p.city} ${p.state}`)}`
}

/**
 * Outreach copy built only from the property's public Google rating. Every
 * figure in it is one the recipient can check on Google.
 */
export function pitch(p: PitchInput) {
  const rating = p.googleRating
  const reviews = p.googleReviews ?? 0
  const count = `${reviews.toLocaleString("en-US")} review${reviews === 1 ? "" : "s"}`
  const close = `See what residents are saying about ${p.name}, free: ${auditLink(p)}`
  if (typeof rating !== "number") {
    return {
      subject: `${p.name} has no Google rating yet`,
      body: `${p.name} doesn't have a Google rating yet, so prospects searching for apartments in ${p.city} see nothing next to your name. AptReputation gives your team tap cards and links that make it easy for happy residents to leave a first review. ${close}`,
    }
  }
  const stars = rating.toFixed(1)
  let middle: string
  if (rating < 3.5) {
    middle = `Prospective residents see that number before they see a floor plan. AptReputation helps your on-site team answer every review, fix what residents complain about most, and ask satisfied residents for a review at the right moment.`
  } else if (rating < 4.3) {
    middle = `That is a few tenths away from standing out against the communities around you. AptReputation helps your on-site team reply to every review, see which complaints repeat, and collect more reviews from the residents who are happy.`
  } else if (reviews < 50) {
    middle = `That is a strong score, but with ${count} a couple of bad weeks can move it. AptReputation helps your team keep new reviews coming so the rating holds.`
  } else {
    middle = `That is a rating worth protecting. AptReputation alerts your team to every new review, drafts replies, and credits the staff residents name so the service behind that score keeps going.`
  }
  return {
    subject: `${p.name} is rated ${stars} on Google`,
    body: `${p.name} has a ${stars}-star Google rating from ${count}. ${middle} ${close}`,
  }
}
