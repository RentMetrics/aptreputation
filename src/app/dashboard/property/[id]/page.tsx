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
import { ProgressTab } from "@/components/property/progress-tab"
import { RequestsTab } from "@/components/property/requests-tab"
import { TeamTab } from "@/components/property/team-tab"
import { SettingsTab } from "@/components/property/settings-tab"
import { CanActProvider } from "@/components/property/access"
import { formatDate } from "@/lib/format"

const TABS = [
  { key: "reviews", label: "Reviews" },
  { key: "progress", label: "Progress" },
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

  const canAct = community.role !== "viewer"
  const canManage = community.role === "owner" || community.role === "manager"

  return (
    <CanActProvider value={canAct}>
    <div>
      {!canAct && (
        <p className="mb-4 rounded-lg border border-line bg-white px-4 py-2.5 text-sm text-muted" role="note">
          You have view-only access to this property. You can read everything and get alerts; replying and changes are
          for the owner, managers and team members.
        </p>
      )}
      <Link href="/dashboard" className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" />All properties
      </Link>

      <div className="bg-white border border-line rounded-2xl p-6 mb-6 flex flex-wrap items-center gap-x-10 gap-y-5">
        <div className="flex-1 min-w-64">
          <h1 className="font-display text-3xl font-bold">{community.name}</h1>
          <p className="text-muted mt-0.5">{community.address}</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-display text-6xl font-extrabold tabular-nums leading-none">{community.googleRating?.toFixed(1) ?? "–"}</span>
          <div>
            <Stars rating={community.googleRating ?? 0} size={20} />
            <p className="text-sm text-muted mt-0.5">{community.totalReviews ?? 0} Google reviews</p>
          </div>
        </div>
        <div className="text-sm border-l border-line pl-6">
          <p className="text-muted">Since joining {formatDate(community.createdAt)}</p>
          <p className={`font-semibold tabular-nums ${delta !== null && delta > 0 ? "text-gain" : delta !== null && delta < 0 ? "text-loss" : "text-ink"}`}>
            {delta === null ? "–" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} stars`}
            {added !== null ? `, ${added >= 0 ? "+" : ""}${added} reviews` : ""}
          </p>
          <p className="text-muted">Started at {community.baselineRating?.toFixed(1) ?? "–"}</p>
        </div>
      </div>

      <div className="border-b border-slate-200 mb-6 flex gap-1 overflow-x-auto" role="tablist" aria-label="Property sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
              tab === t.key ? "border-brand text-brand font-semibold" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "reviews" && <ReviewsTab communityId={communityId} linked={!!community.gbpLocation} placeId={community.googlePlaceId} />}
      {tab === "progress" && <ProgressTab communityId={communityId} />}
      {tab === "insights" && <InsightsTab communityId={communityId} />}
      {tab === "requests" && <RequestsTab communityId={communityId} />}
      {tab === "team" && <TeamTab communityId={communityId} />}
      {tab === "settings" && <SettingsTab community={community} canManage={canManage} />}
    </div>
    </CanActProvider>
  )
}
