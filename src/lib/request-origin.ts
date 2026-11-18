const authorityPattern = /^(\[[a-f0-9:.]+\]|[a-z0-9.-]+)(?::([0-9]+))?$/i
const labelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
const loopbackPattern = /^(?:localhost|127(?:\.[0-9]{1,3}){3}|\[::1\])$/i

export function requestOrigin(headers: Headers, fallbackUrl: string): string {
  const forwardedHost = headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  const forwardedProto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()

  for (const candidate of [forwardedHost, headers.get('host')]) {
    if (!candidate) continue
    const match = authorityPattern.exec(candidate)
    if (!match) continue
    const [, hostname, port] = match
    if (port !== undefined && Number(port) > 65535) continue
    if (!hostname.startsWith('[') &&
        (hostname.length > 253 || !hostname.split('.').every((label) => labelPattern.test(label)))) {
      continue
    }

    const protocol = forwardedProto === 'http' || forwardedProto === 'https'
      ? forwardedProto
      : loopbackPattern.test(hostname) ? 'http' : 'https'
    try {
      return new URL(`${protocol}://${candidate}`).origin
    } catch {
      // A syntactically plausible authority can still contain an invalid IP.
    }
  }

  return new URL(fallbackUrl).origin
}
