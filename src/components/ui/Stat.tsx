import React from 'react'
import { cn } from '@/lib/cn'
import { Icon, IconName } from './icons'

export interface StatProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string
  value: string | number
  change?: string
  trend?: 'up' | 'down' | 'neutral'
  icon?: IconName | React.ReactNode
}

export function Stat({
  label,
  value,
  change,
  trend = 'neutral',
  icon,
  className,
  ...props
}: StatProps) {
  return (
    <div
      className={cn(
        'bg-surface border border-line shadow-card rounded-[var(--radius-lg)] p-4 sm:p-5 flex flex-col justify-between',
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-muted">{label}</span>
        {icon && (
          <span className="text-muted p-1 bg-surface-muted rounded-[var(--radius-sm)]">
            {typeof icon === 'string' ? <Icon name={icon as IconName} size={16} /> : icon}
          </span>
        )}
      </div>
      <div>
        <div className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
          {value}
        </div>
        {change && (
          <div
            className={cn(
              'text-xs font-medium mt-1 flex items-center gap-1',
              trend === 'up' && 'text-primary',
              trend === 'down' && 'text-danger',
              trend === 'neutral' && 'text-muted'
            )}
          >
            {change}
          </div>
        )}
      </div>
    </div>
  )
}
