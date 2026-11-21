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
  // Google now and then answers 500 or 503 ("The service is currently
  // unavailable"). One short retry clears nearly all of them.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${PLACES_NEW}/${path}`, {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": mapsKey(),
        "Content-Type": "application/json",
        ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return data;
    if (res.status >= 500 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
      continue;
    }
    if (res.status >= 500) throw new ConvexError("Google is not answering right now. Please try again in a minute.");
    throw new ConvexError(`Google Places search failed: ${data?.error?.message ?? res.status}`);
  }
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

export type PlaceDetails = Omit<PlaceHit, "isResidential"> & { reviews: IncomingReview[]; location?: { lat: number; lng: number } };

/** Public place details. Google returns at most 5 reviews here. */
export async function placeDetails(placeId: string): Promise<PlaceDetails> {
  const fields = "place_id,name,formatted_address,rating,user_ratings_total,reviews,geometry";
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
    location:
      typeof r.geometry?.location?.lat === "number" && typeof r.geometry?.location?.lng === "number"
        ? { lat: r.geometry.location.lat, lng: r.geometry.location.lng }
        : undefined,
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

/** The website and phone number Google shows for a place. Billed as contact data, so only fetched for the AI search check. */
export async function placeContact(placeId: string): Promise<{ website?: string; phone?: string }> {
  const res = await fetch(
    `${PLACES}/details/json?place_id=${encodeURIComponent(placeId)}&fields=website,formatted_phone_number&key=${mapsKey()}`,
  );
  const data = await res.json();
  if (data.status !== "OK") throw new ConvexError(`Google Places lookup failed: ${data.status}`);
  return { website: data.result?.website, phone: data.result?.formatted_phone_number };
}

export type NearbyCommunity = { placeId: string; name: string; rating: number; totalReviews: number; miles: number };

function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Rated apartment communities around a point, nearest first. One Text Search
 * call. A community needs at least 10 reviews to count, so a brand-new listing
 * with two 5-star reviews does not set the bar for the neighbourhood.
 */
export async function nearbyCommunities(
  center: { lat: number; lng: number },
  excludePlaceId: string,
  radiusMiles = 3,
): Promise<NearbyCommunity[]> {
  const search = (rankPreference: "DISTANCE" | "RELEVANCE") =>
    placesNew(
      "places:searchText",
      {
        textQuery: "apartments",
        regionCode: "US",
        pageSize: 20,
        rankPreference,
        locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: Math.round(radiusMiles * 1609.34) } },
      },
      "places.id,places.displayName,places.types,places.rating,places.userRatingCount,places.location",
    );
  const found = new Map<string, NearbyCommunity>();
  const take = (data: any) => {
    for (const p of data.places ?? []) {
      const name: string = p.displayName?.text ?? "";
      if (p.id === excludePlaceId || !name || !isResidential(p.types, name)) continue;
      if (typeof p.rating !== "number" || (p.userRatingCount ?? 0) < 10) continue;
      if (typeof p.location?.latitude !== "number" || typeof p.location?.longitude !== "number") continue;
      const miles = milesBetween(center, { lat: p.location.latitude, lng: p.location.longitude });
      if (miles > radiusMiles) continue;
      found.set(p.id, { placeId: p.id, name, rating: p.rating, totalReviews: p.userRatingCount, miles: Math.round(miles * 10) / 10 });
    }
  };
  take(await search("DISTANCE"));
  // In towns full of small listings the nearest twenty can hold few real
  // communities; a relevance-ranked search of the same area finds the rest.
  if (found.size < 3) take(await search("RELEVANCE"));
  return [...found.values()].sort((a, b) => a.miles - b.miles);
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

// ---- marketing list: find a known community on Google ----------------------

export type ProspectLookup = {
  name: string;
  address?: string;
  city: string;
  state: string;
  lat?: number;
  lng?: number;
};

export type ProspectMatch = {
  placeId: string;
  name: string;
  rating?: number;
  totalReviews?: number;
  website?: string;
};

const NAME_NOISE = new Set([
  "the", "at", "of", "on", "in", "and", "apartments", "apartment", "apts", "apt", "homes", "apartment homes",
  "residences", "living", "community", "phase", "i", "ii", "iii",
]);

function nameTokens(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !NAME_NOISE.has(t));
}

function sharesName(a: string, b: string) {
  const tb = new Set(nameTokens(b));
  return nameTokens(a).some((t) => tb.has(t));
}

function metersApart(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Finds one community on Google and returns its rating, or null when nothing
 * convincing comes back. Two requests: an ID-only text search (not billed),
 * then one Place Details request for the rating. A result only counts when it
 * is at the same spot, or nearby with a matching name, so a neighbour's rating
 * is never attached to the wrong property.
 */
export async function matchProspect(p: ProspectLookup): Promise<ProspectMatch | null> {
  const hasPoint = typeof p.lat === "number" && typeof p.lng === "number";
  const search = await placesNew(
    "places:searchText",
    {
      textQuery: [`${p.name} apartments`, p.address, p.city, p.state].filter(Boolean).join(", "),
      regionCode: "US",
      pageSize: 1,
      ...(hasPoint
        ? { locationBias: { circle: { center: { latitude: p.lat, longitude: p.lng }, radius: 2000 } } }
        : {}),
    },
    "places.id",
  );
  const id: string | undefined = search.places?.[0]?.id;
  if (!id) return null;

  const res = await fetch(`${PLACES_NEW}/places/${encodeURIComponent(id)}`, {
    headers: {
      "X-Goog-Api-Key": mapsKey(),
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location,rating,userRatingCount,websiteUri",
    },
  });
  const place = await res.json();
  if (!res.ok) throw new ConvexError(`Google Places lookup failed: ${place?.error?.message ?? res.status}`);

  const foundName: string = place.displayName?.text ?? "";
  const sameName = sharesName(p.name, foundName);
  let ok: boolean;
  if (hasPoint && place.location) {
    const d = metersApart(p.lat!, p.lng!, place.location.latitude, place.location.longitude);
    ok = d <= 250 || (d <= 2500 && sameName);
  } else {
    ok = sameName && (place.formattedAddress ?? "").toLowerCase().includes(p.city.toLowerCase());
  }
  if (!ok) return null;
  return {
    placeId: place.id,
    name: foundName,
    rating: place.rating,
    totalReviews: place.userRatingCount,
    website: place.websiteUri,
  };
}
