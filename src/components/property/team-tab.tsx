"use client"

import { useState } from "react"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import { ArrowRight, UserPlus } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { errorMessage, ROLE_LABEL } from "@/lib/format"

type Role = "manager" | "leasing" | "maintenance" | "other"

export function TeamTab({ communityId }: { communityId: Id<"communities"> }) {
  const staff = useQuery(api.staff.list, { communityId })
  const create = useMutation(api.staff.create)
  const [name, setName] = useState("")
  const [role, setRole] = useState<Role>("maintenance")
  const [title, setTitle] = useState("")
  const [startDate, setStartDate] = useState("")
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await create({ communityId, name, role, title: title || undefined, startDate: startDate || undefined })
      setName(""); setTitle(""); setStartDate("")
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="lg:col-span-2 space-y-3">
        {staff === undefined && <p className="text-slate-500">Loading…</p>}
        {staff?.length === 0 && (
          <p className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-600">
            Add your managers, leasing agents and maintenance techs. Each gets a personal review link and a
            profile built from the reviews that name them.
          </p>
        )}
        {staff?.map((s) => (
          <Link
            key={s._id}
            href={`/dashboard/team/${s._id}`}
            className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4 hover:border-blue-400 transition"
          >
            <div className="h-12 w-12 rounded-full bg-slate-900 text-white flex items-center justify-center font-semibold shrink-0">
              {s.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{s.name}{!s.active ? " (former)" : ""}</p>
              <p className="text-sm text-slate-600 truncate">{s.title || ROLE_LABEL[s.role]}</p>
              {s.suggestedCount > 0 && (
                <p className="text-sm text-amber-800">{s.suggestedCount} possible mention{s.suggestedCount > 1 ? "s" : ""} to confirm</p>
              )}
            </div>
            <dl className="hidden sm:grid grid-cols-3 gap-4 text-center text-sm">
              <div><dd className="text-lg font-semibold tabular-nums">{s.praiseCount}</dd><dt className="text-slate-600">Praised by name</dt></div>
              <div><dd className="text-lg font-semibold tabular-nums">{s.taps}</dd><dt className="text-slate-600">Card taps</dt></div>
              <div><dd className="text-lg font-semibold tabular-nums">{s.assistedCount}</dd><dt className="text-slate-600">Reviews after a tap</dt></div>
            </dl>
            <ArrowRight className="h-5 w-5 text-slate-400 shrink-0" />
          </Link>
        ))}
      </section>

      <section className="bg-white border border-slate-200 rounded-xl p-5 h-fit">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><UserPlus className="h-5 w-5" />Add a team member</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="staff-name">Name</Label>
            <Input id="staff-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Carlos Rivera" />
            <p className="text-xs text-slate-500 mt-1">Use the name residents know them by, so reviews match.</p>
          </div>
          <div>
            <Label htmlFor="staff-role">Team</Label>
            <select id="staff-role" className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="maintenance">Maintenance</option>
              <option value="leasing">Leasing</option>
              <option value="manager">Property management</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <Label htmlFor="staff-title">Job title</Label>
            <Input id="staff-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Maintenance Supervisor" />
          </div>
          <div>
            <Label htmlFor="staff-start">Started here</Label>
            <Input id="staff-start" type="month" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <Button type="submit">Add</Button>
        </form>
      </section>
    </div>
  )
}
