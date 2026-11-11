"use client"

import Link from "next/link"
import { FunctionReturnType } from "convex/server"
import { api } from "@/convex/_generated/api"
import { formatDate, timeAgo } from "@/lib/format"

type Overview = FunctionReturnType<typeof api.admin.overview>

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-800 border-emerald-200",
  trialing: "bg-emerald-50 text-emerald-800 border-emerald-200",
  "free trial": "bg-blue-50 text-blue-800 border-blue-200",
  "trial ended": "bg-amber-50 text-amber-900 border-amber-200",
  admin: "bg-slate-100 text-slate-700 border-slate-200",
}

function StatusPill({ status }: { status: string }) {
  const label = status === "active" ? "Subscribed" : status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs border ${STATUS_STYLE[status] ?? "bg-red-50 text-red-800 border-red-200"}`}>
      {label}
    </span>
  )
}

function Change({ from, to, digits }: { from: number | null; to: number | null; digits: number }) {
  if (from === null || to === null) return null
  const diff = to - from
  if (Math.abs(diff) < 10 ** -digits / 2) return <span className="text-xs text-slate-500">no change</span>
  return (
    <span className={`text-xs tabular-nums ${diff > 0 ? "text-emerald-800" : "text-red-700"}`}>
      {diff > 0 ? "+" : "−"}{Math.abs(diff).toFixed(digits)} since joining
    </span>
  )
}

export function AccountsTab({ accounts }: { accounts: Overview["accounts"] }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-600 border-b">
            <th className="py-2 font-medium">Person</th>
            <th className="py-2 font-medium">Status</th>
            <th className="py-2 font-medium">Signed up</th>
            <th className="py-2 font-medium">Properties</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a._id} className="border-b last:border-0 align-top">
              <td className="py-2.5 pr-3">
                <span className="font-medium">{a.name}</span>
                <div className="text-xs text-slate-500"><a href={`mailto:${a.email}`} className="hover:underline">{a.email}</a></div>
              </td>
              <td className="py-2.5 pr-3">
                <StatusPill status={a.status} />
                {a.status === "free trial" && <div className="text-xs text-slate-500 mt-0.5">ends {formatDate(a.trialEndsAt)}</div>}
              </td>
              <td className="py-2.5 pr-3 whitespace-nowrap">{formatDate(a.createdAt)}</td>
              <td className="py-2.5">
                {a.owns.length === 0 && a.worksOn.length === 0 && <span className="text-slate-500">None yet</span>}
                {a.owns.map((p) => (
                  <div key={p._id}>
                    <Link className="text-blue-700 hover:underline" href={`/dashboard/property/${p._id}`}>{p.name}</Link>
                    <span className="text-slate-500"> · owner</span>
                  </div>
                ))}
                {a.worksOn.map((p) => (
                  <div key={p._id}>
                    <Link className="text-blue-700 hover:underline" href={`/dashboard/property/${p._id}`}>{p.name}</Link>
                    <span className="text-slate-500"> · {p.role === "manager" ? "manager" : "team member"}</span>
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {accounts.length === 0 && <p className="text-slate-600 text-sm py-4">Nobody has signed up yet.</p>}
    </section>
  )
}

export function PropertiesTab({ properties }: { properties: Overview["properties"] }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-600 border-b">
            <th className="py-2 font-medium">Property</th>
            <th className="py-2 font-medium">Account and team</th>
            <th className="py-2 font-medium">Rating</th>
            <th className="py-2 font-medium">Reviews</th>
            <th className="py-2 font-medium">Google</th>
            <th className="py-2 font-medium text-right">Cards</th>
            <th className="py-2 font-medium text-right">Taps</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((p) => (
            <tr key={p._id} className="border-b last:border-0 align-top">
              <td className="py-2.5 pr-3">
                <Link className="font-medium text-blue-700 hover:underline" href={`/dashboard/property/${p._id}`}>{p.name}</Link>
                <div className="text-xs text-slate-500">{p.address}</div>
                <div className="text-xs text-slate-500">Added {formatDate(p.createdAt)}</div>
              </td>
              <td className="py-2.5 pr-3">
                {p.ownerName} <StatusPill status={p.ownerStatus} />
                <div className="text-xs text-slate-500">{p.ownerEmail}</div>
                {p.team.map((m) => (
                  <div key={m.email} className="text-xs text-slate-500">
                    {m.email} · {m.role === "manager" ? "manager" : "team member"}{m.joined ? "" : " · invited"}
                  </div>
                ))}
              </td>
              <td className="py-2.5 pr-3 whitespace-nowrap">
                <span className="font-semibold tabular-nums">{p.rating?.toFixed(1) ?? "–"}</span>
                <div><Change from={p.baselineRating} to={p.rating} digits={1} /></div>
              </td>
              <td className="py-2.5 pr-3 whitespace-nowrap">
                <span className="tabular-nums">{p.totalReviews?.toLocaleString("en-US") ?? "–"}</span>
                <div><Change from={p.baselineReviews} to={p.totalReviews} digits={0} /></div>
              </td>
              <td className="py-2.5 pr-3">
                {p.linked ? <span className="text-emerald-800">Profile linked</span> : <span className="text-slate-500">Public reviews only</span>}
                {p.lastSyncAt && <div className="text-xs text-slate-500">checked {timeAgo(p.lastSyncAt)}</div>}
                {p.lastSyncError && <div className="text-xs text-red-700 max-w-48">{p.lastSyncError}</div>}
              </td>
              <td className="py-2.5 pr-3 text-right tabular-nums">
                {p.cards}
                {p.cards > 0 && <div className="text-xs text-slate-500">{p.cardsMailed} mailed</div>}
              </td>
              <td className="py-2.5 text-right tabular-nums">{p.taps}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {properties.length === 0 && <p className="text-slate-600 text-sm py-4">No customer has added a property yet.</p>}
    </section>
  )
}

export function LeadsTab({ leads }: { leads: Overview["leads"] }) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
      {leads.length === 0 && <p className="text-slate-600 text-sm">No leads yet. They appear when a visitor asks for their audit by email.</p>}
      <table className="w-full text-sm">
        <tbody>
          {leads.map((l) => (
            <tr key={l._id} className="border-b last:border-0">
              <td className="py-2"><a className="text-blue-700 underline" href={`mailto:${l.email}`}>{l.email}</a></td>
              <td className="py-2">{l.propertyName}<div className="text-xs text-slate-500">{l.address}</div></td>
              <td className="py-2 tabular-nums">{l.rating?.toFixed(1) ?? "–"} stars, {l.totalReviews ?? 0} reviews, score {l.score ?? "–"}</td>
              <td className="py-2 text-slate-500">{formatDate(l.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
