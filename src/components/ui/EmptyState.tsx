import React from 'react'
import { cn } from '@/lib/cn'
import { Icon, IconName } from './icons'

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: IconName | React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({
  icon = 'info',
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-8 sm:p-12 bg-surface rounded-[var(--radius-lg)] border border-line',
        className
      )}
      {...props}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted text-muted mb-4">
        {typeof icon === 'string' ? (
          <Icon name={icon as IconName} size={28} />
        ) : (
          icon
        )}
      </div>
      <h3 className="text-lg font-semibold text-ink mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted max-w-sm mb-6">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
