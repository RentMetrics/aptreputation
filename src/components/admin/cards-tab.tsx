"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { errorMessage, formatDate, timeAgo } from "@/lib/format"
import { PUBLIC_SITE } from "@/lib/pitch"

type PropertyOption = { _id: Id<"communities">; name: string; ownerEmail: string }
type Filter = "all" | "inventory" | "to-mail" | "mailed"

const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["inventory", "In inventory"],
  ["to-mail", "Assigned, not mailed"],
  ["mailed", "Mailed"],
]

export function CardsTab({ properties }: { properties: PropertyOption[] }) {
  const cards = useQuery(api.tags.adminInventory)
  const addCards = useMutation(api.tags.adminAddCards)
  const assign = useMutation(api.tags.adminAssign)
  const markShipped = useMutation(api.tags.adminMarkShipped)
  const release = useMutation(api.tags.adminRelease)
  const deleteCard = useMutation(api.tags.adminDelete)

  const [serials, setSerials] = useState("")
  const [blank, setBlank] = useState("")
  const [addMessage, setAddMessage] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  const [propertyId, setPropertyId] = useState("")
  const [count, setCount] = useState("3")
  const [selected, setSelected] = useState<Set<Id<"tags">>>(new Set())
  const [assigned, setAssigned] = useState<{ property: string; codes: string[] } | null>(null)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [rowError, setRowError] = useState<string | null>(null)

  const inInventory = useMemo(() => (cards ?? []).filter((c) => !c.communityId && !c.ownerId), [cards])
  const shown = useMemo(
    () =>
      (cards ?? []).filter((c) => {
        if (filter === "inventory") return !c.communityId
        if (filter === "to-mail") return !!c.communityId && !c.shippedAt
        if (filter === "mailed") return !!c.shippedAt
        return true
      }),
    [cards, filter],
  )
  const selectedCards = (cards ?? []).filter((c) => selected.has(c._id))

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError(null)
    setAddMessage(null)
    try {
      const list = serials.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
      const result = await addCards({ serials: list, blankCount: blank ? Number(blank) : 0 })
      setAddMessage(`Added ${result.added} card${result.added === 1 ? "" : "s"}${result.skipped ? `, skipped ${result.skipped} already in inventory` : ""}.`)
      setSerials("")
      setBlank("")
    } catch (err) {
      setAddError(errorMessage(err))
    }
  }

  const submitAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    setAssignError(null)
    setAssigned(null)
    const property = properties.find((p) => p._id === propertyId)
    if (!property) return
    try {
      const codes = await assign({
        communityId: property._id,
        ...(selected.size ? { tagIds: [...selected] } : { count: Number(count) }),
      })
      setAssigned({ property: property.name, codes })
      setSelected(new Set())
    } catch (err) {
      setAssignError(errorMessage(err))
    }
  }

  const act = async (fn: () => Promise<unknown>) => {
    setRowError(null)
    try {
      await fn()
    } catch (err) {
      setRowError(errorMessage(err))
    }
  }

  const toggle = (id: Id<"tags">) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const downloadCsv = () => {
    const rows = [["code", "link to write on the card", "serial", "status", "property", "customer", "mailed", "taps"]]
    for (const c of shown) {
      rows.push([
        c.code,
        `${PUBLIC_SITE}/t/${c.code}`,
        c.serial ?? "",
        c.shippedAt ? "mailed" : c.communityId ? "assigned" : "inventory",
        c.communityName ?? "",
        c.ownerEmail ?? "",
        c.shippedAt ? formatDate(c.shippedAt) : "",
        String(c.tapCount),
      ])
    }
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
    a.download = "nfc-cards.csv"
    a.click()
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6">
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-1">Send cards to a property</h2>
          <p className="text-sm text-slate-600 mb-3">
            Assign cards here, write each link onto its card, then mail them. An assigned card works right away:
            a tap opens that property&apos;s Google review form, and the customer sees it under Get reviews.
          </p>
          <form onSubmit={submitAssign} className="space-y-3">
            <div>
              <Label htmlFor="assign-property">Property</Label>
              <select
                id="assign-property"
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
                className="w-full h-9 border border-slate-300 rounded-md px-2 text-sm bg-white"
              >
                <option value="">Choose a property</option>
                {properties.map((p) => (
                  <option key={p._id} value={p._id}>{p.name} ({p.ownerEmail})</option>
                ))}
              </select>
              {properties.length === 0 && <p className="text-xs text-slate-500 mt-1">No customer has added a property yet.</p>}
            </div>
            {selected.size > 0 ? (
              <p className="text-sm text-slate-700">
                {selected.size} card{selected.size === 1 ? "" : "s"} ticked in the list:{" "}
                <span className="font-mono">{selectedCards.map((c) => c.code).join(", ")}</span>
              </p>
            ) : (
              <div>
                <Label htmlFor="assign-count">Number of cards</Label>
                <Input id="assign-count" type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} />
                <p className="text-xs text-slate-500 mt-1">
                  Takes the next cards from inventory ({inInventory.length} available), or tick specific cards in the list.
                </p>
              </div>
            )}
            <Button type="submit" disabled={!propertyId || (!selected.size && !Number(count))}>Assign cards</Button>
            {assignError && <p className="text-sm text-red-700" role="alert">{assignError}</p>}
          </form>
          {assigned && (
            <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm" role="status">
              <p className="font-medium text-emerald-900">
                {assigned.codes.length} card{assigned.codes.length === 1 ? "" : "s"} assigned to {assigned.property}. Write these links:
              </p>
              <ul className="mt-1 font-mono text-xs text-emerald-900 space-y-0.5">
                {assigned.codes.map((code) => <li key={code}>{PUBLIC_SITE}/t/{code}</li>)}
              </ul>
              <p className="mt-2 text-emerald-900">After they go in the mail, mark them mailed in the list.</p>
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-1">Add cards to inventory</h2>
          <p className="text-sm text-slate-600 mb-3">
            Each card gets a code and a link. Serial numbers are optional and help you tell cards apart.
          </p>
          <form onSubmit={submitAdd} className="space-y-3">
            <div>
              <Label htmlFor="serials">Card serial numbers (one per line)</Label>
              <textarea id="serials" rows={4} value={serials} onChange={(e) => setSerials(e.target.value)} placeholder={"04:C2:88:D2:5F:61:80\n04:A1:7B:D2:5F:61:81"} className="w-full border border-slate-300 rounded-md p-2 text-sm font-mono" />
            </div>
            <div>
              <Label htmlFor="blank">Or number of cards without serials</Label>
              <Input id="blank" type="number" min={0} max={500} value={blank} onChange={(e) => setBlank(e.target.value)} />
            </div>
            <Button type="submit" variant="outline" disabled={!serials.trim() && !Number(blank)}>Add to inventory</Button>
            {addMessage && <p className="text-sm text-emerald-800" role="status">{addMessage}</p>}
            {addError && <p className="text-sm text-red-700" role="alert">{addError}</p>}
          </form>
        </section>
      </div>

      <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 h-fit">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-lg font-semibold">Cards <span className="text-slate-500 font-normal tabular-nums">({shown.length})</span></h2>
          <div className="flex flex-wrap gap-2">
            {selected.size > 0 && selectedCards.every((c) => c.communityId && !c.shippedAt) && (
              <Button size="sm" onClick={() => act(async () => { await markShipped({ tagIds: [...selected], shipped: true }); setSelected(new Set()) })}>
                Mark {selected.size} as mailed
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={downloadCsv} disabled={!shown.length}>Download CSV</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {FILTERS.map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} aria-pressed={filter === key}
              className={`px-3 py-1 rounded-full text-sm border ${filter === key ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300"}`}>
              {label}
            </button>
          ))}
        </div>
        {rowError && <p className="text-sm text-red-700 mb-2" role="alert">{rowError}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600 border-b">
                <th className="py-2 w-8"><span className="sr-only">Select</span></th>
                <th className="py-2 font-medium">Code and link</th>
                <th className="py-2 font-medium">Where</th>
                <th className="py-2 font-medium text-right">Taps</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c._id} className="border-b last:border-0 align-top">
                  <td className="py-2">
                    <input type="checkbox" aria-label={`Select card ${c.code}`} checked={selected.has(c._id)} onChange={() => toggle(c._id)} className="h-4 w-4" />
                  </td>
                  <td className="py-2 font-mono">
                    {c.code}
                    <div className="text-xs text-slate-500">{PUBLIC_SITE}/t/{c.code}</div>
                    {c.serial && <div className="text-xs text-slate-500">{c.serial}</div>}
                  </td>
                  <td className="py-2">
                    {c.communityName ?? (c.ownerEmail ? "Claimed, not placed" : <span className="text-slate-500">In inventory</span>)}
                    {c.ownerEmail && <div className="text-xs text-slate-500">{c.ownerEmail}</div>}
                    {c.communityId && (
                      <div className={`text-xs ${c.shippedAt ? "text-emerald-800" : "text-amber-800"}`}>
                        {c.shippedAt ? `Mailed ${formatDate(c.shippedAt)}` : "Not mailed yet"}
                      </div>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {c.tapCount}
                    {c.lastTapAt ? <div className="text-xs text-slate-500">{timeAgo(c.lastTapAt)}</div> : null}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {c.communityId && (
                      <Button size="sm" variant="ghost" onClick={() => act(() => markShipped({ tagIds: [c._id], shipped: !c.shippedAt }))}>
                        {c.shippedAt ? "Undo mailed" : "Mark mailed"}
                      </Button>
                    )}
                    {c.ownerId && (
                      <Button size="sm" variant="ghost" onClick={() => confirm("Return this card to inventory? It will stop working for the customer.") && act(() => release({ tagId: c._id }))}>
                        Return
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-red-700" onClick={() => confirm(`Delete card ${c.code} permanently? Its link will stop working.`) && act(() => deleteCard({ tagId: c._id }))}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cards && shown.length === 0 && (
            <p className="text-slate-600 text-sm py-4">
              {filter === "all" ? "No cards yet. Add your first cards to inventory." : "No cards in this group."}
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
