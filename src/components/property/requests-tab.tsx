"use client"

import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { Check, Copy, Link2, Nfc, Trash2 } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { QrDialog } from "@/components/qr-dialog"
import { errorMessage, tapUrl, timeAgo } from "@/lib/format"

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1500)
      }}
    >
      {done ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}{done ? "Copied" : "Copy link"}
    </Button>
  )
}

export function RequestsTab({ communityId }: { communityId: Id<"communities"> }) {
  const data = useQuery(api.tags.listForCommunity, { communityId })
  const staff = useQuery(api.staff.list, { communityId })
  const addCard = useMutation(api.tags.addCard)
  const createLink = useMutation(api.tags.createLink)
  const update = useMutation(api.tags.update)
  const remove = useMutation(api.tags.remove)

  const [mode, setMode] = useState<"have-code" | "blank">("have-code")
  const [code, setCode] = useState("")
  const [serial, setSerial] = useState("")
  const [label, setLabel] = useState("")
  const [staffId, setStaffId] = useState("")
  const [linkLabel, setLinkLabel] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const guard = async (fn: () => Promise<unknown>, ok?: string) => {
    setError(null)
    setNotice(null)
    try {
      await fn()
      if (ok) setNotice(ok)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  const submitCard = (e: React.FormEvent) => {
    e.preventDefault()
    void guard(async () => {
      await addCard({
        communityId,
        code: mode === "have-code" ? code : undefined,
        serial: mode === "blank" && serial.trim() ? serial : undefined,
        label: label || undefined,
        staffId: staffId ? (staffId as Id<"staff">) : undefined,
      })
      setCode(""); setSerial(""); setLabel(""); setStaffId("")
    }, mode === "blank" ? "Card added. Write its link onto the card (see the steps below)." : "Card added to this property.")
  }

  if (!data) return <p className="text-slate-500">Loading…</p>

  return (
    <div className="space-y-6">
      <section className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm text-blue-950">
        <h2 className="font-semibold text-base mb-1">How review cards work</h2>
        <p>
          A resident taps a card with their phone, or scans a QR code, and lands on this property&apos;s Google review form.
          Give each team member their own card so their taps and the reviews that follow are credited to them.
          Ask every resident, not only the happy ones, and never offer anything in return: Google removes reviews that are filtered or rewarded.
        </p>
        <p className="mt-2 font-medium tabular-nums">{data.taps30d} tap{data.taps30d === 1 ? "" : "s"} and scans in the last 30 days</p>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-4">Cards and links</h2>
        {data.tags.length === 0 && <p className="text-slate-600 text-sm">Nothing here yet. Add a card or create a link below.</p>}
        <ul className="divide-y">
          {data.tags.map((t) => (
            <li key={t._id} className={`py-4 flex flex-wrap items-center gap-3 ${t.disabled ? "opacity-60" : ""}`}>
              <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                {t.kind === "nfc" ? <Nfc className="h-5 w-5 text-slate-700" /> : <Link2 className="h-5 w-5 text-slate-700" />}
              </div>
              <div className="flex-1 min-w-48">
                <p className="font-medium">{t.label || (t.kind === "nfc" ? "NFC card" : "Review link")}{t.disabled ? " (off)" : ""}</p>
                <p className="text-sm text-slate-600">
                  {t.kind === "nfc" ? "NFC card" : "QR / link"} · code <span className="font-mono">{t.code}</span>
                  {t.serial ? <> · serial <span className="font-mono">{t.serial}</span></> : null}
                </p>
                <p className="text-sm text-slate-600 tabular-nums">
                  {t.tapCount} tap{t.tapCount === 1 ? "" : "s"} total · {t.taps30d} in 30 days{t.lastTapAt ? ` · last ${timeAgo(t.lastTapAt)}` : ""}
                </p>
              </div>
              <select
                aria-label="Credited team member"
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white"
                value={t.staffId ?? ""}
                onChange={(e) => guard(() => update({ tagId: t._id, staffId: e.target.value ? (e.target.value as Id<"staff">) : null }))}
              >
                <option value="">Whole property</option>
                {staff?.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
              <CopyButton text={tapUrl(t.code)} />
              <QrDialog url={tapUrl(t.code)} title={t.label || "Review link"} />
              <Button size="sm" variant="ghost" onClick={() => guard(() => update({ tagId: t._id, disabled: !t.disabled }))}>
                {t.disabled ? "Turn on" : "Turn off"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t.kind === "nfc" ? "Remove card from this property" : "Delete link"}
                onClick={() => confirm(t.kind === "nfc" ? "Remove this card from the property? It stays in your account for reuse." : "Delete this link? Printed QR codes for it will stop working.") && guard(() => remove({ tagId: t._id }))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      {data.unassigned.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-1">Your unassigned cards</h2>
          <p className="text-sm text-slate-600 mb-3">Cards on your account that aren&apos;t at a property.</p>
          <ul className="flex flex-wrap gap-2">
            {data.unassigned.map((t) => (
              <li key={t._id}>
                <Button size="sm" variant="outline" onClick={() => guard(() => addCard({ communityId, code: t.code }), "Card added to this property.")}>
                  <Nfc className="h-4 w-4 mr-1.5" />Use <span className="font-mono mx-1">{t.code}</span> here
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-3">Add an NFC card</h2>
          <div className="flex gap-2 mb-4" role="radiogroup" aria-label="Card type">
            {([["have-code", "Card has a code"], ["blank", "Blank card"]] as const).map(([key, text]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={mode === key}
                onClick={() => setMode(key)}
                className={`px-3 py-1.5 rounded-md text-sm border ${mode === key ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-300"}`}
              >
                {text}
              </button>
            ))}
          </div>
          <form onSubmit={submitCard} className="space-y-3">
            {mode === "have-code" ? (
              <div>
                <Label htmlFor="card-code">Card code</Label>
                <Input id="card-code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="7 characters, or paste the card's link" className="font-mono" />
                <p className="text-xs text-slate-500 mt-1">For cards we sent you. Tap the card with your phone to see its link.</p>
              </div>
            ) : (
              <div>
                <Label htmlFor="card-serial">Serial number (optional)</Label>
                <Input id="card-serial" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="04:C2:88:D2:5F:61:80" className="font-mono" />
                <p className="text-xs text-slate-500 mt-1">Shown by an NFC reader app. Helps you tell cards apart.</p>
              </div>
            )}
            <div>
              <Label htmlFor="card-label">Label</Label>
              <Input id="card-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Front desk, Carlos's badge…" />
            </div>
            <div>
              <Label htmlFor="card-staff">Credit taps to</Label>
              <select id="card-staff" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                <option value="">Whole property</option>
                {staff?.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <Button type="submit">Add card</Button>
          </form>
          {mode === "blank" && (
            <ol className="mt-4 text-sm text-slate-700 list-decimal pl-5 space-y-1">
              <li>Add the card here. It gets its own link.</li>
              <li>Use &ldquo;Copy link&rdquo; on the card in the list above.</li>
              <li>In an NFC writer app (for example NFC Tools), write that link to the card as a URL record.</li>
              <li>Tap the card with a phone to test. The tap count above goes up.</li>
            </ol>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-3">Create a QR code or link</h2>
          <p className="text-sm text-slate-600 mb-3">
            For flyers, work-order door hangers, email signatures or text messages. Each one counts its own scans.
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void guard(async () => {
                await createLink({ communityId, label: linkLabel })
                setLinkLabel("")
              }, "Link created.")
            }}
          >
            <div>
              <Label htmlFor="link-label">Where will it be used?</Label>
              <Input id="link-label" required value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Leasing office counter" />
            </div>
            <Button type="submit">Create link</Button>
          </form>
        </section>
      </div>

      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {notice && <p className="text-sm text-emerald-800" role="status">{notice}</p>}
    </div>
  )
}
