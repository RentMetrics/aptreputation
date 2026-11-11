"use client"

import { useState } from "react"
import { useAction, useQuery } from "convex/react"
import { RefreshCw } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { errorMessage, formatDate } from "@/lib/format"

const PRIORITY = {
  now: { label: "Do now", cls: "bg-red-50 text-red-900 border-red-200" },
  next: { label: "Next 90 days", cls: "bg-amber-50 text-amber-900 border-amber-200" },
  ongoing: { label: "Keep doing", cls: "bg-emerald-50 text-emerald-900 border-emerald-200" },
} as const

export function InsightsTab({ communityId }: { communityId: Id<"communities"> }) {
  const data = useQuery(api.reviews.insightsLatest, { communityId })
  const generate = useAction(api.ai.generateInsights)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!data) return <p className="text-slate-500">Loading…</p>
  const { insight, themes } = data

  const run = async () => {
    setError(null)
    setBusy(true)
    try {
      await generate({ communityId })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">What residents are saying</h2>
            <p className="text-sm text-slate-600">
              {insight
                ? `Based on the ${insight.reviewCount} most recent written reviews · ${formatDate(insight.generatedAt)}`
                : `${data.analyzed} of ${data.loaded} loaded reviews analyzed`}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={run} disabled={busy}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Reading reviews…" : insight ? "Refresh" : "Generate insights"}
          </Button>
        </div>
        {error && <p className="text-sm text-red-700 mt-3" role="alert">{error}</p>}
        {insight ? (
          <p className="mt-4 text-slate-800 leading-relaxed">{insight.summary}</p>
        ) : (
          <p className="mt-4 text-slate-600">
            No summary yet. Insights are written from your reviews once at least 3 written reviews are loaded.
          </p>
        )}
      </section>

      {insight && (
        <>
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-3">Action plan</h2>
            <ul className="space-y-3">
              {insight.actions.map((a, i) => (
                <li key={i} className="flex gap-3">
                  <span className={`shrink-0 h-fit text-xs font-semibold border rounded-full px-2 py-0.5 ${PRIORITY[a.priority].cls}`}>
                    {PRIORITY[a.priority].label}
                  </span>
                  <div>
                    <p className="font-medium">{a.action}</p>
                    <p className="text-sm text-slate-600">{a.why}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <section className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-lg font-semibold mb-3">Complaints</h2>
              {insight.problems.length === 0 && <p className="text-slate-600 text-sm">No recurring complaints found.</p>}
              <ul className="space-y-4">
                {insight.problems.map((p, i) => (
                  <li key={i}>
                    <p className="font-medium">{p.theme} <span className="text-sm font-normal text-slate-500">· {p.reviewCount} review{p.reviewCount === 1 ? "" : "s"}</span></p>
                    <p className="text-sm text-slate-700">{p.detail}</p>
                    <p className="text-sm text-slate-900 mt-1"><span className="font-medium">Try:</span> {p.recommendation}</p>
                  </li>
                ))}
              </ul>
            </section>
            <section className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-lg font-semibold mb-3">Praise</h2>
              {insight.strengths.length === 0 && <p className="text-slate-600 text-sm">No recurring praise found yet.</p>}
              <ul className="space-y-4">
                {insight.strengths.map((s, i) => (
                  <li key={i}>
                    <p className="font-medium">{s.theme} <span className="text-sm font-normal text-slate-500">· {s.reviewCount} review{s.reviewCount === 1 ? "" : "s"}</span></p>
                    <p className="text-sm text-slate-700">{s.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}

      {themes.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-1">Topics by review count</h2>
          <p className="text-sm text-slate-600 mb-3">How many loaded reviews touch each topic, and how those reviewers felt overall.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600 border-b">
                <th className="py-2 font-medium">Topic</th>
                <th className="py-2 font-medium text-right">Reviews</th>
                <th className="py-2 font-medium text-right">Positive</th>
                <th className="py-2 font-medium text-right">Negative</th>
              </tr>
            </thead>
            <tbody>
              {themes.map((t) => (
                <tr key={t.theme} className="border-b last:border-0">
                  <td className="py-2">{t.theme}</td>
                  <td className="py-2 text-right tabular-nums">{t.total}</td>
                  <td className="py-2 text-right tabular-nums text-emerald-800">{t.positive}</td>
                  <td className="py-2 text-right tabular-nums text-red-800">{t.negative}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
