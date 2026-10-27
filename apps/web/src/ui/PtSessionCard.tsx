import { useState, type FormEvent } from 'react'
import { todayInIndia, type PtSessionView } from '@onthec/shared'
import { useCancelSession, useRescheduleSession } from '../api/pt-booking'
import { errorMessage, formatPhone } from '../lib/format'
import { freeCancelNote } from '../lib/pt'
import { formatTime, formatWhen } from '../lib/time'
import { Button } from './Button'
import { Field, TextInput } from './Form'
import { ErrorText } from './Screen'
import { SlotPicker } from './SlotPicker'

/**
 * One booked PT session with Reschedule and Cancel.
 * - `member`: the member's own view. Free to cancel or move until `freeCancelUntil`; after that
 *   cancelling uses up the session and moving is not offered (the server refuses it).
 * - `staff`: the trainer or the desk. Cancelling never uses up the member's session.
 */
export function PtSessionCard({
  session: s,
  viewer,
  showMember = false,
  showTrainer = false,
  showDay = true,
}: {
  session: PtSessionView
  viewer: 'member' | 'staff'
  showMember?: boolean
  showTrainer?: boolean
  /** Off in lists already grouped by day. */
  showDay?: boolean
}) {
  const [panel, setPanel] = useState<'cancel' | 'move' | null>(null)
  const now = Date.now()
  const today = todayInIndia()
  const started = Date.parse(s.startsAt) <= now
  const free = viewer === 'staff' || now <= Date.parse(s.freeCancelUntil)
  const canMove = !started && free

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold">
            {showDay ? formatWhen(s.startsAt, today) : formatTime(s.startsAt)} – {formatTime(s.endsAt)}
          </p>
          {showMember && (
            <p className="text-sm">
              {s.member.name} ·{' '}
              <a href={`tel:${s.member.phone}`} className="text-muted hover:text-ink">
                {formatPhone(s.member.phone)}
              </a>
            </p>
          )}
          {showTrainer && <p className="text-sm text-muted">with {s.trainer.name}</p>}
          <p className="text-xs text-muted">{s.packageName}</p>
        </div>
      </div>

      {viewer === 'member' && !started && (
        <p className={`text-sm ${free ? 'text-muted' : 'font-semibold text-warn'}`}>
          {free
            ? `Free to cancel until ${formatWhen(s.freeCancelUntil, today)}`
            : 'Cancelling now uses up this session.'}
        </p>
      )}

      {panel === null && !started && (
        <div className="flex gap-3">
          {canMove && (
            <Button variant="secondary" onClick={() => setPanel('move')}>
              Reschedule
            </Button>
          )}
          <Button variant="secondary" onClick={() => setPanel('cancel')}>
            Cancel
          </Button>
        </div>
      )}
      {panel === 'move' && <MovePanel session={s} viewer={viewer} onDone={() => setPanel(null)} />}
      {panel === 'cancel' && <CancelPanel session={s} viewer={viewer} free={free} onDone={() => setPanel(null)} />}
    </article>
  )
}

function MovePanel({
  session,
  viewer,
  onDone,
}: {
  session: PtSessionView
  viewer: 'member' | 'staff'
  onDone: () => void
}) {
  const move = useRescheduleSession()
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <h3 className="font-semibold">Move to another time</h3>
      <SlotPicker
        purchaseId={session.purchaseId}
        confirmLabel="Move session"
        pending={move.isPending}
        error={move.error}
        note={viewer === 'member' ? freeCancelNote : undefined}
        onConfirm={(startsAt) => move.mutate({ sessionId: session.id, startsAt }, { onSuccess: onDone })}
        onCancel={onDone}
      />
    </div>
  )
}

function CancelPanel({
  session,
  viewer,
  free,
  onDone,
}: {
  session: PtSessionView
  viewer: 'member' | 'staff'
  free: boolean
  onDone: () => void
}) {
  const cancel = useCancelSession()
  const [reason, setReason] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    cancel.mutate({ sessionId: session.id, reason: reason.trim() || undefined }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 border-t border-line pt-3">
      <h3 className="font-semibold">Cancel this session?</h3>
      {viewer === 'staff' ? (
        <p className="text-sm text-muted">{session.member.name} keeps the session (it is not used up).</p>
      ) : free ? (
        <p className="text-sm text-muted">It's free: the session goes back on your package.</p>
      ) : (
        <p role="alert" className="text-sm font-semibold text-warn">
          It's less than the free-cancel time before the start, so cancelling now uses up this session.
        </p>
      )}
      {viewer === 'staff' && (
        <Field label="Reason (optional)">
          {(id) => <TextInput id={id} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />}
        </Field>
      )}
      <ErrorText>{errorMessage(cancel.error)}</ErrorText>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onDone}>
          Keep it
        </Button>
        <Button type="submit" loading={cancel.isPending} className="!bg-danger !text-bg">
          Cancel session
        </Button>
      </div>
    </form>
  )
}
