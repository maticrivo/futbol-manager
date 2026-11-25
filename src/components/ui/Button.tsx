import React from 'react'
import { cn } from '@/lib/cn'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  href?: string
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      href,
      asChild = false,
      ...props
    },
    ref
  ) => {
    const variants = {
      primary:
        'bg-primary text-on-primary hover:bg-primary-hover shadow-sm active:scale-[0.98]',
      secondary:
        'bg-surface-muted text-ink hover:bg-line active:scale-[0.98]',
      outline:
        'border border-line bg-surface text-ink hover:bg-surface-muted active:scale-[0.98]',
      ghost:
        'text-ink hover:bg-surface-muted active:scale-[0.98]',
      danger:
        'bg-danger text-white hover:opacity-90 shadow-sm active:scale-[0.98]',
    }

    const sizes = {
      sm: 'h-9 px-3 text-xs rounded-[var(--radius-sm)] gap-1.5',
      md: 'h-11 px-4 text-sm rounded-[var(--radius-md)] gap-2 min-w-[44px] min-h-[44px]',
      lg: 'h-12 px-6 text-base rounded-[var(--radius-lg)] gap-2.5 min-w-[44px] min-h-[44px]',
      icon: 'h-11 w-11 rounded-[var(--radius-md)] p-0 flex items-center justify-center min-w-[44px] min-h-[44px]',
    }

    const combinedClassName = cn(
      'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-50 select-none',
      variants[variant],
      sizes[size],
      className
    )

    const content = (
      <>
        {isLoading ? (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          leftIcon
        )}
        {children}
        {!isLoading && rightIcon}
      </>
    )

    if (asChild && React.isValidElement<{ className?: string }>(children)) {
      return React.cloneElement(children, {
        className: cn(combinedClassName, children.props.className),
      })
    }

    if (href) {
      return (
        <a href={href} className={combinedClassName} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
          {content}
        </a>
      )
    }

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={combinedClassName}
        {...props}
      >
        {content}
      </button>
    )
  }
)

Button.displayName = 'Button'
