"use client"

import { Suspense, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useAction, useMutation } from "convex/react"
import { BadgeCheck, BarChart3, CheckCircle, MessageSquareReply, Nfc, Search } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Stars } from "@/components/stars"
import { errorMessage } from "@/lib/format"

type Audit = {
  placeId: string
  name: string
  address: string
  rating: number | null
  totalReviews: number
  score: number | null
  sampleSize: number
  recentNegative: number
  summary: string | null
  praised: string[]
  concerns: string[]
}

function InactiveCardNotice() {
  const params = useSearchParams()
  if (params.get("card") !== "inactive") return null
  return (
    <p className="bg-amber-50 text-amber-900 text-sm text-center px-4 py-3" role="status">
      That review card isn&apos;t set up yet. If you manage this property, sign in and add the card under Get reviews.
    </p>
  )
}

const FEATURES = [
  {
    icon: MessageSquareReply,
    title: "Answer every review",
    body: "All your Google reviews in one inbox. AI drafts a reply to each one; you edit, approve and post it without leaving the page.",
  },
  {
    icon: Nfc,
    title: "Get more reviews",
    body: "NFC cards and QR codes take a resident straight to your Google review form. See which cards get tapped and what follows.",
  },
  {
    icon: BarChart3,
    title: "Know what residents say",
    body: "Maintenance, office staff, noise, parking: see which topics drive your rating, with a short action plan for the on-site team.",
  },
  {
    icon: BadgeCheck,
    title: "Credit your people",
    body: "When a review names Maria in the office or Carlos in maintenance, it goes on their profile: a one-page record of resident praise they can share.",
  },
]

