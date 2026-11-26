import { Logo } from '@/components/ui/Logo'
import { cn } from '@/lib/cn'

export default function Brand({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <Logo />
      <span className="text-lg font-semibold text-ink">{name}</span>
    </span>
  )
}
