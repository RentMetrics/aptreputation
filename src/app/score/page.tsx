"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useAction } from "convex/react"
import { Search } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AuditResultBody, type Audit } from "@/components/audit-result"
import { errorMessage } from "@/lib/format"

const PARTS: [string, string, string][] = [
  ["50", "Google rating", "Your star rating. Five stars score all 50."],
  ["20", "Standing nearby", "How your rating compares with communities within three miles."],
  ["15", "Review volume", "How many reviews you have. Full marks at 150."],
  ["15", "Newest reviews", "The share of your newest reviews rated 4 or 5 stars."],
]

/**
 * The AptRep Score page: one job, show a community its score. The short domain
 * aptrep.com lands here, and aptrep.com/<property-and-city> runs that property.
 */
export default function ScorePage() {
  const runAudit = useAction(api.audit.run)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [audit, setAudit] = useState<Audit | null>(null)
  const [error, setError] = useState<string | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  const check = async (text: string) => {
    const q = text.trim()
    if (q.length < 3) return
    setLoading(true)
    setError(null)
    setAudit(null)
    try {
      const result = await runAudit({ query: q })
      if (result) setAudit(result)
      else setError("We couldn't find that property on Google. Try the full name and city.")
      // Keep the address shareable: /score?q=<property and city>
      const url = new URL(window.location.href)
      url.searchParams.set("q", q)
      window.history.replaceState(null, "", url)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }))
    }
  }

  const linked = useRef(false)
  useEffect(() => {
    if (linked.current) return
    linked.current = true
    const wanted = new URLSearchParams(window.location.search).get("q")?.slice(0, 200)
    if (!wanted) return
    setQuery(wanted)
    void check(wanted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-line">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
          <Link href="/" aria-label="AptReputation home">
            <Image src="/apt-reputation-logo-full-md.png" alt="APT Reputation" width={160} height={42} className="h-9 w-auto" priority />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Site">
            <Link href="/" className="hidden sm:block px-3 py-2 text-sm font-medium text-muted hover:text-ink">How AptReputation works</Link>
            <Button asChild><Link href="/sign-up">Start free trial</Link></Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="bg-ink text-white">
          <div className="max-w-3xl mx-auto px-5 py-16 sm:py-20">
            <p className="text-sm font-semibold uppercase tracking-wide text-white/70">AptRep Score</p>
            <h1 className="mt-3 font-display font-extrabold text-[2.5rem] leading-[1.05] sm:text-6xl tracking-tight">
              What&apos;s your community&apos;s score?
            </h1>
            <p className="mt-5 text-lg text-white/85 leading-relaxed max-w-2xl">
              Enter an apartment community. In a few seconds you&apos;ll see its score out of 100, how it is made up, and where it stands against the communities around it.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void check(query)
              }}
              className="mt-8 flex flex-col sm:flex-row gap-3"
            >
              <label htmlFor="score-q" className="sr-only">Property name and city, or address</label>
              <Input
                id="score-q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Property name and city, or address"
                className="h-12 bg-white text-ink placeholder:text-slate-500 sm:flex-1"
                autoComplete="off"
              />
              <Button type="submit" disabled={loading} className="h-12 px-6 bg-star text-ink font-semibold hover:bg-star/90">
                <Search className="h-4 w-4" />
                {loading ? "Reading the listing…" : "Get my score"}
              </Button>
            </form>
            <p className="mt-3 text-sm text-white/70">Free. Reads the property&apos;s public Google listing. No sign-up.</p>
          </div>
        </section>

        <div ref={resultRef} className="scroll-mt-4">
          {(audit || error) && (
            <section className="max-w-3xl mx-auto px-5 py-12" aria-live="polite">
              {error && (
                <div className="rounded-2xl border border-line p-6">
                  <h2 className="font-display text-2xl font-bold">We couldn&apos;t run that check</h2>
                  <p className="mt-2 text-slate-700">{error}</p>
                </div>
              )}
              {audit && (
                <div className="rounded-2xl border border-line p-6 sm:p-8 grid gap-5">
                  <div>
                    <h2 className="font-display text-2xl sm:text-3xl font-bold">{audit.name}</h2>
                    <p className="mt-1 text-slate-600">{audit.address}</p>
                  </div>
                  <AuditResultBody audit={audit} />
                </div>
              )}
            </section>
          )}
        </div>

        <section className="max-w-3xl mx-auto px-5 py-14">
          <h2 className="font-display text-2xl sm:text-3xl font-bold">What goes into the score</h2>
          <p className="mt-3 text-slate-700 leading-relaxed">
            Every part is counted from the public Google listing, never judged, so the same listing always gets the same score and you can check it yourself.
          </p>
          <dl className="mt-8 grid gap-px bg-line border border-line rounded-2xl overflow-hidden">
            {PARTS.map(([pts, name, text]) => (
              <div key={name} className="bg-white p-5 grid grid-cols-[3.5rem_1fr] gap-4 items-baseline">
                <dt className="font-display text-3xl font-extrabold text-brand tabular-nums">{pts}</dt>
                <dd>
                  <p className="font-semibold">{name}</p>
                  <p className="text-sm text-slate-600 mt-1 leading-relaxed">{text}</p>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-8 text-slate-700 leading-relaxed">
            A score is where it starts. AptReputation helps your on-site team reply to every review and earn new ones, then shows how far the score has moved since the day you joined.{" "}
            <Link href="/" className="font-semibold text-brand underline underline-offset-4">See how it works</Link>
          </p>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="max-w-5xl mx-auto px-5 py-6 text-sm text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
          <span>© {new Date().getFullYear()} Apartment Reputation (AptReputation)</span>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
        </div>
      </footer>
    </div>
  )
}
