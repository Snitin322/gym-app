import type { ReactNode } from 'react'
import { useSignedInUser } from '../auth/AuthContext'
import { ROLE_LABELS } from '../lib/format'
import { DESK_TABS, TRAINER_TABS, deskSidebar } from '../lib/nav'
import { AppShell, PageHeader } from './AppShell'
import { Logo } from './Screen'

/**
 * The frame for staff screens. The front desk gets Today · Members · PT · More (a sidebar on laptops);
 * trainers (on their availability screen) keep their own tabs.
 */
export function DeskShell({ children }: { children: ReactNode }) {
  const user = useSignedInUser()
  if (user.role === 'trainer') return <AppShell tabs={TRAINER_TABS}>{children}</AppShell>
  const header = (
    <div className="flex items-center gap-3">
      <Logo size={40} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{user.gym.name}</p>
        <p className="text-xs text-muted">{ROLE_LABELS[user.role]}</p>
      </div>
    </div>
  )
  return (
    <AppShell tabs={DESK_TABS} sidebar={{ header, items: deskSidebar(user.role) }}>
      {children}
    </AppShell>
  )
}

/** A staff screen: title (with optional back link, line under it and action), inside the desk frame. */
export function AdminLayout({
  title,
  subtitle,
  back,
  action,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: { to: string; label: string }
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <DeskShell>
      <PageHeader title={title} subtitle={subtitle} back={back} action={action} />
      {children}
    </DeskShell>
  )
}

export function LoadingText({ children = 'Loading…' }: { children?: ReactNode }) {
  return <p className="py-8 text-center text-muted">{children}</p>
}
