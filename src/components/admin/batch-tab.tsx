"use client"

import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import type { Audit } from "@/components/audit-result"
import { errorMessage } from "@/lib/format"
import { SENDER, scoreEmail } from "@/lib/pitch"

type Row = NonNullable<ReturnType<typeof useQuery<typeof api.batch.list>>>[number]

const PILL = {
  wait: "bg-slate-50 text-slate-700 border-slate-200",
  run: "bg-blue-50 text-blue-900 border-blue-200",
  good: "bg-emerald-50 text-emerald-900 border-emerald-200",
  bad: "bg-red-50 text-red-900 border-red-200",
  warn: "bg-amber-50 text-amber-900 border-amber-200",
} as const

function stateOf(r: Row): { label: string; kind: keyof typeof PILL } {
  if (r.status === "queued") return { label: "Waiting", kind: "wait" }
  if (r.status === "scoring") return { label: "Scoring", kind: "run" }
  if (r.status === "blocked") return { label: "Do not contact", kind: "bad" }
  if (r.status === "notfound") return { label: "Not found on Google", kind: "warn" }
  if (r.status === "failed") return { label: "Failed", kind: "warn" }
  if (r.report?.state === "running") return { label: "Asking the assistants", kind: "run" }
  if (r.report?.state === "failed") return { label: "Report failed", kind: "warn" }
  return { label: "Ready to send", kind: "good" }
}

function EmailRow({ r }: { r: Row }) {
  const [copied, setCopied] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const audit = r.audit as Audit | null
  const ready = r.status === "started" && r.report?.state === "done" && audit
  const email = ready ? scoreEmail(audit, { query: r.query, firstName: r.firstName ?? undefined }) : null
  const s = stateOf(r)

  const copy = async (what: "subject" | "email") => {
    if (!email) return
    try {
      if (what === "subject") await navigator.clipboard.writeText(email.subject)
      else if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([email.html], { type: "text/html" }),
            "text/plain": new Blob([email.text], { type: "text/plain" }),
          }),
        ])
      } else await navigator.clipboard.writeText(email.text)
      setCopied(what)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      setCopied(null)
      setOpen(true)
    }
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <p className="font-medium truncate">{audit?.name ?? r.query}</p>
          <p className="text-sm text-slate-600 truncate">
            {audit ? audit.address : `Searched: ${r.query}`}
            {r.firstName || r.email ? ` · To ${[r.firstName, r.email].filter(Boolean).join(", ")}` : ""}
          </p>
          {r.note && <p className="text-sm text-slate-600">{r.note}</p>}
          {r.report?.error && <p className="text-sm text-red-700">{r.report.error}</p>}
        </div>
        <div className="text-sm tabular-nums text-slate-700 w-44">
          {audit?.score != null && <p>AptRep Score {audit.score}</p>}
          {email && audit?.ai && <p className="font-medium">Named in {(audit.ai as { shown: number; outOf: number }).shown} of {(audit.ai as { shown: number; outOf: number }).outOf}</p>}
        </div>
        <span className={`h-fit whitespace-nowrap text-xs font-semibold border rounded-full px-2 py-0.5 ${PILL[s.kind]}`}>{s.label}</span>
      </div>
      {email && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => copy("subject")}>{copied === "subject" ? "Subject copied" : "Copy subject"}</Button>
          <Button size="sm" onClick={() => copy("email")}>{copied === "email" ? "Email copied" : "Copy email"}</Button>
          <Button size="sm" variant="outline" asChild>
            <a href={`/score?q=${encodeURIComponent(r.query)}`} target="_blank" rel="noreferrer">Open report</a>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide email" : "Preview email"}</Button>
        </div>
      )}
      {email && open && (
        <div className="mt-3 rounded-lg border border-slate-200">
          <p className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm"><span className="text-slate-500">Subject: </span><span className="font-medium">{email.subject}</span></p>
          {/* Built by scoreEmail, which escapes every value it places in the markup. */}
          <div className="p-4" dangerouslySetInnerHTML={{ __html: email.html }} />
        </div>
      )}
    </li>
  )
}

/** Runs the AptRep Score and AI search report for a list of properties, then writes each email. */
export function BatchTab() {
  const rows = useQuery(api.batch.list)
  const add = useMutation(api.batch.add)
  const clear = useMutation(api.batch.clear)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length >= 3).length
  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await add({ text })
      setText("")
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const counts = rows
    ? {
        ready: rows.filter((r) => stateOf(r).label === "Ready to send").length,
        working: rows.filter((r) => ["wait", "run"].includes(stateOf(r).kind)).length,
      }
    : null

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="font-semibold">Batch reports</h2>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Paste properties, one per line. Each is scored, checked against the do-not-contact list, and has its AI search
          report run, one every 20 seconds. Then copy each email into a new message from {SENDER.email}. A report from
          the last 45 days is reused at no cost; each new one costs about two dollars.
        </p>
        <form onSubmit={run} className="mt-4 grid gap-3">
          <label htmlFor="batch-text" className="text-sm font-medium">Properties</label>
          <textarea
            id="batch-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
            placeholder={"Bridgeside Landing Taylorsville UT | Dana | dana@company.com\nThe Pearl at Founders Square Naples FL\n4536 S Bridgeside Way, Taylorsville, UT"}
          />
          <p className="text-xs text-slate-500">
            Property name with city and state, or the street address. Add <code>| First name | email</code> to greet them by name and check the email against do-not-contact. Up to 100 lines.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || lines === 0}>{busy ? "Adding…" : lines ? `Run ${lines} report${lines === 1 ? "" : "s"}` : "Run reports"}</Button>
            {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          </div>
        </form>
      </section>

      {rows && rows.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700">
              <span className="font-semibold">{counts!.ready}</span> ready to send
              {counts!.working > 0 && <> · <span className="font-semibold">{counts!.working}</span> still running</>}
              {" "}· {rows.length} in the list
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void clear({ onlyFinished: true })}>Clear finished</Button>
            </div>
          </div>
          <ul className="mt-2 divide-y divide-slate-200">
            {rows.map((r) => <EmailRow key={r._id} r={r} />)}
          </ul>
          <p className="text-xs text-slate-500 mt-3">Reports stay on each property&apos;s public score page for 45 days, so the link in every email keeps working until then.</p>
        </section>
      )}
    </div>
  )
}
