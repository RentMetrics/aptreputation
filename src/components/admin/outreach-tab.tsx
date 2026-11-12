"use client"

import { useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Doc, Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { errorMessage, formatDate, timeAgo } from "@/lib/format"
import { SENDER, sequence } from "@/lib/pitch"

type Prospect = Doc<"prospects">

const DEFAULT_METRO = "Dallas-Plano-Irving, TX"
const COST_PER_LOOKUP = 0.02
const STEP_NAMES = ["First email", "Follow-up", "Last note"]
const num = (n: number) => n.toLocaleString("en-US")

function Preview({ p }: { p: Prospect }) {
  const emails = sequence(p)
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-3">
      {emails.map((e, i) => (
        <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="text-xs font-semibold text-slate-500">{STEP_NAMES[i]}{i > 0 ? ` · ${i === 1 ? 4 : 9} days after the first` : ""}</p>
          <p className="font-medium mt-1">{e.subject}</p>
          {e.paragraphs.map((t, j) => (
            <p key={j} className="mt-2 text-slate-700 break-words">{t}</p>
          ))}
        </div>
      ))}
      <p className="md:col-span-3 text-xs text-slate-500">
        Each email comes from {SENDER.name} ({SENDER.email}), where replies also go, and ends with why they received
        it, your postal address and an unsubscribe link. Properties owned or managed by Excelsa, and anything on the
        do-not-contact list, are never sent to.
      </p>
    </div>
  )
}

