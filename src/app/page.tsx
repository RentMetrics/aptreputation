"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useAction } from "convex/react"
import { CheckCircle, MessageSquareReply, Nfc, Search } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Stars } from "@/components/stars"
import { AuditResultBody, type Audit } from "@/components/audit-result"
import { LIST_PRICE, PROMO, promoActive } from "@/convex/lib/promo"
import { errorMessage } from "@/lib/format"

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
    body: "The day you add a property we record its Google rating and review count, and ask the AI assistants about it. Everything after is measured against that line.",
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
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [audit, setAudit] = useState<Audit | null>(null)
  const [error, setError] = useState<string | null>(null)

  const check = async (text: string) => {
    if (text.trim().length < 3) return
    setLoading(true)
    setError(null)
    setAudit(null)
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


  return (
    <div className="min-h-screen bg-paper text-ink">
      <Suspense fallback={null}><InactiveCardNotice /></Suspense>

      <header className="bg-white border-b border-line">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <Image src="/aptreputation-logo-md.png" alt="AptReputation" width={398} height={120} className="h-11 w-auto" priority />
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Site">
            <a href="#how" className="hidden sm:block px-3 py-2 text-sm font-medium text-muted hover:text-ink">How it works</a>
            <a href="#pricing" className="hidden sm:block px-3 py-2 text-sm font-medium text-muted hover:text-ink">Pricing</a>
            <Link href="/sign-in" className="px-3 py-2 text-sm font-medium text-muted hover:text-ink whitespace-nowrap">Sign in</Link>
            <Button asChild><Link href="/sign-up">Start free trial</Link></Button>
          </nav>
        </div>
      </header>

      {/* Hero: the promise on the left, what progress looks like on the right */}
      <section className="bg-ink text-white">
        <div className="max-w-6xl mx-auto px-5 py-16 lg:py-24 grid gap-12 lg:grid-cols-[1.1fr_0.9fr] items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-star">AI search and Google reviews</p>
            <h1 className="mt-3 font-display font-extrabold text-[2.4rem] leading-[1.04] sm:text-[3.4rem] lg:text-[3.6rem] tracking-tight">
              Renters are asking ChatGPT where to live. What does it say about your property?
            </h1>
            <p className="text-lg sm:text-xl text-blue-200 mt-6 max-w-xl leading-relaxed">
              AptReputation checks how ChatGPT, Gemini and Claude answer renters about your community, gives your team a
              step-by-step plan to fix what they get wrong, and grows the Google reviews those assistants rely on.
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
          <div className="relative" aria-label="Example: an AI search check and a review reply">
            <div className="settle bg-white text-ink rounded-2xl p-6 shadow-2xl shadow-black/30">
              <p className="text-sm font-medium text-muted">Example community: AI search check</p>
              <div className="flex items-end justify-between gap-4 mt-3">
                <div>
                  <p className="font-display text-5xl font-extrabold tabular-nums leading-none">3 <span className="text-2xl font-semibold text-muted">of 12</span></p>
                  <p className="text-sm text-muted mt-1">renter searches named it</p>
                </div>
                <ul className="text-sm tabular-nums text-right space-y-0.5">
                  <li>ChatGPT <span className="font-semibold">1 of 4</span></li>
                  <li>Gemini <span className="font-semibold">0 of 4</span></li>
                  <li>Claude <span className="font-semibold">2 of 4</span></li>
                </ul>
              </div>
              <div className="mt-4 pt-4 border-t border-line text-sm space-y-1.5">
                <p><span className="font-semibold">Fix now:</span> assistants give 3 different leasing numbers</p>
                <p><span className="font-semibold">Fix now:</span> ChatGPT quotes a 1.0 rating from 3 reviews</p>
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

      {/* The AI search check: what it asks, what it finds, what subscribers get */}
      <section className="bg-white border-b border-line">
        <div className="max-w-6xl mx-auto px-5 py-16">
          <h2 className="font-display text-3xl sm:text-4xl font-bold max-w-3xl">The shortlist is now written by an AI assistant</h2>
          <p className="mt-4 text-lg text-slate-700 leading-relaxed max-w-3xl">
            A renter types &ldquo;pet friendly 2 bedroom near downtown under $2,000&rdquo; into ChatGPT and gets three or four
            communities back, with a rating and a phone number for each. Apartments.com, Zillow and RentCafe now answer
            renters inside ChatGPT. If your property isn&apos;t on that list, or the details are wrong, the renter never sees your listing.
          </p>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            <div className="border-t-2 border-ink pt-5">
              <h3 className="text-xl font-semibold">We ask what renters ask</h3>
              <p className="mt-3 text-slate-700 leading-relaxed">ChatGPT, Gemini and Claude each get the questions renters ask in your market, and one about your property by name.</p>
            </div>
            <div className="border-t-2 border-ink pt-5">
              <h3 className="text-xl font-semibold">We show what they get wrong</h3>
              <p className="mt-3 text-slate-700 leading-relaxed">How often you are named, who is named instead, and the phone numbers, ratings and old names the assistants repeat.</p>
            </div>
            <div className="border-t-2 border-ink pt-5">
              <h3 className="text-xl font-semibold">Your team fixes it, step by step</h3>
              <p className="mt-3 text-slate-700 leading-relaxed">Each finding becomes a task with plain steps and a request written for you. A fresh check every month shows what changed.</p>
            </div>
          </div>
          <a href="/score" className="mt-8 inline-block font-semibold text-brand underline underline-offset-4">
            See how AI assistants describe your property
          </a>
        </div>
      </section>

      {/* Why it matters: the stakes, with the source named */}
      <section className="bg-white border-b border-line">
        <div className="max-w-6xl mx-auto px-5 py-16">
          <h2 className="font-display text-3xl sm:text-4xl font-bold max-w-2xl">Renters read your reviews before they read your website</h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            <div className="border-t-2 border-ink pt-5">
              <p className="font-display text-5xl font-extrabold text-brand">93%</p>
              <p className="mt-3 text-slate-700 leading-relaxed">of U.S. apartment seekers used online reviews in their search.</p>
            </div>
            <div className="border-t-2 border-ink pt-5">
              <p className="font-display text-5xl font-extrabold text-brand">64%</p>
              <p className="mt-3 text-slate-700 leading-relaxed">said they would pay more for a highly rated or reviewed property.</p>
            </div>
            <div className="border-t-2 border-ink pt-5">
              <p className="font-display text-2xl font-bold leading-tight">First thing they see</p>
              <p className="mt-3 text-slate-700 leading-relaxed">
                Your star rating sits beside your name in Google Search and Maps. A prospect sees it before a floor plan, a photo or a price.
              </p>
            </div>
          </div>
          <p className="mt-8 text-xs text-slate-500 max-w-3xl">
            Survey figures: 2019 Renter Insight &amp; Digital Engagement survey of more than 1,100 renters, conducted by SurveyMonkey Audience for Binary Fountain,{" "}
            <a
              className="underline"
              href="https://www.multifamilyexecutive.com/property-management/a-vast-majority-of-u-s-renters-use-online-ratings-and-reviews-in-apartment-search_o"
              target="_blank"
              rel="noopener noreferrer"
            >
              reported by Multifamily Executive
            </a>
            .
          </p>
          <a href="#audit" className="mt-6 inline-block font-semibold text-brand underline underline-offset-4">
            Check where your property stands, free
          </a>
        </div>
      </section>

      {/* The score: what goes into it, so anyone can check the number */}
      <section id="score" className="max-w-6xl mx-auto px-5 pt-20">
        <div className="grid gap-10 md:grid-cols-[1fr_1.2fr] items-start">
          <div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold">The AptRep Score: a number your team can move</h2>
            <p className="mt-4 text-slate-700 leading-relaxed">
              One number out of 100 for how a community looks on Google today, and where it stands against the communities around it.
              Every part is counted from the public listing, never judged, so the same listing always gets the same score and you can check it yourself.
            </p>
            <a href="#audit" className="mt-6 inline-block font-semibold text-brand underline underline-offset-4">
              See your score, free
            </a>
          </div>
          <dl className="grid gap-px bg-line border border-line rounded-2xl overflow-hidden">
            {[
              ["50", "Google rating", "Your star rating. One star scores nothing, five stars score all 50."],
              ["20", "Standing nearby", "How your rating compares with rated apartment communities within three miles."],
              ["15", "Review volume", "How many reviews you have. Full marks at 150 or more."],
              ["15", "Newest reviews", "The share of your newest reviews rated 4 or 5 stars."],
            ].map(([pts, name, text]) => (
              <div key={name} className="bg-white p-5 grid grid-cols-[3.5rem_1fr] gap-4 items-baseline">
                <dt className="font-display text-3xl font-extrabold text-brand tabular-nums">{pts}</dt>
                <dd>
                  <p className="font-semibold">{name}</p>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">{text}</p>
                </dd>
              </div>
            ))}
          </dl>
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
            A monthly check of how ChatGPT, Gemini and Claude answer renters about your property, with a step-by-step
            fix plan. Review inbox with AI reply drafts, email alerts, resident insights, tap cards and QR codes with
            tracking, team profiles, and progress reporting. Invite as many teammates as you need.
          </p>
        </div>
        <div className="bg-ink text-white rounded-3xl p-8 md:min-w-80">
          {promoActive(Date.now()) ? (
            <>
              <p className="text-sm font-semibold uppercase tracking-wide text-star">{PROMO.name}</p>
              <p className="mt-2 font-display text-6xl font-extrabold tabular-nums leading-none">
                ${PROMO.price} <span className="text-2xl font-semibold text-blue-200 line-through">${LIST_PRICE}</span>
              </p>
              <p className="text-blue-200 mt-2">per property, per month, for your first {PROMO.months} months</p>
              <p className="text-sm text-blue-200 mt-1">Subscribe by {PROMO.deadline}. ${LIST_PRICE} after that.</p>
            </>
          ) : (
            <>
              <p className="font-display text-6xl font-extrabold tabular-nums leading-none">${LIST_PRICE}</p>
              <p className="text-blue-200 mt-2">per property, per month</p>
            </>
          )}
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
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
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
              <AuditResultBody
                audit={audit}
                onAiReady={() => void runAudit({ query }).then((fresh) => fresh && setAudit(fresh)).catch(() => undefined)}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
