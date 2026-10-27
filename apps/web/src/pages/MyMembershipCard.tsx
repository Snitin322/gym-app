import { EXPIRING_WITHIN_DAYS, formatPaise, inclusiveDays, todayInIndia, type MembershipView } from '@onthec/shared'
import { useMyMembership } from '../api/admin'
import { errorMessage, formatDate, plural } from '../lib/format'
import { membershipRange, membershipSummary, monthsLabel } from '../lib/membership'
import { Card } from '../ui/Form'
import { PaymentRow } from '../ui/PaymentRow'
import { RenewOnlineEntry } from './RenewOnline'
import { ErrorText } from '../ui/Screen'
import { StatusBadge } from '../ui/StatusBadge'

/** The signed-in member's membership: what they have, until when, and how many days are left. */
export function MyMembershipCard() {
  const query = useMyMembership()
  const today = todayInIndia()

  if (query.isPending) {
    return (
      <Card>
        <div aria-busy="true" aria-label="Loading your membership" className="h-28 animate-pulse rounded-xl bg-surface-2" />
      </Card>
    )
  }
  if (query.error) {
    return (
      <Card>
        <ErrorText>{errorMessage(query.error)}</ErrorText>
      </Card>
    )
  }

  const { current, history, duePaise, payments } = query.data
  if (!current) {
    return (
      <>
        <Card>
          <h2 className="font-semibold">No membership yet</h2>
          <p className="mt-1 text-sm text-muted">Start a plan at the front desk, or online if available below.</p>
        </Card>
        <RenewOnlineEntry />
      </>
    )
  }

  const next = history
    .filter((m) => m.status === 'upcoming')
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
  const running = current.status === 'active' || current.status === 'frozen'
  const endingSoon = running && !next && current.daysLeft <= EXPIRING_WITHIN_DAYS
  const past = history.filter((m) => m.status !== 'upcoming')

  return (
    <>
      <Card className="border border-line">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Your membership</p>
            <h2 className="text-lg font-bold">{current.planName}</h2>
          </div>
          <StatusBadge status={current.status} />
        </div>

        <p className="mt-4 text-4xl font-extrabold tracking-tight">{membershipSummary(current, today)}</p>
        <p className="mt-1 text-sm text-muted">{membershipRange(current)}</p>

        {running && <Progress membership={current} today={today} />}

        {current.freezes.some((f) => f.toDate >= today) && (
          <p className="mt-3 text-sm text-info">{freezeNote(current, today)}</p>
        )}
        {endingSoon && (
          <p role="status" className="mt-4 rounded-xl bg-warn/10 px-4 py-3 text-sm text-warn">
            {current.daysLeft === 1 ? 'Your membership ends today.' : `Only ${plural(current.daysLeft, 'day')} left.`}{' '}
            Renew at the front desk to keep coming without a break.
          </p>
        )}
        {current.status === 'expired' && (
          <p className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
            Renew at the front desk to start again.
          </p>
        )}
        {next && (
          <p className="mt-4 text-sm text-muted">
            Next: <span className="text-ink">{next.planName}</span> from {formatDate(next.startDate)}
            {next.planName.trim().toLowerCase() !== monthsLabel(next.durationMonths) &&
              ` (${monthsLabel(next.durationMonths)})`}
          </p>
        )}
      </Card>

      <RenewOnlineEntry />

      {duePaise > 0 && (
        <p role="alert" className="rounded-2xl bg-warn/10 px-5 py-4 text-warn">
          <span className="font-bold">{formatPaise(duePaise)} due.</span> Please pay at the front desk.
        </p>
      )}

      {payments.length > 0 && (
        <details className="rounded-2xl bg-surface px-5 py-4 text-sm">
          <summary className="cursor-pointer font-semibold">My payments ({payments.length})</summary>
          <ul className="mt-3 flex flex-col gap-2">
            {payments.map((p) => (
              <li key={p.id}>
                <PaymentRow payment={p} />
              </li>
            ))}
          </ul>
        </details>
      )}

      {past.length > 0 && (
        <details className="rounded-2xl bg-surface px-5 py-4 text-sm">
          <summary className="cursor-pointer font-semibold">Past memberships ({past.length})</summary>
          <ul className="mt-3 flex flex-col gap-2">
            {past.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3">
                <span>
                  {m.planName}
                  <span className="block text-muted">{membershipRange(m)}</span>
                </span>
                <StatusBadge status={m.status} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

/** How much of the membership has been used, as a bar (frozen days still count towards the total). */
function Progress({ membership, today }: { membership: MembershipView; today: string }) {
  const total = inclusiveDays(membership.startDate, membership.endDate)
  const used = Math.min(total, Math.max(0, total - membership.daysLeft))
  const percent = Math.round((used / total) * 100)
  return (
    <div className="mt-4">
      <div
        role="progressbar"
        aria-label="Membership used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-2 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className={`h-full rounded-full ${membership.status === 'frozen' ? 'bg-info' : 'bg-accent'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted">
        Ends {formatDate(membership.endDate)}
        {today < membership.startDate ? '' : ` · day ${used + 1} of ${total}`}
      </p>
    </div>
  )
}

function freezeNote(m: MembershipView, today: string) {
  const freeze = m.freezes.find((f) => f.toDate >= today)
  if (!freeze) return ''
  const range = `${formatDate(freeze.fromDate, { short: true })} – ${formatDate(freeze.toDate, { short: true })}`
  return freeze.fromDate <= today
    ? `Paused ${range}. These days are added to your end date.`
    : `Pause planned ${range}. These days are added to your end date.`
}