export function OutreachTab() {
  const summary = useQuery(api.prospects.summary)
  const [metro, setMetro] = useState(DEFAULT_METRO)
  const data = useQuery(api.outreach.overview, { metro })
  const startRating = useMutation(api.prospects.startRating)
  const startContacts = useMutation(api.outreach.startContacts)
  const stopContacts = useMutation(api.outreach.stopContacts)
  const approve = useMutation(api.outreach.approve)
  const stop = useMutation(api.outreach.stop)
  const setContact = useMutation(api.outreach.setContact)
  const sendPreview = useAction(api.outreach.sendPreview)

  const [picked, setPicked] = useState<Set<Id<"prospects">>>(new Set())
  const [open, setOpen] = useState<Id<"prospects"> | null>(null)
  const [rateCount, setRateCount] = useState(200)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setError(null)
    setNotice(null)
    try {
      await fn()
      if (done) setNotice(done)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  if (!summary || !data) return <p className="text-slate-500">Loading…</p>
  if (summary.total === 0) return <p className="text-slate-600">Load the marketing list first (Marketing list tab).</p>

  const c = data.counts
  const ratingJob = summary.jobs[0]
  const rating = ratingJob?.status === "running"
  const contactJob = data.contactJob
  const searching = contactJob?.status === "running"
  const unchecked = c.withWebsite - c.checked
  const toggle = (id: Id<"prospects">) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allPicked = data.ready.length > 0 && data.ready.every((p) => picked.has(p._id))

  const sending = data.sending
  const modeText =
    sending.mode === "live"
      ? "Live: approved emails go to the property."
      : sending.mode === "test"
        ? `Test: every email goes to ${sending.testTo} instead of the property.`
        : "Off: nothing is sent. Approved properties wait until sending is switched on."

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <label htmlFor="outreach-metro" className="text-sm font-medium">Metro area</label>
            <select id="outreach-metro" value={metro} onChange={(e) => { setMetro(e.target.value); setPicked(new Set()) }}
              className="block h-9 border border-slate-300 rounded-md px-2 text-sm bg-white max-w-sm">
              {[...summary.metros].sort((a, b) => a.name.localeCompare(b.name)).map((m) => (
                <option key={m.key} value={m.key}>{m.name} ({num(m.properties)})</option>
              ))}
            </select>
          </div>
          <p className={`text-sm rounded-full px-3 py-1 border ${sending.mode === "live" ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-amber-50 border-amber-200 text-amber-900"}`}>
            {modeText}
          </p>
        </div>

        <ol className="mt-5 grid gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Properties", c.properties],
            ["Found on Google", c.located],
            ["Have a website", c.withWebsite],
            ["Email found", c.withEmail],
            ["In sequence", c.inSequence + c.finished],
            ["Replied", c.replied],
          ].map(([label, value]) => (
            <li key={label} className="bg-white p-3">
              <p className="text-xs text-slate-600">{label}</p>
              <p className="text-xl font-semibold tabular-nums">{num(value as number)}</p>
            </li>
          ))}
        </ol>
        {error && <p className="text-sm text-red-700 mt-3" role="alert">{error}</p>}
        {notice && <p className="text-sm text-emerald-800 mt-3" role="status">{notice}</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-semibold">1. Look up Google ratings</h2>
          <p className="text-sm text-slate-600 mt-1">
            {num(c.lookedUp)} of {num(c.properties)} looked up. Each lookup also saves the property&apos;s website.
            About ${COST_PER_LOOKUP.toFixed(2)} each on your Google Maps account.
          </p>
          {rating && ratingJob ? (
            <p className="text-sm text-slate-700 mt-3 tabular-nums" role="status">
              Running for {ratingJob.scopeName}: {num(ratingJob.done)} of {num(ratingJob.limit)}.
            </p>
          ) : c.lookedUp < c.properties ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select aria-label="How many properties to look up" value={rateCount} onChange={(e) => setRateCount(Number(e.target.value))}
                className="h-9 border border-slate-300 rounded-md px-2 text-sm bg-white">
                {[50, 200, 500, 1000, 2500].map((n) => <option key={n} value={n}>Next {num(n)}</option>)}
              </select>
              <Button
                onClick={() =>
                  confirm(`Look up Google ratings for up to ${num(rateCount)} properties in ${metro}? Google may bill about $${(rateCount * COST_PER_LOOKUP).toFixed(2)}.`) &&
                  act(() => startRating({ kind: "metro", key: metro, limit: rateCount }))
                }
              >
                Look up ratings
              </Button>
              <span className="text-sm text-slate-500 tabular-nums">about ${(rateCount * COST_PER_LOOKUP).toFixed(2)}</span>
            </div>
          ) : (
            <p className="text-sm text-emerald-800 mt-3">Every property in this metro has been looked up.</p>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="font-semibold">2. Find contact emails</h2>
          <p className="text-sm text-slate-600 mt-1">
            Reads each property&apos;s own website for an email address it publishes. No guessing: if the site shows
            none, the property is left out. {num(c.checked)} checked, {num(c.withEmail)} found.
          </p>
          {searching && contactJob ? (
            <p className="text-sm text-slate-700 mt-3 tabular-nums" role="status">
              Checking websites: {num(contactJob.done)} of {num(contactJob.limit)}, {num(contactJob.found)} found.{" "}
              <button className="text-red-700 underline" onClick={() => act(() => stopContacts({ jobId: contactJob._id }))}>Stop</button>
            </p>
          ) : unchecked > 0 ? (
            <Button className="mt-3" onClick={() => act(() => startContacts({ metro, limit: Math.min(unchecked, 5000) }))}>
              Check {num(unchecked)} website{unchecked === 1 ? "" : "s"}
            </Button>
          ) : (
            <p className="text-sm text-slate-600 mt-3">
              {c.withWebsite === 0 ? "Look up ratings first." : "Every website found so far has been checked."}
            </p>
          )}
        </section>
      </div>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">3. Review and approve</h2>
            <p className="text-sm text-slate-600 mt-1">
              {num(data.readyTotal)} propert{data.readyTotal === 1 ? "y" : "ies"} ready, lowest rating first. Nothing is
              sent to a property until you approve it here. Up to {sending.cap} emails go out per weekday, 9am to 4pm Central.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={picked.size === 0}
              onClick={() => act(async () => { await stop({ prospectIds: [...picked] }); setPicked(new Set()) }, "Skipped.")}>
              Skip {picked.size || ""}
            </Button>
            <Button size="sm" disabled={picked.size === 0}
              onClick={() => act(async () => {
                const n = await approve({ prospectIds: [...picked] })
                setPicked(new Set())
                setNotice(`${n} approved. ${sending.mode === "off" ? "They will wait until sending is switched on." : "The first emails go out in the next send window."}`)
              })}>
              Approve {picked.size || ""}
            </Button>
          </div>
        </div>

        {data.ready.length === 0 ? (
          <p className="text-sm text-slate-600 mt-4">Nothing waiting. Run steps 1 and 2 to find more.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600 border-b">
                  <th className="py-2 w-8">
                    <input type="checkbox" aria-label="Select all" className="h-4 w-4" checked={allPicked}
                      onChange={() => setPicked(allPicked ? new Set() : new Set(data.ready.map((p) => p._id)))} />
                  </th>
                  <th className="py-2 font-medium">Property</th>
                  <th className="py-2 font-medium">Google</th>
                  <th className="py-2 font-medium">Email found</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.ready.map((p) => (
                  <tr key={p._id} className="border-b last:border-0 align-top">
                    <td className="py-2.5"><input type="checkbox" aria-label={`Select ${p.name}`} className="h-4 w-4" checked={picked.has(p._id)} onChange={() => toggle(p._id)} /></td>
                    <td className="py-2.5 pr-3" colSpan={open === p._id ? 4 : 1}>
                      <span className="font-medium">{p.name}</span>
                      <div className="text-xs text-slate-500">{p.city}, {p.state}{p.units ? ` · ${num(p.units)} units` : ""}{p.management ? ` · ${p.management}` : ""}</div>
                      {open === p._id && (
                        <>
                          <p className="text-sm mt-2">
                            To <span className="font-medium">{p.contactEmail}</span>{" "}
                            <button className="text-blue-700 underline text-xs" onClick={() => {
                              const next = prompt("Send to this address instead:", p.contactEmail ?? "")
                              if (next) void act(() => setContact({ prospectId: p._id, email: next }))
                            }}>change</button>{" "}
                            <button className="text-blue-700 underline text-xs" onClick={() => act(async () => {
                              const to = await sendPreview({ prospectId: p._id })
                              setNotice(`All three emails for ${p.name} sent to ${to} as a test.`)
                            })}>send me a test</button>{" "}
                            <button className="text-blue-700 underline text-xs" onClick={() => setOpen(null)}>close</button>
                          </p>
                          <Preview p={p} />
                        </>
                      )}
                    </td>
                    {open !== p._id && (
                      <>
                        <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums">
                          {p.googleRating !== undefined ? `${p.googleRating.toFixed(1)} · ${num(p.googleReviews ?? 0)} reviews` : "No rating"}
                        </td>
                        <td className="py-2.5 pr-3">
                          {p.contactEmail}
                          <div className="text-xs text-slate-500">
                            {p.contactSource?.startsWith("http") ? (
                              <a className="hover:underline" href={p.contactSource} target="_blank" rel="noreferrer">from {p.contactSource.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48)}</a>
                            ) : p.contactSource}
                          </div>
                        </td>
                        <td className="py-2.5 text-right">
                          <Button size="sm" variant="ghost" onClick={() => setOpen(p._id)}>Preview emails</Button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.readyTotal > data.ready.length && <p className="text-xs text-slate-500 pt-3">Showing the first {data.ready.length}. Approve or skip these to see more.</p>}
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="font-semibold">4. Sending</h2>
        <p className="text-sm text-slate-600 mt-1 tabular-nums">
          {sending.sentToday} of {sending.cap} sent today. {num(c.inSequence)} in progress, {num(c.finished)} finished all
          three, {num(c.stopped)} stopped (replied, unsubscribed, bounced or skipped).
        </p>
        {data.active.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600 border-b">
                  <th className="py-2 font-medium">Property</th>
                  <th className="py-2 font-medium">To</th>
                  <th className="py-2 font-medium">Progress</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.active.map((p) => (
                  <tr key={p._id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{p.name}</td>
                    <td className="py-2 pr-3">{p.contactEmail}</td>
                    <td className="py-2 pr-3">
                      {p.seq === "active"
                        ? `${p.seqStep ?? 0} of 3 sent${p.seqNextAt ? `, next ${p.seqNextAt <= Date.now() ? "in the next send window" : formatDate(p.seqNextAt)}` : ""}`
                        : p.seq === "done" ? "All 3 sent" : `Stopped: ${p.stopReason ?? "no reason recorded"}`}
                    </td>
                    <td className="py-2 text-right">
                      {p.seq === "active" && <Button size="sm" variant="ghost" onClick={() => act(() => stop({ prospectIds: [p._id] }))}>Stop</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.sends.length > 0 && (
          <>
            <h3 className="text-sm font-semibold mt-5">Recently sent</h3>
            <ul className="mt-1 text-sm text-slate-700 divide-y divide-slate-100">
              {data.sends.map((s) => (
                <li key={s._id} className="py-1.5 flex flex-wrap gap-x-3">
                  <span className="text-slate-500 w-24">{timeAgo(s.at)}</span>
                  <span className="font-medium">{s.name}</span>
                  <span>{STEP_NAMES[s.step]}</span>
                  <span className="text-slate-500">{s.to}{s.test ? " (test)" : ""}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
