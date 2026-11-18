import { expect, it } from 'vitest'
import { buildGroupMessage } from '@/lib/copy'

const locales = ['en', 'he', 'es'] as const
const events = ['signup_open', 'lock_reminder', 'bill_ready'] as const

it('every event in every locale includes the URL', () => {
  for (const locale of locales) {
    for (const event of events) {
      const msg = buildGroupMessage(event, locale, {
        url: 'https://example.test',
        date: 'Tue 30 Mar 20:30',
        venue: 'Campo',
        month: '2026-11',
      })
      expect(msg).toContain('https://example.test')
    }
  }
})

it('never produces empty output', () => {
  for (const locale of locales) {
    for (const event of events) {
      const msg = buildGroupMessage(event, locale, { url: 'https://example.test' })
      expect(msg.trim().length).toBeGreaterThan(0)
    }
  }
})

it('bill_ready includes the month', () => {
  for (const locale of locales) {
    const msg = buildGroupMessage('bill_ready', locale, { url: 'https://example.test', month: '2026-11' })
    expect(msg).toContain('2026-11')
  }
})

it('signup_open includes the date and venue when provided', () => {
  for (const locale of locales) {
    const msg = buildGroupMessage('signup_open', locale, {
      date: 'Tue 30 Mar 20:30',
      venue: 'Campo',
      url: 'https://example.test',
    })
    expect(msg).toContain('20:30')
    expect(msg).toContain('Campo')
  }
})

it('lock_reminder includes the date when provided', () => {
  for (const locale of locales) {
    const msg = buildGroupMessage('lock_reminder', locale, { date: 'Tue 30 Mar 20:30', url: 'https://example.test' })
    expect(msg).toContain('20:30')
  }
})

it('puts the URL on its own line', () => {
  const msg = buildGroupMessage('signup_open', 'en', {
    date: 'Tue 30 Mar 20:30',
    venue: 'Campo',
    url: 'https://example.test',
  })
  expect(msg).toContain('\nhttps://example.test')
})
