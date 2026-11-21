import React from 'react'

export function MemberName({
  name,
  nickname,
}: {
  name: string | null | undefined
  nickname: string | null | undefined
}) {
  const display = nickname && nickname.trim() !== '' ? nickname.trim() : (name ?? '')
  const realName = name ?? ''

  if (nickname && nickname.trim() !== '' && realName && realName !== nickname) {
    return (
      <span
        title={`Real name: ${realName}`}
        className="cursor-help underline decoration-dotted underline-offset-4"
      >
        <bdi>{display}</bdi>
      </span>
    )
  }
  return <bdi>{display}</bdi>
}
