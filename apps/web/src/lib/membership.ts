import {
  daysBetween,
  formatPaise,
  type IsoDate,
  type MemberListStatus,
  type MembershipPlan,
  type MembershipStatus,
  type MembershipView,
} from '@onthec/shared'
import { formatDate, plural } from './format'

export type BadgeTone = 'good' | 'info' | 'warn' | 'bad' | 'muted'

type AnyStatus = MembershipStatus | MemberListStatus

export const STATUS_BADGES: Record<AnyStatus, { label: string; tone: BadgeTone }> = {
  active: { label: 'Active', tone: 'good' },
  frozen: { label: 'Frozen', tone: 'info' },
  expiring: { label: 'Expiring', tone: 'warn' },
  upcoming: { label: 'Upcoming', tone: 'info' },
  expired: { label: 'Expired', tone: 'bad' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
  none: { label: 'No plan', tone: 'muted' },
}

/** One-line summary: "12 days left", "Last day today", "Starts 1 Apr", "Expired 3 days ago"… */
export function membershipSummary(m: MembershipView, today: IsoDate): string {
  switch (m.status) {
    case 'active':
      return m.daysLeft === 1 ? 'Last day today' : `${plural(m.daysLeft, 'day')} left`
    case 'frozen': {
      const freeze = m.freezes.find((f) => f.fromDate <= today && today <= f.toDate)
      return freeze ? `Frozen until ${formatDate(freeze.toDate, { short: true })}` : 'Frozen'
    }
    case 'upcoming':
      return `Starts ${formatDate(m.startDate, { short: true })}`
    case 'expired': {
      const ago = daysBetween(m.endDate, today)
      return ago === 1 ? 'Expired yesterday' : `Expired ${plural(ago, 'day')} ago`
    }
    case 'cancelled':
      return 'Cancelled'
  }
}

/** "20 Mar 2026 – 19 Jun 2026" */
export function membershipRange(m: Pick<MembershipView, 'startDate' | 'endDate'>) {
  return `${formatDate(m.startDate)} – ${formatDate(m.endDate)}`
}

export function monthsLabel(months: number) {
  return plural(months, 'month')
}

/** "Gold · 3 months · ₹4,500", or "3 months · ₹4,500" when the name already says the length. */
export function planOptionLabel(plan: Pick<MembershipPlan, 'name' | 'durationMonths' | 'pricePaise'>) {
  const length = monthsLabel(plan.durationMonths)
  const parts = plan.name.trim().toLowerCase() === length ? [plan.name] : [plan.name, length]
  return [...parts, formatPaise(plan.pricePaise)].join(' · ')
}
