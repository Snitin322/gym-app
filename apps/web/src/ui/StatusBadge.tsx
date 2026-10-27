import type { MemberListStatus, MembershipStatus } from '@onthec/shared'
import { STATUS_BADGES, type BadgeTone } from '../lib/membership'

const tones: Record<BadgeTone, string> = {
  good: 'bg-accent/15 text-accent',
  info: 'bg-info/15 text-info',
  warn: 'bg-warn/15 text-warn',
  bad: 'bg-danger/15 text-danger',
  muted: 'bg-surface-2 text-muted',
}

export function StatusBadge({ status }: { status: MembershipStatus | MemberListStatus }) {
  const { label, tone } = STATUS_BADGES[status]
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {label}
    </span>
  )
}
