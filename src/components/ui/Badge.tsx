import React from 'react'
import { cn } from '@/lib/cn'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'neutral' | 'outline'
  size?: 'sm' | 'md'
}

export function Badge({
  className,
  variant = 'primary',
  size = 'md',
  children,
  ...props
}: BadgeProps) {
  const variants = {
    primary: 'bg-primary-soft text-primary',
    secondary: 'bg-surface-muted text-muted',
    success: 'bg-primary-soft text-primary',
    danger: 'bg-danger-soft text-danger',
    warning: 'bg-warning-soft text-warning',
    neutral: 'bg-surface-muted text-ink',
    outline: 'border border-line text-ink bg-surface',
  }

  const sizes = {
    sm: 'text-[11px] px-2 py-0.5 rounded-[var(--radius-sm)]',
    md: 'text-xs px-2.5 py-1 rounded-[var(--radius-pill)]',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium tracking-wide',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}
