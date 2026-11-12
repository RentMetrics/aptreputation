"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useAction, useMutation } from "convex/react"
import { CheckCircle, MessageSquareReply, Nfc, Search } from "lucide-react"
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

const STEPS = [
  {
    title: "Mark your starting point",
    body: "The day you add a property we record its Google rating and review count. Everything after is measured against that line.",
  },
  {
    title: "Answer every review",
    body: "New reviews reach your team by email. AI drafts a reply to each one; a manager edits it and posts it to Google.",
  },
  {
    title: "Ask at the right moment",
    body: "After a finished work order or a smooth move-in, staff hold out a tap card. One tap opens your Google review form.",
  },
  {
    title: "Watch the rating move",
    body: "See 4 and 5 star reviews per month, your reply rate, and how far the rating has come since you joined.",
  },
]

const ROLES = [
  {
    who: "Owners and asset managers",
    what: "See every property's rating against the day it joined, and which ones have reviews going unanswered.",
  },
  {
    who: "Property managers",
    what: "Connect the Google Business Profile once. After that your whole team replies from AptReputation, with no Google logins to share.",
  },
  {
    who: "Leasing and maintenance",
    what: "Carry a tap card, ask residents for a review, and build a profile of the praise that names you.",
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

  const check = async (text: string) => {
    if (text.trim().length < 3) return
    setLoading(true)
    setError(null)
    setAudit(null)
    setLeadState("idle")
    try {
      const result = await runAudit({ query: text })
      if (result) setAudit(result)
      else setError("We couldn't find that property on Google. Try the full name and city.")
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
      setOpen(true)
    }
  }

  const search = (e: React.FormEvent) => {
    e.preventDefault()
    void check(query)
  }

  // Outreach links arrive as /?audit=<property name and city> and open the
  // audit for that property straight away.
  const linked = useRef(false)
  useEffect(() => {
    if (linked.current) return
    linked.current = true
    const wanted = new URLSearchParams(window.location.search).get("audit")?.slice(0, 200)
    if (!wanted) return
    setQuery(wanted)
    void check(wanted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    <div className="min-h-screen bg-paper text-ink">
      <Suspense fallback={null}><InactiveCardNotice /></Suspense>

      <header className="bg-white border-b border-line">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <Image src="/apt-reputation-logo-full-md.png" alt="APT Reputation" width={160} height={42} className="h-9 w-auto" priority />
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Site">
            <a href="#how" className="hidden sm:block px-3 py-2 text-sm font-medium text-muted hover:text-ink">How it works</a>
            <a href="#pricing" className="hidden sm:block px-3 py-2 text-sm font-medium text-muted hover:text-ink">Pricing</a>
            <Link href="/sign-in" className="px-3 py-2 text-sm font-medium text-muted hover:text-ink">Sign in</Link>
            <Button asChild><Link href="/sign-up">Start free trial</Link></Button>
          </nav>
        </div>
      </header>

      {/* Hero: the promise on the left, what progress looks like on the right */}
      <section className="bg-ink text-white">
        <div className="max-w-6xl mx-auto px-5 py-16 lg:py-24 grid gap-12 lg:grid-cols-[1.1fr_0.9fr] items-center">
          <div>
            <h1 className="font-display font-extrabold text-[2.6rem] leading-[1.02] sm:text-6xl lg:text-[4.25rem] tracking-tight">
              Raise your community&apos;s Google rating. Then prove it.
            </h1>
            <p className="text-lg sm:text-xl text-blue-200 mt-6 max-w-xl leading-relaxed">
              AptReputation helps on-site teams earn more 4 and 5 star reviews, answer every one,
              and shows owners exactly how far each property has come since day one.
            </p>

            <form onSubmit={search} className="mt-9 max-w-xl">
              <label htmlFor="audit" className="block text-sm font-semibold text-white mb-2">
                See where your property stands today
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <Input
                  id="audit"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Property name and city"
                  className="h-13 text-base flex-1 bg-white text-ink border-0 placeholder:text-slate-400"
                />
                <Button type="submit" disabled={loading || query.trim().length < 3} className="h-13 px-6 text-base bg-star text-ink hover:bg-star/90 font-semibold disabled:opacity-100">
                  <Search className="h-5 w-5 mr-1" />{loading ? "Checking…" : "Check my property"}
                </Button>
              </div>
              <p className="text-sm text-blue-200 mt-2.5">Free. Reads the property&apos;s public Google reviews. No sign-up.</p>
            </form>
          </div>

          {/* An example of the product's own progress view, built from its real parts */}
          <div className="relative" aria-label="Example: one community's first 90 days">
            <div className="settle bg-white text-ink rounded-2xl p-6 shadow-2xl shadow-black/30">
              <p className="text-sm font-medium text-muted">Example community, first 90 days</p>
              <div className="flex items-end gap-4 mt-3">
                <div>
                  <p className="text-sm text-muted">Joined at</p>
                  <p className="font-display text-4xl font-bold text-slate-400 tabular-nums leading-none">4.1</p>
                </div>
                <svg viewBox="0 0 120 40" className="h-10 flex-1 mb-1" aria-hidden>
                  <path d="M2 34 C 30 34, 40 22, 62 18 S 100 6, 118 5" fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" />
                  <circle cx="118" cy="5" r="4.5" fill="var(--brand)" stroke="#fff" strokeWidth="2" />
                </svg>
                <div className="text-right">
                  <p className="text-sm text-muted">Today</p>
                  <p className="font-display text-6xl font-extrabold tabular-nums leading-none">4.4</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-line">
                <Stars rating={4.4} size={20} />
                <p className="text-sm font-semibold text-gain">+0.3 stars, +47 reviews</p>
              </div>
            </div>

            <div className="settle settle-2 bg-white text-ink rounded-2xl p-5 shadow-2xl shadow-black/30 mt-4 ml-6 sm:ml-12">
              <div className="flex items-center gap-2 text-sm">
                <Stars rating={5} size={14} />
                <span className="font-semibold">Danielle R.</span>
                <span className="text-muted">2 hours ago</span>
              </div>
              <p className="mt-2 text-[0.95rem] leading-relaxed">
                &ldquo;Carlos fixed our AC the same afternoon we called. Best maintenance team we&apos;ve had.&rdquo;
              </p>
              <p className="mt-3 text-sm text-muted flex items-center gap-1.5">
                <Nfc className="h-4 w-4 text-brand" />Posted after a tap on Carlos&apos;s card
              </p>
            </div>

            <div className="settle settle-3 bg-brand text-white rounded-2xl rounded-tl-sm p-4 mt-3 ml-12 sm:ml-24 text-sm leading-relaxed shadow-xl shadow-black/20">
              <p className="font-semibold mb-1 flex items-center gap-1.5"><MessageSquareReply className="h-4 w-4" />Reply drafted, waiting for your OK</p>
              Thank you, Danielle. A same-day AC repair is exactly what we aim for, and we&apos;ll make sure Carlos sees this…
            </div>
          </div>
        </div>
      </section>

      {/* How it works: a real sequence, so it is numbered */}
      <section id="how" className="max-w-6xl mx-auto px-5 py-20">
        <h2 className="font-display text-3xl sm:text-4xl font-bold max-w-2xl">From your rating today to a better one, in four steps</h2>
        <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="border-t-2 border-ink pt-5">
              <span className="font-display text-5xl font-extrabold text-brand tabular-nums leading-none">{i + 1}</span>
              <h3 className="text-xl font-semibold mt-4 mb-2">{step.title}</h3>
              <p className="text-muted leading-relaxed">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Tap cards */}
      <section className="bg-white border-y border-line">
        <div className="max-w-6xl mx-auto px-5 py-20 grid gap-12 md:grid-cols-2 items-center">
          <Image
            src="/aptreputation_card_image.png"
            alt="A leasing agent holds a review card next to a resident's phone, which opens the community's Google review form"
            width={560}
            height={560}
            className="rounded-3xl w-full h-auto max-h-[30rem] object-cover"
          />
          <div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold">A review card for every person on your team</h2>
            <p className="text-lg text-muted mt-4 leading-relaxed">
              The best time to ask is right after you&apos;ve helped. One tap on a resident&apos;s phone opens your
              Google review form. No app, no searching for the listing.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Each card is tied to one person, so their taps are counted",
                "QR codes and links for flyers, door hangers and texts",
                "Reviews that follow a tap show up beside the person who asked",
                "Everyone is asked the same way, as Google requires",
              ].map((line) => (
                <li key={line} className="flex gap-2.5"><CheckCircle className="h-5 w-5 text-gain shrink-0 mt-0.5" />{line}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Staff profile */}
      <section className="max-w-6xl mx-auto px-5 py-20 grid gap-12 md:grid-cols-2 items-center">
        <div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold">Praise that follows your people</h2>
          <p className="text-lg text-muted mt-4 leading-relaxed">
            When a review names Maria in the office or Carlos in maintenance, it goes on their profile:
            a one-page record of what residents said about their work. They can share it with you, an owner,
            or their next employer.
          </p>
          <p className="text-muted mt-4 leading-relaxed">
            Managers confirm each match, and only positive reviews appear on a shared profile.
          </p>
        </div>
        <div className="bg-white rounded-3xl border border-line overflow-hidden max-w-md md:ml-auto w-full" aria-label="Example staff profile">
          <div className="bg-ink text-white p-6">
            <p className="text-sm text-blue-200">Maintenance</p>
            <p className="font-display text-2xl font-bold mt-0.5">Carlos Rivera</p>
            <p className="text-blue-200 text-sm mt-1">Maintenance Supervisor, 3 years at this community</p>
          </div>
          <div className="p-6">
            <dl className="grid grid-cols-2 gap-3">
              <div className="bg-paper rounded-xl p-3.5">
                <dd className="font-display text-3xl font-bold tabular-nums">23</dd>
                <dt className="text-sm text-muted">reviews praise him by name</dt>
              </div>
              <div className="bg-paper rounded-xl p-3.5">
                <dd className="font-display text-3xl font-bold tabular-nums">4.9</dd>
                <dt className="text-sm text-muted">average rating when named</dt>
              </div>
            </dl>
            <blockquote className="mt-5 border-l-4 border-star pl-4 text-[0.95rem] leading-relaxed">
              &ldquo;Carlos came out on a Sunday when our water heater failed. Polite, fast, and he explained everything.&rdquo;
              <footer className="text-sm text-muted mt-1.5 flex items-center gap-2"><Stars rating={5} size={13} />Google review</footer>
            </blockquote>
            <p className="text-xs text-muted mt-4">Example profile.</p>
          </div>
        </div>
      </section>

      {/* Who does what */}
      <section className="bg-white border-y border-line">
        <div className="max-w-6xl mx-auto px-5 py-20">
          <h2 className="font-display text-3xl sm:text-4xl font-bold max-w-2xl">One property, the whole team on it</h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {ROLES.map((r) => (
              <div key={r.who}>
                <h3 className="text-xl font-semibold mb-2">{r.who}</h3>
                <p className="text-muted leading-relaxed">{r.what}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="max-w-6xl mx-auto px-5 py-20 grid gap-10 md:grid-cols-[1fr_auto] items-center">
        <div>
          <h2 className="font-display text-3xl sm:text-4xl font-bold">One plan, per property</h2>
          <p className="text-lg text-muted mt-4 max-w-xl leading-relaxed">
            Review inbox with AI reply drafts, email alerts, resident insights, tap cards and QR codes with tracking,
            team profiles, and progress reporting. Invite as many teammates as you need.
          </p>
        </div>
        <div className="bg-ink text-white rounded-3xl p-8 md:min-w-80">
          <p className="font-display text-6xl font-extrabold tabular-nums leading-none">$99</p>
          <p className="text-blue-200 mt-2">per property, per month</p>
          <Button asChild className="mt-6 h-12 w-full text-base bg-star text-ink hover:bg-star/90 font-semibold"><Link href="/sign-up">Start free trial</Link></Button>
          <p className="text-sm text-blue-200 mt-3">14 days free. No card needed.</p>
        </div>
      </section>

      <footer className="border-t border-line bg-white py-8 text-sm text-muted">
        <div className="max-w-6xl mx-auto px-5 flex flex-wrap items-center justify-between gap-3">
          <span>
            © {new Date().getFullYear()} Apartment Reputation (AptReputation) ·{" "}
            <a href="mailto:contact@aptreputation.com" className="hover:text-ink underline">contact@aptreputation.com</a>
          </span>
          <span className="flex gap-5">
            <Link href="/privacy" className="hover:text-ink underline">Privacy</Link>
            <Link href="/terms" className="hover:text-ink underline">Terms</Link>
          </span>
        </div>
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
                A free trial tracks every new review from the day you join, drafts replies, and shows what to fix first.
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
