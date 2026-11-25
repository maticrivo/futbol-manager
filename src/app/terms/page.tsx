import { LegalContact } from '@/components/LegalContact'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Terms of Service — Tuesday Football',
  description: 'The rules for using the Tuesday Football application.',
}

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 text-start">
      <div dir="ltr" className="space-y-6">
        <PageHeader
          title="Terms of Service"
          subtitle="The rules for using the Tuesday Football application."
        />

        <Card className="space-y-6 p-6 text-sm leading-relaxed text-ink">
          <p className="text-xs text-muted">Last updated: November 25, 2026</p>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Acceptance</h2>
            <p>
              Tuesday Football is a private web application for a football group. By signing
              in or using the application, you agree to these terms. If you do not agree,
              do not use the application.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Who may use it</h2>
            <p>
              The application is intended for members of the group and invited guests. New
              accounts need administrator approval before they can use match, waiting-list,
              and billing features. The administrator may approve, disable, or remove
              accounts to protect the group and the application.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Your account</h2>
            <p>
              Sign-in is provided by Google or Facebook. Keep your provider account secure
              and give accurate profile information. You are responsible for activity under
              your account. Do not share your session or impersonate another member.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Using the application</h2>
            <p>
              You may use the application only to organise and participate in the
              group&apos;s football matches, waiting lists, guest invitations, notifications,
              and related payments. Do not attempt to access another member&apos;s account,
              interfere with the service, submit false sign-ups, or use the application for
              unlawful or abusive activity.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Payments</h2>
            <p>
              The application records charges and payments for the group&apos;s internal
              bookkeeping. It does not process card payments or hold money. Amounts, payment
              methods, and billing periods are set and recorded by the group administrator.
              If you believe a record is wrong, contact the administrator.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Guest information</h2>
            <p>
              If you add a guest, you confirm that you may share their name with the group
              for roster purposes. Do not enter another person&apos;s private information
              without permission.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Availability and changes</h2>
            <p>
              The application is provided as-is for the group&apos;s convenience. Features
              may change, be suspended, or be unavailable. We do not guarantee uninterrupted
              access or that every record will always be available.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Ending access</h2>
            <p>
              You may stop using the application at any time. The administrator may suspend
              or disable an account for misuse, non-payment, or behaviour that harms the
              group. To request deletion of your data, follow the{' '}
              <Link
                className="text-primary underline decoration-primary/40 underline-offset-2"
                href="/data-deletion"
              >
                data deletion instructions
              </Link>
              .
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Disclaimer and responsibility</h2>
            <p>
              To the extent permitted by law, the application is provided without warranties,
              and the group administrator is not liable for indirect or consequential loss
              arising from use of the application. Nothing in these terms limits rights that
              cannot be limited by law. You are responsible for your own participation in
              matches and for following the group&apos;s safety and conduct rules.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Privacy</h2>
            <p>
              Our{' '}
              <Link
                className="text-primary underline decoration-primary/40 underline-offset-2"
                href="/privacy"
              >
                privacy policy
              </Link>{' '}
              explains what data we collect and how it is used.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Changes to these terms</h2>
            <p>
              We may update these terms as the application changes. The updated date will be
              shown at the top of this page. Continued use after a change means you accept
              the updated terms.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Contact</h2>
            <p>
              Questions about these terms: <LegalContact subject="Terms of Service question" />.
            </p>
          </section>
        </Card>
      </div>
    </main>
  )
}
