export type CopyEvent = 'signup_open' | 'lock_reminder' | 'bill_ready'

export type CopyInput = {
  date?: string
  venue?: string
  url: string
  month?: string
}

const copy: Record<CopyEvent, Record<'en' | 'he' | 'es', { emoji: string; text: string }>> = {
  signup_open: {
    he: { emoji: '⚽', text: 'ההרשמה נפתחה! אפשר להירשם למשחק ב־{{date}}. {{venue}}' },
    en: { emoji: '⚽', text: 'Sign-up is open! Join the match on {{date}}. {{venue}}' },
    es: { emoji: '⚽', text: '¡Inscripciones abiertas! Apúntate al partido del {{date}}. {{venue}}' },
  },
  lock_reminder: {
    he: { emoji: '🔒', text: 'תזכורת: ההרשמה נסגרת בקרוב. עדכנו את ההרשמה למשחק ב־{{date}}.' },
    en: { emoji: '🔒', text: 'Reminder: sign-up closes soon. Update your sign-up for the match on {{date}}.' },
    es: { emoji: '🔒', text: 'Recordatorio: la inscripción cierra pronto. Actualiza tu inscripción al partido del {{date}}.' },
  },
  bill_ready: {
    he: { emoji: '🧾', text: 'החשבון החודשי של {{month}} מוכן לצפייה.' },
    en: { emoji: '🧾', text: 'The monthly bill for {{month}} is ready to view.' },
    es: { emoji: '🧾', text: 'La cuenta mensual de {{month}} está lista.' },
  },
}

/**
 * Builds a group-chat (e.g. WhatsApp) message for an event, mirroring the
 * notification copy: an emoji, the localized sentence with any date/venue/month
 * substituted, and the URL on its own line.
 */
export function buildGroupMessage(event: CopyEvent, locale: string, input: CopyInput): string {
  const entry = copy[event][locale === 'he' || locale === 'es' ? locale : 'en']
  const substitutions: Record<string, string> = {
    date: input.date ?? '',
    venue: input.venue ?? '',
    month: input.month ?? '',
  }
  const text = entry.text
    .replace(/\{\{(date|month|venue)\}\}/g, (_, key: string) => substitutions[key])
    .replace(/\s{2,}/g, ' ')
    .trim()
  return `${entry.emoji} ${text}\n${input.url}`
}
