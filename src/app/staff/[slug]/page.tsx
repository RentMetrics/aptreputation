"use client"

import { useParams } from "next/navigation"
import { useQuery } from "convex/react"
import Image from "next/image"
import { Building2, CalendarDays, Printer, Quote } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Stars } from "@/components/stars"
import { formatDate, ROLE_LABEL, tenure } from "@/lib/format"

/** The public "mini resume" for a manager, leasing agent or maintenance tech. */
export default function StaffProfilePage() {
  const { slug } = useParams<{ slug: string }>()
  const p = useQuery(api.staff.publicProfile, { slug })

  if (p === undefined) return <main className="min-h-screen flex items-center justify-center text-slate-500">Loading…</main>
  if (p === null) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Profile not available</h1>
          <p className="text-slate-600 mt-1">This profile is private or the link is out of date.</p>
        </div>
      </main>
    )
  }

  const time = tenure(p.startDate)
  const stats = [
    { label: "Reviews praising them by name", value: p.praiseCount, show: true },
    { label: "Avg. rating when named", value: p.praiseAvg !== null ? `${p.praiseAvg} / 5` : "–", show: p.praiseAvg !== null },
    { label: "Review invitations made", value: p.invitations, show: p.invitations > 0 },
    { label: "Reviews after an invitation", value: p.assistedCount, show: p.assistedCount > 0 },
  ].filter((s) => s.show)

  return (
    <main className="min-h-screen bg-slate-100 py-8 px-4 print:bg-white print:py-0">
      <article className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-0">
        <header className="bg-slate-900 text-white p-8">
          <p className="text-sm uppercase tracking-wide text-slate-300">{ROLE_LABEL[p.role]}</p>
          <h1 className="text-3xl font-bold mt-1">{p.name}</h1>
          {p.title && <p className="text-lg text-slate-200 mt-1">{p.title}</p>}
          <div className="flex flex-wrap gap-x-5 gap-y-1 mt-4 text-sm text-slate-200">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-4 w-4" />{p.active ? "" : "Formerly at "}{p.communityName}
              {p.communityRating !== null ? ` · ${p.communityRating.toFixed(1)}★ on Google` : ""}
            </span>
            {time && <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{time} at this community</span>}
          </div>
        </header>

        <div className="p-8 space-y-8">
          {stats.length > 0 && (
            <dl className="grid grid-cols-2 gap-3">
              {stats.map((s) => (
                <div key={s.label} className="bg-slate-50 rounded-xl p-4">
                  <dd className="text-2xl font-bold tabular-nums">{s.value}</dd>
                  <dt className="text-sm text-slate-600">{s.label}</dt>
                </div>
              ))}
            </dl>
          )}

          {p.bio && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">About</h2>
              <p className="text-slate-800 whitespace-pre-line leading-relaxed">{p.bio}</p>
            </section>
          )}

          {p.skills.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">Skills and certifications</h2>
              <ul className="flex flex-wrap gap-2">
                {p.skills.map((s) => <li key={s} className="bg-slate-100 rounded-full px-3 py-1 text-sm">{s}</li>)}
              </ul>
            </section>
          )}

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">What residents said</h2>
            {p.quotes.length === 0 ? (
              <p className="text-slate-600">Resident reviews naming {p.name.split(" ")[0]} will appear here once confirmed by their manager.</p>
            ) : (
              <ul className="space-y-4">
                {p.quotes.map((q, i) => (
                  <li key={i} className="border-l-4 border-amber-400 pl-4 break-inside-avoid">
                    <Quote className="h-4 w-4 text-amber-500 mb-1" aria-hidden />
                    <p className="text-slate-800 whitespace-pre-line">{q.text}</p>
                    <p className="text-sm text-slate-600 mt-1.5 flex items-center gap-2">
                      <Stars rating={q.rating} size={13} />{q.reviewer} · Google review · {formatDate(q.date)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="px-8 py-5 border-t border-slate-200 flex items-center justify-between gap-4 text-sm text-slate-500">
          <div className="flex items-center gap-2">
            <Image src="/apt-reputation-logo-full-sm.png" alt="APT Reputation" width={110} height={29} className="h-6 w-auto" />
            <span>Quotes are public Google reviews confirmed by {p.communityName}.</span>
          </div>
          <button onClick={() => window.print()} className="print:hidden inline-flex items-center gap-1.5 font-medium text-slate-700 hover:text-slate-900">
            <Printer className="h-4 w-4" />Print
          </button>
        </footer>
      </article>
    </main>
  )
}
