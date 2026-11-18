import type { Result } from './result'

export type ActionResult = { ok: true } | { ok: false; code: string }

export function toActionResult(result: Result<unknown>): ActionResult {
  return result.ok ? { ok: true } : { ok: false, code: result.code }
}
