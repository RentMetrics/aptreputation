import { ConvexError } from "convex/values"

/** The message a user should see for a failed Convex call. */
export function errorMessage(e: unknown): string {
  if (e instanceof ConvexError) return typeof e.data === "string" ? e.data : "Something went wrong."
  return "Something went wrong. Please try again."
}

export function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function timeAgo(ms: number) {
  const minutes = Math.round((Date.now() - ms) / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return `${Math.round(hours / 24)} days ago`
}

export function tenure(startDate?: string | null) {
  if (!startDate) return null
  const [y, m] = startDate.split("-").map(Number)
  if (!y) return null
  const months = (new Date().getFullYear() - y) * 12 + (new Date().getMonth() + 1 - (m || 1))
  if (months < 1) return "New this month"
  if (months < 12) return `${months} mo`
  const years = Math.floor(months / 12)
  return `${years} yr${years > 1 ? "s" : ""}${months % 12 ? ` ${months % 12} mo` : ""}`
}

export const ROLE_LABEL: Record<string, string> = {
  manager: "Property Management",
  leasing: "Leasing",
  maintenance: "Maintenance",
  other: "Team Member",
}

export function tapUrl(code: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin
  return `${origin}/t/${code}`
}
