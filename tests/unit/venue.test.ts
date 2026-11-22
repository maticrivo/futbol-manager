import { expect, it } from 'vitest'
import { isHttpUrl, splitVenue } from '@/lib/venue'

it('splits a legacy venue value into a name and a maps link', () => {
  expect(splitVenue('Onim (אונים) - https://maps.app.goo.gl/WPPALMNQFfW3MX7L6')).toEqual({
    venue: 'Onim (אונים)',
    venueUrl: 'https://maps.app.goo.gl/WPPALMNQFfW3MX7L6',
  })
})

it('leaves a plain venue name untouched', () => {
  expect(splitVenue('Hakoach Pitch')).toEqual({ venue: 'Hakoach Pitch', venueUrl: null })
})

it('keeps only the first URL and trims trailing separators', () => {
  expect(splitVenue('Pitch | https://example.com/map')).toEqual({
    venue: 'Pitch',
    venueUrl: 'https://example.com/map',
  })
})

it('validates http and https URLs', () => {
  expect(isHttpUrl('https://maps.app.goo.gl/abc')).toBe(true)
  expect(isHttpUrl('http://example.com')).toBe(true)
  expect(isHttpUrl('ftp://example.com')).toBe(false)
  expect(isHttpUrl('not a url')).toBe(false)
})
