import type { Metadata } from "next"
import type { ReactNode } from "react"

const title = "AptRep Score: how does your apartment community rate?"
const description =
  "Enter any apartment community and see its AptRep Score out of 100 and where it stands nearby, then get a report on what ChatGPT, Gemini and Claude tell renters about it. Free."

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/score" },
  // A child's openGraph replaces the root one, so the share image is repeated here.
  openGraph: { type: "website", url: "/score", siteName: "AptReputation", title, description, images: ["/aptreputation-share-ai.png"] },
  twitter: { card: "summary_large_image", title, description, images: ["/aptreputation-share-ai.png"] },
}

export default function ScoreLayout({ children }: { children: ReactNode }) {
  return children
}
