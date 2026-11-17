import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Pages anyone can open without an account. Clerk is skipped on them entirely,
// so visitors, card taps and site reviewers are never sent through a sign-in
// redirect first. Signed-in state on these pages is resolved in the browser.
const isOpenRoute = createRouteMatcher(['/', '/t/(.*)', '/staff/(.*)', '/u/(.*)', '/privacy', '/terms', '/robots.txt', '/sitemap.xml', '/score'])

// Sign-in and sign-up run through Clerk but need no session.
const isAuthPage = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)'])

const withClerk = clerkMiddleware(async (auth, request) => {
  if (!isAuthPage(request)) {
    await auth.protect()
  }
})

// The short domain sends people to the score page. aptrep.com/ opens it, and
// aptrep.com/<property-and-city> opens it with that property already running.
const SHORT_HOSTS = new Set(['aptrep.com', 'www.aptrep.com'])

function shortDomainRedirect(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').toLowerCase().split(':')[0]
  if (!SHORT_HOSTS.has(host)) return null
  const target = new URL('https://www.aptreputation.com/score')
  let slug = request.nextUrl.pathname.slice(1)
  try {
    slug = decodeURIComponent(slug)
  } catch {
    // keep the raw path
  }
  slug = slug.replace(/[-_+/]+/g, ' ').trim().slice(0, 200)
  if (slug && slug !== 'score') target.searchParams.set('q', slug)
  request.nextUrl.searchParams.forEach((value, key) => {
    if (!target.searchParams.has(key)) target.searchParams.set(key, value)
  })
  // Temporary, so the domain can be pointed elsewhere later without stale caches.
  return NextResponse.redirect(target, 307)
}

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  const short = shortDomainRedirect(request)
  if (short) return short
  if (isOpenRoute(request)) return NextResponse.next()
  return withClerk(request, event)
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
