import {
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  CircleUserRound,
  Dumbbell,
  Ellipsis,
  House,
  IdCard,
  Megaphone,
  UserRound,
  UsersRound,
} from 'lucide-react'
import type { Role } from '@onthec/shared'
import type { TabItem } from '../ui/AppShell'

export const MEMBER_TABS: TabItem[] = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/workout', label: 'Workout', icon: Dumbbell },
  { to: '/pt', label: 'PT', icon: CalendarClock },
  { to: '/profile', label: 'Profile', icon: UserRound },
]

export const TRAINER_TABS: TabItem[] = [
  { to: '/home', label: 'Today', icon: CalendarCheck },
  { to: '/trainer/clients', label: 'Clients', icon: UsersRound },
  { to: '/trainer/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/trainer/profile', label: 'Profile', icon: UserRound, also: ['/trainer/availability'] },
]

const MORE_SCREENS = [
  '/admin/leads',
  '/admin/plans',
  '/admin/workouts',
  '/admin/staff',
  '/admin/trainers',
  '/admin/gym',
]

/** Front desk (owner/admin) on a phone: Today · Members · PT · More. */
export const DESK_TABS: TabItem[] = [
  { to: '/home', label: 'Today', icon: House },
  { to: '/admin/members', label: 'Members', icon: UsersRound },
  { to: '/admin/pt', label: 'PT', icon: CalendarClock },
  { to: '/admin/more', label: 'More', icon: Ellipsis, also: MORE_SCREENS },
]

/** Front desk on a laptop: every screen in a sidebar. */
export function deskSidebar(role: Role): TabItem[] {
  return [
    DESK_TABS[0]!,
    DESK_TABS[1]!,
    DESK_TABS[2]!,
    { to: '/admin/leads', label: 'Leads', icon: Megaphone },
    { to: '/admin/plans', label: 'Plans', icon: ClipboardList },
    { to: '/admin/workouts', label: 'Workouts', icon: Dumbbell },
    { to: '/admin/staff', label: 'Staff', icon: IdCard, also: ['/admin/trainers'] },
    ...(role === 'owner' ? [{ to: '/admin/gym', label: 'Gym details', icon: Building2 }] : []),
    { to: '/admin/more', label: 'Account', icon: CircleUserRound },
  ]
}
