"use client"

import { useCallback, useEffect, useState } from "react"
import { useAction } from "convex/react"
import { RefreshCw } from "lucide-react"
import { api } from "@/convex/_generated/api"
import type { RevenueReport } from "@/convex/billing"
import { Button } from "@/components/ui/button"
import { errorMessage, formatDate } from "@/lib/format"

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n % 1 ? 2 : 0 })

const PLAN_PILL: Record<string, string> = {
  Paying: "bg-emerald-50 text-emerald-900 border-emerald-200",
  "Paid trial": "bg-blue-50 text-blue-900 border-blue-200",
  "Past due": "bg-red-50 text-red-900 border-red-200",
  "Free trial": "bg-blue-50 text-blue-900 border-blue-200",
  "Free account": "bg-slate-50 text-slate-700 border-slate-200",
  Admin: "bg-slate-50 text-slate-700 border-slate-200",
}

/** Clients, what each pays, and what the business has collected. Read live from Stripe. */
export function RevenueTab() {
  const load = useAction(api.billing.revenue)
  const [data, setData] = useState<RevenueReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setData(await load({}))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [load])
  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Read live from Stripe each time this tab opens.</p>
        <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={busy}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${busy ? "animate-spin" : ""}`} />{busy ? "Reading Stripe…" : "Refresh"}
        </Button>
      </div>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {data?.stripeError && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="alert">
          Stripe could not be read, so payments show as zero: {data.stripeError}
        </p>
      )}
      {data && (
        <>
          <div className="grid gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Monthly recurring revenue", money(data.mrr)],
              ["Paying accounts", String(data.payingAccounts)],
              ["Paying properties", String(data.payingProperties)],
              ["Collected this month", money(data.collectedThisMonth)],
              ["Collected all time", money(data.collectedAllTime)],
            ].map(([label, value]) => (
              <div key={label} className="bg-white p-4">
                <p className="text-sm text-slate-600">{label}</p>
                <p className="text-2xl font-semibold tabular-nums mt-1">{value}</p>
              </div>
            ))}
          </div>
          <section className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600 border-b">
                  <th className="py-2 pr-3 font-medium">Client</th>
                  <th className="py-2 pr-3 font-medium">Plan</th>
                  <th className="py-2 pr-3 font-medium text-right">Properties</th>
                  <th className="py-2 pr-3 font-medium text-right">Pays a month</th>
                  <th className="py-2 pr-3 font-medium">Next bill</th>
                  <th className="py-2 pr-3 font-medium text-right">Paid to date</th>
                  <th className="py-2 font-medium">Last payment</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((a) => (
                  <tr key={a._id} className="border-b last:border-0 align-top">
                    <td className="py-2.5 pr-3">
                      <span className="font-medium">{a.name}</span>
                      <div className="text-xs text-slate-500">{a.email}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={`whitespace-nowrap text-xs font-semibold border rounded-full px-2 py-0.5 ${PLAN_PILL[a.plan] ?? "bg-amber-50 text-amber-900 border-amber-200"}`}>{a.plan}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{a.properties}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">
                      {a.monthly === null ? "–" : money(a.monthly)}
                      {a.discounted && <div className="text-xs text-slate-500">discount applied</div>}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">{a.nextBill ? formatDate(a.nextBill * 1000) : "–"}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{money(a.paidToDate)}</td>
                    <td className="py-2.5 whitespace-nowrap">{a.lastPaid ? formatDate(a.lastPaid) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  )
}
