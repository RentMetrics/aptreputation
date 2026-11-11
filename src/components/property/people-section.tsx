"use client"

import { useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { Mail, UserPlus, X } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { errorMessage } from "@/lib/format"

type Notify = "all" | "negative" | "none"
type Role = "manager" | "responder" | "viewer"

const ROLE_TEXT = { owner: "Owner", manager: "Manager", responder: "Team member", viewer: "Viewer" } as const

/** Who can work on this property, and who is emailed when a review arrives. */
export function PeopleSection({ communityId }: { communityId: Id<"communities"> }) {
  const data = useQuery(api.members.list, { communityId })
  const invite = useMutation(api.members.invite)
  const update = useMutation(api.members.update)
  const remove = useMutation(api.members.remove)
  const sendTest = useAction(api.notify.sendTest)

  const [email, setEmail] = useState("")
  const [role, setRole] = useState<Role>("responder")
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

  if (!data) return null

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5">
      <h2 className="text-lg font-semibold">People and alerts</h2>
      <p className="text-sm text-slate-600 mt-1">
        Everyone here can read reviews, reply, and manage review cards for this property. Each person chooses which
        new reviews are emailed to them.
      </p>

      {!data.emailReady && (
        <p className="mt-3 text-sm bg-amber-50 border border-amber-200 text-amber-950 rounded-lg px-3 py-2">
          Email isn&apos;t connected yet, so alerts and invitations are not being sent. People you add still get access when they sign up.
        </p>
      )}

      <ul className="mt-4 divide-y border rounded-lg">
        {data.people.map((p) => (
          <li key={p.key} className="p-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-48">
              <p className="font-medium">
                {p.name}{p.isYou ? " (you)" : ""}
                {p.pending && <span className="ml-2 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Invited, not signed up yet</span>}
              </p>
              <p className="text-sm text-slate-600">{p.email}</p>
            </div>
            {p.role === "owner" || !data.canManage ? (
              <span className="text-sm text-slate-600 w-32">{ROLE_TEXT[p.role]}</span>
            ) : (
              <select
                aria-label={`Role for ${p.name}`}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white w-36"
                value={p.role}
                onChange={(e) => guard(() => update({ communityId, memberId: p.memberId, role: e.target.value as Role }))}
              >
                <option value="manager">Manager</option>
                <option value="responder">Team member</option>
                <option value="viewer">Viewer</option>
              </select>
            )}
            <select
              aria-label={`Email alerts for ${p.name}`}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white disabled:opacity-60"
              value={p.notify}
              disabled={!data.canManage && !p.isYou}
              onChange={(e) => guard(() => update({ communityId, memberId: p.memberId, notify: e.target.value as Notify }))}
            >
              <option value="all">Email every new review</option>
              <option value="negative">Only 3 stars or lower, and urgent</option>
              <option value="none">No emails</option>
            </select>
            {data.canManage && p.memberId && (
              <Button size="sm" variant="ghost" aria-label={`Remove ${p.name}`} onClick={() => confirm(`Remove ${p.name} from this property?`) && guard(() => remove({ communityId, memberId: p.memberId! }))}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>

      {data.canManage && (
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void guard(async () => {
              await invite({ communityId, email, role })
              setEmail("")
            }, "Added. They get access as soon as they sign in with that email.")
          }}
        >
          <div className="flex-1 min-w-56">
            <Label htmlFor="invite-email">Add someone by email</Label>
            <Input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="manager@yourcompany.com" />
          </div>
          <div>
            <Label htmlFor="invite-role">Role</Label>
            <select id="invite-role" className="block border border-slate-300 rounded-md px-3 py-2 text-sm bg-white h-9" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="responder">Team member</option>
              <option value="manager">Manager</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <Button type="submit"><UserPlus className="h-4 w-4 mr-1.5" />Add</Button>
        </form>
      )}
      <p className="text-xs text-slate-500 mt-3">
        Team members reply to reviews and manage cards and staff profiles. Managers can also add people, connect
        Google, and remove the property. Viewers can read everything and get alerts but cannot reply or change
        anything. Billing stays with the owner.
      </p>

      <div className="mt-4 pt-4 border-t flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" disabled={!data.emailReady} onClick={() => guard(() => sendTest({}), "Test email sent. Check your inbox.")}>
          <Mail className="h-4 w-4 mr-1.5" />Send me a test alert
        </Button>
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        {notice && <p className="text-sm text-emerald-800" role="status">{notice}</p>}
      </div>
    </section>
  )
}
