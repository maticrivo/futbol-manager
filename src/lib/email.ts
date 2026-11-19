export type SentEmail = {
  from: string
  to: string[]
  subject: string
  html: string
  text?: string
}

export const sentEmails: SentEmail[] = []

export function clearSentEmails(): void {
  sentEmails.length = 0
}

/**
 * Sends a magic sign-in link to the requested email.
 * Accepts either a full URL (http://... or https://...) or a raw token.
 * Uses Resend API (POST https://api.resend.com/emails) when RESEND_API_KEY is configured.
 * When in test or when RESEND_API_KEY is missing, gracefully logs / mocks the delivery.
 */
export async function sendMagicLinkEmail(email: string, magicLinkUrl: string): Promise<void> {
  const trimmedEmail = email.trim()
  const rawUrl = magicLinkUrl.trim()

  const url =
    rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
      ? rawUrl
      : `${(process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/login/${rawUrl}`

  const from = process.env.EMAIL_FROM || 'Tuesday Football <onboarding@resend.dev>'
  const subject = 'Your Magic Sign-in Link - Tuesday Football'
  const html = `
    <div style="font-family: sans-serif; line-height: 1.5; color: #111;">
      <h2>Tuesday Football</h2>
      <p>Click the link below to sign in:</p>
      <p><a href="${url}" style="display: inline-block; padding: 10px 20px; background-color: #10b981; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold;">Sign In</a></p>
      <p>Or copy and paste this link into your browser:</p>
      <p><a href="${url}">${url}</a></p>
      <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #6b7280; font-size: 14px;">If you did not request this link, you can safely ignore this email.</p>
    </div>
  `.trim()
  const text = `Sign in to Tuesday Football:\n\n${url}\n\nIf you did not request this link, you can safely ignore this email.`

  const apiKey = process.env.RESEND_API_KEY?.trim()

  const emailRecord: SentEmail = {
    from,
    to: [trimmedEmail],
    subject,
    html,
    text,
  }

  sentEmails.push(emailRecord)

  if (!apiKey) {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[Email Mock] Magic link for ${trimmedEmail}: ${url}`)
    }
    return
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [trimmedEmail],
      subject,
      html,
      text,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `Resend email delivery failed: ${response.status} ${response.statusText} ${errorText}`.trim()
    )
  }
}
