import { ConvexError } from "convex/values";

const PLACES = "https://maps.googleapis.com/maps/api/place";

function mapsKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new ConvexError("Google Maps is not configured (GOOGLE_MAPS_API_KEY).");
  return key;
}

export type PlaceHit = {
  placeId: string;
  name: string;
  address: string;
  rating?: number;
  totalReviews?: number;
  /** True when Google classifies the place as apartments, condos or housing. */
  isResidential: boolean;
};

const PLACES_NEW = "https://places.googleapis.com/v1";
const RESIDENTIAL_TYPES = ["apartment_complex", "apartment_building", "condominium_complex", "housing_complex"];
// Results that are a spot on the map rather than a business with reviews.
const NOT_A_BUSINESS = ["street_address", "premise", "subpremise", "route", "locality", "postal_code", "neighborhood", "political"];

// Many communities are filed on Google as a generic business; the name gives them away.
const RESIDENTIAL_NAME = /\b(apartments?|apts?|lofts?|residences?|flats|townhomes?|villas?|condos?|condominiums?)\b/i;

function isResidential(types: string[] | undefined, name: string) {
  return (types ?? []).some((t) => RESIDENTIAL_TYPES.includes(t)) || RESIDENTIAL_NAME.test(name);
}

async function placesNew(path: string, body: unknown, fieldMask?: string) {
  const res = await fetch(`${PLACES_NEW}/${path}`, {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": mapsKey(),
      "Content-Type": "application/json",
      ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new ConvexError(`Google Places search failed: ${data?.error?.message ?? res.status}`);
  return data;
}

/**
 * Full search with ratings. Apartment communities are listed first. A query
 * that starts with a street number is treated as an address.
 */
export async function searchPlaces(query: string): Promise<PlaceHit[]> {
  const looksLikeAddress = /^\d+\s+\S+/.test(query);
  const data = await placesNew(
    "places:searchText",
    { textQuery: looksLikeAddress ? `apartments at ${query}` : query, regionCode: "US", pageSize: 12 },
    "places.id,places.displayName,places.formattedAddress,places.types,places.rating,places.userRatingCount",
  );
  const hits: PlaceHit[] = (data.places ?? []).map((p: any) => ({
    placeId: p.id,
    name: p.displayName?.text ?? "Unnamed place",
    address: p.formattedAddress ?? "",
    rating: p.rating,
    totalReviews: p.userRatingCount,
    isResidential: isResidential(p.types, p.displayName?.text ?? ""),
  }));
  return hits.sort((a, b) => Number(b.isResidential) - Number(a.isResidential));
}

export type PlaceSuggestion = { placeId: string; name: string; address: string; isResidential: boolean };

/** Type-ahead suggestions: apartment communities first, then other businesses. */
export async function suggestPlaces(input: string, sessionToken?: string): Promise<PlaceSuggestion[]> {
  const base = { input, includedRegionCodes: ["us"], ...(sessionToken ? { sessionToken } : {}) };
  const [residential, anything] = await Promise.all([
    placesNew("places:autocomplete", { ...base, includedPrimaryTypes: RESIDENTIAL_TYPES }),
    placesNew("places:autocomplete", base),
  ]);
  const out: PlaceSuggestion[] = [];
  const seen = new Set<string>();
  const add = (list: any[], fromResidentialSearch: boolean) => {
    for (const s of list ?? []) {
      const p = s.placePrediction;
      if (!p || seen.has(p.placeId)) continue;
      const types: string[] = p.types ?? [];
      if (!fromResidentialSearch && types.some((t) => NOT_A_BUSINESS.includes(t)) && !types.includes("establishment")) continue;
      seen.add(p.placeId);
      const name: string = p.structuredFormat?.mainText?.text ?? p.text?.text ?? "";
      out.push({
        placeId: p.placeId,
        name,
        address: p.structuredFormat?.secondaryText?.text ?? "",
        isResidential: fromResidentialSearch || isResidential(types, name),
      });
    }
  };
  add(residential.suggestions, true);
  add(anything.suggestions, false);
  return out.sort((a, b) => Number(b.isResidential) - Number(a.isResidential)).slice(0, 8);
}

export type IncomingReview = {
  externalId: string;
  reviewerName: string;
  rating: number;
  text: string;
  reviewDate: number;
  replyText?: string;
  replyAt?: number;
};

export type PlaceDetails = Omit<PlaceHit, "isResidential"> & { reviews: IncomingReview[] };

/** Public place details. Google returns at most 5 reviews here. */
export async function placeDetails(placeId: string): Promise<PlaceDetails> {
  const fields = "place_id,name,formatted_address,rating,user_ratings_total,reviews";
  const res = await fetch(
    `${PLACES}/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&reviews_sort=newest&key=${mapsKey()}`,
  );
  const data = await res.json();
  if (data.status !== "OK") throw new ConvexError(`Google Places lookup failed: ${data.status}`);
  const r = data.result;
  return {
    placeId: r.place_id,
    name: r.name,
    address: r.formatted_address,
    rating: r.rating,
    totalReviews: r.user_ratings_total,
    reviews: (r.reviews ?? []).map((rv: any) => ({
      // Places has no review ID; author + timestamp is stable for a review.
      externalId: `${rv.author_url ?? rv.author_name}:${rv.time}`,
      reviewerName: rv.author_name ?? "Google user",
      rating: rv.rating,
      text: rv.text ?? "",
      reviewDate: rv.time * 1000,
    })),
  };
}

export function writeReviewUrl(placeId: string) {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

const STARS: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** All reviews for a Business Profile location (owner access required). */
export async function businessReviews(accessToken: string, location: string) {
  const reviews: IncomingReview[] = [];
  let pageToken: string | undefined;
  let rating: number | undefined;
  let total: number | undefined;
  for (let page = 0; page < 100; page++) {
    const url = new URL(`https://mybusiness.googleapis.com/v4/${location}/reviews`);
    url.searchParams.set("pageSize", "50");
    url.searchParams.set("orderBy", "updateTime desc");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new ConvexError(await googleError(res));
    const data = await res.json();
    rating = data.averageRating ?? rating;
    total = data.totalReviewCount ?? total;
    for (const rv of data.reviews ?? []) {
      reviews.push({
        externalId: rv.reviewId,
        reviewerName: rv.reviewer?.displayName ?? "Google user",
        rating: STARS[rv.starRating] ?? 0,
        text: rv.comment ?? "",
        reviewDate: new Date(rv.createTime).getTime(),
        replyText: rv.reviewReply?.comment,
        replyAt: rv.reviewReply?.updateTime ? new Date(rv.reviewReply.updateTime).getTime() : undefined,
      });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return { reviews, rating, total };
}

export async function googleError(res: Response): Promise<string> {
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.error?.message ?? body?.error_description ?? "";
  } catch {
    // no JSON body
  }
  if (res.status === 403 || res.status === 429) {
    return `Google refused the request (${res.status}). The Google Cloud project may not yet be approved for the Business Profile API, or its quota is 0. ${detail}`.trim();
  }
  if (res.status === 401) return "Google sign-in expired. Reconnect Google in Settings.";
  return `Google error ${res.status}. ${detail}`.trim();
}
