export type TakerOption = { id: string; name: string; offRoster: boolean }

/**
 * Options for the admin's bag-taker select. The roster comes first; a recorded
 * taker who has since left it is appended so the select can still show (and
 * keep) the honest record.
 */
export function bagTakerOptions(
  members: { id: string; name: string }[],
  actual: { memberId: string; name: string | null; nickname: string | null } | null,
): TakerOption[] {
  const options: TakerOption[] = members.map(member => ({ ...member, offRoster: false }))

  if (actual && !members.some(member => member.id === actual.memberId)) {
    options.push({
      id: actual.memberId,
      name: actual.nickname?.trim() || actual.name || '',
      offRoster: true,
    })
  }

  return options
}
