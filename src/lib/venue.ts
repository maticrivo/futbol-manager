const URL_PATTERN = /https?:\/\/[^\s]+/i

export function splitVenue(value: string): { venue: string; venueUrl: string | null } {
  const trimmed = value.trim()
  const match = trimmed.match(URL_PATTERN)
  if (!match) return { venue: trimmed, venueUrl: null }

  const withoutUrl = trimmed.slice(0, match.index).trim()
  const venue = withoutUrl.replace(/[\s\-–—:|]+$/, '').trim()
  return { venue: venue || trimmed.replace(match[0], '').trim(), venueUrl: match[0] }
}

export function isHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
