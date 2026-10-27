import type { ReactNode } from 'react'

/** Phone-width page layout (works from 360px up), optionally vertically centred. */
export function Screen({ children, centered = false }: { children: ReactNode; centered?: boolean }) {
  return (
    <main
      className={`mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-5 py-10 ${centered ? 'justify-center' : ''}`}
    >
      {children}
    </main>
  )
}

export function Logo({ size = 72 }: { size?: number }) {
  return (
    <img
      src="/logo.svg"
      alt=""
      width={size}
      height={size}
      className="rounded-3xl shadow-[0_12px_40px_rgb(163_230_53/0.15)]"
    />
  )
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  )
}
