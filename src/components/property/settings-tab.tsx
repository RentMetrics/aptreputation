"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAction, useMutation, useQuery } from "convex/react"
import { CheckCircle2, RefreshCw } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Doc } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { errorMessage, timeAgo } from "@/lib/format"

type Location = { location: string; title: string; address: string }

export function SettingsTab({ community }: { community: Doc<"communities"> }) {
  const router = useRouter()
  const status = useQuery(api.google.status)
  const startConnect = useMutation(api.google.startConnect)
  const disconnect = useMutation(api.google.disconnect)
  const listLocations = useAction(api.google.listLocations)
  const linkLocation = useMutation(api.google.linkLocation)
  const unlinkLocation = useMutation(api.google.unlinkLocation)
  const syncNow = useAction(api.google.syncNow)
  const remove = useMutation(api.communities.remove)

  const [locations, setLocations] = useState<Location[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (name: string, fn: () => Promise<unknown>) => {
    setError(null)
    setBusy(name)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-lg font-semibold">Google Business Profile</h2>
        <p className="text-sm text-slate-600 mt-1">
          Without this link we can only see the 5 reviews Google shows publicly. Linking the profile you manage loads
          every review and lets you post replies from the Reviews tab.
        </p>

        {community.gbpLocation ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 text-emerald-800 font-medium">
              <CheckCircle2 className="h-5 w-5" />Linked to {community.gbpLocationTitle}
            </p>
            <Button size="sm" variant="ghost" onClick={() => run("unlink", () => unlinkLocation({ communityId: community._id }))}>Unlink</Button>
          </div>
        ) : status?.connected ? (
          <div className="mt-4">
            <p className="text-sm text-slate-700">Signed in to Google as {status.googleEmail ?? "your account"}.</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" disabled={busy !== null} onClick={() => run("locations", async () => setLocations(await listLocations({})))}>
                {busy === "locations" ? "Loading locations…" : "Choose this property's location"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => confirm("Disconnect Google? Every property will be unlinked.") && run("disconnect", () => disconnect({}))}>
                Disconnect Google
              </Button>
            </div>
            {locations && locations.length === 0 && (
              <p className="text-sm text-slate-600 mt-3">This Google account doesn&apos;t manage any Business Profile locations.</p>
            )}
            {locations && locations.length > 0 && (
              <ul className="mt-3 divide-y border rounded-lg">
                {locations.map((l) => (
                  <li key={l.location} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{l.title}</p>
                      <p className="text-sm text-slate-600 truncate">{l.address}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => run("link", () => linkLocation({ communityId: community._id, location: l.location, title: l.title }))}>
                      Link
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <Button className="mt-4" disabled={busy !== null} onClick={() => run("connect", async () => { window.location.href = await startConnect({}) })}>
            Connect Google
          </Button>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-lg font-semibold">Review sync</h2>
        <p className="text-sm text-slate-600 mt-1">
          Reviews refresh automatically every 6 hours.{" "}
          {community.lastSyncAt
            ? `Last checked ${timeAgo(community.lastSyncAt)} (${community.lastSyncSource === "business" ? "full Business Profile feed" : "Google public sample"}).`
            : "Not synced yet."}
        </p>
        {community.lastSyncError && (
          <p className="text-sm text-red-700 mt-2" role="alert">Last sync failed: {community.lastSyncError}</p>
        )}
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => run("sync", async () => {
            const result = await syncNow({ communityId: community._id })
            if (!result.ok) setError(result.error ?? "Sync failed.")
          })}
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${busy === "sync" ? "animate-spin" : ""}`} />{busy === "sync" ? "Syncing…" : "Sync now"}
        </Button>
      </section>

      <section className="bg-white border border-red-200 rounded-xl p-5">
        <h2 className="text-lg font-semibold">Remove property</h2>
        <p className="text-sm text-slate-600 mt-1">
          Deletes this property&apos;s reviews, insights, team profiles and links from AptReputation. Nothing on Google changes.
        </p>
        <Button
          className="mt-3"
          size="sm"
          variant="destructive"
          disabled={busy !== null}
          onClick={() => confirm(`Remove ${community.name}? This cannot be undone.`) && run("remove", async () => {
            await remove({ communityId: community._id })
            router.push("/dashboard")
          })}
        >
          Remove property
        </Button>
      </section>

      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    </div>
  )
}
