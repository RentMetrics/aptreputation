import { NextRequest, NextResponse } from "next/server"
import { fetchMutation } from "convex/nextjs"
import { api } from "@/convex/_generated/api"

/**
 * Where every NFC card and QR code points: /t/<code>.
 * Logs the tap, then sends the resident to the property's Google review form.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const origin = new URL(request.url).origin
  try {
    const result = await fetchMutation(api.tags.recordTap, { code })
    if (result.status === "ok") {
      const response = NextResponse.redirect(result.url, 302)
      response.headers.set("Cache-Control", "no-store")
      return response
    }
  } catch (e) {
    console.error("Tap failed", e)
  }
  return NextResponse.redirect(new URL("/?card=inactive", origin), 302)
}
