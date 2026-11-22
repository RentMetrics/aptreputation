"use client"

import { useEffect, useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { Check, Copy, PenLine, RefreshCw } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { FACT_FIELDS, PLACE_LABEL, type Facts, type Place, type TabLink } from "@/convex/lib/fixPlan"
import { useCanAct } from "@/components/property/access"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { errorMessage, formatDate } from "@/lib/format"

const PILL = {
  good: "bg-emerald-50 text-emerald-900 border-emerald-200",
  bad: "bg-red-50 text-red-900 border-red-200",
  warn: "bg-amber-50 text-amber-900 border-amber-200",
  plain: "bg-slate-50 text-slate-700 border-slate-200",
} as const

const PLACES: Place[] = ["aptreputation", "google", "listing", "website"]

function Pill({ kind, children }: { kind: keyof typeof PILL; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap text-xs font-semibold border rounded-full px-2 py-0.5 ${PILL[kind]}`}>{children}</span>
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // The browser refused; the text is on the page to select by hand.
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={copy}>
      {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
      {copied ? "Copied" : label}
    </Button>
  )
}

type Plan = NonNullable<ReturnType<typeof useQuery<typeof api.fixPlan.get>>>
type Task = Plan["tasks"][number]

function TaskCard({ task, communityId, onOpen }: { task: Task; communityId: Id<"communities">; onOpen: (tab: TabLink) => void }) {
  const canAct = useCanAct()
  const setDone = useMutation(api.fixPlan.setDone)
  const assign = useMutation(api.fixPlan.assign)
  const draft = useAction(api.fixPlanAi.draftRequest)
  const [busy, setBusy] = useState(false)
  const [request, setRequest] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [who, setWho] = useState(task.assignee ?? "")
  useEffect(() => setWho(task.assignee ?? ""), [task.assignee])

  const guard = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    }
  }
  const write = async () => {
    setBusy(true)
    await guard(async () => setRequest(await draft({ communityId, key: task.key })))
    setBusy(false)
  }

  const closable = task.verify === "check" || task.verify === "manual"
  const state =
    task.verify === "ongoing" ? <Pill kind="plain">Ongoing</Pill>
    : task.status === "done" ? <Pill kind="good">{task.verify === "check" ? "Marked done · the next check confirms it" : "Done"}</Pill>
    : task.reopened ? <Pill kind="warn">Still showing in the latest check</Pill>
    : <Pill kind={task.priority === "now" ? "bad" : "warn"}>{task.priority === "now" ? "Do now" : "Next"}</Pill>

  return (
    <li className="border border-slate-200 rounded-lg p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-semibold">{task.title}</h4>
        {state}
      </div>
      <p className="text-sm text-slate-600 mt-1">{task.why}</p>
      <ol className="mt-3 space-y-1.5 text-sm text-slate-800 list-decimal pl-5">
        {task.steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>

      {request && (
        <div className="mt-3">
          <p className="text-sm font-medium">Request to send</p>
          <p className="text-sm text-slate-800 mt-1 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-lg p-3">{request}</p>
          <p className="text-xs text-slate-500 mt-1">Fill in anything in [brackets] before you send it.</p>
        </div>
      )}
      {error && <p className="text-sm text-red-700 mt-3" role="alert">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {task.link && (
          <Button size="sm" onClick={() => onOpen(task.link!.tab)}>{task.link.label}</Button>
        )}
        {canAct && task.request && (
          <Button variant="outline" size="sm" onClick={write} disabled={busy}>
            <PenLine className={`h-4 w-4 mr-1.5 ${busy ? "animate-pulse" : ""}`} />
            {busy ? "Writing…" : request ? "Write it again" : "Write the request for me"}
          </Button>
        )}
        {request && <CopyButton text={request} label="Copy the request" />}
        {canAct && closable && (
          <Button variant="outline" size="sm" onClick={() => guard(() => setDone({ communityId, key: task.key, done: task.status !== "done" }))}>
            {task.status === "done" ? "Not done yet" : "Mark as done"}
          </Button>
        )}
        {canAct && closable && (
          <label className="flex items-center gap-2 text-sm text-slate-600 ml-auto">
            <span>Handled by</span>
            <Input
              id={`who-${task.key}`}
              value={who}
              onChange={(e) => setWho(e.target.value)}
              onBlur={() => who.trim() !== (task.assignee ?? "") && guard(() => assign({ communityId, key: task.key, assignee: who }))}
              placeholder="Name or email"
              className="h-8 w-44"
            />
          </label>
        )}
      </div>
    </li>
  )
}

type Listing = { title: string; phone: string | null; website: string | null; hours: string[]; factPhone: string | null; factWebsite: string | null; factHours: string | null }

const digitsOf = (s: string | null) => (s ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "")
const siteOf = (s: string | null) => (s ?? "").trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "")

/** Compares the fact sheet with the live Google listing and sends the lines the manager picks. */
function GoogleListing({ communityId }: { communityId: Id<"communities"> }) {
  const load = useAction(api.google.listingFacts)
  const update = useAction(api.google.updateListing)
  const [listing, setListing] = useState<Listing | null>(null)
  const [busy, setBusy] = useState<"load" | "send" | null>(null)
  const [pick, setPick] = useState({ phone: false, website: false })
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const compare = async () => {
    setError(null)
    setNote(null)
    setBusy("load")
    try {
      const l = await load({ communityId })
      setListing(l)
      setPick({
        phone: !!l.factPhone && digitsOf(l.factPhone) !== digitsOf(l.phone),
        website: !!l.factWebsite && siteOf(l.factWebsite) !== siteOf(l.website),
      })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }
  const send = async () => {
    if (!listing) return
    setError(null)
    setBusy("send")
    try {
      const now = await update({ communityId, ...pick })
      setListing({ ...listing, phone: now.phone, website: now.website })
      setPick({ phone: false, website: false })
      setNote("Sent to Google. Google checks some edits before they show publicly, which can take a few days.")
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const rows = listing
    ? ([
        { key: "phone" as const, label: "Phone", fact: listing.factPhone, google: listing.phone, same: digitsOf(listing.factPhone) === digitsOf(listing.phone) },
        { key: "website" as const, label: "Website", fact: listing.factWebsite, google: listing.website, same: siteOf(listing.factWebsite) === siteOf(listing.website) },
      ])
    : []

  return (
    <div className="mt-6 border-t border-slate-200 pt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Update the Google listing from the fact sheet</h3>
          <p className="text-sm text-slate-600">See what Google shows now, then send the phone and website from the fact sheet. Save the fact sheet first. Nothing changes until you choose.</p>
        </div>
        <Button variant="outline" size="sm" onClick={compare} disabled={busy !== null}>
          {busy === "load" ? "Reading Google…" : listing ? "Compare again" : "Compare with Google"}
        </Button>
      </div>
      {error && <p className="text-sm text-red-700 mt-3" role="alert">{error}</p>}
      {note && <p className="text-sm text-emerald-800 mt-3" role="status">{note}</p>}
      {listing && (
        <>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600 border-b">
                  <th className="py-2 pr-3 font-medium">Update</th>
                  <th className="py-2 pr-3 font-medium">Line</th>
                  <th className="py-2 pr-3 font-medium">Fact sheet</th>
                  <th className="py-2 font-medium">Google now ({listing.title})</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b align-top">
                    <td className="py-2 pr-3">
                      <input
                        id={`send-${r.key}`}
                        type="checkbox"
                        className="h-4 w-4"
                        checked={pick[r.key]}
                        disabled={!r.fact || r.same}
                        onChange={(e) => setPick({ ...pick, [r.key]: e.target.checked })}
                        aria-label={`Send the ${r.label.toLowerCase()} to Google`}
                      />
                    </td>
                    <td className="py-2 pr-3"><label htmlFor={`send-${r.key}`}>{r.label}</label></td>
                    <td className="py-2 pr-3 break-words">{r.fact ?? <span className="text-slate-500">Not on the fact sheet</span>}</td>
                    <td className="py-2 break-words">
                      {r.google ?? <span className="text-slate-500">None</span>}{" "}
                      {r.fact && (r.same ? <span className="text-emerald-800">· matches</span> : <span className="text-amber-800">· different</span>)}
                    </td>
                  </tr>
                ))}
                <tr className="align-top">
                  <td className="py-2 pr-3" />
                  <td className="py-2 pr-3">Hours</td>
                  <td className="py-2 pr-3 break-words">{listing.factHours ?? <span className="text-slate-500">Not on the fact sheet</span>}</td>
                  <td className="py-2">{listing.hours.length ? listing.hours.join(", ") : <span className="text-slate-500">None</span>}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 mt-2">Hours are shown to compare. Change them in Google itself, where each day is set separately.</p>
          <Button className="mt-3" onClick={send} disabled={busy !== null || (!pick.phone && !pick.website)}>
            {busy === "send" ? "Sending to Google…" : "Update the ticked lines on Google"}
          </Button>
        </>
      )}
    </div>
  )
}

function FactSheet({ plan, communityId }: { plan: Plan; communityId: Id<"communities"> }) {
  const canAct = useCanAct()
  const save = useMutation(api.fixPlan.saveFacts)
  const start = (): Facts => ({
    ...plan.facts,
    phone: plan.facts.phone ?? plan.suggested?.phone ?? undefined,
    website: plan.facts.website ?? plan.suggested?.website ?? undefined,
  })
  const [facts, setFacts] = useState<Facts>(start)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await save({ communityId, facts })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="fact-sheet" className="bg-white border border-slate-200 rounded-xl p-5 scroll-mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Fact sheet</h2>
          <p className="text-sm text-slate-600">The one set of facts every listing should show. Requests we write for you are filled in from it.</p>
        </div>
        <CopyButton text={plan.factSheet} label="Copy the fact sheet" />
      </div>
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 text-sm text-slate-700">
          <p><span className="font-medium">Name:</span> {plan.name}</p>
          <p><span className="font-medium">Address:</span> {plan.address.replace(/, USA$/, "")}</p>
        </div>
        {FACT_FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={`fact-${f.key}`} className="text-sm font-medium">
              {f.label}{f.required ? "" : <span className="font-normal text-slate-500"> (optional)</span>}
            </label>
            <Input
              id={`fact-${f.key}`}
              value={facts[f.key] ?? ""}
              onChange={(e) => setFacts({ ...facts, [f.key]: e.target.value })}
              placeholder={f.hint}
              disabled={!canAct}
              className="mt-1"
            />
          </div>
        ))}
        {canAct && (
          <div className="sm:col-span-2 flex items-center gap-3">
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save the fact sheet"}</Button>
            {saved && <span className="text-sm text-emerald-800" role="status">Saved</span>}
            {error && <span className="text-sm text-red-700" role="alert">{error}</span>}
          </div>
        )}
      </form>
      {canAct && plan.hasGoogle && <GoogleListing communityId={communityId} />}
      {canAct && !plan.hasGoogle && (
        <p className="mt-5 border-t border-slate-200 pt-4 text-sm text-slate-600">
          Once this property&apos;s Google Business Profile is connected in Settings, you can send the phone and website from this fact sheet straight to the Google listing.
        </p>
      )}
    </section>
  )
}

export function FixPlanTab({ communityId, onOpenTab }: { communityId: Id<"communities">; onOpenTab: (tab: "reviews" | "requests" | "settings" | "ai") => void }) {
  const canAct = useCanAct()
  const plan = useQuery(api.fixPlan.get, { communityId })
  const check = useQuery(api.visibility.latest, { communityId })
  const start = useMutation(api.visibility.start)
  const [error, setError] = useState<string | null>(null)

  if (!plan || !check) return <p className="text-slate-500">Loading…</p>
  const running = !!check.running

  const open = (tab: TabLink) => {
    if (tab === "facts") document.getElementById("fact-sheet")?.scrollIntoView({ behavior: "smooth" })
    else onOpenTab(tab)
  }
  const run = async () => {
    setError(null)
    try {
      await start({ communityId })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Fix plan</h2>
            <p className="text-sm text-slate-600">
              {plan.lastCheckAt
                ? `From the AI search check on ${formatDate(plan.lastCheckAt)}. We check again automatically every month${plan.nextCheckAt ? `, next around ${formatDate(plan.nextCheckAt)}` : ""}.`
                : "Run the first AI search check to see what assistants say about this property. Until then, these are the steps every property should take."}
            </p>
          </div>
          {canAct && (
            <Button variant="outline" size="sm" onClick={run} disabled={running || !check.allowance.allowed}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${running ? "animate-spin" : ""}`} />
              {running ? "Asking the assistants…" : plan.lastCheckAt ? "Check again now" : "Run the check"}
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-red-700 mt-3" role="alert">{error}</p>}
        {!running && check.allowance.reason && <p className="text-sm text-slate-600 mt-3">{check.allowance.reason}</p>}
        <div className="mt-5 flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <p className="text-4xl font-semibold tabular-nums">{plan.open}</p>
            <p className="text-sm text-slate-600">to do</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{plan.waiting}</p>
            <p className="text-sm text-slate-600">marked done</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{plan.cleared.length}</p>
            <p className="text-sm text-slate-600">cleared</p>
          </div>
          {plan.shown && (
            <button type="button" className="text-left" onClick={() => onOpenTab("ai")}>
              <p className="text-2xl font-semibold tabular-nums">{plan.shown.shown} of {plan.shown.outOf}</p>
              <p className="text-sm text-brand underline">AI searches named this property</p>
              {plan.sinceJoining && (
                <p className={`text-sm ${plan.sinceJoining.now.shown > plan.sinceJoining.then.shown ? "text-gain" : plan.sinceJoining.now.shown < plan.sinceJoining.then.shown ? "text-loss" : "text-slate-600"}`}>
                  Started at {plan.sinceJoining.then.shown} of {plan.sinceJoining.then.outOf}
                </p>
              )}
            </button>
          )}
        </div>
      </section>

      {PLACES.map((place) => {
        const tasks = plan.tasks.filter((t) => t.place === place)
        if (tasks.length === 0) return null
        return (
          <section key={place} className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-lg font-semibold">{PLACE_LABEL[place].title}</h3>
            <p className="text-sm text-slate-600 mb-3">{PLACE_LABEL[place].blurb}</p>
            <ul className="space-y-3">
              {tasks.map((t) => <TaskCard key={t.key} task={t} communityId={communityId} onOpen={open} />)}
            </ul>
          </section>
        )
      })}

      <FactSheet key={JSON.stringify(plan.facts)} plan={plan} communityId={communityId} />

      {plan.cleared.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-lg font-semibold mb-3">Cleared</h3>
          <ul className="divide-y divide-slate-200">
            {plan.cleared.map((c) => (
              <li key={c.key} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span>{c.title}</span>
                <span className="text-sm text-slate-600">{c.how}{c.at ? ` · ${formatDate(c.at)}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
