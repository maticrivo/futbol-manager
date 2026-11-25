import { LegalContact } from '@/components/LegalContact'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Privacy Policy — Tuesday Football',
  description: 'How Tuesday Football collects, uses, and protects member data.',
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 text-start">
      <div dir="ltr" className="space-y-6">
        <PageHeader
          title="Privacy Policy"
          subtitle="How Tuesday Football collects, uses, and protects your data."
        />

        <Card className="space-y-6 p-6 text-sm leading-relaxed text-ink">
          <p className="text-xs text-muted">Last updated: November 25, 2026</p>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Who we are</h2>
            <p>
              Tuesday Football is a private web application used by a football group to
              organise weekly matches, waiting lists, guest players, notifications, and
              member billing. The group administrator operates the application and is the
              contact for privacy requests: <LegalContact subject="Privacy request" />.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Data we collect</h2>
            <ul className="list-disc space-y-1 ps-5">
              <li>
                <strong>Sign-in data from Google or Facebook:</strong> your name, email
                address, profile photo, and the provider account identifier.
              </li>
              <li>
                <strong>Profile data:</strong> nickname, phone number, and any photo you
                upload or choose.
              </li>
              <li>
                <strong>Match activity:</strong> sign-ups, waiting-list entries, guest
                names you add, attendance, and related timestamps.
              </li>
              <li>
                <strong>Billing data:</strong> charges, payments, amounts, billing months,
                payment method, and admin notes.
              </li>
              <li>
                <strong>Notification data:</strong> your notification preferences and the
                browser push subscription needed to deliver notifications.
              </li>
              <li>
                <strong>Technical data:</strong> authentication sessions, locale and theme
                preferences, audit-log records of administrative actions, and standard
                server logs.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">How we use your data</h2>
            <p>
              We use this data to authenticate you, let an administrator approve or disable
              accounts, manage match rosters and waiting lists, calculate and record member
              and guest payments, send the notifications you enable, keep an audit trail,
              and protect the application from abuse.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Service providers</h2>
            <p>
              Sign-in is handled by Google or Facebook. The application and database are
              hosted by Vercel and Neon. Push notifications are delivered through the push
              service provided by your browser or device vendor. We do not sell personal
              data or use it for advertising.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Cookies</h2>
            <p>
              We use a necessary authentication cookie to keep you signed in, plus small
              preference cookies for language and theme. We do not use advertising or
              analytics cookies.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Retention</h2>
            <p>
              Account and profile data are kept until you ask us to delete them or the
              administrator closes the account. Match and payment records may be retained
              or anonymised where needed for the group&apos;s financial records, dispute
              resolution, or legal obligations. Audit records may retain the action and
              timestamp without your name after account deletion.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Security</h2>
            <p>
              The application uses HTTPS, server-side sessions, and access controls that
              limit member and billing management to administrators. No system is perfectly
              secure, but we take reasonable steps to protect the data we hold.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Your choices and rights</h2>
            <p>
              You can review and update your profile in the application. You can ask for a
              copy of your data, correct it, or request deletion by contacting{' '}
              <LegalContact subject="Privacy request" />. See the{' '}
              <Link
                className="text-primary underline decoration-primary/40 underline-offset-2"
                href="/data-deletion"
              >
                data deletion instructions
              </Link>{' '}
              for the deletion process.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Children</h2>
            <p>
              The application is intended for adult members of the football group and is
              not directed at children under 16.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Changes to this policy</h2>
            <p>
              We may update this policy when the application or the way we handle data
              changes. The updated date will be shown at the top of this page.
            </p>
          </section>

          <p className="border-t border-line pt-4 text-xs text-muted">
            See also the{' '}
            <Link className="text-primary underline decoration-primary/40 underline-offset-2" href="/terms">
              terms of service
            </Link>{' '}
            and{' '}
            <Link
              className="text-primary underline decoration-primary/40 underline-offset-2"
              href="/data-deletion"
            >
              data deletion instructions
            </Link>
            .
          </p>
        </Card>
      </div>
    </main>
  )
}
