"use client"

import { Suspense } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useConvexAuth, useQuery } from "convex/react"
import { UserButton } from "@clerk/nextjs"
import { api } from "@/convex/_generated/api"
import { formatDate } from "@/lib/format"

function GoogleNotice() {
  const params = useSearchParams()
  const google = params.get("google")
  if (!google) return null
  const ok = google === "connected"
  return (
    <div className={`px-4 py-3 text-sm ${ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`} role="status">
      <div className="max-w-6xl mx-auto">
        {ok
          ? "Google connected. Open a property's Settings tab to link it to its Business Profile."
          : params.get("message") ?? "Could not connect Google."}
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth()
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip")
  const pathname = usePathname()

  const links = [
    { href: "/dashboard", label: "Properties" },
    { href: "/dashboard/billing", label: "Billing" },
    ...(me?.role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ]

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-6">
          <Link href="/dashboard" className="shrink-0">
            <Image src="/apt-reputation-logo-full-md.png" alt="APT Reputation" width={150} height={40} className="h-9 w-auto" priority />
          </Link>
          <nav className="flex gap-1 flex-1" aria-label="Main">
            {links.map((l) => {
              const active = l.href === "/dashboard" ? !pathname.startsWith("/dashboard/billing") : pathname.startsWith(l.href)
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${active ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:text-slate-900"}`}
                >
                  {l.label}
                </Link>
              )
            })}
          </nav>
          <UserButton />
        </div>
      </header>

      <Suspense fallback={null}>
        <GoogleNotice />
      </Suspense>

      {me && !me.subscribed && me.role !== "admin" && (
        <div className={`px-4 py-2.5 text-sm ${me.inTrial ? "bg-blue-50 text-blue-900" : "bg-amber-50 text-amber-900"}`}>
          <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {me.inTrial
                ? `Free trial until ${formatDate(me.trialEndsAt)}.`
                : "Your free trial has ended. Review syncing, AI drafts and replies are paused."}
            </span>
            <Link href="/dashboard/billing" className="font-semibold underline">
              {me.inTrial ? "Add billing" : "Subscribe to continue"}
            </Link>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 py-8">
        {me ? children : <p className="text-slate-500 py-16 text-center">Loading your account…</p>}
      </main>
    </div>
  )
}
