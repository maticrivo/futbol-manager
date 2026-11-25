import type { Result } from './result'

export type ActionResult = { ok: true } | { ok: false; code: string }

export function toActionResult(result: Result<unknown>): ActionResult {
  return result.ok ? { ok: true } : { ok: false, code: result.code }
}

export function parseUserId(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim()
  return id.length > 0 && id.length <= 64 ? id : null
}
