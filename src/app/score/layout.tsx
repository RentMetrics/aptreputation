import type { Metadata } from "next"
import type { ReactNode } from "react"

const title = "AptRep Score: how does your apartment community rate?"
const description =
  "Enter any apartment community and see its AptRep Score out of 100, how it is made up, and where it stands against the communities around it. Free, no sign-up."

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/score" },
  // A child's openGraph replaces the root one, so the share image is repeated here.
  openGraph: { type: "website", url: "/score", siteName: "AptReputation", title, description, images: ["/aptreputation-share.png"] },
  twitter: { card: "summary_large_image", title, description, images: ["/aptreputation-share.png"] },
}

export default function ScoreLayout({ children }: { children: ReactNode }) {
  return children
}
