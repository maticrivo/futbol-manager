import { cn } from '@/lib/cn'

export function FootballSpinner({ size = 60, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={cn('football-spin', className)}
    >
      <clipPath id="football-clip">
        <circle cx="24" cy="24" r="22" />
      </clipPath>
      <circle cx="24" cy="24" r="22" fill="#f7f7f2" stroke="#161a18" strokeWidth="2" />
      <g clipPath="url(#football-clip)">
        <polygon
          points="24,16.6 31.04,21.71 28.35,29.99 19.65,29.99 16.96,21.71"
          fill="#161a18"
        />
        {[0, 72, 144, 216, 288].map((angle) => (
          <g key={angle} transform={`rotate(${angle} 24 24)`}>
            <line x1="24" y1="16.6" x2="24" y2="13.9" stroke="#161a18" strokeWidth="1.6" />
            <polygon
              points="24,13.9 17.91,9.48 20.24,2.32 27.76,2.32 30.09,9.48"
              fill="#161a18"
              stroke="#161a18"
              strokeWidth="1.2"
            />
          </g>
        ))}
      </g>
      <circle cx="24" cy="24" r="22" fill="none" stroke="#161a18" strokeWidth="2" />
    </svg>
  )
}
