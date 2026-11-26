import Image from 'next/image'
import { cn } from '@/lib/cn'

export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/app-icon.svg"
      alt=""
      width={size}
      height={size}
      className={cn('rounded-[6px] ring-1 ring-line', className)}
    />
  )
}
