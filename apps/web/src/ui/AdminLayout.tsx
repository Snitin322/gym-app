import type { ReactNode } from 'react'
import { Link } from 'react-router'

/** Page shell for staff screens: back link, title, optional action, wider on desktop. */
export function AdminLayout({
  title,
  back,
  action,
  children,
}: {
  title: string
  back?: { to: string; label: string }
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-5 py-6">
      {back && (
        <Link to={back.to} className="-mb-2 self-start text-sm text-muted hover:text-ink">
          ← {back.label}
        </Link>
      )}
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {action}
      </header>
      {children}
    </main>
  )
}

export function LoadingText({ children = 'Loading…' }: { children?: ReactNode }) {
  return <p className="py-8 text-center text-muted">{children}</p>
}
