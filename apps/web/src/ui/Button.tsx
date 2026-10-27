import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink font-bold disabled:opacity-60',
  secondary: 'bg-surface-2 text-ink font-semibold border border-line disabled:opacity-60',
  ghost: 'text-muted font-medium underline-offset-4 hover:underline disabled:opacity-60',
}

export function Button({
  variant = 'primary',
  loading = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      type="button"
      className={`min-h-12 w-full cursor-pointer rounded-xl px-4 text-base transition-opacity disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? 'Please wait…' : children}
    </button>
  )
}
