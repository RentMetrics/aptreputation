"use client"

import { useState } from "react"
import Link from "next/link"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { ArrowLeft } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { errorMessage, formatDate, timeAgo } from "@/lib/format"

type Tab = "cards" | "customers" | "leads"

export default function AdminPage() {
  const { isAuthenticated } = useConvexAuth()
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip")
  const isAdmin = me?.role === "admin"
  const overview = useQuery(api.admin.overview, isAdmin ? {} : "skip")
  const cards = useQuery(api.tags.adminInventory, isAdmin ? {} : "skip")
  const addCards = useMutation(api.tags.adminAddCards)
  const release = useMutation(api.tags.adminRelease)
  const deleteCard = useMutation(api.tags.adminDelete)

  const [tab, setTab] = useState<Tab>("cards")
  const [serials, setSerials] = useState("")
  const [blank, setBlank] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (me === undefined) return <main className="p-10 text-slate-500">Loading…</main>
  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center text-center p-6">
        <div>
          <h1 className="text-xl font-semibold">Admins only</h1>
          <Link href="/dashboard" className="text-blue-700 underline">Back to your properties</Link>
        </div>
      </main>
    )
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setMessage(null)
    try {
      const list = serials.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
      const result = await addCards({ serials: list, blankCount: blank ? Number(blank) : 0 })
      setMessage(`Added ${result.added} card${result.added === 1 ? "" : "s"}${result.skipped ? `, skipped ${result.skipped} already in inventory` : ""}.`)
      setSerials("")
      setBlank("")
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const downloadCsv = () => {
    const rows = [["code", "url", "serial", "status", "customer", "property", "taps"]]
    for (const c of cards ?? []) {
      rows.push([c.code, `${origin}/t/${c.code}`, c.serial ?? "", c.communityId ? "in use" : c.ownerId ? "claimed" : "inventory", c.ownerEmail ?? "", c.communityName ?? "", String(c.tapCount)])
    }
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    a.download = "nfc-cards.csv"
    a.click()
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" />Dashboard
        </Link>
        <h1 className="text-2xl font-bold mb-2">Admin</h1>
        {overview && (
          <p className="text-slate-600 mb-6 tabular-nums">
            {overview.totals.customers} accounts · {overview.totals.subscribed} subscribed · {overview.totals.properties} properties · {overview.leads.length} audit leads
          </p>
        )}

        <div className="border-b border-slate-200 mb-6 flex gap-1" role="tablist">
          {([["cards", "NFC cards"], ["customers", "Customers"], ["leads", "Audit leads"]] as const).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tab === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-600"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "cards" && (
          <div className="grid gap-6 lg:grid-cols-3">
            <section className="bg-white border border-slate-200 rounded-xl p-5 h-fit">
              <h2 className="text-lg font-semibold mb-1">Add physical cards</h2>
              <p className="text-sm text-slate-600 mb-3">
                Each card gets a code and a link. Write the link to the card as a URL record, then hand it to a customer:
                they add it with the code, or it activates when you ship pre-assigned.
              </p>
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <Label htmlFor="serials">Card serial numbers (one per line)</Label>
                  <textarea id="serials" rows={5} value={serials} onChange={(e) => setSerials(e.target.value)} placeholder={"04:C2:88:D2:5F:61:80\n04:A1:7B:D2:5F:61:81"} className="w-full border border-slate-300 rounded-md p-2 text-sm font-mono" />
                </div>
                <div>
                  <Label htmlFor="blank">Or number of cards without serials</Label>
                  <Input id="blank" type="number" min={0} max={500} value={blank} onChange={(e) => setBlank(e.target.value)} />
                </div>
                <Button type="submit" disabled={!serials.trim() && !Number(blank)}>Add to inventory</Button>
                {message && <p className="text-sm text-emerald-800" role="status">{message}</p>}
                {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
              </form>
            </section>

            <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Card inventory <span className="text-slate-500 font-normal tabular-nums">({cards?.length ?? 0})</span></h2>
                <Button size="sm" variant="outline" onClick={downloadCsv} disabled={!cards?.length}>Download CSV of links</Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-600 border-b">
                      <th className="py-2 font-medium">Code / link</th>
                      <th className="py-2 font-medium">Serial</th>
                      <th className="py-2 font-medium">Where</th>
                      <th className="py-2 font-medium text-right">Taps</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cards?.map((c) => (
                      <tr key={c._id} className="border-b last:border-0 align-top">
                        <td className="py-2 font-mono">{c.code}<div className="text-xs text-slate-500">{origin}/t/{c.code}</div></td>
                        <td className="py-2 font-mono text-xs">{c.serial ?? "–"}</td>
                        <td className="py-2">
                          {c.communityName ?? (c.ownerEmail ? "Claimed, not placed" : <span className="text-slate-500">In inventory</span>)}
                          {c.ownerEmail && <div className="text-xs text-slate-500">{c.ownerEmail}</div>}
                        </td>
                        <td className="py-2 text-right tabular-nums">{c.tapCount}{c.lastTapAt ? <div className="text-xs text-slate-500">{timeAgo(c.lastTapAt)}</div> : null}</td>
                        <td className="py-2 text-right">
                          {c.ownerId && (
                            <Button size="sm" variant="ghost" onClick={() => confirm("Return this card to inventory? It will stop working for the customer.") && release({ tagId: c._id })}>
                              Return to inventory
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-red-700" onClick={() => confirm(`Delete card ${c.code} permanently? Its link will stop working.`) && deleteCard({ tagId: c._id })}>
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {cards?.length === 0 && <p className="text-slate-600 text-sm py-4">No cards yet.</p>}
              </div>
            </section>
          </div>
        )}

        {tab === "customers" && (
          <section className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-600 border-b"><th className="py-2 font-medium">Account</th><th className="py-2 font-medium">Status</th><th className="py-2 font-medium">Joined</th><th className="py-2 font-medium">Properties</th></tr></thead>
              <tbody>
                {overview?.customers.map((c) => (
                  <tr key={c._id} className="border-b last:border-0 align-top">
                    <td className="py-2">{c.name}<div className="text-xs text-slate-500">{c.email}{c.role === "admin" ? " · admin" : ""}</div></td>
                    <td className="py-2">{c.status}</td>
                    <td className="py-2">{formatDate(c.createdAt)}</td>
                    <td className="py-2">
                      {c.properties.length === 0 ? <span className="text-slate-500">None</span> : c.properties.map((p) => (
                        <div key={p._id}>
                          <Link className="text-blue-700 underline" href={`/dashboard/property/${p._id}`}>{p.name}</Link>
                          <span className="text-slate-500"> · {p.rating?.toFixed(1) ?? "–"}★{p.linked ? " · Google linked" : ""}</span>
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {tab === "leads" && (
          <section className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
            {overview?.leads.length === 0 && <p className="text-slate-600 text-sm">No leads yet. They appear when a visitor asks for their audit by email.</p>}
            <table className="w-full text-sm">
              <tbody>
                {overview?.leads.map((l) => (
                  <tr key={l._id} className="border-b last:border-0">
                    <td className="py-2"><a className="text-blue-700 underline" href={`mailto:${l.email}`}>{l.email}</a></td>
                    <td className="py-2">{l.propertyName}<div className="text-xs text-slate-500">{l.address}</div></td>
                    <td className="py-2 tabular-nums">{l.rating?.toFixed(1) ?? "–"}★ · {l.totalReviews ?? 0} reviews · score {l.score ?? "–"}</td>
                    <td className="py-2 text-slate-500">{formatDate(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </main>
  )
}
