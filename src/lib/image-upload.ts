export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

export async function parseImageEntry(
  entry: FormDataEntryValue | null,
): Promise<string | null | undefined> {
  if (!entry) return undefined
  if (entry instanceof File && entry.size > 0) {
    if (entry.size > MAX_IMAGE_BYTES) return null
    const arrayBuffer = await entry.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    return `data:${entry.type || 'image/jpeg'};base64,${base64}`
  }
  if (typeof entry === 'string') {
    const trimmed = entry.trim()
    return trimmed === '' ? null : trimmed
  }
  return undefined
}
