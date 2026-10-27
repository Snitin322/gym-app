import { daysBetween, type IsoDate, type PtPurchaseStatus, type PtPurchaseView } from '@onthec/shared'
import { formatDate, plural } from './format'
import type { BadgeTone } from './membership'

export const PT_STATUS_BADGES: Record<PtPurchaseStatus, { label: string; tone: BadgeTone }> = {
  active: { label: 'Active', tone: 'good' },
  used_up: { label: 'Used up', tone: 'muted' },
  expired: { label: 'Expired', tone: 'bad' },
}

/** "9 of 12 sessions left" */
export function ptSessionsLabel(p: Pick<PtPurchaseView, 'sessionsLeft' | 'sessionCount'>) {
  return `${p.sessionsLeft} of ${plural(p.sessionCount, 'session')} left`
}

/** "Use by 18 May 2026", "Use by today", or "Expired on 18 May 2026" */
export function ptUseByLabel(p: Pick<PtPurchaseView, 'expiresOn' | 'status'>, today: IsoDate) {
  if (p.status === 'expired') return `Expired on ${formatDate(p.expiresOn)}`
  return p.expiresOn === today ? 'Use by today' : `Use by ${formatDate(p.expiresOn)}`
}

/** Unused sessions about to lapse: active, sessions left, use-by date within a week. */
export function ptExpiringSoon(p: PtPurchaseView, today: IsoDate) {
  return p.status === 'active' && daysBetween(today, p.expiresOn) <= 7
}

