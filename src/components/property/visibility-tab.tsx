"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { RefreshCw } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { labelOf, listOf, type AssistantAnswer, type VisibilityResult } from "@/convex/lib/visibility"
import { useCanAct } from "@/components/property/access"
import { Button } from "@/components/ui/button"
import { errorMessage, formatDate } from "@/lib/format"

const PILL = {
  yes: "bg-emerald-50 text-emerald-900 border-emerald-200",
  no: "bg-red-50 text-red-900 border-red-200",
  warn: "bg-amber-50 text-amber-900 border-amber-200",
} as const

function parse(json: string | null | undefined): VisibilityResult | null {
  if (!json) return null
  try {
    const r = JSON.parse(json) as VisibilityResult
    // Checks saved before several assistants were asked have another shape; they are left out.
    return r.v === 2 ? r : null
  } catch {
    return null
  }
}

function Pill({ kind, children }: { kind: keyof typeof PILL; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap text-xs font-semibold border rounded-full px-2 py-0.5 ${PILL[kind]}`}>{children}</span>
}

function Shown({ a }: { a: AssistantAnswer }) {
  if (a.error) return <Pill kind="warn">No answer</Pill>
  if (!a.mentioned) return <Pill kind="no">Not named</Pill>
  return <Pill kind="yes">{a.position ? `Named, ${ordinal(a.position)}` : "Named"}</Pill>
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-3">
      <Pill kind={ok ? "yes" : "no"}>{ok ? "Yes" : "No"}</Pill>
      <div>
        <p className="font-medium">{label}</p>
        {detail && <p className="text-sm text-slate-600 break-words">{detail}</p>}
      </div>
    </li>
  )
}

export function VisibilityTab({ communityId }: { communityId: Id<"communities"> }) {
  const canAct = useCanAct()
  const data = useQuery(api.visibility.latest, { communityId })
  const start = useMutation(api.visibility.start)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const currentJson = data?.current?.result
  const previousJson = data?.previous?.result
  const result = useMemo(() => parse(currentJson), [currentJson])
  const previous = useMemo(() => parse(previousJson), [previousJson])

  if (!data) return <p className="text-slate-500">Loading…</p>
  const running = !!data.running

  const run = async () => {
    setError(null)
    try {
      await start({ communityId })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const need = result?.prompts.filter((p) => p.kind === "need") ?? []
  const byName = result?.prompts.find((p) => p.kind === "name")
  const named = byName?.answers.filter((a) => !a.error) ?? []
  const noAnswer = result
    ? [...new Set(result.prompts.flatMap((p) => p.answers.filter((a) => a.error).map((a) => a.assistant)))].filter((k) => !result.assistants.some((a) => a.key === k))
    : []

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">How AI assistants answer renters</h2>
            <p className="text-sm text-slate-600">
              {result && data.current
                ? `${listOf(result.assistants.map((a) => a.label))}, each with web search · checked ${formatDate(data.current.at)}`
                : "We ask AI assistants the questions renters ask, and record whether they name this property."}
            </p>
          </div>
          {canAct && (
            <Button variant="outline" size="sm" onClick={run} disabled={running || !data.allowance.allowed}>
              <RefreshCw className={`h-4 w-4 mr-1.5 ${running ? "animate-spin" : ""}`} />
              {running ? "Asking the assistants…" : result ? "Check again" : "Run the check"}
            </Button>
          )}
        </div>
        {running && <p className="text-sm text-slate-600 mt-3">This takes a minute or two. You can leave this page; the result will be here when you come back.</p>}
        {error && <p className="text-sm text-red-700 mt-3" role="alert">{error}</p>}
        {!running && data.allowance.reason && <p className="text-sm text-slate-600 mt-3">{data.allowance.reason}</p>}
        {!running && data.failed && <p className="text-sm text-red-700 mt-3" role="alert">The last check did not finish: {data.failed.error}</p>}

        {result && (
          <div className="mt-5 flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <p className="text-4xl font-semibold tabular-nums">{result.shown} of {result.outOf}</p>
              <p className="text-sm text-slate-600">renter searches named this property</p>
            </div>
            {result.assistants.map((a) => (
              <div key={a.key}>
                <p className="text-2xl font-semibold tabular-nums">{a.shown} of {a.outOf}</p>
                <p className="text-sm text-slate-600">{a.label}</p>
              </div>
            ))}
          </div>
        )}
        {result && previous && data.previous && (
          <p className="text-sm text-slate-600 mt-3">
            Previous check ({formatDate(data.previous.at)}): {previous.shown} of {previous.outOf}
          </p>
        )}
        {result && noAnswer.length > 0 && (
          <p className="text-sm text-amber-900 mt-3" role="status">
            {noAnswer.map(labelOf).join(" and ")} did not answer this time, so {noAnswer.length === 1 ? "it is" : "they are"} left out of the count.
          </p>
        )}
        {result && (
          <p className="text-sm text-slate-600 mt-4">
            Each question is asked once per assistant, and assistants word their answers differently each time, so read this as a sample. Answers come from each assistant&apos;s developer service, which can differ a little from its consumer app.
          </p>
        )}
      </section>

      {result && result.fixes.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-lg font-semibold">What to fix</h2>
          <p className="text-sm text-slate-600 mb-3">The Fix plan tab has the steps for each of these.</p>
          <ul className="space-y-3">
            {result.fixes.map((f, i) => (
              <li key={i} className="flex gap-3">
                <span className={`shrink-0 h-fit text-xs font-semibold border rounded-full px-2 py-0.5 ${f.priority === "now" ? PILL.no : PILL.warn}`}>
                  {f.priority === "now" ? "Do now" : "Next"}
                </span>
                <div>
                  <p className="font-medium">{f.title}</p>
                  <p className="text-sm text-slate-600">{f.why}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result && (
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-3">Search by search</h2>
          <ul className="divide-y divide-slate-200">
            {need.map((p, i) => (
              <li key={i} className="py-4">
                <p className="font-medium">{p.question}</p>
                <ul className="mt-2 space-y-3">
                  {p.answers.map((a) => {
                    const id = `${i}:${a.assistant}`
                    return (
                      <li key={a.assistant} className="grid gap-x-3 gap-y-1 sm:grid-cols-[5.5rem_7.5rem_1fr]">
                        <p className="text-sm font-medium">{labelOf(a.assistant)}</p>
                        <div><Shown a={a} /></div>
                        <div className="min-w-0">
                          {a.error ? (
                            <p className="text-sm text-slate-600 break-words">{a.error}</p>
                          ) : (
                            <>
                              <p className="text-sm text-slate-700">{a.note}</p>
                              {a.sources.length > 0 && <p className="text-sm text-slate-600 break-words">Sources: {a.sources.join(", ")}</p>}
                              <button type="button" className="text-sm text-brand underline" onClick={() => setOpen(open === id ? null : id)} aria-expanded={open === id}>
                                {open === id ? "Hide the answer" : "Read the answer"}
                              </button>
                              {open === id && <p className="text-sm text-slate-800 mt-2 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-lg p-3">{a.answer}</p>}
                            </>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result && byName && (
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-1">When asked about this property by name</h2>
          <p className="text-sm text-slate-600 mb-3">{byName.question}</p>
          {named.length === 0 ? (
            <p className="text-sm text-slate-600">No assistant answered this question.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600 border-b">
                      <th className="py-2 pr-4 font-medium">Fact</th>
                      {named.map((a) => <th key={a.assistant} className="py-2 pr-4 font-medium">{labelOf(a.assistant)} said</th>)}
                      <th className="py-2 font-medium">Google shows</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b align-top">
                      <td className="py-2 pr-4">Name</td>
                      {named.map((a) => <td key={a.assistant} className="py-2 pr-4">{a.namedAs ?? result.google.name}</td>)}
                      <td className="py-2">{result.google.name}</td>
                    </tr>
                    <tr className="border-b align-top">
                      <td className="py-2 pr-4">Phone</td>
                      {named.map((a) => <td key={a.assistant} className="py-2 pr-4 tabular-nums">{a.statedPhone ?? "Not given"}</td>)}
                      <td className="py-2 tabular-nums">
                        {result.google.phone ?? "None listed"}
                        {result.factPhone && <span className="block text-slate-500">Fact sheet: {result.factPhone}</span>}
                      </td>
                    </tr>
                    <tr className="border-b align-top">
                      <td className="py-2 pr-4">Rating</td>
                      {named.map((a) => <td key={a.assistant} className="py-2 pr-4">{a.statedRating ?? "Not given"}</td>)}
                      <td className="py-2 tabular-nums">
                        {result.google.rating !== null ? `${result.google.rating.toFixed(1)} (${result.google.totalReviews.toLocaleString("en-US")} reviews)` : "No rating"}
                      </td>
                    </tr>
                    <tr className="border-b align-top">
                      <td className="py-2 pr-4">Rent</td>
                      {named.map((a) => <td key={a.assistant} className="py-2 pr-4">{a.statedRent ?? "Not given"}</td>)}
                      <td className="py-2 text-slate-500">Not on Google</td>
                    </tr>
                    <tr className="align-top">
                      <td className="py-2 pr-4">Overall</td>
                      {named.map((a) => <td key={a.assistant} className="py-2 pr-4 capitalize">{a.tone === "none" ? "Not described" : a.tone}</td>)}
                      <td className="py-2" />
                    </tr>
                  </tbody>
                </table>
              </div>
              <ul className="mt-4 space-y-4">
                {named.map((a) => (
                  <li key={a.assistant}>
                    <p className="font-medium">{labelOf(a.assistant)}</p>
                    <p className="text-sm text-slate-700">{a.note}</p>
                    {a.sources.length > 0 && <p className="text-sm text-slate-600 break-words">Sources: {a.sources.join(", ")}</p>}
                    <p className="text-sm text-slate-800 mt-2 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-lg p-3">{a.answer}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {result && result.competitors.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-1">Who was named instead</h2>
          <p className="text-sm text-slate-600 mb-3">Communities named most often across the {result.outOf} answers.</p>
          <table className="w-full text-sm">
            <tbody>
              {result.competitors.map((c) => (
                <tr key={c.name} className="border-b last:border-0">
                  <td className="py-2">{c.name}</td>
                  <td className="py-2 text-right tabular-nums">{c.count} of {result.outOf}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {result && (
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-1">What the property&apos;s website gives an assistant</h2>
          {!result.google.website ? (
            <p className="text-sm text-slate-600">Google shows no website for this property.</p>
          ) : !result.site || result.site.status === "failed" ? (
            <p className="text-sm text-slate-600 break-words">{result.google.website} could not be opened.</p>
          ) : result.site.status === "blocked" ? (
            <p className="text-sm text-slate-600 break-words">
              {result.site.url} turned away our automated reader, so the page itself could not be checked.{" "}
              {result.site.citedByAssistant
                ? "At least one assistant cited the site in its answers, so assistants are getting in."
                : "No assistant cited the site either. Ask the web vendor whether AI crawlers are allowed in."}
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-600 mb-3 break-words">{result.site.url}</p>
              <ul className="space-y-3">
                <Check ok={result.site.blockedCrawlers.length === 0} label="AI crawlers are allowed in" detail={result.site.blockedCrawlers.length ? `Blocked: ${result.site.blockedCrawlers.join(", ")}` : undefined} />
                <Check ok={result.site.textLength >= 600} label="The page can be read as plain text" />
                <Check ok={result.site.showsRent} label="Rent is shown" />
                <Check ok={result.site.mentionsPets} label="Pets are mentioned" />
                <Check ok={result.site.showsPhone} label="The phone number matches Google" detail={result.google.phone ?? undefined} />
                <Check ok={!!result.site.description} label="The page has a description" detail={result.site.description} />
                <Check ok={result.site.schemaTypes.length > 0} label="Structured data is present" detail={result.site.schemaTypes.join(", ") || undefined} />
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  )
}
