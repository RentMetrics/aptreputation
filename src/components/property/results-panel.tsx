"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { formatDate } from "@/lib/format"

const tone = (n: number) => (n > 0 ? "text-gain" : n < 0 ? "text-loss" : "text-slate-600")
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`

/**
 * What the subscription is doing for this property: how it is seen now against
 * where it started, and the work behind it, in the last 30 days and since joining.
 */
export function ResultsPanel({ communityId }: { communityId: Id<"communities"> }) {
  const r = useQuery(api.results.get, { communityId })
  if (!r) return null
  const o = r.outcomes
  const score = o.score.start !== null && o.score.now !== null ? o.score.now - o.score.start : null
  const ai = o.ai ? o.ai.now.shown - o.ai.then.shown : null

  const rows: { label: string; last30: string | number; since: string | number; note?: string }[] = [
    { label: "New Google reviews", last30: r.last30.newReviews, since: r.sinceJoining.newReviews },
    { label: "New 4 and 5 star reviews", last30: r.last30.positive, since: r.sinceJoining.positive },
    { label: "Replies posted through AptReputation", last30: r.last30.repliesPosted, since: r.sinceJoining.repliesPosted },
    {
      label: "Typical time to reply",
      last30: r.last30.replyHours === null ? "–" : `${r.last30.replyHours} h`,
      since: r.sinceJoining.replyHours === null ? "–" : `${r.sinceJoining.replyHours} h`,
    },
    { label: "Reply drafts written by AI", last30: r.last30.draftsWritten, since: r.sinceJoining.draftsWritten },
    { label: "Review card taps and scans", last30: r.last30.cardTaps, since: r.sinceJoining.cardTaps },
    { label: "Reviews posted after a card tap", last30: r.last30.reviewsAfterTap, since: r.sinceJoining.reviewsAfterTap },
    { label: "AI search checks run", last30: r.last30.aiChecks, since: r.sinceJoining.aiChecks },
    { label: "Fixes confirmed cleared", last30: r.last30.fixesCleared, since: r.sinceJoining.fixesCleared },
    { label: "Fixes marked done by your team", last30: r.last30.fixesDone, since: r.sinceJoining.fixesDone },
  ]

  return (
    <div className="space-y-6">
      <section className="bg-white border border-line rounded-2xl p-6">
        <h2 className="text-lg font-semibold">How the property is seen, against the day it joined</h2>
        <p className="text-sm text-slate-600">Joined {formatDate(r.joined)}. Starting points are locked on that day and never change.</p>
        <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-sm text-slate-600">AptRep Score</p>
            <p className="font-display text-4xl font-extrabold tabular-nums leading-none mt-1">{o.score.now ?? "–"}</p>
            {score !== null && <p className={`text-sm mt-1 ${tone(score)}`}>{score === 0 ? "No change" : signed(score)} · started at {o.score.start}</p>}
          </div>
          <div>
            <p className="text-sm text-slate-600">Named by AI assistants</p>
            <p className="font-display text-4xl font-extrabold tabular-nums leading-none mt-1">{o.ai ? `${o.ai.now.shown} of ${o.ai.now.outOf}` : "–"}</p>
            {o.ai && ai !== null && <p className={`text-sm mt-1 ${tone(ai)}`}>{ai === 0 ? "No change" : signed(ai)} · started at {o.ai.then.shown} of {o.ai.then.outOf}</p>}
          </div>
          <div>
            <p className="text-sm text-slate-600">Google rating</p>
            <p className="font-display text-4xl font-extrabold tabular-nums leading-none mt-1">{o.rating.now?.toFixed(1) ?? "–"}</p>
            {o.rating.start !== null && o.rating.now !== null && (
              <p className={`text-sm mt-1 ${tone(o.rating.now - o.rating.start)}`}>
                {o.rating.now === o.rating.start ? "No change" : `${o.rating.now > o.rating.start ? "+" : "−"}${Math.abs(o.rating.now - o.rating.start).toFixed(1)}`} · started at {o.rating.start.toFixed(1)}
              </p>
            )}
          </div>
          <div>
            <p className="text-sm text-slate-600">Google reviews</p>
            <p className="font-display text-4xl font-extrabold tabular-nums leading-none mt-1">{o.reviews.now ?? "–"}</p>
            {o.reviews.start !== null && o.reviews.now !== null && (
              <p className={`text-sm mt-1 ${tone(o.reviews.now - o.reviews.start)}`}>{o.reviews.now === o.reviews.start ? "No change" : signed(o.reviews.now - o.reviews.start)} · started at {o.reviews.start}</p>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white border border-line rounded-2xl p-6 overflow-x-auto">
        <h2 className="text-lg font-semibold">What AptReputation has done</h2>
        <p className="text-sm text-slate-600">The work behind the numbers above, from this property&apos;s reviews, cards and fix plan.</p>
        <table className="w-full text-sm mt-4">
          <thead>
            <tr className="text-left text-slate-600 border-b">
              <th className="py-2 pr-3 font-medium" />
              <th className="py-2 pr-3 font-medium text-right whitespace-nowrap">Last 30 days</th>
              <th className="py-2 font-medium text-right whitespace-nowrap">Since joining</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b last:border-0">
                <td className="py-2 pr-3">{row.label}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{row.last30}</td>
                <td className="py-2 text-right tabular-nums font-semibold">{row.since}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {r.sinceJoining.fixesOpen > 0 && <p className="text-sm text-slate-600 mt-3">{r.sinceJoining.fixesOpen} fix{r.sinceJoining.fixesOpen === 1 ? " is" : "es are"} still open on the Fix plan.</p>}
      </section>
    </div>
  )
}
