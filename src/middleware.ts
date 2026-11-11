import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Pages anyone can open without an account. Clerk is skipped on them entirely,
// so visitors, card taps and site reviewers are never sent through a sign-in
// redirect first. Signed-in state on these pages is resolved in the browser.
const isOpenRoute = createRouteMatcher(['/', '/t/(.*)', '/staff/(.*)', '/privacy', '/terms'])

// Sign-in and sign-up run through Clerk but need no session.
const isAuthPage = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)'])

const withClerk = clerkMiddleware(async (auth, request) => {
  if (!isAuthPage(request)) {
    await auth.protect()
  }
})

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (isOpenRoute(request)) return NextResponse.next()
  return withClerk(request, event)
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
