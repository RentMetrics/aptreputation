"use client"

import { useState } from "react"

const W = 640
const AXIS = "var(--line)"
const TEXT = "var(--muted)"
const SERIES = "var(--brand)"

function shortDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/**
 * Google rating over time, one series. The dashed-free grey rule is the rating
 * on the day the property joined, so the gap between rule and line is the gain.
 */
export function RatingLine({
  points,
  baseline,
}: {
  points: { at: number; rating: number; totalReviews: number }[]
  baseline: number | null
}) {
  const [hover, setHover] = useState<number | null>(null)
  const H = 220
  const pad = { l: 36, r: 56, t: 16, b: 28 }
  if (points.length === 0) return null

  const values = [...points.map((p) => p.rating), ...(baseline !== null ? [baseline] : [])]
  const lo = Math.max(1, Math.floor((Math.min(...values) - 0.25) * 10) / 10)
  const hi = Math.min(5, Math.ceil((Math.max(...values) + 0.25) * 10) / 10)
  const t0 = points[0].at
  const t1 = points.length > 1 ? points[points.length - 1].at : t0 + 1
  const x = (t: number) => (points.length > 1 ? pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r) : pad.l + (W - pad.l - pad.r) / 2)
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b)
  const ticks = [lo, Math.round(((lo + hi) / 2) * 10) / 10, hi]
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)},${y(p.rating).toFixed(1)}`).join(" ")
  const last = points[points.length - 1]
  const active = hover !== null ? points[hover] : null

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    let best = 0
    points.forEach((p, i) => {
      if (Math.abs(x(p.at) - px) < Math.abs(x(points[best].at) - px)) best = i
    })
    setHover(best)
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Google rating over time. Currently ${last.rating.toFixed(1)}${baseline !== null ? `, joined at ${baseline.toFixed(1)}` : ""}.`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={AXIS} strokeWidth="1" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill={TEXT}>{t.toFixed(1)}</text>
          </g>
        ))}
        {baseline !== null && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(baseline)} y2={y(baseline)} stroke="var(--color-slate-400)" strokeWidth="1.5" />
            <text x={W - pad.r + 6} y={y(baseline) + 4} fontSize="12" fill={TEXT}>Joined</text>
          </g>
        )}
        {points.length > 1 && <path d={path} fill="none" stroke={SERIES} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {active && <line x1={x(active.at)} x2={x(active.at)} y1={pad.t} y2={H - pad.b} stroke="var(--color-slate-400)" strokeWidth="1" />}
        <circle cx={x(last.at)} cy={y(last.rating)} r="5" fill={SERIES} stroke="#fff" strokeWidth="2" />
        {active && active !== last && <circle cx={x(active.at)} cy={y(active.rating)} r="5" fill={SERIES} stroke="#fff" strokeWidth="2" />}
        <text x={x(last.at) + 10} y={y(last.rating) - 8} fontSize="13" fontWeight="600" fill="var(--ink)">{last.rating.toFixed(1)}</text>
        <text x={pad.l} y={H - 8} fontSize="12" fill={TEXT}>{shortDate(t0)}</text>
        {points.length > 1 && <text x={W - pad.r} y={H - 8} textAnchor="end" fontSize="12" fill={TEXT}>{shortDate(t1)}</text>}
      </svg>
      {active && (
        <div
          className="absolute top-2 pointer-events-none bg-ink text-white text-xs rounded-md px-2.5 py-1.5 shadow-lg whitespace-nowrap"
          style={{ left: `${(x(active.at) / W) * 100}%`, transform: `translateX(${x(active.at) > W * 0.7 ? "-105%" : "8px"})` }}
        >
          <p className="font-semibold tabular-nums">{active.rating.toFixed(1)} stars, {active.totalReviews} reviews</p>
          <p className="opacity-80">{shortDate(active.at)}</p>
        </div>
      )}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted hover:text-ink w-fit">View as table</summary>
        <table className="mt-2 w-full max-w-sm text-sm">
          <thead><tr className="text-left text-muted border-b"><th className="py-1 font-medium">Date</th><th className="py-1 font-medium text-right">Rating</th><th className="py-1 font-medium text-right">Reviews</th></tr></thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.at} className="border-b last:border-0"><td className="py-1">{shortDate(p.at)}</td><td className="py-1 text-right tabular-nums">{p.rating.toFixed(1)}</td><td className="py-1 text-right tabular-nums">{p.totalReviews}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

