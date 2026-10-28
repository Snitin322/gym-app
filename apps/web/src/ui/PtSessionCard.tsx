import { useState, type FormEvent } from 'react'
import {
  PT_CONFIRMATION_LABELS,
  todayInIndia,
  type PtConfirmation,
  type PtMarkOutcome,
  type PtSessionView,
} from '@onthec/shared'
import {
  useCancelSession,
  useConfirmSession,
  useDisputeSession,
  useMarkSession,
  useRescheduleSession,
  useResolveDispute,
  useUndoMark,
} from '../api/pt-booking'
import { errorMessage, formatPhone } from '../lib/format'
import type { BadgeTone } from '../lib/membership'
import { freeCancelNote } from '../lib/pt'
import { formatTime, formatWhen } from '../lib/time'
import { Button } from './Button'
import { Field, TextArea, TextInput } from './Form'
import { ErrorText } from './Screen'
import { SlotPicker } from './SlotPicker'
import { Badge } from './StatusBadge'

const CONFIRMATION_TONES: Record<PtConfirmation, BadgeTone> = {
  pending: 'warn',
  confirmed: 'good',
  auto_confirmed: 'good',
  disputed: 'bad',
  upheld: 'info',
  rejected: 'muted',
}

const OUTCOME_LABELS: Record<PtMarkOutcome, string> = { completed: 'Completed', no_show: 'No-show' }

type Panel = 'cancel' | 'move' | 'mark' | 'dispute' | 'resolve' | null

/**
 * One PT session.
 * - Booked, not started: Reschedule and Cancel. Members cancel free until `freeCancelUntil`; after that
 *   cancelling uses up the session and moving is not offered (the server refuses it). Staff never use it up.
 * - Started, not marked: staff mark it Completed or No-show; the member sees it is waiting.
 * - Marked: the member confirms or disputes within 24 hours; staff can undo a mistake (the trainer within
 *   an hour, the desk until the member answers); the desk resolves disputes.
 */
export function PtSessionCard({
  session: s,
  viewer,
  desk = false,
  showMember = false,
  showTrainer = false,
  showDay = true,
}: {
  session: PtSessionView
  viewer: 'member' | 'staff'
  /** Owner or admin: can also undo until the member answers, and resolve disputes. */
  desk?: boolean
  showMember?: boolean
  showTrainer?: boolean
  /** Off in lists already grouped by day. */
  showDay?: boolean
}) {
  const [panel, setPanel] = useState<Panel>(null)
  const close = () => setPanel(null)
  const now = Date.now()
  const today = todayInIndia()
  const booked = s.status === 'booked'
  const started = Date.parse(s.startsAt) <= now
  const free = viewer === 'staff' || now <= Date.parse(s.freeCancelUntil)
  const canMove = booked && !started && free

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
        {s.confirmation && (
          <Badge label={PT_CONFIRMATION_LABELS[s.confirmation]} tone={CONFIRMATION_TONES[s.confirmation]} />
        )}
      </div>

      {viewer === 'member' && booked && !started && (
        <p className={`text-sm ${free ? 'text-muted' : 'font-semibold text-warn'}`}>
          {free
            ? `Free to cancel until ${formatWhen(s.freeCancelUntil, today)}`
            : 'Cancelling now uses up this session.'}
        </p>
      )}
      {viewer === 'member' && booked && started && (
        <p className="text-sm text-muted">Waiting for {s.trainer.name} to mark this session.</p>
      )}

      {s.confirmation && <MarkedDetails session={s} viewer={viewer} />}

      {panel === null && (
        <SessionActions session={s} viewer={viewer} desk={desk} now={now} canMove={canMove} onOpen={setPanel} />
      )}
      {panel === 'move' && <MovePanel session={s} viewer={viewer} onDone={close} />}
      {panel === 'cancel' && <CancelPanel session={s} viewer={viewer} free={free} onDone={close} />}
      {panel === 'mark' && <MarkPanel session={s} onDone={close} />}
      {panel === 'dispute' && <DisputePanel session={s} onDone={close} />}
      {panel === 'resolve' && <ResolvePanel session={s} onDone={close} />}
    </article>
  )
}

/** What happened, in words: outcome, trainer's note, the member's dispute and the desk's answer. */
function MarkedDetails({ session: s, viewer }: { session: PtSessionView; viewer: 'member' | 'staff' }) {
  const today = todayInIndia()
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>
        <span className="font-semibold">{OUTCOME_LABELS[s.status as PtMarkOutcome]}</span>
        {s.markedByName && <span className="text-muted"> · marked by {s.markedByName}</span>}
      </p>
      {s.trainerNotes && <p className="text-muted">Trainer’s note: {s.trainerNotes}</p>}
      {s.disputeReason && (
        <p className="text-muted">
          {viewer === 'member' ? 'You said' : `${s.member.name} says`}: {s.disputeReason}
        </p>
      )}
      {s.resolutionNote && <p className="text-muted">Front desk: {s.resolutionNote}</p>}
      {viewer === 'member' && s.confirmation === 'pending' && s.disputeUntil && (
        <p className="font-semibold text-warn">
          Is this right? Please confirm or tell us by {formatWhen(s.disputeUntil, today)}. No reply counts as confirmed.
        </p>
      )}
    </div>
  )
}

