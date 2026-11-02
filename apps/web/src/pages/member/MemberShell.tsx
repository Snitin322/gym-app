import type { ReactNode } from 'react'
import { MEMBER_TABS } from '../../lib/nav'
import { AppShell } from '../../ui/AppShell'

/** A member screen inside the app frame with the Home · Workout · PT · Profile tabs. */
export function MemberShell({ children }: { children: ReactNode }) {
  return <AppShell tabs={MEMBER_TABS}>{children}</AppShell>
}
