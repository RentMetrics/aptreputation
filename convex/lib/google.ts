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
};

export async function searchPlaces(query: string): Promise<PlaceHit[]> {
  const res = await fetch(
    `${PLACES}/textsearch/json?query=${encodeURIComponent(query)}&key=${mapsKey()}`,
  );
  const data = await res.json();
  if (data.status === "ZERO_RESULTS") return [];
  if (data.status !== "OK") throw new ConvexError(`Google Places search failed: ${data.status}`);
  return data.results.slice(0, 8).map((p: any) => ({
    placeId: p.place_id,
    name: p.name,
    address: p.formatted_address,
    rating: p.rating,
    totalReviews: p.user_ratings_total,
  }));
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

export type PlaceDetails = PlaceHit & { reviews: IncomingReview[] };

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