function SessionActions({
  session: s,
  viewer,
  desk,
  now,
  canMove,
  onOpen,
}: {
  session: PtSessionView
  viewer: 'member' | 'staff'
  desk: boolean
  now: number
  canMove: boolean
  onOpen: (panel: Panel) => void
}) {
  const confirm = useConfirmSession()
  const undo = useUndoMark()
  const started = Date.parse(s.startsAt) <= now

  if (s.status === 'booked' && !started) {
    return (
      <div className="flex gap-3">
        {canMove && (
          <Button variant="secondary" onClick={() => onOpen('move')}>
            Reschedule
          </Button>
        )}
        <Button variant="secondary" onClick={() => onOpen('cancel')}>
          Cancel
        </Button>
      </div>
    )
  }
  if (s.status === 'booked' && viewer === 'staff') {
    return <Button onClick={() => onOpen('mark')}>Mark session</Button>
  }
  if (viewer === 'member' && s.confirmation === 'pending') {
    return (
      <>
        <div className="flex gap-3">
          <Button loading={confirm.isPending} onClick={() => confirm.mutate({ sessionId: s.id })}>
            Confirm
          </Button>
          <Button variant="secondary" onClick={() => onOpen('dispute')}>
            Not right?
          </Button>
        </div>
        <ErrorText>{errorMessage(confirm.error)}</ErrorText>
      </>
    )
  }
  const canUndo =
    viewer === 'staff' &&
    s.confirmation === 'pending' &&
    (desk || (s.undoUntil !== null && now <= Date.parse(s.undoUntil)))
  if (canUndo || (desk && s.confirmation === 'disputed')) {
    return (
      <>
        <div className="flex gap-3">
          {canUndo && (
            <Button variant="secondary" loading={undo.isPending} onClick={() => undo.mutate({ sessionId: s.id })}>
              Undo mark
            </Button>
          )}
          {desk && s.confirmation === 'disputed' && <Button onClick={() => onOpen('resolve')}>Resolve dispute</Button>}
        </div>
        <ErrorText>{errorMessage(undo.error)}</ErrorText>
      </>
    )
  }
  return null
}

function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T | null
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full border px-4 py-2 text-sm font-semibold ${
            value === o.value ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function PanelFooter({
  onCancel,
  submitLabel,
  loading,
  error,
}: {
  onCancel: () => void
  submitLabel: string
  loading: boolean
  error: string | null
}) {
  return (
    <>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Back
        </Button>
        <Button type="submit" loading={loading}>
          {submitLabel}
        </Button>
      </div>
    </>
  )
}

function MarkPanel({ session, onDone }: { session: PtSessionView; onDone: () => void }) {
  const mark = useMarkSession()
  const [outcome, setOutcome] = useState<PtMarkOutcome | null>(null)
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!outcome) return setProblem('Choose Completed or No-show')
    setProblem(null)
    mark.mutate({ sessionId: session.id, outcome, note: note.trim() || undefined }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 border-t border-line pt-3">
      <h3 className="font-semibold">How did it go?</h3>
      <ChoiceChips
        label="Outcome"
        value={outcome}
        onChange={setOutcome}
        options={[
          { value: 'completed', label: 'Completed' },
          { value: 'no_show', label: 'No-show' },
        ]}
      />
      <p className="text-sm text-muted">
        Either uses up one of {session.member.name}’s sessions. They can confirm or dispute it for 24 hours.
      </p>
      <Field label="Note for the member (optional)">
        {(id) => (
          <TextArea
            id={id}
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Leg day, squats up to 60 kg"
          />
        )}
      </Field>
      <PanelFooter
        onCancel={onDone}
        submitLabel="Save"
        loading={mark.isPending}
        error={problem ?? errorMessage(mark.error)}
      />
    </form>
  )
}

function DisputePanel({ session, onDone }: { session: PtSessionView; onDone: () => void }) {
  const dispute = useDisputeSession()
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (reason.trim().length < 3) return setProblem('Tell the gym what went wrong')
    setProblem(null)
    dispute.mutate({ sessionId: session.id, reason: reason.trim() }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 border-t border-line pt-3">
      <h3 className="font-semibold">What’s not right?</h3>
      <p className="text-sm text-muted">The front desk will look into it and can give the session back.</p>
      <Field label="What happened?">
        {(id) => (
          <TextArea
            id={id}
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. I was there, the trainer didn’t come"
          />
        )}
      </Field>
      <PanelFooter
        onCancel={onDone}
        submitLabel="Send to front desk"
        loading={dispute.isPending}
        error={problem ?? errorMessage(dispute.error)}
      />
    </form>
  )
}

function ResolvePanel({ session, onDone }: { session: PtSessionView; onDone: () => void }) {
  const resolve = useResolveDispute()
  const [resolution, setResolution] = useState<'upheld' | 'rejected' | null>(null)
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!resolution) return setProblem('Choose what to do')
    if (note.trim().length < 3) return setProblem('Add a short note for the member')
    setProblem(null)
    resolve.mutate({ sessionId: session.id, resolution, note: note.trim() }, { onSuccess: onDone })
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 border-t border-line pt-3">
      <h3 className="font-semibold">Resolve dispute</h3>
      <ChoiceChips
        label="Decision"
        value={resolution}
        onChange={setResolution}
        options={[
          { value: 'upheld', label: 'Give session back' },
          { value: 'rejected', label: 'Keep as used' },
        ]}
      />
      <Field label="Note for the member">
        {(id) => (
          <TextInput
            id={id}
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Checked with the trainer"
          />
        )}
      </Field>
      <PanelFooter
        onCancel={onDone}
        submitLabel="Save decision"
        loading={resolve.isPending}
        error={problem ?? errorMessage(resolve.error)}
      />
    </form>
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
