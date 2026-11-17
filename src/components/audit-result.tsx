"use client"

import { useState } from "react"
import Link from "next/link"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Stars } from "@/components/stars"
import { errorMessage } from "@/lib/format"

export type Audit = {
  placeId: string
  name: string
  address: string
  rating: number | null
  totalReviews: number
  score: number | null
  parts?: { key: string; label: string; points: number; max: number; detail: string }[]
  market?: {
    radiusMiles: number
    rank: number
    of: number
    averageRating: number
    nearby: { placeId: string; name: string; rating: number; totalReviews: number; miles: number }[]
  } | null
  nextStep?: string | null
  sampleSize: number
  recentNegative: number
  summary: string | null
  praised: string[]
  concerns: string[]
}

/**
 * The body of a free check result: rating, AptRep Score and its parts, standing
 * nearby, what to do next, and the follow-up form. Used in the landing page's
 * dialog and on the /score page. The caller renders the property name above it.
 */
export function AuditResultBody({ audit, signUpHref = "/sign-up" }: { audit: Audit; signUpHref?: string }) {
  const saveLead = useMutation(api.audit.saveLead)
  const [email, setEmail] = useState("")
  const [leadState, setLeadState] = useState<"idle" | "saving" | "saved">("idle")
  const [leadError, setLeadError] = useState<string | null>(null)

  const sendLead = async (e: React.FormEvent) => {
    e.preventDefault()
    setLeadError(null)
    setLeadState("saving")
    try {
      await saveLead({
        email,
        propertyName: audit.name,
        address: audit.address,
        placeId: audit.placeId,
        rating: audit.rating ?? undefined,
        totalReviews: audit.totalReviews,
        score: audit.score ?? undefined,
      })
      setLeadState("saved")
    } catch (err) {
      setLeadError(errorMessage(err))
      setLeadState("idle")
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-50 rounded-xl p-4">
          <p className="text-sm text-slate-600">Google rating</p>
          <p className="text-3xl font-bold tabular-nums">{audit.rating?.toFixed(1) ?? "–"}</p>
          <Stars rating={audit.rating ?? 0} />
          <p className="text-sm text-slate-600 mt-1">{audit.totalReviews} reviews</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-4">
          <p className="text-sm text-slate-600">AptRep Score</p>
          <p className="text-3xl font-bold tabular-nums">{audit.score ?? "–"}<span className="text-base font-normal text-slate-500"> / 100</span></p>
          <p className="text-xs text-slate-500 mt-1">Rating, review volume, newest reviews, and standing among nearby communities.</p>
        </div>
      </div>
      {audit.summary && <p className="text-slate-800">{audit.summary}</p>}
      {(audit.praised.length > 0 || audit.concerns.length > 0) && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-semibold mb-1">Residents praise</p>
            {audit.praised.length > 0 ? (
              <ul className="list-disc pl-5 text-slate-700">{audit.praised.map((p) => <li key={p}>{p}</li>)}</ul>
            ) : (
              <p className="text-slate-500">Nothing in the newest reviews.</p>
            )}
          </div>
          <div>
            <p className="font-semibold mb-1">Residents raise</p>
            {audit.concerns.length > 0 ? (
              <ul className="list-disc pl-5 text-slate-700">{audit.concerns.map((c) => <li key={c}>{c}</li>)}</ul>
            ) : (
              <p className="text-slate-500">Nothing in the newest reviews.</p>
            )}
          </div>
        </div>
      )}
      {audit.parts && audit.parts.length > 0 && (
        <div>
          <p className="font-semibold text-sm mb-2">How the score is made up</p>
          <ul className="grid gap-2.5">
            {audit.parts.map((p) => (
              <li key={p.key} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{p.label}</span>
                  <span className="tabular-nums text-slate-600">{p.points} of {p.max}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-200" aria-hidden="true">
                  <div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.max(2, Math.min(100, (p.points / p.max) * 100))}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{p.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {audit.market && audit.rating !== null && (
        <div>
          <p className="font-semibold text-sm mb-1">Where you stand nearby</p>
          <p className="text-sm text-slate-700">
            Ranked {audit.market.rank} of {audit.market.of} apartment communities within {audit.market.radiusMiles} miles by Google rating. The others average {audit.market.averageRating.toFixed(1)} stars.
          </p>
          <ol className="mt-2 divide-y divide-line border-y border-line text-sm">
            {[
              ...audit.market.nearby.map((n) => ({ id: n.placeId, name: n.name, rating: n.rating, reviews: n.totalReviews, self: false })),
              { id: "self", name: audit.name, rating: audit.rating, reviews: audit.totalReviews, self: true },
            ]
              .sort((a, b) => b.rating - a.rating || Number(b.self) - Number(a.self))
              .slice(0, 7)
              .map((row) => (
                <li key={row.id} className={`flex items-center justify-between gap-3 py-1.5 ${row.self ? "font-semibold text-ink" : "text-slate-700"}`}>
                  <span className="truncate">{row.name}{row.self ? " (you)" : ""}</span>
                  <span className="tabular-nums shrink-0">{row.rating.toFixed(1)} <span className="text-slate-500 font-normal">· {row.reviews.toLocaleString("en-US")}</span></span>
                </li>
              ))}
          </ol>
        </div>
      )}
      {audit.nextStep && (
        <div className="rounded-xl border border-line bg-slate-50 p-4">
          <p className="font-semibold text-sm mb-1">What would raise it most</p>
          <p className="text-sm text-slate-700">{audit.nextStep}</p>
        </div>
      )}
      <p className="text-sm text-slate-600">
        This check reads the {audit.sampleSize} newest reviews Google shows publicly
        {audit.recentNegative > 0 ? `, ${audit.recentNegative} of them 1 or 2 stars` : ""}.
        A free trial tracks every new review from the day you join, drafts replies, and shows what to fix first.
        Ratings and reviews are from Google.
      </p>
      <Button asChild className="h-11"><Link href={signUpHref}>Start free trial</Link></Button>
      {leadState === "saved" ? (
        <p className="text-sm text-emerald-800" role="status">Thanks. We&apos;ll be in touch about {audit.name}.</p>
      ) : (
        <form onSubmit={sendLead} className="border-t pt-4">
          <label htmlFor="lead-email" className="text-sm font-medium">Not ready? Have us follow up about this property.</label>
          <div className="flex gap-2 mt-2">
            <Input id="lead-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            <Button type="submit" variant="outline" disabled={leadState === "saving"}>Send</Button>
          </div>
          {leadError && <p className="text-sm text-red-700 mt-2" role="alert">{leadError}</p>}
        </form>
      )}
    </>
  )
}
