"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { PositiveBars, RatingLine } from "@/components/charts"
import { formatDate } from "@/lib/format"

function signed(n: number, digits = 0) {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`
}

export function ProgressTab({ communityId }: { communityId: Id<"communities"> }) {
  const p = useQuery(api.communities.progress, { communityId })
  if (!p) return <p className="text-muted">Loading…</p>

  const ratingChange = p.baseline.rating !== null && p.current.rating !== null ? p.current.rating - p.baseline.rating : null
  const reviewsAdded = p.baseline.reviews !== null && p.current.reviews !== null ? p.current.reviews - p.baseline.reviews : null
  const days = Math.max(1, Math.round((Date.now() - p.joined) / 86400000))
  const replyRate = p.since.count ? Math.round((p.since.replied / p.since.count) * 100) : null
  const positiveShare = p.since.count ? Math.round((p.since.positive / p.since.count) * 100) : null
  const beforeShare = p.before.count ? Math.round((p.before.positive / p.before.count) * 100) : null

  return (
    <div className="space-y-6">
      {/* The headline: where the property started and where it is */}
      <section className="bg-ink text-white rounded-2xl p-6 sm:p-8">
        <p className="text-blue-200 text-sm">Since joining on {formatDate(p.joined)} ({days} day{days === 1 ? "" : "s"})</p>
        <div className="mt-4 grid gap-8 sm:grid-cols-3">
          <div>
            <p className="font-display text-5xl sm:text-6xl font-extrabold tabular-nums leading-none">
              {ratingChange === null ? "–" : signed(ratingChange, 1)}
            </p>
            <p className="text-blue-200 mt-2">
              stars on Google, from {p.baseline.rating?.toFixed(1) ?? "–"} to {p.current.rating?.toFixed(1) ?? "–"}
            </p>
          </div>
          <div>
            <p className="font-display text-5xl sm:text-6xl font-extrabold tabular-nums leading-none">
              {reviewsAdded === null ? "–" : signed(reviewsAdded)}
            </p>
            <p className="text-blue-200 mt-2">
              Google reviews, from {p.baseline.reviews ?? "–"} to {p.current.reviews ?? "–"}
            </p>
          </div>
          <div>
            <p className="font-display text-5xl sm:text-6xl font-extrabold tabular-nums leading-none">{p.since.positive}</p>
            <p className="text-blue-200 mt-2">new 4 and 5 star reviews{positiveShare !== null ? `, ${positiveShare}% of new reviews` : ""}</p>
          </div>
        </div>
      </section>

      {!p.fullHistory && (
        <p className="bg-amber-50 border border-amber-200 text-amber-950 rounded-xl px-4 py-3 text-sm">
          The rating and review totals above come straight from Google and are exact. Star-by-star counts cover only the
          reviews we could load, because Google shows just the 5 newest publicly. We check hourly, so new reviews are
          captured from here on. Link the Business Profile in Settings to bring in the full history.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="bg-white border border-line rounded-2xl p-5">
          <h2 className="text-lg font-semibold">Google rating</h2>
          <p className="text-sm text-muted mb-3">
            {p.snapshots.length > 1 ? "Recorded each time the rating or review count changes." : "The line starts today. We record the rating as it changes."}
          </p>
          <RatingLine points={p.snapshots} baseline={p.baseline.rating} />
        </section>
        <section className="bg-white border border-line rounded-2xl p-5">
          <h2 className="text-lg font-semibold">4 and 5 star reviews per month</h2>
          <p className="text-sm text-muted mb-3">Counted by the month each review was posted.</p>
          <PositiveBars months={p.months} />
        </section>
      </div>

      <section className="bg-white border border-line rounded-2xl p-5">
        <h2 className="text-lg font-semibold mb-3">Before and since joining</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted border-b">
              <th className="py-2 font-medium">Loaded reviews</th>
              <th className="py-2 font-medium text-right">Before</th>
              <th className="py-2 font-medium text-right">Since</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            <tr className="border-b"><td className="py-2">Reviews</td><td className="py-2 text-right">{p.before.count}</td><td className="py-2 text-right font-semibold">{p.since.count}</td></tr>
            <tr className="border-b"><td className="py-2">Average stars</td><td className="py-2 text-right">{p.before.average?.toFixed(2) ?? "–"}</td><td className="py-2 text-right font-semibold">{p.since.average?.toFixed(2) ?? "–"}</td></tr>
            <tr className="border-b"><td className="py-2">Share that are 4 or 5 stars</td><td className="py-2 text-right">{beforeShare !== null ? `${beforeShare}%` : "–"}</td><td className="py-2 text-right font-semibold">{positiveShare !== null ? `${positiveShare}%` : "–"}</td></tr>
            <tr className="border-b"><td className="py-2">1 and 2 star reviews</td><td className="py-2 text-right">{p.before.negative}</td><td className="py-2 text-right font-semibold">{p.since.negative}</td></tr>
            <tr className="border-b"><td className="py-2">Replied to</td><td className="py-2 text-right">{p.before.count ? `${Math.round((p.before.replied / p.before.count) * 100)}%` : "–"}</td><td className="py-2 text-right font-semibold">{replyRate !== null ? `${replyRate}%` : "–"}</td></tr>
            <tr><td className="py-2">Card taps and QR scans</td><td className="py-2 text-right">–</td><td className="py-2 text-right font-semibold">{p.tapsSinceJoining}</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}
