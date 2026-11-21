import React from 'react'
import { cn } from '@/lib/cn'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'surface' | 'muted' | 'interactive' | 'danger'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export function Card({
  className,
  variant = 'default',
  padding = 'md',
  children,
  ...props
}: CardProps) {
  const variants = {
    default: 'bg-surface border border-line shadow-card rounded-[var(--radius-lg)]',
    surface: 'bg-surface rounded-[var(--radius-lg)]',
    muted: 'bg-surface-muted rounded-[var(--radius-lg)]',
    interactive:
      'bg-surface border border-line shadow-card rounded-[var(--radius-lg)] transition-all hover:border-primary/50 hover:shadow-md cursor-pointer',
    danger:
      'bg-danger-soft border border-danger/30 text-ink rounded-[var(--radius-lg)] shadow-card',
  }

  const paddings = {
    none: '',
    sm: 'p-3',
    md: 'p-4 sm:p-5',
    lg: 'p-6 sm:p-7',
  }

  return (
    <div
      className={cn(variants[variant], paddings[padding], className)}
      {...props}
    >
      {children}
    </div>
  )
}
