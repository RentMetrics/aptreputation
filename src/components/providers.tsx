"use client"

import { useEffect } from "react"
import { ConvexReactClient, useConvexAuth, useMutation } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { useAuth } from "@clerk/nextjs"
import { api } from "@/convex/_generated/api"

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

/** Creates the user's row in Convex the first time they arrive signed in. */
function EnsureUser() {
  const { isAuthenticated } = useConvexAuth()
  const ensure = useMutation(api.users.ensure)
  useEffect(() => {
    if (isAuthenticated) void ensure()
  }, [isAuthenticated, ensure])
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <EnsureUser />
      {children}
    </ConvexProviderWithClerk>
  )
}
