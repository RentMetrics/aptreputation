"use client"

import { useState } from "react"
import { useConvex, useMutation, usePaginatedQuery, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Doc } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Stars } from "@/components/stars"
import { errorMessage, timeAgo } from "@/lib/format"
import { auditLink, pitch } from "@/lib/pitch"

type Prospect = Doc<"prospects">
type ScopeKind = "all" | "state" | "metro" | "management"
type Status = Prospect["rateStatus"]
type Outreach = NonNullable<Prospect["outreach"]>

const STATUSES: [Status, string][] = [
  ["rated", "Rated, lowest first"],
  ["new", "Not looked up yet"],
  ["noreviews", "On Google, no rating"],
  ["nomatch", "Not found on Google"],
]

const OUTREACH: [Outreach, string][] = [
  ["contacted", "Contacted"],
  ["replied", "Replied"],
  ["customer", "Signed up"],
  ["skip", "Skip"],
]

// What one Google lookup costs once the free monthly allowance is used up.
const COST_PER_LOOKUP = 0.02
const RUN_SIZES = [25, 100, 500, 1000, 5000]

const num = (n: number) => n.toLocaleString("en-US")

export function ProspectsTab() {
  const convex = useConvex()
  const summary = useQuery(api.prospects.summary)
  const startRating = useMutation(api.prospects.startRating)
  const stopRating = useMutation(api.prospects.stopRating)
  const setOutreach = useMutation(api.prospects.setOutreach)

  const [view, setView] = useState<"properties" | "companies">("properties")
  const [kind, setKind] = useState<ScopeKind>("all")
  const [key, setKey] = useState("")
  const [company, setCompany] = useState<{ key: string; name: string } | null>(null)
  const [status, setStatus] = useState<Status>("rated")
  const [nameSearch, setNameSearch] = useState("")
  const [companySearch, setCompanySearch] = useState("")
  const [runSize, setRunSize] = useState(100)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const scopeKey = kind === "management" ? company?.key : key || undefined
  const scopeReady = kind === "all" || !!scopeKey
  const scope = { kind, ...(kind === "all" ? {} : { key: scopeKey }) }

  const searching = nameSearch.trim().length >= 2
  const page = usePaginatedQuery(
    api.prospects.list,
    scopeReady && !searching && view === "properties" ? { ...scope, status } : "skip",
    { initialNumItems: 50 },
  )
  const found = useQuery(
    api.prospects.searchByName,
    searching ? { text: nameSearch, ...(kind === "state" && key ? { state: key } : {}) } : "skip",
  )
  const companies = useQuery(api.prospects.companies, view === "companies" ? { search: companySearch } : "skip")

  const rows: Prospect[] = searching ? found ?? [] : page.results
  const job = summary?.jobs[0]
  const running = job?.status === "running"
  const scopeLabel =
    kind === "all" ? "all properties" : kind === "management" ? company?.name ?? "a company" : key || `a ${kind}`

  const start = async () => {
    setError(null)
    const cost = runSize * COST_PER_LOOKUP
    if (!confirm(`Look up Google ratings for up to ${num(runSize)} properties in ${scopeLabel}? Google may bill your Maps account about $${cost.toFixed(2)} for this run.`)) return
    try {
      await startRating({ ...scope, limit: runSize })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const copyPitch = async (p: Prospect) => {
    const text = pitch(p)
    await navigator.clipboard.writeText(`${text.subject}\n\n${text.body}`)
    setCopied(p._id)
    setTimeout(() => setCopied((c) => (c === p._id ? null : c)), 2000)
  }

  const exportCsv = async () => {
    setError(null)
    setExporting(true)
    try {
      const list = await convex.query(api.prospects.exportRows, scope)
      const out = [[
        "property", "address", "city", "state", "zip", "phone", "units", "management company", "owner",
        "google rating", "google reviews", "google listing", "outreach", "subject", "message", "audit link",
      ]]
      for (const p of list) {
        const text = pitch(p)
        out.push([
          p.name, p.address ?? "", p.city, p.state, p.zip ?? "", p.phone ?? "", p.units ? String(p.units) : "",
          p.management ?? "", p.owner ?? "", p.googleRating?.toFixed(1) ?? "", String(p.googleReviews ?? ""),
          p.googlePlaceId ? `https://www.google.com/maps/place/?q=place_id:${p.googlePlaceId}` : "",
          p.outreach ?? "", text.subject, text.body, auditLink(p),
        ])
      }
      const csv = out.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n")
      const a = document.createElement("a")
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
      a.download = `campaign-${scopeLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`
      a.click()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  if (summary === undefined) return <p className="text-slate-500">Loading…</p>
  if (summary.total === 0) {
    return (
      <section className="bg-white border border-slate-200 rounded-xl p-6 max-w-2xl">
        <h2 className="text-lg font-semibold">No marketing list loaded</h2>
        <p className="text-slate-600 mt-1">
          Load the property list from your Data folder by running this in the project folder:
        </p>
        <pre className="mt-3 bg-slate-100 rounded-md p-3 text-sm overflow-x-auto">node scripts/prospects-load.mjs --commit</pre>
      </section>
    )
  }

  const options = kind === "state" ? summary.states : kind === "metro" ? summary.metros : []

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden">
        {[
          ["Properties on the list", num(summary.total)],
          ["Apartment units", num(summary.units)],
          ["Google rating looked up", `${num(summary.rated)} of ${num(summary.total)}`],
          ["Average rating so far", summary.averageRating ? summary.averageRating.toFixed(2) : "–"],
        ].map(([label, value]) => (
          <div key={label} className="bg-white p-4">
            <dt className="text-sm text-slate-600">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums mt-0.5">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex gap-1 border-b border-slate-200">
        {([["properties", "Properties"], ["companies", "Management companies"]] as const).map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${view === v ? "border-blue-600 text-blue-700" : "border-transparent text-slate-600"}`}>
            {label}
          </button>
        ))}
      </div>

      {view === "companies" && (
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="max-w-sm mb-3">
            <Label htmlFor="company-search">Find a management company</Label>
            <Input id="company-search" value={companySearch} onChange={(e) => setCompanySearch(e.target.value)} placeholder="Greystar" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600 border-b">
                  <th className="py-2 font-medium">Company</th>
                  <th className="py-2 font-medium text-right">Properties</th>
                  <th className="py-2 font-medium text-right">Units</th>
                  <th className="py-2 font-medium text-right">Rated</th>
                  <th className="py-2 font-medium text-right">Average rating</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {companies?.map((c) => (
                  <tr key={c.key} className="border-b last:border-0">
                    <td className="py-2 font-medium">{c.name}</td>
                    <td className="py-2 text-right tabular-nums">{num(c.properties)}</td>
                    <td className="py-2 text-right tabular-nums">{num(c.units)}</td>
                    <td className="py-2 text-right tabular-nums">{num(c.rated)}</td>
                    <td className="py-2 text-right tabular-nums">{c.averageRating ? c.averageRating.toFixed(2) : "–"}</td>
                    <td className="py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => { setCompany({ key: c.key, name: c.name }); setKind("management"); setNameSearch(""); setView("properties") }}>
                        View properties
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {companies?.length === 0 && <p className="text-slate-600 text-sm py-4">No company matches that name.</p>}
            {companies && companies.length >= 150 && <p className="text-slate-500 text-xs pt-3">Showing the 150 largest. Search to find others.</p>}
          </div>
        </section>
      )}

      {view === "properties" && (
        <>
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="scope-kind">Show</Label>
                <select id="scope-kind" value={kind} onChange={(e) => { setKind(e.target.value as ScopeKind); setKey("") }}
                  className="block h-9 border border-slate-300 rounded-md px-2 text-sm bg-white">
                  <option value="all">All properties</option>
                  <option value="state">One state</option>
                  <option value="metro">One metro area</option>
                  <option value="management">One management company</option>
                </select>
              </div>
              {(kind === "state" || kind === "metro") && (
                <div>
                  <Label htmlFor="scope-key">{kind === "state" ? "State" : "Metro area"}</Label>
                  <select id="scope-key" value={key} onChange={(e) => setKey(e.target.value)}
                    className="block h-9 border border-slate-300 rounded-md px-2 text-sm bg-white max-w-xs">
                    <option value="">Choose…</option>
                    {[...options].sort((a, b) => a.name.localeCompare(b.name)).map((o) => (
                      <option key={o.key} value={o.key}>{o.name} ({num(o.properties)})</option>
                    ))}
                  </select>
                </div>
              )}
              {kind === "management" && (
                <p className="text-sm pb-2">
                  {company ? <span className="font-medium">{company.name}</span> : "No company chosen."}{" "}
                  <button className="text-blue-700 underline" onClick={() => setView("companies")}>Choose a company</button>
                </p>
              )}
              <div className="grow min-w-48 max-w-sm">
                <Label htmlFor="name-search">Or find a property by name</Label>
                <Input id="name-search" value={nameSearch} onChange={(e) => setNameSearch(e.target.value)} placeholder="Pear Ridge" />
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-200">
              <h3 className="font-semibold">Look up Google ratings</h3>
              <p className="text-sm text-slate-600 mt-0.5 max-w-3xl">
                Finds each property on Google and saves its star rating and review count. Google bills your Maps
                account about ${COST_PER_LOOKUP.toFixed(2)} a property after its free monthly allowance, so run it
                for the group you plan to contact rather than the whole list.
              </p>
              {running && job ? (
                <div className="mt-3">
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden max-w-md">
                    <div className="h-full bg-blue-600" style={{ width: `${Math.round((job.done / job.limit) * 100)}%` }} />
                  </div>
                  <p className="text-sm text-slate-700 mt-2 tabular-nums" role="status">
                    {job.scopeName}: {num(job.done)} of {num(job.limit)} looked up, {num(job.rated)} rated, {num(job.noMatch)} not found.{" "}
                    <button className="text-red-700 underline" onClick={() => stopRating({ jobId: job._id })}>Stop</button>
                  </p>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label htmlFor="run-size" className="text-sm text-slate-700">Next</label>
                  <select id="run-size" value={runSize} onChange={(e) => setRunSize(Number(e.target.value))}
                    className="h-9 border border-slate-300 rounded-md px-2 text-sm bg-white">
                    {RUN_SIZES.map((n) => <option key={n} value={n}>{num(n)}</option>)}
                  </select>
                  <span className="text-sm text-slate-700">not yet looked up in {scopeLabel}</span>
                  <Button onClick={start} disabled={!scopeReady}>Look up ratings</Button>
                  <span className="text-sm text-slate-500 tabular-nums">up to about ${(runSize * COST_PER_LOOKUP).toFixed(2)}</span>
                </div>
              )}
              {!running && job && (
                <p className="text-sm text-slate-600 mt-2 tabular-nums">
                  Last run ({job.scopeName}, {timeAgo(job.finishedAt ?? job.startedAt)}): {num(job.done)} looked up, {num(job.rated)} rated, {num(job.noMatch)} not found
                  {job.status === "stopped" ? ", stopped early" : ""}.
                  {job.status === "failed" && <span className="text-red-700"> Stopped on an error: {job.error}</span>}
                </p>
              )}
              {error && <p className="text-sm text-red-700 mt-2" role="alert">{error}</p>}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              {searching ? (
                <p className="text-sm text-slate-700">Properties named like &ldquo;{nameSearch.trim()}&rdquo;</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {STATUSES.map(([s, label]) => (
                    <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s}
                      className={`px-3 py-1 rounded-full text-sm border ${status === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!scopeReady || exporting}>
                {exporting ? "Preparing…" : "Download campaign CSV"}
              </Button>
            </div>

            {!scopeReady && !searching ? (
              <p className="text-slate-600 text-sm py-4">Choose a {kind === "management" ? "company" : kind} above to see its properties.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600 border-b">
                      <th className="py-2 font-medium">Property</th>
                      <th className="py-2 pr-3 font-medium text-right">Units</th>
                      <th className="py-2 font-medium">Managed by</th>
                      <th className="py-2 font-medium">Google</th>
                      <th className="py-2 font-medium">Outreach</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p._id} className="border-b last:border-0 align-top">
                        <td className="py-2.5 pr-3">
                          <span className="font-medium">{p.name}</span>
                          <div className="text-xs text-slate-500">{[p.address, p.city, p.state].filter(Boolean).join(", ")}</div>
                          {p.phone && <div className="text-xs text-slate-500">{p.phone}</div>}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums">{p.units ? num(p.units) : "–"}</td>
                        <td className="py-2.5 pr-3">
                          {p.management ? (
                            <button className="text-left text-blue-700 hover:underline"
                              onClick={() => { setCompany({ key: p.managementKey, name: p.management! }); setKind("management"); setNameSearch("") }}>
                              {p.management}
                            </button>
                          ) : <span className="text-slate-500">Not listed</span>}
                          {p.owner && p.owner !== p.management && <div className="text-xs text-slate-500">Owner: {p.owner}</div>}
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap">
                          {p.rateStatus === "rated" && p.googleRating !== undefined ? (
                            <>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold tabular-nums">{p.googleRating.toFixed(1)}</span>
                                <Stars rating={p.googleRating} />
                              </div>
                              <a className="text-xs text-blue-700 hover:underline tabular-nums" target="_blank" rel="noreferrer"
                                href={`https://www.google.com/maps/place/?q=place_id:${p.googlePlaceId}`}>
                                {num(p.googleReviews ?? 0)} reviews
                              </a>
                            </>
                          ) : (
                            <span className="text-slate-500">
                              {p.rateStatus === "new" ? "Not looked up" : p.rateStatus === "nomatch" ? "Not found" : "No rating yet"}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 whitespace-nowrap">
                          <select aria-label={`Outreach status for ${p.name}`} value={p.outreach ?? ""}
                            onChange={(e) => setOutreach({ prospectId: p._id, outreach: (e.target.value || null) as Outreach | null })}
                            className="h-8 border border-slate-300 rounded-md px-1.5 text-sm bg-white">
                            <option value="">Not contacted</option>
                            {OUTREACH.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                          </select>
                          {p.rateStatus !== "new" && p.rateStatus !== "nomatch" && (
                            <div className="mt-1 flex gap-3 text-xs">
                              <button className="text-blue-700 hover:underline" onClick={() => copyPitch(p)}>
                                {copied === p._id ? "Copied" : "Copy message"}
                              </button>
                              <a className="text-blue-700 hover:underline" href={auditLink(p)} target="_blank" rel="noreferrer">Audit link</a>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 && (searching ? found !== undefined : page.status !== "LoadingFirstPage") && (
                  <p className="text-slate-600 text-sm py-4">
                    {searching
                      ? "No property with that name on the list."
                      : status === "rated"
                        ? "No ratings looked up here yet. Use Look up ratings above."
                        : "Nothing in this group."}
                  </p>
                )}
                {!searching && page.status === "CanLoadMore" && (
                  <div className="pt-3"><Button variant="outline" size="sm" onClick={() => page.loadMore(100)}>Show more</Button></div>
                )}
                {!searching && (page.status === "LoadingFirstPage" || page.status === "LoadingMore") && (
                  <p className="text-slate-500 text-sm py-3">Loading…</p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
