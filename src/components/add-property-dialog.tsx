"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAction } from "convex/react"
import { Plus, Search } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Stars } from "@/components/stars"
import { errorMessage } from "@/lib/format"

type Hit = { placeId: string; name: string; address: string; rating?: number; totalReviews?: number }

export function AddPropertyDialog() {
  const router = useRouter()
  const search = useAction(api.communities.search)
  const add = useAction(api.communities.add)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy("search")
    try {
      setHits(await search({ query }))
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const choose = async (hit: Hit) => {
    setError(null)
    setBusy(hit.placeId)
    try {
      const id = await add({ placeId: hit.placeId })
      setOpen(false)
      router.push(`/dashboard/property/${id}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" />Add property</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a property</DialogTitle>
          <DialogDescription>Find your community on Google. Today&apos;s rating is saved as your starting point.</DialogDescription>
        </DialogHeader>
        <form onSubmit={runSearch} className="flex gap-2">
          <Input
            autoFocus
            aria-label="Property name or address"
            placeholder="Property name and city"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button type="submit" disabled={busy !== null || query.trim().length < 3}>
            <Search className="h-4 w-4 mr-2" />{busy === "search" ? "Searching…" : "Search"}
          </Button>
        </form>
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        {hits && hits.length === 0 && <p className="text-sm text-slate-600">No matches on Google. Try adding the city.</p>}
        {hits && hits.length > 0 && (
          <ul className="divide-y border rounded-lg max-h-80 overflow-auto">
            {hits.map((h) => (
              <li key={h.placeId} className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{h.name}</p>
                  <p className="text-sm text-slate-600 truncate">{h.address}</p>
                  {h.rating !== undefined && (
                    <p className="text-sm text-slate-600 flex items-center gap-1.5 mt-0.5">
                      <Stars rating={h.rating} size={13} /> {h.rating} · {h.totalReviews ?? 0} reviews
                    </p>
                  )}
                </div>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => choose(h)}>
                  {busy === h.placeId ? "Adding…" : "Add"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
