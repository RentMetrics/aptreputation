"use client"

import { useState } from "react"
import Link from "next/link"
import { useConvexAuth, useQuery } from "convex/react"
import { ArrowLeft } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { CardsTab } from "@/components/admin/cards-tab"
import { ProspectsTab } from "@/components/admin/prospects-tab"
import { AccountsTab, LeadsTab, PropertiesTab } from "@/components/admin/tracker-tabs"

const TABS = [
  ["accounts", "Accounts"],
  ["properties", "Properties"],
  ["cards", "NFC cards"],
  ["prospects", "Marketing list"],
  ["leads", "Audit leads"],
] as const
type Tab = (typeof TABS)[number][0]

export default function AdminPage() {
  const { isAuthenticated } = useConvexAuth()
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip")
  const isAdmin = me?.role === "admin"
  const overview = useQuery(api.admin.overview, isAdmin ? {} : "skip")
  const [tab, setTab] = useState<Tab>("accounts")

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

  const t = overview?.totals
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Link href="/dashboard" className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-4">
          <ArrowLeft className="h-4 w-4 mr-1" />Dashboard
        </Link>
        <h1 className="font-display text-3xl font-bold mb-4">Admin</h1>

        {t && (
          <dl className="grid grid-cols-2 md:grid-cols-5 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden mb-6">
            {[
              ["Accounts", t.accounts],
              ["Subscribed", t.subscribed],
              ["Properties", t.properties],
              ["Google profile linked", t.linked],
              ["Invitations waiting", t.invitesPending],
            ].map(([label, value]) => (
              <div key={label} className="bg-white p-4">
                <dt className="text-sm text-slate-600">{label}</dt>
                <dd className="text-2xl font-semibold tabular-nums mt-0.5">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="border-b border-slate-200 mb-6 flex gap-1 overflow-x-auto" role="tablist">
          {TABS.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-600"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "accounts" && overview && <AccountsTab accounts={overview.accounts} />}
        {tab === "properties" && overview && <PropertiesTab properties={overview.properties} />}
        {tab === "cards" && <CardsTab properties={overview?.properties ?? []} />}
        {tab === "prospects" && <ProspectsTab />}
        {tab === "leads" && overview && <LeadsTab leads={overview.leads} />}
      </div>
    </main>
  )
}
