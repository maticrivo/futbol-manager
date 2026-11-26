'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isPrimaryNavActive } from '@/lib/nav'
import { cn } from '@/lib/cn'

export default function NavLink({
  href,
  label,
  icon,
  variant = 'desktop',
}: {
  href: string
  label: string
  icon?: string
  variant?: 'desktop' | 'mobile'
}) {
  const pathname = usePathname()
  const active = isPrimaryNavActive(href, pathname)

  if (variant === 'mobile') {
    return (
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex flex-1 flex-col items-center justify-center py-1 text-xs font-medium transition-colors',
          active ? 'text-primary' : 'text-muted hover:text-ink',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
            active && 'bg-primary-soft',
          )}
        >
          {icon}
        </span>
        <span>{label}</span>
      </Link>
    )
  }

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-[var(--radius-pill)] px-2.5 py-1.5 transition-colors lg:px-3',
        active ? 'bg-primary-soft text-primary' : 'text-muted hover:text-ink',
      )}
    >
      {label}
    </Link>
  )
}
