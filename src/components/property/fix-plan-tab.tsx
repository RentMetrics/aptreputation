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
            <Button variant="outline" size="sm" onClick={run} disabled={running}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${running ? "animate-spin" : ""}`} />
              {running ? "Asking the assistants…" : plan.lastCheckAt ? "Check again now" : "Run the check"}
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-red-700 mt-3" role="alert">{error}</p>}
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
