"use client"

import { useMemo, useState } from "react"
import { useAction, useMutation, useQuery } from "convex/react"
import { AlertTriangle, Check, Copy, ExternalLink, Send, Sparkles, X } from "lucide-react"
import { FunctionReturnType } from "convex/server"
import { api } from "@/convex/_generated/api"
import { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Stars } from "@/components/stars"
import { useCanAct } from "@/components/property/access"
import { errorMessage, formatDate } from "@/lib/format"

type Filter = "needs" | "urgent" | "negative" | "all"

export function ReviewsTab({ communityId, linked, placeId }: { communityId: Id<"communities">; linked: boolean; placeId: string }) {
  const reviews = useQuery(api.reviews.list, { communityId })
  const staff = useQuery(api.staff.list, { communityId })
  const [filter, setFilter] = useState<Filter>("needs")

  const counts = useMemo(() => ({
    needs: reviews?.filter((r) => !r.replyText).length ?? 0,
    urgent: reviews?.filter((r) => r.urgent && !r.replyText).length ?? 0,
    negative: reviews?.filter((r) => r.rating <= 3).length ?? 0,
    all: reviews?.length ?? 0,
  }), [reviews])

  const shown = reviews?.filter((r) =>
    filter === "needs" ? !r.replyText
    : filter === "urgent" ? r.urgent && !r.replyText
    : filter === "negative" ? r.rating <= 3
    : true,
  )

  const tabs: { key: Filter; label: string }[] = [
    { key: "needs", label: "Needs a reply" },
    { key: "urgent", label: "Urgent" },
    { key: "negative", label: "3 stars or lower" },
    { key: "all", label: "All" },
  ]

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5" role="tablist" aria-label="Filter reviews">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={filter === t.key}
            onClick={() => setFilter(t.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
              filter === t.key ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-300 hover:border-slate-500"
            }`}
          >
            {t.label} <span className="tabular-nums opacity-70">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {reviews === undefined && <p className="text-slate-500">Loading reviews…</p>}
      {shown?.length === 0 && (
        <p className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-600">
          {filter === "needs" && counts.all > 0 ? "Every loaded review has a reply." : "No reviews here yet."}
        </p>
      )}

      <ul className="space-y-4">
        {shown?.map((r) => (
          <ReviewCard key={r._id} review={r} staff={staff ?? []} linked={linked} placeId={placeId} />
        ))}
      </ul>
    </div>
  )
}

type Review = FunctionReturnType<typeof api.reviews.list>[number]
type Staff = FunctionReturnType<typeof api.staff.list>

function ReviewCard({ review, staff, linked, placeId }: { review: Review; staff: Staff; linked: boolean; placeId: string }) {
  const draftReply = useAction(api.ai.draftReply)
  const postReply = useAction(api.google.postReply)
  const saveDraft = useMutation(api.reviews.saveDraft)
  const markReplied = useMutation(api.reviews.markReplied)
  const setMention = useMutation(api.reviews.setMention)
  const [text, setText] = useState(review.draftReply ?? "")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const canAct = useCanAct()

  const canPost = linked && review.source === "business"

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
    <li className="bg-white border border-slate-200 rounded-xl p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars rating={review.rating} />
        <span className="font-medium">{review.reviewerName}</span>
        <span className="text-sm text-slate-500">{formatDate(review.reviewDate)}</span>
        {review.sinceJoining && (
          <span className="text-xs font-medium text-brand bg-blue-50 rounded-full px-2 py-0.5">Since joining</span>
        )}
        {review.urgent && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-800 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
            <AlertTriangle className="h-3 w-3" />Urgent
          </span>
        )}
        {review.assistedStaffName && (
          <span className="text-xs text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">
            Followed a tap on {review.assistedStaffName}&apos;s card
          </span>
        )}
      </div>

      <p className="mt-3 whitespace-pre-line text-slate-800">
        {review.text || <span className="text-slate-500 italic">Star rating only, no written review.</span>}
      </p>

      {(review.themes?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {review.themes!.map((t) => (
            <span key={t} className="text-xs bg-blue-50 text-blue-900 rounded-full px-2 py-0.5">{t}</span>
          ))}
        </div>
      )}

      {review.mentions.map((m, i) =>
        m.status === "rejected" ? null : (
          <div key={i} className="mt-3 flex flex-wrap items-center gap-2 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {m.status !== "confirmed" && !canAct ? (
              <span className="text-slate-800">Mentions &ldquo;{m.name}&rdquo; ({m.sentiment}), not yet confirmed.</span>
            ) : m.status === "confirmed" ? (
              <span className="text-slate-800"><Check className="inline h-4 w-4 text-emerald-700 mr-1" />Names <strong>{m.staffName ?? m.name}</strong> ({m.sentiment})</span>
            ) : (
              <>
                <span className="text-slate-800">
                  Mentions &ldquo;{m.name}&rdquo; ({m.sentiment}).{" "}
                  {m.staffName ? <>Is this <strong>{m.staffName}</strong>?</> : staff.length ? "Who is this?" : "Add them on the Team tab to credit this review."}
                </span>
                {m.staffName && (
                  <Button size="sm" variant="outline" onClick={() => run("mention", () => setMention({ reviewId: review._id, index: i, status: "confirmed" }))}>
                    Yes
                  </Button>
                )}
                {!m.staffName && staff.length > 0 && (
                  <select
                    aria-label={`Team member named ${m.name}`}
                    className="border border-slate-300 rounded-md px-2 py-1 bg-white"
                    defaultValue=""
                    onChange={(e) => e.target.value && run("mention", () =>
                      setMention({ reviewId: review._id, index: i, status: "confirmed", staffId: e.target.value as Id<"staff"> }))}
                  >
                    <option value="" disabled>Choose…</option>
                    {staff.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                )}
                <Button size="sm" variant="ghost" onClick={() => run("mention", () => setMention({ reviewId: review._id, index: i, status: "rejected" }))}>
                  <X className="h-4 w-4 mr-1" />Not our staff
                </Button>
              </>
            )}
          </div>
        ),
      )}

      <div className="mt-4 pt-4 border-t border-slate-100">
        {review.replyText ? (
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs font-semibold text-slate-600 mb-1">
              Your reply{review.replyAt ? ` · ${formatDate(review.replyAt)}` : ""}
              {review.replyByName ? ` · posted by ${review.replyByName}` : ""}
            </p>
            <p className="whitespace-pre-line text-slate-800 text-sm">{review.replyText}</p>
          </div>
        ) : !canAct ? (
          <p className="text-sm text-slate-500">
            No reply yet.{review.draftReply ? " A draft is in progress." : ""}
          </p>
        ) : (
          <>
            <label className="sr-only" htmlFor={`reply-${review._id}`}>Reply to {review.reviewerName}</label>
            <textarea
              id={`reply-${review._id}`}
              rows={text ? 5 : 2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => text !== (review.draftReply ?? "") && void saveDraft({ reviewId: review._id, text })}
              placeholder="Write a reply, or draft one with AI and edit it."
              className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => run("draft", async () => setText(await draftReply({ reviewId: review._id })))}
              >
                <Sparkles className="h-4 w-4 mr-1.5" />{busy === "draft" ? "Drafting…" : text ? "Redraft with AI" : "Draft with AI"}
              </Button>
              {canPost ? (
                <Button size="sm" disabled={busy !== null || !text.trim()} onClick={() => run("post", () => postReply({ reviewId: review._id, text }))}>
                  <Send className="h-4 w-4 mr-1.5" />{busy === "post" ? "Posting…" : "Post to Google"}
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!text.trim()}
                    onClick={async () => {
                      await navigator.clipboard.writeText(text)
                      setCopied(true)
                      window.open(`https://search.google.com/local/reviews?placeid=${placeId}`, "_blank", "noopener")
                    }}
                  >
                    {copied ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}Copy and open Google
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Button>
                  <Button size="sm" disabled={busy !== null || !text.trim()} onClick={() => run("mark", () => markReplied({ reviewId: review._id, text }))}>
                    Mark as replied
                  </Button>
                </>
              )}
            </div>
            {!canPost && (
              <p className="text-xs text-slate-500 mt-2">
                Link this property&apos;s Google Business Profile (Settings tab) to post replies without leaving this page.
              </p>
            )}
          </>
        )}
        {error && <p className="text-sm text-red-700 mt-2" role="alert">{error}</p>}
      </div>
    </li>
  )
}
