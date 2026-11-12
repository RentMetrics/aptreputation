"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"

/** The unsubscribe link in outreach emails. One click, no sign-in. */
export default function UnsubscribePage() {
  const { token } = useParams<{ token: string }>()
  const unsubscribe = useMutation(api.outreach.unsubscribe)
  const [state, setState] = useState<"ask" | "working" | "done" | "unknown" | "failed">("ask")

  const confirm = async () => {
    setState("working")
    try {
      const result = await unsubscribe({ token })
      setState(result.ok ? "done" : "unknown")
    } catch {
      setState("failed")
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-paper p-6">
      <div className="max-w-md w-full bg-white border border-line rounded-xl p-8 text-center">
        <p className="font-display text-lg font-bold text-brand mb-4">AptReputation</p>
        {state === "done" ? (
          <>
            <h1 className="text-xl font-semibold text-ink">You&apos;re unsubscribed</h1>
            <p className="text-muted mt-2">We won&apos;t email this address again.</p>
          </>
        ) : state === "unknown" ? (
          <>
            <h1 className="text-xl font-semibold text-ink">This link has expired</h1>
            <p className="text-muted mt-2">
              To stop our emails, write to <a className="underline" href="mailto:contact@aptreputation.com">contact@aptreputation.com</a> and
              we&apos;ll remove you.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-ink">Stop emails from AptReputation?</h1>
            <p className="text-muted mt-2 mb-5">Confirm and we won&apos;t email this address again.</p>
            <Button onClick={confirm} disabled={state === "working"} className="w-full h-11">
              {state === "working" ? "Unsubscribing…" : "Unsubscribe"}
            </Button>
            {state === "failed" && (
              <p className="text-sm text-loss mt-3" role="alert">
                That didn&apos;t go through. Try again, or write to contact@aptreputation.com.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  )
}
