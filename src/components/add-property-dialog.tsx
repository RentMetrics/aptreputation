"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAction } from "convex/react"
import { Building2, MapPin, Plus, Search } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Stars } from "@/components/stars"
import { errorMessage } from "@/lib/format"

type Hit = {
  placeId: string
  name: string
  address: string
  isResidential: boolean
  rating?: number
  totalReviews?: number
}

export function AddPropertyDialog() {
  const router = useRouter()
  const suggest = useAction(api.communities.suggest)
  const search = useAction(api.communities.search)
  const add = useAction(api.communities.add)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [mode, setMode] = useState<"suggest" | "full">("suggest")
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Groups one dialog's keystrokes into a single Google billing session.
  const session = useRef("")
  // Ignores answers that arrive after a newer keystroke.
  const requestId = useRef(0)

  useEffect(() => {
    if (open) session.current = crypto.randomUUID()
    else {
      setQuery("")
      setHits(null)
      setError(null)
      setMode("suggest")
    }
  }, [open])

  // Suggestions as the manager types.
  useEffect(() => {
    const q = query.trim()
    if (!open || mode === "full") return
    if (q.length < 3) {
      setHits(null)
      return
    }
    const id = ++requestId.current
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const result = await suggest({ query: q, sessionToken: session.current })
        if (id === requestId.current) {
          setHits(result)
          setError(null)
        }
      } catch (err) {
        if (id === requestId.current) setError(errorMessage(err))
      } finally {
        if (id === requestId.current) setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, open, mode, suggest])

  // Wider search with ratings, for when the suggestions miss.
  const fullSearch = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const q = query.trim()
    if (q.length < 3) return
    const id = ++requestId.current
    setMode("full")
    setLoading(true)
    setError(null)
    try {
      const result = await search({ query: q })
      if (id === requestId.current) setHits(result)
    } catch (err) {
      if (id === requestId.current) setError(errorMessage(err))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }

  const choose = async (hit: Hit) => {
    setError(null)
    setAdding(hit.placeId)
    try {
      const id = await add({ placeId: hit.placeId })
      setOpen(false)
      router.push(`/dashboard/property/${id}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setAdding(null)
    }
  }

  const typed = query.trim().length >= 3

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" />Add property</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a property</DialogTitle>
          <DialogDescription>
            Start typing the community&apos;s name. Add the city if several share the name, or search by street address.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={fullSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
            <Input
              autoFocus
              aria-label="Property name, city, or address"
              placeholder="e.g. The Vue at Traverse Ridge, Lehi"
              className="pl-9"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setMode("suggest")
              }}
            />
          </div>
          <Button type="submit" variant="outline" disabled={!typed || adding !== null}>Search</Button>
        </form>

        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}

        <div aria-live="polite" className="min-h-24">
          {!typed && <p className="text-sm text-slate-500">Type at least 3 letters.</p>}
          {typed && loading && !hits && <p className="text-sm text-slate-500">Searching Google…</p>}
          {typed && hits && hits.length === 0 && !loading && (
            <p className="text-sm text-slate-600">
              {mode === "full"
                ? "Google has no listing matching that. Check the spelling, or try the street address."
                : "No suggestions yet. Keep typing, add the city, or press Search."}
            </p>
          )}
          {hits && hits.length > 0 && (
            <ul className={`divide-y border rounded-lg max-h-96 overflow-auto ${loading ? "opacity-60" : ""}`}>
              {hits.map((h) => (
                <li key={h.placeId} className="p-3 flex items-center gap-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${h.isResidential ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                    {h.isResidential ? <Building2 className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{h.name}</p>
                    <p className="text-sm text-slate-600 truncate">{h.address}</p>
                    <p className="text-sm text-slate-600 flex flex-wrap items-center gap-x-1.5 mt-0.5">
                      {h.rating !== undefined && (
                        <><Stars rating={h.rating} size={13} /> {h.rating} · {h.totalReviews ?? 0} reviews ·</>
                      )}
                      <span className={h.isResidential ? "text-blue-800" : "text-slate-500"}>
                        {h.isResidential ? "Apartment community" : "Other listing"}
                      </span>
                    </p>
                  </div>
                  <Button size="sm" disabled={adding !== null} onClick={() => choose(h)}>
                    {adding === h.placeId ? "Adding…" : "Add"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {typed && mode === "suggest" && hits && (
            <button type="button" onClick={() => fullSearch()} className="mt-3 text-sm font-medium text-blue-700 underline">
              Don&apos;t see it? Search all Google listings for &ldquo;{query.trim()}&rdquo;
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
