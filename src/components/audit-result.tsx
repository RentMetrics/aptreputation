"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Stars } from "@/components/stars"
import { errorMessage } from "@/lib/format"
import { labelOf, listOf, type AiSummary } from "@/convex/lib/visibility"
import { promoLine } from "@/convex/lib/promo"

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
  ai?: AiSummary | null
}

/** How AI assistants answer renters about this property: what they said, with the fixes left for subscribers. */
function AiSearch({ ai, name }: { ai: AiSummary; name: string }) {
  const offer = promoLine(Date.now())
  return (
    <div className="rounded-xl border border-line p-4 sm:p-5 grid gap-4 break-inside-avoid">
      <div>
        <p className="font-semibold">How AI assistants answer renters</p>
        <p className="text-sm text-slate-600">
          We asked {listOf(ai.assistants.map((a) => a.label))} the questions renters ask about apartments nearby, each with web search, and recorded whether they named {name}.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-3xl font-bold tabular-nums">{ai.shown} of {ai.outOf}</p>
          <p className="text-sm text-slate-600">answers named this property</p>
        </div>
        {ai.assistants.map((a) => (
          <div key={a.key}>
            <p className="text-xl font-semibold tabular-nums">{a.shown} of {a.outOf}</p>
            <p className="text-sm text-slate-600">{a.label}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-600 border-b border-line">
              <th className="py-1.5 pr-3 font-medium">A renter asks</th>
              {ai.assistants.map((a) => <th key={a.key} className="py-1.5 pr-3 font-medium whitespace-nowrap">{a.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {ai.questions.map((q) => (
              <tr key={q.question} className="border-b border-line last:border-0 align-top">
                <td className="py-1.5 pr-3">{q.question}</td>
                {ai.assistants.map((a) => {
                  const ans = q.answers.find((x) => x.assistant === a.key)
                  return (
                    <td key={a.key} className={`py-1.5 pr-3 whitespace-nowrap ${ans?.mentioned ? "text-emerald-800 font-medium" : "text-slate-500"}`}>
                      {!ans ? "No answer" : ans.mentioned ? (ans.position ? `Named, no. ${ans.position}` : "Named") : "Not named"}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ai.byName.length > 0 && (
        <div>
          <p className="font-semibold text-sm mb-1">Asked about {name} by name</p>
          <ul className="text-sm text-slate-700 grid gap-1">
            {ai.byName.map((b) => (
              <li key={b.assistant}>
                <span className="font-medium">{labelOf(b.assistant)}:</span>{" "}
                {b.tone === "none" ? "did not describe it" : `a ${b.tone} description`}
                {b.statedRating ? `, quoting ${b.statedRating}` : ""}
                {b.statedPhone ? `, phone ${b.statedPhone}` : ""}.
              </li>
            ))}
          </ul>
        </div>
      )}
      {ai.competitors.length > 0 && (
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Named most often instead:</span> {ai.competitors.map((c) => c.name).join(", ")}.
        </p>
      )}
      {ai.findings.length > 0 && (
        <div>
          <p className="font-semibold text-sm mb-1">What is holding it back</p>
          <ul className="list-disc pl-5 text-sm text-slate-700 grid gap-1">
            {ai.findings.map((f) => <li key={f.title}><span className="font-medium">{f.title}.</span> {f.why}</li>)}
          </ul>
        </div>
      )}
      <p className="text-sm text-slate-700 rounded-lg bg-slate-50 p-3">
        <span className="font-semibold">The fix plan comes with the monthly service.</span> Subscribers get each of these as a step-by-step task, requests written for them to send to listing sites and web vendors, and a fresh check every month to confirm what changed.{offer ? ` ${offer}` : ""}
      </p>
      <p className="text-xs text-slate-500">
        Each question was asked once per assistant on {new Date(ai.at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. Assistants word answers differently each time, so this is a sample, not a ranking.
      </p>
    </div>
  )
}

/** Lets a visitor ask for the AI search report by email, and shows it on the page when it lands. */
function AiReportRequest({ audit, onReady }: { audit: Audit; onReady?: () => void }) {
  const request = useMutation(api.visibility.requestReport)
  const [email, setEmail] = useState("")
  const [state, setState] = useState<"idle" | "saving" | "started" | "running" | "ready">("idle")
  const [error, setError] = useState<string | null>(null)
  const status = useQuery(api.visibility.publicReportStatus, state === "started" || state === "running" ? { placeId: audit.placeId } : "skip")
  const fired = useRef(false)
  useEffect(() => {
    if (status?.doneAt && !fired.current) {
      fired.current = true
      setState("ready")
      onReady?.()
    }
  }, [status?.doneAt, onReady])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setState("saving")
    try {
      const out = await request({ placeId: audit.placeId, email })
      setState(out.state)
      if (out.state === "ready") onReady?.()
    } catch (err) {
      setError(errorMessage(err))
      setState("idle")
    }
  }

  return (
    <div className="rounded-xl border-2 border-brand/30 bg-blue-50/50 p-4 sm:p-5 print:hidden">
      <p className="font-semibold">What do ChatGPT, Gemini and Claude tell renters about {audit.name}?</p>
      <p className="text-sm text-slate-700 mt-1">
        We&apos;ll ask each of them the questions renters ask about apartments nearby, and about {audit.name} by name, then email you what they said: how often it&apos;s named, who is named instead, and what they get wrong. Free, about two minutes.
      </p>
      {state === "idle" || state === "saving" ? (
        <form onSubmit={submit} className="mt-3 flex flex-col sm:flex-row gap-2">
          <label htmlFor="ai-report-email" className="sr-only">Your email</label>
          <Input id="ai-report-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="bg-white sm:flex-1" />
          <Button type="submit" disabled={state === "saving"}>{state === "saving" ? "Starting…" : "Email me the AI search report"}</Button>
        </form>
      ) : state === "ready" ? (
        <p className="text-sm text-emerald-800 mt-3" role="status">Your report is ready{onReady ? " and showing on this page" : ""}. We&apos;ve also emailed it to {email}.</p>
      ) : (
        <p className="text-sm text-slate-800 mt-3" role="status">
          Asking the assistants now. It takes about two minutes; we&apos;ll email it to {email}{onReady ? " and show it here when it lands" : ""}.
        </p>
      )}
      {error && <p className="text-sm text-red-700 mt-2" role="alert">{error}</p>}
    </div>
  )
}

/**
 * The body of a free check result: rating, AptRep Score and its parts, standing
 * nearby, what to do next, and the follow-up form. Used in the landing page's
 * dialog and on the /score page. The caller renders the property name above it.
 */
export function AuditResultBody({ audit, signUpHref = "/sign-up", onAiReady }: { audit: Audit; signUpHref?: string; onAiReady?: () => void }) {
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
      {audit.ai ? <AiSearch ai={audit.ai} name={audit.name} /> : audit.rating !== null && <AiReportRequest audit={audit} onReady={onAiReady} />}
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
      <Button asChild className="h-11 print:hidden"><Link href={signUpHref}>Start free trial</Link></Button>
      {leadState === "saved" ? (
        <p className="text-sm text-emerald-800" role="status">Thanks. We&apos;ll be in touch about {audit.name}.</p>
      ) : (
        <form onSubmit={sendLead} className="border-t pt-4 print:hidden">
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
