import { LegalContact } from '@/components/LegalContact'
import Link from 'next/link'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Data Deletion Instructions — Tuesday Football',
  description: 'How to request deletion of your Tuesday Football account and personal data.',
}

export default function DataDeletionPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 text-start">
      <div dir="ltr" className="space-y-6">
        <PageHeader
          title="Data Deletion Instructions"
          subtitle="How to request deletion of your Tuesday Football account and personal data."
        />

        <Card className="space-y-6 p-6 text-sm leading-relaxed text-ink">
          <p className="text-xs text-muted">Last updated: November 25, 2026</p>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">How to request deletion</h2>
            <p>
              Send an email to <LegalContact subject="Delete my data" /> with the subject{' '}
              <strong>Delete my data</strong>. Include the name and email address you use to
              sign in to Tuesday Football so we can find the right account.
            </p>
            <p>
              If you cannot access that email address, tell us in the message. The
              administrator may ask you to confirm your identity by signing in or by
              answering a question about your account before deleting anything.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">What we delete</h2>
            <ul className="list-disc space-y-1 ps-5">
              <li>Your account and sign-in links to Google and Facebook.</li>
              <li>Your profile: name, nickname, email, phone number, and photo.</li>
              <li>Active sessions, so you are signed out everywhere.</li>
              <li>Notification preferences and browser push subscriptions.</li>
              <li>Waiting-list and roster data that identifies you as a person.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">What may be kept</h2>
            <p>
              Match and payment records may be retained or anonymised where needed for the
              group&apos;s financial records, dispute resolution, or legal obligations.
              Audit records may keep the action and timestamp without your name. Where
              records are kept, we remove or replace direct identifiers.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">How long it takes</h2>
            <p>
              We aim to respond within 30 days. We will confirm when the deletion is
              complete, or explain if some records must be retained and why.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Facebook and Google</h2>
            <p>
              Deleting your Tuesday Football data does not delete your Facebook or Google
              account. To remove this app from Facebook, open Facebook Settings, go to
              <strong> Apps and Websites</strong>, find Tuesday Football, and remove it. You
              can manage Google-connected apps from your Google Account permissions page.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Questions</h2>
            <p>
              For questions about this process, contact <LegalContact subject="Delete my data" />. For information
              about what data the application holds, see the{' '}
              <Link
                className="text-primary underline decoration-primary/40 underline-offset-2"
                href="/privacy"
              >
                privacy policy
              </Link>{' '}
              and the{' '}
              <Link
                className="text-primary underline decoration-primary/40 underline-offset-2"
                href="/terms"
              >
                terms of service
              </Link>
              .
            </p>
          </section>
        </Card>
      </div>
    </main>
  )
}
