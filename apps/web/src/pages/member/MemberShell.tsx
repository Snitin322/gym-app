import type { ReactNode } from 'react'
import { CalendarClock, Dumbbell, House, UserRound } from 'lucide-react'
import { AppShell, type TabItem } from '../../ui/AppShell'

const MEMBER_TABS: TabItem[] = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/workout', label: 'Workout', icon: Dumbbell },
  { to: '/pt', label: 'PT', icon: CalendarClock },
  { to: '/profile', label: 'Profile', icon: UserRound },
]

/** A member screen inside the app frame with the Home · Workout · PT · Profile tabs. */
export function MemberShell({ children }: { children: ReactNode }) {
  return <AppShell tabs={MEMBER_TABS}>{children}</AppShell>
}
