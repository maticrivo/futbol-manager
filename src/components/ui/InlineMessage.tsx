import React from 'react'
import { cn } from '@/lib/cn'
import { Icon, IconName } from './icons'

export interface InlineMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'info' | 'success' | 'warning' | 'danger'
  title?: string
  icon?: IconName | React.ReactNode
}

export function InlineMessage({
  variant = 'info',
  title,
  icon,
  className,
  children,
  ...props
}: InlineMessageProps) {
  const variants = {
    info: 'bg-surface-muted text-ink border-line',
    success: 'bg-primary-soft text-primary border-primary/20',
    warning: 'bg-warning-soft text-warning border-warning/20',
    danger: 'bg-danger-soft text-danger border-danger/20',
  }

  const defaultIcons: Record<NonNullable<InlineMessageProps['variant']>, IconName> = {
    info: 'info',
    success: 'check',
    warning: 'alert-triangle',
    danger: 'x',
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3.5 rounded-[var(--radius-md)] border text-sm',
        variants[variant],
        className
      )}
      {...props}
    >
      <span className="mt-0.5 shrink-0">
        {typeof icon === 'string' ? (
          <Icon name={icon as IconName} size={18} />
        ) : icon ? (
          icon
        ) : (
          <Icon name={defaultIcons[variant]} size={18} />
        )}
      </span>
      <div className="flex-1 leading-relaxed">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  )
}
