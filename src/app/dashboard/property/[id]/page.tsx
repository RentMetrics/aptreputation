"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useQuery } from "convex/react"
import { ArrowLeft } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Stars } from "@/components/stars"
import { ReviewsTab } from "@/components/property/reviews-tab"
import { InsightsTab } from "@/components/property/insights-tab"
import { RequestsTab } from "@/components/property/requests-tab"
import { TeamTab } from "@/components/property/team-tab"
import { SettingsTab } from "@/components/property/settings-tab"
import { formatDate } from "@/lib/format"

const TABS = [
  { key: "reviews", label: "Reviews" },
  { key: "insights", label: "Insights" },
  { key: "requests", label: "Get reviews" },
  { key: "team", label: "Team" },
  { key: "settings", label: "Settings" },
] as const

type TabKey = (typeof TABS)[number]["key"]

export default function PropertyPage() {
  const { id } = useParams<{ id: string }>()
  const communityId = id as Id<"communities">
  const community = useQuery(api.communities.get, { communityId })
  const [tab, setTab] = useState<TabKey>("reviews")

  if (community === undefined) return <p className="text-slate-500">Loading…</p>

  const delta =
    community.googleRating !== undefined && community.baselineRating !== undefined
      ? Math.round((community.googleRating - community.baselineRating) * 10) / 10
      : null
  const added =
    community.totalReviews !== undefined && community.baselineReviews !== undefined
      ? community.totalReviews - community.baselineReviews
      : null

  return (
    <div>
      <Link href="/dashboard" className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" />All properties
      </Link>

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6 flex flex-wrap items-center gap-6">
        <div className="flex-1 min-w-64">
          <h1 className="text-2xl font-bold">{community.name}</h1>
          <p className="text-slate-600">{community.address}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-4xl font-bold tabular-nums">{community.googleRating?.toFixed(1) ?? "–"}</span>
          <div>
            <Stars rating={community.googleRating ?? 0} size={18} />
            <p className="text-sm text-slate-600">{community.totalReviews ?? 0} Google reviews</p>
          </div>
        </div>
        <dl className="text-sm text-slate-700">
          <div className="flex gap-2"><dt className="text-slate-500">Started at</dt><dd className="tabular-nums">{community.baselineRating?.toFixed(1) ?? "–"} on {formatDate(community.createdAt)}</dd></div>
          <div className="flex gap-2"><dt className="text-slate-500">Change</dt><dd className="tabular-nums">{delta === null ? "–" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} stars`}{added !== null ? `, ${added >= 0 ? "+" : ""}${added} reviews` : ""}</dd></div>
        </dl>
      </div>

      <div className="border-b border-slate-200 mb-6 flex gap-1 overflow-x-auto" role="tablist" aria-label="Property sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "reviews" && <ReviewsTab communityId={communityId} linked={!!community.gbpLocation} placeId={community.googlePlaceId} />}
      {tab === "insights" && <InsightsTab communityId={communityId} />}
      {tab === "requests" && <RequestsTab communityId={communityId} />}
      {tab === "team" && <TeamTab communityId={communityId} />}
      {tab === "settings" && <SettingsTab community={community} />}
    </div>
  )
}
