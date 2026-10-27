import { useState } from 'react'
import { todayInIndia, type PtSlot } from '@onthec/shared'
import { usePtSlots } from '../api/pt-booking'
import { errorMessage, plural } from '../lib/format'
import { formatDay, formatTime, formatWhen, groupByDay } from '../lib/time'
import { Button } from './Button'
import { ErrorText } from './Screen'

/** A pill-shaped radio button (day and time choices). */
function Choice({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${
        checked ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-ink'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Pick a day, then a time, from the package's open slots (worked out by the server), then confirm.
 * Used to book a new session and to move one.
 */
export function SlotPicker({
  purchaseId,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onCancel,
  note,
}: {
  purchaseId: string
  confirmLabel: string
  pending: boolean
  error: unknown
  onConfirm: (startsAt: string) => void
  onCancel: () => void
  /** Shown under the confirmation, e.g. the free-cancel rule for members. */
  note?: (rules: { freeCancelHours: number }) => string
}) {
  const slots = usePtSlots(purchaseId)
  const today = todayInIndia()
  const days = groupByDay(slots.data?.slots ?? [], (s) => s.startsAt)
  const [day, setDay] = useState<string | null>(null)
  const [slot, setSlot] = useState<PtSlot | null>(null)
  const chosenDay = days.find((d) => d.date === day) ?? days[0]

  if (slots.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading open times" className="h-24 animate-pulse rounded-xl bg-surface-2" />
    )
  }
  if (slots.error) {
    return (
      <div className="flex flex-col gap-3">
        <ErrorText>{errorMessage(slots.error)}</ErrorText>
        <Button variant="secondary" onClick={onCancel}>
          Back
        </Button>
      </div>
    )
  }

  const { trainer, rules, sessionMinutes } = slots.data
  return (
    <div className="flex flex-col gap-4">
      {days.length === 0 ? (
        <p className="text-muted">
          {trainer.name} has no open times in the next {plural(rules.bookingHorizonDays, 'day')}. Please check again
          later or ask at the front desk.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">
            {sessionMinutes}-minute sessions with {trainer.name}. All times are India time.
          </p>
          <div role="radiogroup" aria-label="Day" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {days.map((d) => (
              <Choice
                key={d.date}
                checked={d.date === chosenDay?.date}
                onClick={() => {
                  setDay(d.date)
                  setSlot(null)
                }}
              >
                {formatDay(d.date, today)}
              </Choice>
            ))}
          </div>
          <div role="radiogroup" aria-label="Time" className="flex flex-wrap gap-2">
            {chosenDay?.items.map((s) => (
              <Choice key={s.startsAt} checked={slot?.startsAt === s.startsAt} onClick={() => setSlot(s)}>
                {formatTime(s.startsAt)}
              </Choice>
            ))}
          </div>
        </>
      )}
      {slot && (
        <p className="rounded-xl bg-surface-2 p-3 text-sm">
          <span className="font-semibold">
            {formatWhen(slot.startsAt, today)} – {formatTime(slot.endsAt)}
          </span>{' '}
          with {trainer.name}
          {note && <span className="mt-1 block text-muted">{note(rules)}</span>}
        </p>
      )}
      <ErrorText>{errorMessage(error)}</ErrorText>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Back
        </Button>
        <Button disabled={!slot} loading={pending} onClick={() => slot && onConfirm(slot.startsAt)}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}
