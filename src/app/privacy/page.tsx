import type { Metadata } from "next"
import Link from "next/link"
import { LegalPage } from "@/components/legal-page"
import { LEGAL } from "@/lib/legal"

export const metadata: Metadata = { title: "Privacy Policy | AptReputation" }

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <section>
        <p>
          {LEGAL.company}, which operates {LEGAL.product} (&ldquo;we&rdquo;, &ldquo;us&rdquo;), provides review management software for apartment
          communities at {LEGAL.site}. This policy explains what information we collect, how we use it, and the
          choices you have. It applies to our website and to the AptReputation application.
        </p>
      </section>

      <section>
        <h2>Information we collect</h2>
        <ul>
          <li><strong>Account information.</strong> Your name, email address and sign-in details when you create an account.</li>
          <li><strong>Property information.</strong> The communities you add, including name, address and Google listing.</li>
          <li><strong>Reviews.</strong> Google reviews of your communities: reviewer display name, star rating, review text, date, and any reply. Reviews are already public on Google.</li>
          <li><strong>Team information.</strong> Names, job titles, start dates and profile details you enter for your staff, and which reviews you confirm are about them.</li>
          <li><strong>Review card and link activity.</strong> When someone taps an NFC card or opens a review link, we record the time and which card or link was used. We do not record who tapped it or collect anything from their device beyond what is needed to redirect them.</li>
          <li><strong>Billing information.</strong> Payments are processed by Stripe. We receive your subscription status, not your full card number.</li>
          <li><strong>Free reputation check.</strong> The property you search for and, if you ask us to follow up, your email address.</li>
          <li><strong>Technical information.</strong> Standard logs such as IP address, browser type and pages requested, used to run and secure the service.</li>
        </ul>
      </section>

      <section>
        <h2>Information from your Google account</h2>
        <p>
          If you connect a Google Business Profile, we ask for the Google permission that lets an application manage
          your business listings. With it we access:
        </p>
        <ul>
          <li>the Business Profile accounts and locations you manage, so you can choose which location belongs to each property;</li>
          <li>the reviews on those locations and your existing replies; and</li>
          <li>your Google account email address, to show which account is connected.</li>
        </ul>
        <p>We use this access only to:</p>
        <ul>
          <li>show your reviews in AptReputation and analyze them for you;</li>
          <li>publish a reply to a review when you choose to post it; and</li>
          <li>keep your reviews and rating up to date.</li>
        </ul>
        <p>
          We never post a reply without your action, and we do not change any other part of your Business Profile.
          Google access tokens are stored on our servers, are never sent to your browser, and are deleted when you
          disconnect Google or close your account. You can disconnect at any time in a property&apos;s Settings tab,
          or revoke access at{" "}
          <a href="https://myaccount.google.com/permissions" rel="noopener">myaccount.google.com/permissions</a>.
        </p>
        <p>
          AptReputation&apos;s use and transfer of information received from Google APIs adheres to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Information obtained through your Google connection is not sold,
          is not used for advertising, is not used to develop or train generalized artificial intelligence or machine
          learning models, and is not read by people at AptReputation except with your permission, for security
          purposes, or to comply with law.
        </p>
      </section>

      <section>
        <h2>How we use information</h2>
        <ul>
          <li>To provide the service: your review inbox, reply drafts, insights, review cards and links, and team profiles.</li>
          <li>To bill you and manage your subscription.</li>
          <li>To respond to you, including about a free reputation check you asked us to follow up on.</li>
          <li>To secure, maintain and improve the service.</li>
        </ul>
      </section>

      <section>
        <h2>Artificial intelligence</h2>
        <p>
          We use an AI model provided by Anthropic to sort reviews by topic and sentiment, identify staff named in a
          review, draft replies for you to edit, and summarize what residents are saying. Review text and the
          property name are sent to Anthropic for this purpose. Under its commercial terms, Anthropic does not use
          this content to train its models. AI output can be wrong; you decide what is posted.
        </p>
        <p>
          We may create de-identified and aggregated information from use of the service, for example benchmarks
          across many communities that do not identify any customer, property, resident or employee, and use it to
          improve our products and for research and analytics. This does not include information obtained through
          your Google connection, which is handled as described above.
        </p>
      </section>

      <section>
        <h2>Team profiles</h2>
        <p>
          A staff member&apos;s profile is private to your account unless you turn on sharing for that person. A
          shared profile is visible to anyone with its link and shows the person&apos;s name, role, community, the
          details you entered, and positive public reviews you confirmed are about them. You are responsible for
          having your staff member&apos;s agreement before sharing their profile. Staff members can ask us to turn
          off or remove a profile by contacting us.
        </p>
      </section>

      <section>
        <h2>Who we share information with</h2>
        <p>We do not sell personal information. We share it only with service providers that help us run AptReputation, under contracts that limit their use of it:</p>
        <ul>
          <li>Convex (database and backend hosting)</li>
          <li>Vercel (website hosting)</li>
          <li>Clerk (sign-in and account security)</li>
          <li>Stripe (payments)</li>
          <li>Anthropic (AI processing)</li>
          <li>Google (Maps and Business Profile services)</li>
        </ul>
        <p>
          We may also disclose information if required by law, to protect our rights or users, or as part of a merger
          or sale of the business, in which case this policy continues to apply to information already collected.
        </p>
      </section>

      <section>
        <h2>Retention and deletion</h2>
        <p>
          We keep your information while your account is open. Removing a property deletes its reviews, insights,
          team profiles and links from AptReputation; nothing on Google is changed. To close your account and delete
          its data, email us. We delete account data within 30 days of a verified request, except records we must
          keep for tax, billing or legal reasons.
        </p>
      </section>

      <section>
        <h2>Your choices and rights</h2>
        <p>
          You can view and correct your information in the application, disconnect Google, and ask us to access,
          correct or delete your personal information. Depending on where you live, you may have additional rights
          under state privacy law, including the right to appeal a decision about your request. We do not
          discriminate against anyone for exercising these rights. To make a request, email{" "}
          <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          Data is encrypted in transit, access to each property is limited to the account that owns it, and secrets
          such as Google tokens are kept on our servers. No system is perfectly secure; if we learn of a breach
          affecting your information we will notify you as the law requires.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>AptReputation is a business tool and is not directed to children under 16. We do not knowingly collect their information.</p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          We will post any changes here and update the effective date. If a change materially affects how we use your
          information, we will notify account holders by email before it takes effect.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          {LEGAL.company}<br />
          {LEGAL.address}<br />
          <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
        </p>
        <p>See also our <Link href="/terms">Terms of Service</Link>.</p>
      </section>
    </LegalPage>
  )
}
