# APT Reputation - Testing Guide

## ✅ Completed Changes

### 1. Authentication Flow Fixed
- **Sign-up now redirects to dashboard** instead of landing page
- Users can immediately access the dashboard after creating an account
- Authentication middleware protects dashboard and admin routes

### 2. Stripe Test Mode Configured
- Stripe keys are set to test mode in `.env.local`
- Payment processing is in test mode (no real charges)
- Live keys are commented out for when you're ready to go live

### 3. Route Protection
- Created middleware to protect authenticated routes
- Dashboard requires sign-in
- Landing page and API test endpoints are public

## 🧪 Testing the Application

### Sign Up Flow
1. Go to: https://aptreputation-c0m6pvp38-curtis-holders-projects.vercel.app
2. Click "Sign Up" or "Start Free Trial"
3. Create a new account with Clerk
4. **You should be redirected to `/dashboard` immediately**

### Dashboard Testing
Once logged in, test these features:
- [ ] View property cards and stats
- [ ] Switch between properties
- [ ] View recent reviews
- [ ] Check reputation score display
- [ ] Test NFC card management section
- [ ] Verify Google integration status component

### Sign In Flow
1. Sign out if logged in
2. Go to sign-in page
3. Enter credentials
4. Should redirect to dashboard

## 🔧 Stripe Setup (On Hold)

### What's Already Done:
- Stripe test keys are in `.env.local`
- Payment form component exists: `src/components/stripe-payment-form.tsx`
- Sign-up flow has payment integration code (currently bypassed)

### What You Need Before Going Live:
1. **Get Real Stripe Test Keys:**
   - Go to https://dashboard.stripe.com/test/apikeys
   - Copy your test publishable key (starts with `pk_test_`)
   - Copy your test secret key (starts with `sk_test_`)
   - Update `.env.local` with real test keys

2. **Test Payment Flow:**
   - When ready, update sign-up redirect back to multi-step flow
   - Change `afterSignUpUrl="/dashboard"` to `afterSignUpUrl="/sign-up?step=2"`
   - Test with Stripe test card: 4242 4242 4242 4242

3. **Before Going Live:**
   - Uncomment live keys in `.env.local`
   - Update environment variables in Vercel
   - Test with real payment methods
   - Set up Stripe webhooks for subscription management

## 🚀 Deployment Info

**Production URL:** https://aptreputation-c0m6pvp38-curtis-holders-projects.vercel.app

**Latest Deployment:**
- Includes sign-up redirect fix
- Has authentication middleware
- Stripe in test mode
- Optimized landing page with hero image and NFC card feature

## 📝 Environment Variables Needed in Vercel

Make sure these are set in Vercel dashboard:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CONVEX_DEPLOYMENT`
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- `NEXT_PUBLIC_GOOGLE_GEMINI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (test mode for now)
- `STRIPE_SECRET_KEY` (test mode for now)

## 🐛 Known Issues to Test

1. **Convex Integration:** Verify that property data saves correctly
2. **Google Places API:** Test property search functionality
3. **Review Analysis:** Test AI sentiment analysis with Gemini
4. **NFC Card Management:** Verify card ordering flow works

## 📞 Next Steps

1. **Test the sign-up flow** and verify redirect to dashboard
2. **Test dashboard functionality** without payment
3. **Report any issues** you find
4. **When ready for payments:**
   - Get real Stripe test keys
   - Re-enable payment flow in sign-up
   - Test end-to-end with test cards
5. **When ready to go live:**
   - Switch to Stripe live keys
   - Update Vercel environment variables
   - Remove test mode comments from code
