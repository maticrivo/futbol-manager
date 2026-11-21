import React from 'react'
import { cn } from '@/lib/cn'

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  subtitle?: React.ReactNode
  action?: React.ReactNode
  backButton?: React.ReactNode
}

export function PageHeader({
  title,
  subtitle,
  action,
  backButton,
  className,
  ...props
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 pb-4 pt-2 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-3">
        {backButton}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="flex items-center gap-2 self-start sm:self-auto">{action}</div>}
    </div>
  )
}