export default function Home() {
  const runAudit = useAction(api.audit.run)
  const saveLead = useMutation(api.audit.saveLead)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [audit, setAudit] = useState<Audit | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [leadState, setLeadState] = useState<"idle" | "saving" | "saved">("idle")
  const [leadError, setLeadError] = useState<string | null>(null)

  const search = async (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim().length < 3) return
    setLoading(true)
    setError(null)
    setAudit(null)
    setLeadState("idle")
    try {
      const result = await runAudit({ query })
      if (result) setAudit(result)
      else setError("We couldn't find that property on Google. Try the full name and city.")
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
      setOpen(true)
    }
  }

  const sendLead = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!audit) return
    setLeadError(null)
    setLeadState("saving")
    try {
      await saveLead({
        email,
        propertyName: audit.name,
        address: audit.address,
        placeId: audit.placeId,
        rating: audit.rating ?? undefined,
        totalReviews: audit.totalReviews,
        score: audit.score ?? undefined,
      })
      setLeadState("saved")
    } catch (err) {
      setLeadError(errorMessage(err))
      setLeadState("idle")
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Suspense fallback={null}><InactiveCardNotice /></Suspense>

      <header className="border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Image src="/apt-reputation-logo-full-md.png" alt="APT Reputation" width={160} height={42} className="h-9 w-auto" priority />
          <nav className="flex items-center gap-2" aria-label="Account">
            <Link href="/sign-in" className="px-3 py-2 text-sm font-medium text-slate-700 hover:text-slate-900">Sign in</Link>
            <Button asChild><Link href="/sign-up">Start free trial</Link></Button>
          </nav>
        </div>
      </header>

      <section className="bg-gradient-to-b from-blue-50 to-white px-4 py-20">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
            Your apartment community&apos;s Google reviews, managed in one place
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 mt-5">
            Reply to every review, earn more of them, see what residents are telling you, and give your on-site team credit for the praise they earn.
          </p>

          <form onSubmit={search} className="mt-10 bg-white rounded-2xl shadow-lg border border-slate-200 p-6 text-left">
            <label htmlFor="audit" className="block font-semibold text-lg">Free reputation check</label>
            <p className="text-slate-600 text-sm mb-3">Enter a property to see its rating, review volume and what the latest reviewers said.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input id="audit" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Property name and city" className="h-12 text-base flex-1" />
              <Button type="submit" disabled={loading || query.trim().length < 3} className="h-12 px-6 text-base">
                <Search className="h-5 w-5 mr-2" />{loading ? "Checking…" : "Check my property"}
              </Button>
            </div>
          </form>
        </div>
      </section>

      <section className="px-4 py-20">
        <div className="max-w-6xl mx-auto grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title}>
              <div className="h-11 w-11 rounded-xl bg-blue-600 text-white flex items-center justify-center mb-4">
                <f.icon className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-semibold mb-1.5">{f.title}</h2>
              <p className="text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-slate-50 px-4 py-20">
        <div className="max-w-5xl mx-auto grid gap-10 md:grid-cols-2 items-center">
          <div>
            <h2 className="text-3xl font-bold mb-4">A review card for every team member</h2>
            <p className="text-slate-600 mb-5">
              After a finished work order or a smooth move-in, your tech or leasing agent holds out their card.
              One tap opens your Google review form on the resident&apos;s phone. No app, no searching.
            </p>
            <ul className="space-y-2.5 text-slate-800">
              {[
                "Each card is tied to one person, so their taps are counted",
                "QR codes and links for flyers, door hangers and texts",
                "Reviews that follow a tap show up next to the person who asked",
                "Everyone is asked the same way, as Google requires",
              ].map((line) => (
                <li key={line} className="flex gap-2"><CheckCircle className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />{line}</li>
              ))}
            </ul>
          </div>
          <Image src="/aptreputation_card_image.png" alt="An APT Reputation NFC review card" width={520} height={360} className="rounded-2xl shadow-lg w-full h-auto" />
        </div>
      </section>

      <section className="px-4 py-20" id="pricing">
        <div className="max-w-md mx-auto text-center border border-slate-200 rounded-2xl p-8 shadow-sm">
          <h2 className="text-2xl font-bold">One plan</h2>
          <p className="mt-3"><span className="text-5xl font-bold">$99</span><span className="text-slate-600"> per property / month</span></p>
          <p className="text-slate-600 mt-3">Review inbox with AI reply drafts, insights, NFC and QR tracking, and team profiles. 14-day free trial, no card needed.</p>
          <Button asChild className="mt-6 h-12 px-8 text-base"><Link href="/sign-up">Start free trial</Link></Button>
        </div>
      </section>

      <footer className="border-t border-slate-200 px-4 py-8 text-sm text-slate-500 text-center">
        © {new Date().getFullYear()} APT Reputation
      </footer>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          {error && (
            <DialogHeader>
              <DialogTitle>We couldn&apos;t run that check</DialogTitle>
              <DialogDescription>{error}</DialogDescription>
            </DialogHeader>
          )}
          {audit && (
            <>
              <DialogHeader>
                <DialogTitle>{audit.name}</DialogTitle>
                <DialogDescription>{audit.address}</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-sm text-slate-600">Google rating</p>
                  <p className="text-3xl font-bold tabular-nums">{audit.rating?.toFixed(1) ?? "–"}</p>
                  <Stars rating={audit.rating ?? 0} />
                  <p className="text-sm text-slate-600 mt-1">{audit.totalReviews} reviews</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-sm text-slate-600">AptReputation Score</p>
                  <p className="text-3xl font-bold tabular-nums">{audit.score ?? "–"}<span className="text-base font-normal text-slate-500"> / 100</span></p>
                  <p className="text-xs text-slate-500 mt-1">Rating, review volume, and how the newest reviews rate you.</p>
                </div>
              </div>
              {audit.summary && <p className="text-slate-800">{audit.summary}</p>}
              {(audit.praised.length > 0 || audit.concerns.length > 0) && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-semibold mb-1">Residents praise</p>
                    <ul className="list-disc pl-5 text-slate-700">{audit.praised.map((p) => <li key={p}>{p}</li>)}</ul>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">Residents raise</p>
                    <ul className="list-disc pl-5 text-slate-700">{audit.concerns.map((c) => <li key={c}>{c}</li>)}</ul>
                  </div>
                </div>
              )}
              <p className="text-sm text-slate-600">
                This check reads the {audit.sampleSize} newest reviews Google shows publicly
                {audit.recentNegative > 0 ? `, ${audit.recentNegative} of them 1 or 2 stars` : ""}.
                A free trial loads all {audit.totalReviews} once you connect your Business Profile.
              </p>
              <Button asChild className="h-11"><Link href="/sign-up">Start free trial</Link></Button>
              {leadState === "saved" ? (
                <p className="text-sm text-emerald-800" role="status">Thanks. We&apos;ll be in touch about {audit.name}.</p>
              ) : (
                <form onSubmit={sendLead} className="border-t pt-4">
                  <label htmlFor="lead-email" className="text-sm font-medium">Not ready? Have us follow up about this property.</label>
                  <div className="flex gap-2 mt-2">
                    <Input id="lead-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
                    <Button type="submit" variant="outline" disabled={leadState === "saving"}>Send</Button>
                  </div>
                  {leadError && <p className="text-sm text-red-700 mt-2" role="alert">{leadError}</p>}
                </form>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
