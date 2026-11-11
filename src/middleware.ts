import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Public: marketing page, auth pages, the NFC/QR tap redirect, shared staff profiles, and legal pages.
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/t/(.*)',
  '/staff/(.*)',
  '/privacy',
  '/terms',
])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
