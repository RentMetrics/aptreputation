"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import { AlertTriangle, ArrowRight, Building2, MessageSquare, Nfc, TrendingDown, TrendingUp } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { AddPropertyDialog } from "@/components/add-property-dialog"
import { Stars } from "@/components/stars"

export default function PortfolioPage() {
  const properties = useQuery(api.communities.list)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold">Your properties</h1>
          <p className="text-slate-600">Ratings, reviews waiting on a reply, and review-card activity.</p>
        </div>
        <AddPropertyDialog />
      </div>

      {properties === undefined && <p className="text-slate-500">Loading…</p>}

      {properties?.length === 0 && (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center">
          <Building2 className="h-10 w-10 mx-auto text-slate-400 mb-4" />
          <h2 className="text-lg font-semibold mb-1">Add your first property</h2>
          <p className="text-slate-600 mb-6 max-w-md mx-auto">
            Search for your community on Google and we&apos;ll load its rating and latest reviews in a few seconds.
          </p>
          <AddPropertyDialog />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {properties?.map((p) => {
          const delta =
            p.googleRating !== undefined && p.baselineRating !== undefined
              ? Math.round((p.googleRating - p.baselineRating) * 10) / 10
              : 0
          return (
            <Link
              key={p._id}
              href={`/dashboard/property/${p._id}`}
              className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-400 hover:shadow-sm transition block"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-lg truncate">{p.name}</h2>
                  <p className="text-sm text-slate-600 truncate">{p.address}</p>
                </div>
                <ArrowRight className="h-5 w-5 text-slate-400 shrink-0 mt-1" />
              </div>
              <div className="flex items-center gap-3 mt-4">
                <span className="text-3xl font-bold tabular-nums">{p.googleRating?.toFixed(1) ?? "–"}</span>
                <div>
                  <Stars rating={p.googleRating ?? 0} />
                  <p className="text-sm text-slate-600">{p.totalReviews ?? 0} Google reviews</p>
                </div>
                {delta !== 0 && (
                  <span className={`ml-auto inline-flex items-center gap-1 text-sm font-medium ${delta > 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {delta > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {delta > 0 ? "+" : ""}{delta} since you joined
                  </span>
                )}
              </div>
              <dl className="grid grid-cols-3 gap-3 mt-5 text-sm">
                <div className="bg-slate-50 rounded-lg p-3">
                  <dt className="text-slate-600 flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" />Need a reply</dt>
                  <dd className="text-xl font-semibold tabular-nums">{p.needsReply}</dd>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <dt className="text-slate-600">New, 30 days</dt>
                  <dd className="text-xl font-semibold tabular-nums">{p.newReviews30d}</dd>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <dt className="text-slate-600 flex items-center gap-1.5"><Nfc className="h-3.5 w-3.5" />Taps, 30 days</dt>
                  <dd className="text-xl font-semibold tabular-nums">{p.taps30d}</dd>
                </div>
              </dl>
              {p.urgent > 0 && (
                <p className="mt-3 text-sm text-red-700 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />{p.urgent} urgent review{p.urgent > 1 ? "s" : ""} without a reply
                </p>
              )}
              {!p.gbpLocation && (
                <p className="mt-3 text-sm text-amber-800">
                  Showing Google&apos;s public sample ({p.loadedReviews} reviews). Link the Business Profile for the full history.
                </p>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
