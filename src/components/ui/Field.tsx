import React from 'react'
import { cn } from '@/lib/cn'

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string
  error?: string
  hint?: string
  required?: boolean
}

export function Field({
  label,
  error,
  hint,
  required,
  className,
  children,
  ...props
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)} {...props}>
      {label && (
        <label className="text-sm font-medium text-ink flex items-center gap-1">
          {label}
          {required && <span className="text-danger">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-danger mt-0.5">{error}</p>}
      {!error && hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
    </div>
  )
}
