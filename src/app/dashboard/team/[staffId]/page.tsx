"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Stars } from "@/components/stars"
import { QrDialog } from "@/components/qr-dialog"
import { errorMessage, formatDate, ROLE_LABEL, tapUrl } from "@/lib/format"

export default function TeamMemberPage() {
  const { staffId } = useParams<{ staffId: string }>()
  const id = staffId as Id<"staff">
  const router = useRouter()
  const data = useQuery(api.staff.get, { staffId: id })
  const update = useMutation(api.staff.update)
  const remove = useMutation(api.staff.remove)
  const setMention = useMutation(api.reviews.setMention)

  const [form, setForm] = useState({ name: "", title: "", startDate: "", bio: "", skills: "" })
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (data && !loaded) {
      setForm({
        name: data.staff.name,
        title: data.staff.title ?? "",
        startDate: data.staff.startDate ?? "",
        bio: data.staff.bio ?? "",
        skills: (data.staff.skills ?? []).join(", "),
      })
      setLoaded(true)
    }
  }, [data, loaded])

  if (data === undefined) return <p className="text-slate-500">Loading…</p>
  const { staff } = data

  const guard = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    void guard(async () => {
      await update({
        staffId: id,
        name: form.name,
        title: form.title,
        startDate: form.startDate,
        bio: form.bio,
        skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  const profileUrl = typeof window === "undefined" ? "" : `${window.location.origin}/staff/${staff.slug}`

  return (
    <div>
      <Link href={`/dashboard/property/${staff.communityId}`} className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" />{data.communityName}
      </Link>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="h-14 w-14 rounded-full bg-slate-900 text-white flex items-center justify-center font-semibold text-lg">
          {staff.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{staff.name}</h1>
          <p className="text-slate-600">{staff.title || ROLE_LABEL[staff.role]} · {data.communityName}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          ["Praised by name", data.praiseCount],
          ["Named in reviews", data.named.length],
          ["Card and link taps", data.taps],
          ["Reviews after a tap", data.assisted.length],
        ].map(([label, value]) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
            <dt className="text-sm text-slate-600">{label}</dt>
            <dd className="text-2xl font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {data.suggested.length > 0 && (
            <section className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <h2 className="text-lg font-semibold mb-1">Is this {staff.name.split(" ")[0]}?</h2>
              <p className="text-sm text-slate-700 mb-3">These reviews mention a matching name. Confirm the ones that are about this person.</p>
              <ul className="space-y-3">
                {data.suggested.map((r) => (
                  <li key={r._id} className="bg-white rounded-lg border border-amber-200 p-3">
                    <p className="text-sm flex items-center gap-2"><Stars rating={r.rating} size={13} /><span className="font-medium">{r.reviewerName}</span><span className="text-slate-500">{formatDate(r.reviewDate)}</span></p>
                    <p className="text-sm text-slate-800 mt-1 whitespace-pre-line">{r.text}</p>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" onClick={() => guard(() => setMention({ reviewId: r._id, index: r.mentionIndex, status: "confirmed" }))}>Yes, that&apos;s them</Button>
                      <Button size="sm" variant="outline" onClick={() => guard(() => setMention({ reviewId: r._id, index: r.mentionIndex, status: "rejected" }))}>No</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-1">Reviews that name {staff.name.split(" ")[0]}</h2>
            <p className="text-sm text-slate-600 mb-3">
              Only you see this full list. The shared profile shows 4 and 5 star reviews that speak well of them.
            </p>
            {data.named.length === 0 && <p className="text-sm text-slate-600">None confirmed yet.</p>}
            <ul className="space-y-3">
              {data.named.map((r) => (
                <li key={r._id} className="border border-slate-200 rounded-lg p-3">
                  <p className="text-sm flex flex-wrap items-center gap-2">
                    <Stars rating={r.rating} size={13} /><span className="font-medium">{r.reviewerName}</span>
                    <span className="text-slate-500">{formatDate(r.reviewDate)}</span>
                    {r.mentionSentiment !== "positive" && <span className="text-xs bg-slate-100 rounded-full px-2 py-0.5">{r.mentionSentiment}, private</span>}
                  </p>
                  <p className="text-sm text-slate-800 mt-1 whitespace-pre-line">{r.text}</p>
                </li>
              ))}
            </ul>
          </section>

          {data.assisted.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-xl p-5">
              <h2 className="text-lg font-semibold mb-1">Reviews after a tap</h2>
              <p className="text-sm text-slate-600 mb-3">
                Posted within 48 hours of a tap on one of {staff.name.split(" ")[0]}&apos;s cards or links. Google doesn&apos;t tell us who tapped, so this is a likely match, not proof.
                {data.assistedAvg !== null ? ` Average ${data.assistedAvg} stars.` : ""}
              </p>
              <ul className="space-y-2">
                {data.assisted.map((r) => (
                  <li key={r._id} className="text-sm flex items-center gap-2">
                    <Stars rating={r.rating} size={13} /><span className="font-medium">{r.reviewerName}</span><span className="text-slate-500">{formatDate(r.reviewDate)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-1">Shareable profile</h2>
            <p className="text-sm text-slate-600 mb-3">
              A one-page record of resident praise this person can share with you, an owner, or a future employer.
              Get their OK before turning it on.
            </p>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={staff.isPublic}
                onChange={(e) => guard(() => update({ staffId: id, isPublic: e.target.checked }))}
              />
              Anyone with the link can view
            </label>
            {staff.isPublic && (
              <a href={profileUrl} target="_blank" rel="noopener" className="mt-3 inline-flex items-center text-sm font-medium text-blue-700 underline break-all">
                Open profile<ExternalLink className="h-3.5 w-3.5 ml-1" />
              </a>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-3">Review links</h2>
            <ul className="space-y-3">
              {data.tags.map((t) => (
                <li key={t._id} className="text-sm">
                  <p className="font-medium">{t.label || (t.kind === "nfc" ? "NFC card" : "Link")}</p>
                  <p className="text-slate-600 tabular-nums mb-1.5">{t.kind === "nfc" ? "NFC card" : "QR / link"} · {t.tapCount} taps</p>
                  <QrDialog url={tapUrl(t.code)} title={`${staff.name} review link`} />
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500 mt-3">Assign physical cards on the property&apos;s Get reviews tab.</p>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-3">Profile details</h2>
            <form onSubmit={save} className="space-y-3">
              <div><Label htmlFor="f-name">Name</Label><Input id="f-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label htmlFor="f-title">Job title</Label><Input id="f-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label htmlFor="f-start">Started here</Label><Input id="f-start" type="month" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
              <div>
                <Label htmlFor="f-skills">Skills and certifications</Label>
                <Input id="f-skills" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder="HVAC (EPA 608), CPO, Yardi" />
                <p className="text-xs text-slate-500 mt-1">Separate with commas.</p>
              </div>
              <div>
                <Label htmlFor="f-bio">Summary</Label>
                <textarea id="f-bio" rows={4} maxLength={1200} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="w-full border border-slate-300 rounded-md p-2 text-sm" />
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit">Save</Button>
                {saved && <span className="text-sm text-emerald-800" role="status">Saved</span>}
              </div>
            </form>
            <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t">
              <Button size="sm" variant="outline" onClick={() => guard(() => update({ staffId: id, active: !staff.active }))}>
                {staff.active ? "Mark as former employee" : "Mark as current"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-700"
                onClick={() => confirm(`Delete ${staff.name}'s profile? Their shared link will stop working.`) && guard(async () => {
                  await remove({ staffId: id })
                  router.push(`/dashboard/property/${staff.communityId}`)
                })}
              >
                Delete
              </Button>
            </div>
          </section>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        </div>
      </div>
    </div>
  )
}
