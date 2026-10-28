import {
  daysBetween,
  type IsoDate,
  type PtPurchaseStatus,
  type PtPurchaseView,
  type PtSessionView,
} from '@onthec/shared'
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

/** The member-facing reminder of the cancellation rule. */
export function freeCancelNote({ freeCancelHours }: { freeCancelHours: number }) {
  return freeCancelHours > 0
    ? `You can cancel or move it for free until ${plural(freeCancelHours, 'hour')} before it starts.`
    : 'You can cancel or move it for free until it starts.'
}

/** "9 sessions left · 2 booked" */
export function ptBookingLabel(p: Pick<PtPurchaseView, 'sessionsLeft' | 'sessionsBooked'>) {
  return `${plural(p.sessionsLeft, 'session')} left · ${p.sessionsBooked} booked`
}

/** Why a new session can't be booked on this package (the server checks the same), or null. */
export function bookingBlockedReason(p: Pick<PtPurchaseView, 'status' | 'sessionsLeft' | 'sessionsBooked'>) {
  if (p.status === 'expired') return 'This package has expired. Ask the front desk to extend it.'
  if (p.sessionsLeft - p.sessionsBooked < 1) {
    return p.sessionsBooked > 0
      ? 'All your sessions are already booked. Cancel one or buy more at the front desk.'
      : 'No sessions left. Buy more at the front desk.'
  }
  return null
}

/** Booked sessions that haven't finished yet, soonest first. */
export function upcomingSessions(sessions: PtSessionView[], now = Date.now()) {
  return sessions
    .filter((s) => s.status === 'booked' && Date.parse(s.endsAt) > now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
}

/** Marked sessions the member still has to confirm or dispute, soonest deadline first. */
export function sessionsToAnswer(sessions: PtSessionView[]) {
  return sessions
    .filter((s) => s.confirmation === 'pending')
    .sort((a, b) => Date.parse(a.disputeUntil ?? a.startsAt) - Date.parse(b.disputeUntil ?? b.startsAt))
}

/** Marked sessions already settled (confirmed, disputed or resolved), newest first. */
export function pastSessions(sessions: PtSessionView[]) {
  return sessions
    .filter((s) => s.confirmation !== null && s.confirmation !== 'pending')
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
}

/**
 * A trainer's day: booked sessions not yet over (started ones can be marked), plus sessions they
 * marked within the last hour, so a mistake can still be undone.
 */
export function scheduleSessions(sessions: PtSessionView[], now = Date.now()) {
  return sessions
    .filter(
      (s) =>
        (s.status === 'booked' && Date.parse(s.endsAt) > now) ||
        (s.confirmation === 'pending' && s.undoUntil !== null && now <= Date.parse(s.undoUntil)),
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
}

/** Sessions that are over but nobody marked (still booked, so still reserved). */
export function unmarkedSessions(sessions: PtSessionView[], now = Date.now()) {
  return sessions.filter((s) => s.status === 'booked' && Date.parse(s.endsAt) <= now)
}
