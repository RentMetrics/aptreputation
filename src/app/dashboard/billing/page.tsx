"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useAction, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { errorMessage, formatDate } from "@/lib/format"

function CheckoutNotice() {
  const params = useSearchParams()
  if (params.get("checkout") !== "success") return null
  return (
    <p className="bg-emerald-50 text-emerald-900 rounded-lg px-4 py-3 text-sm mb-4" role="status">
      Thank you. Your subscription will show as active here within a minute.
    </p>
  )
}

export default function BillingPage() {
  const me = useQuery(api.users.me)
  const properties = useQuery(api.communities.list)
  const checkout = useAction(api.billing.createCheckout)
  const portal = useAction(api.billing.createPortal)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const go = async (fn: () => Promise<string>) => {
    setError(null)
    setBusy(true)
    try {
      window.location.href = await fn()
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  if (!me) return null
  const count = Math.max(1, properties?.length ?? 1)

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Billing</h1>
      <Suspense fallback={null}><CheckoutNotice /></Suspense>

      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold">AptReputation</h2>
          <p><span className="text-3xl font-bold">$99</span> <span className="text-slate-600">per property / month</span></p>
        </div>
        <ul className="mt-4 text-sm text-slate-700 space-y-1.5 list-disc pl-5">
          <li>Every Google review in one inbox, with AI reply drafts you approve</li>
          <li>Resident insights and an action plan for each property</li>
          <li>NFC cards, QR codes and links with tap tracking</li>
          <li>Team profiles built from the reviews that name your staff</li>
        </ul>

        <div className="mt-6 pt-5 border-t">
          {me.subscribed ? (
            <>
              <p className="font-medium text-emerald-800">
                Subscription {me.subscriptionStatus === "trialing" ? "in trial" : "active"} · billed for {count} propert{count === 1 ? "y" : "ies"}
              </p>
              <Button className="mt-3" variant="outline" disabled={busy} onClick={() => go(() => portal({}))}>
                Manage payment method and invoices
              </Button>
            </>
          ) : (
            <>
              <p className="text-slate-700">
                {me.role === "admin"
                  ? "Admin account: all features are on without a subscription."
                  : me.inTrial
                    ? `Your free trial runs until ${formatDate(me.trialEndsAt)}.`
                    : "Your free trial has ended."}
                {me.subscriptionStatus ? ` Last subscription status: ${me.subscriptionStatus}.` : ""}
              </p>
              <Button className="mt-3" disabled={busy} onClick={() => go(() => checkout({}))}>
                {busy ? "Opening checkout…" : `Subscribe · $${99 * count}/month for ${count} propert${count === 1 ? "y" : "ies"}`}
              </Button>
              <p className="text-xs text-slate-500 mt-2">The amount updates automatically when you add or remove properties.</p>
            </>
          )}
          {error && <p className="text-sm text-red-700 mt-3" role="alert">{error}</p>}
        </div>
      </section>
    </div>
  )
}
