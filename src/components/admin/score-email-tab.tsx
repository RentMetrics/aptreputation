"use client"

import { useMemo, useState } from "react"
import { useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Audit } from "@/components/audit-result"
import { errorMessage } from "@/lib/format"
import { NEVER_CONTACT, SENDER, scoreEmail } from "@/lib/pitch"

/** The do-not-contact name this text matches, if any. */
function blockedBy(...texts: string[]) {
  const hay = texts.join(" | ").toLowerCase()
  const squeezed = hay.replace(/[^a-z0-9|@.]/g, "")
  return NEVER_CONTACT.find((t) => hay.includes(t) || squeezed.includes(t.replace(/\s+/g, ""))) ?? null
}

/**
 * Runs a property's AptRep Score and writes it as an email with the report in
 * the body. The admin copies it into their own mailbox and sends it, so it
 * arrives as a personal note with no attachment.
 */
export function ScoreEmailTab() {
  const runAudit = useAction(api.audit.run)
  const [query, setQuery] = useState("")
  const [ran, setRan] = useState("")
  const [firstName, setFirstName] = useState("")
  const [to, setTo] = useState("")
  const [audit, setAudit] = useState<Audit | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const email = useMemo(() => (audit ? scoreEmail(audit, { query: ran, firstName }) : null), [audit, ran, firstName])
  const blocked = audit ? blockedBy(audit.name, to) : to ? blockedBy(to) : null

  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (q.length < 3) return
    setError(null)
    setCopied(null)
    setLoading(true)
    try {
      const result = await runAudit({ query: q })
      if (!result) setError("Google has no listing that matches. Add the city and state, or try the street address.")
      setAudit(result)
      setRan(q)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const copy = async (what: "email" | "subject") => {
    if (!email) return
    try {
      if (what === "subject") {
        await navigator.clipboard.writeText(email.subject)
      } else if (typeof ClipboardItem !== "undefined") {
        // Formatted and plain versions together: a mail program takes the formatted one.
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([email.html], { type: "text/html" }),
            "text/plain": new Blob([email.text], { type: "text/plain" }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(email.text)
      }
      setCopied(what)
    } catch {
      setError("Your browser blocked copying. Select the email below and copy it by hand.")
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="font-semibold">Send a property its AptRep Score</h2>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl">
          Enter a property and this writes an email with its score report in the body: no attachment, nothing to
          download. Copy it into a new message from {SENDER.email} and send it yourself.
        </p>
        <form onSubmit={run} className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr_1.4fr_auto] md:items-end">
          <div>
            <label htmlFor="se-q" className="text-sm font-medium">Property, city and state</label>
            <Input id="se-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Bridgeside Landing Taylorsville UT" />
          </div>
          <div>
            <label htmlFor="se-first" className="text-sm font-medium">Their first name</label>
            <Input id="se-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Optional" />
          </div>
          <div>
            <label htmlFor="se-to" className="text-sm font-medium">Their email</label>
            <Input id="se-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Optional, checked against do-not-contact" />
          </div>
          <Button type="submit" disabled={loading || query.trim().length < 3}>{loading ? "Scoring…" : "Write the email"}</Button>
        </form>
        {error && <p className="text-sm text-red-700 mt-3" role="alert">{error}</p>}
      </section>

      {blocked && (
        <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900" role="alert">
          Do not send this one. It matches &ldquo;{blocked}&rdquo; on the do-not-contact list.
        </p>
      )}

      {audit && email && (
        <section className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500">Google matched</p>
              <p className="font-medium truncate">{audit.name}</p>
              <p className="text-sm text-slate-600 truncate">{audit.address}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => copy("subject")} variant="outline" disabled={!!blocked}>{copied === "subject" ? "Subject copied" : "Copy subject"}</Button>
              <Button onClick={() => copy("email")} disabled={!!blocked}>{copied === "email" ? "Email copied" : "Copy email"}</Button>
              <Button asChild variant="outline">
                <a href={`/score?q=${encodeURIComponent(ran)}`} target="_blank" rel="noreferrer">Open full report</a>
              </Button>
            </div>
          </div>
          <p className="text-sm text-slate-600 mt-3">
            Check the match above is the property you meant. The link in the email, {email.link}, opens the same
            report; use &ldquo;Print or save as PDF&rdquo; there if someone asks for a file.
          </p>
          <div className="mt-4 rounded-lg border border-slate-200">
            <p className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm"><span className="text-slate-500">Subject: </span><span className="font-medium">{email.subject}</span></p>
            {/* Built by scoreEmail, which escapes every value it places in the markup. */}
            <div className="p-4" dangerouslySetInnerHTML={{ __html: email.html }} />
          </div>
        </section>
      )}
    </div>
  )
}
