import React from 'react'
import { cn } from '@/lib/cn'

export function initials(name: string): string {
  if (!name || typeof name !== 'string') return ''
  const trimmed = name.trim()
  if (!trimmed) return ''

  const parts = trimmed.split(/\s+/)
  if (parts.length === 1) {
    const word = parts[0]
    // If word has 2 or more chars, take first 2 chars
    if (word.length >= 2) {
      return word.slice(0, 2).toUpperCase()
    }
    return word.toUpperCase()
  }

  const first = parts[0]
  const last = parts[parts.length - 1]
  const firstChar = first ? first[0] : ''
  const lastChar = last ? last[0] : ''

  return (firstChar + lastChar).toUpperCase()
}

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Avatar({
  name,
  src,
  size = 'md',
  className,
  ...props
}: AvatarProps) {
  const [imageError, setImageError] = React.useState(false)

  const sizes = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
    xl: 'h-16 w-16 text-lg',
  }

  const computedInitials = initials(name)

  return (
    <div
      className={cn(
        'relative inline-flex items-center justify-center rounded-full bg-surface-muted text-ink font-semibold overflow-hidden shrink-0 select-none border border-line',
        sizes[size],
        className
      )}
      {...props}
    >
      {src && !imageError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <span>{computedInitials}</span>
      )}
    </div>
  )
}
