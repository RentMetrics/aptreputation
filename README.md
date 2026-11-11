# AptReputation

Google review management for apartment communities: a review inbox with AI reply
drafts, resident insights, NFC/QR review requests with tap tracking, and shareable
staff profiles ("mini resumes") built from the reviews that name each team member.

Stack: Next.js 15 (App Router) · Convex · Clerk · Stripe · Claude (Anthropic API).

## Run locally

```bash
npm install
npx convex dev      # pushes functions, watches for changes
npm run dev         # http://localhost:3000
```

Next.js only needs the Clerk keys and the Convex URL (`.env.local`). Every other
secret lives in the Convex environment — see `env.example` for the full list.

## How it fits together

| Area | Where |
|---|---|
| Access rules (sign-in, ownership, admin, trial/subscription) | `convex/lib/auth.ts` |
| Properties, public Places lookup | `convex/communities.ts`, `convex/lib/google.ts` |
| Google Business Profile connect, full review sync, posting replies | `convex/google.ts` |
| Reviews, staff-mention confirmation, insights storage | `convex/reviews.ts` |
| AI: per-review analysis, reply drafts, insights, audit summary | `convex/ai.ts` |
| Team profiles and the public profile query | `convex/staff.ts`, `src/app/staff/[slug]` |
| NFC cards, QR links, tap logging, admin card inventory | `convex/tags.ts`, `src/app/t/[code]` |
| Team access per property (owner, manager, team member) | `convex/members.ts` |
| New-review emails and invitations (Resend) | `convex/notify.ts` |
| Progress since joining (baseline, charts) | `convex/communities.ts` (`progress`), `src/components/charts.tsx` |
| Stripe checkout, portal, webhook | `convex/billing.ts`, `convex/http.ts` |
| Free audit + lead capture | `convex/audit.ts`, `src/app/page.tsx` |

### Reviews: two sources

* **Public sample** — Google's Places API returns only the 5 newest reviews. Used for
  the free audit and until a property is linked.
* **Business Profile** — once the manager connects Google and links the location,
  every review is synced (hourly and on demand) and replies post to Google.
  The Google Cloud project must be approved for the Business Profile APIs.

### NFC cards

Every card or QR link has a 7-character code served at `/t/<code>`. A tap is logged,
then the visitor is redirected to the property's Google review form.

* Admin → NFC cards: load physical cards into inventory (by chip serial or as a
  count), download the CSV of links, and write each link to its card as a URL record.
* Customers add a card on a property's **Get reviews** tab, by code (cards you
  shipped) or as a blank card (they get a link to write themselves).
* Assign a card to a team member to credit their taps. A review that appears within
  48 hours of a tap is shown as "after a tap" for that person (a likely match — Google
  does not say who tapped).

### Review-request rules (do not remove)

Everyone is sent to the same Google form. No pre-screening by sentiment and no
incentives: both violate Google's review policy and the FTC's fake-review rule.

## Pricing

$99 per property per month, 14-day free trial without a card. Quantity follows the
number of properties.