/** 4 and 5 star reviews per month, split into before joining (grey) and since (blue). */
export function PositiveBars({
  months,
}: {
  months: { label: string; positiveBefore: number; positiveSince: number; total: number }[]
}) {
  const [hover, setHover] = useState<number | null>(null)
  const H = 220
  const pad = { l: 36, r: 12, t: 22, b: 30 }
  const totals = months.map((m) => m.positiveBefore + m.positiveSince)
  const top = Math.ceil(Math.max(4, ...totals) / 4) * 4
  const band = (W - pad.l - pad.r) / months.length
  const barW = Math.min(24, band - 8)
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b)
  const base = H - pad.b
  const peak = totals.reduce((best, t, i) => (t > totals[best] ? i : best), 0)
  const hasBefore = months.some((m) => m.positiveBefore > 0)

  // A column segment from value v0 up to v1; only the top segment gets rounded ends.
  const segment = (x0: number, v0: number, v1: number, rounded: boolean, gap: number) => {
    const yb = y(v0) - gap
    const yt = y(v1)
    const r = rounded ? Math.min(4, Math.max(0, yb - yt)) : 0
    return `M${x0},${yb} V${yt + r} Q${x0},${yt} ${x0 + r},${yt} H${x0 + barW - r} Q${x0 + barW},${yt} ${x0 + barW},${yt + r} V${yb} Z`
  }

  return (
    <div className="relative">
      <div className="flex gap-4 text-sm text-muted mb-1">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand" />Since joining</span>
        {hasBefore && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300" />Before joining</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="4 and 5 star reviews per month for the last 12 months" onMouseLeave={() => setHover(null)}>
        {[0, top / 2, top].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={AXIS} strokeWidth="1" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="12" fill={TEXT}>{t}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx = pad.l + band * i + band / 2
          const x0 = cx - barW / 2
          const total = totals[i]
          const dim = hover === null || hover === i ? 1 : 0.55
          return (
            <g key={m.label} onMouseEnter={() => setHover(i)}>
              {/* generous invisible hit area */}
              <rect x={pad.l + band * i} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" />
              {m.positiveBefore > 0 && (
                <path d={segment(x0, 0, m.positiveBefore, m.positiveSince === 0, 0)} fill="var(--color-slate-300)" opacity={dim} />
              )}
              {m.positiveSince > 0 && (
                <path d={segment(x0, m.positiveBefore, total, true, m.positiveBefore > 0 ? 2 : 0)} fill={SERIES} opacity={dim} />
              )}
              {i === peak && total > 0 && (
                <text x={cx} y={y(total) - 6} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--ink)">{total}</text>
              )}
              {(i % 2 === 1 || months.length <= 6) && (
                <text x={cx} y={H - 10} textAnchor="middle" fontSize="11" fill={TEXT}>{m.label}</text>
              )}
            </g>
          )
        })}
      </svg>
      {hover !== null && (
        <div
          className="absolute top-8 pointer-events-none bg-ink text-white text-xs rounded-md px-2.5 py-1.5 shadow-lg whitespace-nowrap"
          style={{ left: `${((pad.l + band * hover + band / 2) / W) * 100}%`, transform: `translateX(${hover > months.length * 0.7 ? "-105%" : "10px"})` }}
        >
          <p className="font-semibold">{months[hover].label}</p>
          <p className="tabular-nums">{totals[hover]} of {months[hover].total} reviews were 4 or 5 stars</p>
          {months[hover].positiveSince > 0 && months[hover].positiveBefore > 0 && (
            <p className="opacity-80 tabular-nums">{months[hover].positiveSince} since joining, {months[hover].positiveBefore} before</p>
          )}
        </div>
      )}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted hover:text-ink w-fit">View as table</summary>
        <table className="mt-2 w-full max-w-md text-sm">
          <thead><tr className="text-left text-muted border-b"><th className="py-1 font-medium">Month</th><th className="py-1 font-medium text-right">Before joining</th><th className="py-1 font-medium text-right">Since joining</th><th className="py-1 font-medium text-right">All reviews</th></tr></thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.label} className="border-b last:border-0"><td className="py-1">{m.label}</td><td className="py-1 text-right tabular-nums">{m.positiveBefore}</td><td className="py-1 text-right tabular-nums">{m.positiveSince}</td><td className="py-1 text-right tabular-nums">{m.total}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
