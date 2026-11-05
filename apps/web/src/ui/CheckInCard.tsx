import { useState, type ReactNode } from 'react'
import { MessageSquareText } from 'lucide-react'
import {
  CHECK_IN_POSES,
  MEASUREMENTS,
  MEASUREMENT_LABELS,
  POSE_LABELS,
  type CheckInPose,
  type CheckInView,
} from '@onthec/shared'
import { formatDate } from '../lib/format'
import { changeLabel } from '../lib/progress'
import { Card } from './Form'
import { Sheet } from './Sheet'

/**
 * One week's check-in: weight (and the change from the previous one), measurements, photos, the
 * member's note and the coach's reply. `children` go at the bottom (e.g. the coach's reply form).
 */
export function CheckInCard({
  checkIn: c,
  previous,
  coachName,
  children,
}: {
  checkIn: CheckInView
  previous?: CheckInView
  coachName?: string
  children?: ReactNode
}) {
  const [photo, setPhoto] = useState<CheckInPose | null>(null)
  const change = changeLabel(c.weightKg, previous?.weightKg, 'kg')
  const extras: [string, string][] = [
    ...(c.bodyFatPct !== null ? [['Body fat', `${c.bodyFatPct}%`] as [string, string]] : []),
    ...MEASUREMENTS.filter((m) => c[m] !== null).map((m) => [MEASUREMENT_LABELS[m], `${c[m]} cm`] as [string, string]),
  ]
  const poses = CHECK_IN_POSES.filter((p) => c.photos[p])

  return (
    <Card>
      <article aria-label={`Week of ${formatDate(c.weekOf)}`} className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-muted">Week of {formatDate(c.weekOf)}</p>
          {change && (
            <p className={`text-sm font-semibold ${change.startsWith('−') ? 'text-accent' : 'text-muted'}`}>{change}</p>
          )}
        </div>
        <p className="text-2xl font-extrabold tracking-tight">{c.weightKg} kg</p>
        {extras.length > 0 && (
          <dl className="flex flex-wrap gap-2 text-sm">
            {extras.map(([label, value]) => (
              <div key={label} className="rounded-lg bg-surface-2 px-2.5 py-1">
                <dt className="sr-only">{label}</dt>
                <dd>
                  <span className="text-muted">{label}</span> {value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {poses.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {poses.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPhoto(p)}
                aria-label={`Open ${POSE_LABELS[p].toLowerCase()} photo`}
                className="overflow-hidden rounded-xl bg-surface-2"
              >
                <img src={c.photos[p]} alt="" className="aspect-[3/4] w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}
        {c.note && <p className="whitespace-pre-line text-sm">“{c.note}”</p>}
        {c.coachReply && (
          <div className="rounded-xl bg-accent/10 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-accent">
              <MessageSquareText aria-hidden="true" size={16} /> {c.reviewedByName ?? coachName ?? 'Coach'}
            </p>
            <p className="mt-1 whitespace-pre-line">{c.coachReply}</p>
          </div>
        )}
        {children}
      </article>
      {photo && (
        <Sheet
          open
          title={`${POSE_LABELS[photo]} · ${formatDate(c.weekOf, { short: true })}`}
          onClose={() => setPhoto(null)}
        >
          <div className="flex flex-col gap-3">
            <img src={c.photos[photo]} alt={`${POSE_LABELS[photo]} photo`} className="w-full rounded-xl" />
            {poses.length > 1 && (
              <div className="flex gap-2">
                {poses.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={p === photo}
                    onClick={() => setPhoto(p)}
                    className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${p === photo ? 'bg-accent text-accent-ink' : 'bg-surface-2'}`}
                  >
                    {POSE_LABELS[p]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Sheet>
      )}
    </Card>
  )
}
