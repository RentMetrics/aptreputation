import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { fetchAction } from "convex/nextjs"
import { ConvexError } from "convex/values"
import { api } from "@/convex/_generated/api"

/** Google sends the manager back here after they approve Business Profile access. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const done = (params: Record<string, string>) => {
    const target = new URL("/dashboard", url.origin)
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v)
    return NextResponse.redirect(target)
  }

  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  if (url.searchParams.get("error") || !code || !state) {
    return done({ google: "error", message: "Google access was not granted." })
  }

  const { getToken } = await auth()
  const token = await getToken({ template: "convex" })
  if (!token) return done({ google: "error", message: "Please sign in and try again." })

  try {
    // The exchange runs in Convex as this user, so tokens are stored against the right account.
    await fetchAction(api.google.completeConnect, { code, state }, { token })
    return done({ google: "connected" })
  } catch (e) {
    const message = e instanceof ConvexError && typeof e.data === "string" ? e.data : "Could not connect Google."
    return done({ google: "error", message })
  }
}
