"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import { AlertTriangle, Building2, ChevronRight } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { AddPropertyDialog } from "@/components/add-property-dialog"
import { Stars } from "@/components/stars"
import { formatDate } from "@/lib/format"

export default function PortfolioPage() {
  const properties = useQuery(api.communities.list)

  const rated = properties?.filter((p) => p.googleRating !== undefined) ?? []
  const average = rated.length ? rated.reduce((n, p) => n + (p.googleRating ?? 0), 0) / rated.length : null
  const needsReply = properties?.reduce((n, p) => n + p.needsReply, 0) ?? 0
  const positive = properties?.reduce((n, p) => n + p.positiveSinceJoining, 0) ?? 0
  const taps = properties?.reduce((n, p) => n + p.taps30d, 0) ?? 0

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-4xl font-bold">Your properties</h1>
          <p className="text-muted mt-1">Where each rating stands against the day it joined.</p>
        </div>
        <AddPropertyDialog />
      </div>

      {properties === undefined && <p className="text-muted">Loading…</p>}

      {properties?.length === 0 && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center">
          <Building2 className="h-10 w-10 mx-auto text-slate-400 mb-4" />
          <h2 className="text-xl font-semibold mb-1">Add your first property</h2>
          <p className="text-muted mb-6 max-w-md mx-auto">
            Find your community on Google. We record today&apos;s rating as your starting point and load its latest reviews.
          </p>
          <AddPropertyDialog />
        </div>
      )}

      {properties && properties.length > 0 && (
        <>
          {/* Portfolio totals: one line of figures, not a row of cards */}
          <dl className="bg-ink text-white rounded-2xl px-6 py-5 mb-6 grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-5">
            {[
              { value: average !== null ? average.toFixed(2) : "–", label: `average rating, ${properties.length} propert${properties.length === 1 ? "y" : "ies"}` },
              { value: positive, label: "new 4 and 5 star reviews since joining" },
              { value: needsReply, label: "reviews waiting on a reply" },
              { value: taps, label: "card taps and scans, last 30 days" },
            ].map((s) => (
              <div key={s.label}>
                <dd className="font-display text-4xl font-extrabold tabular-nums leading-none">{s.value}</dd>
                <dt className="text-sm text-blue-200 mt-1.5">{s.label}</dt>
              </div>
            ))}
          </dl>

          <ul className="bg-white border border-line rounded-2xl divide-y divide-line overflow-hidden">
            {properties.map((p) => {
              const delta =
                p.googleRating !== undefined && p.baselineRating !== undefined
                  ? Math.round((p.googleRating - p.baselineRating) * 10) / 10
                  : null
              const added = p.totalReviews !== undefined && p.baselineReviews !== undefined ? p.totalReviews - p.baselineReviews : null
              return (
                <li key={p._id}>
                  <Link href={`/dashboard/property/${p._id}`} className="flex flex-wrap items-center gap-x-8 gap-y-4 p-5 hover:bg-slate-50 transition-colors">
                    <div className="flex-1 min-w-56">
                      <h2 className="font-display text-xl font-semibold">{p.name}</h2>
                      <p className="text-sm text-muted truncate">{p.address}</p>
                      {p.urgent > 0 && (
                        <p className="mt-1.5 text-sm text-loss font-medium flex items-center gap-1.5">
                          <AlertTriangle className="h-4 w-4" />{p.urgent} urgent review{p.urgent > 1 ? "s" : ""} without a reply
                        </p>
                      )}
                      {!p.gbpLocation && <p className="mt-1.5 text-sm text-amber-800">Google profile not linked yet</p>}
                    </div>

                    <div className="flex items-center gap-3 w-44">
                      <span className="font-display text-4xl font-extrabold tabular-nums leading-none">{p.googleRating?.toFixed(1) ?? "–"}</span>
                      <div>
                        <Stars rating={p.googleRating ?? 0} size={15} />
                        <p className="text-sm text-muted">{p.totalReviews ?? 0} reviews</p>
                      </div>
                    </div>

                    <div className="w-44 text-sm">
                      <p className={`font-semibold tabular-nums ${delta !== null && delta > 0 ? "text-gain" : delta !== null && delta < 0 ? "text-loss" : "text-ink"}`}>
                        {delta === null ? "–" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} stars`}
                        {added !== null ? `, ${added >= 0 ? "+" : ""}${added} reviews` : ""}
                      </p>
                      <p className="text-muted">since {formatDate(p.createdAt)}</p>
                    </div>

                    <dl className="flex gap-6 text-sm">
                      <div className="w-24">
                        <dd className={`text-xl font-semibold tabular-nums ${p.needsReply > 0 ? "text-ink" : "text-slate-400"}`}>{p.needsReply}</dd>
                        <dt className="text-muted">need a reply</dt>
                      </div>
                      <div className="w-24">
                        <dd className={`text-xl font-semibold tabular-nums ${p.taps30d > 0 ? "text-ink" : "text-slate-400"}`}>{p.taps30d}</dd>
                        <dt className="text-muted">taps, 30 days</dt>
                      </div>
                    </dl>
                    <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
