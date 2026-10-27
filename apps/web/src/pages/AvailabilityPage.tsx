import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import {
  WEEKDAY_LABELS,
  addDays,
  formatMinute,
  indiaDateTime,
  todayInIndia,
  type AvailabilityWindow,
  type PtSessionView,
  type TimeOffView,
  type TrainerAvailabilityView,
} from '@onthec/shared'
import { useAddTimeOff, useAvailability, useRemoveTimeOff, useSaveAvailability } from '../api/pt-booking'
import { useSignedInUser } from '../auth/AuthContext'
import { errorMessage, formatPhone, plural } from '../lib/format'
import { formatDay, formatWhen, indiaDateOf, indiaMinuteOf } from '../lib/time'
import { AdminLayout, LoadingText } from '../ui/AdminLayout'
import { Button } from '../ui/Button'
import { Card, Field, SelectInput, TextInput } from '../ui/Form'
import { ErrorText } from '../ui/Screen'

/** Trainer's own hours ("My availability"). */
export function MyAvailabilityPage() {
  const user = useSignedInUser()
  return <AvailabilityScreen trainerId={user.id} title="My availability" back={{ to: '/home', label: 'Home' }} />
}

/** The desk viewing or editing a trainer's hours (from Staff). */
export function TrainerAvailabilityPage() {
  const { id = '' } = useParams()
  return <AvailabilityScreen trainerId={id} back={{ to: '/admin/staff', label: 'Staff' }} />
}

function AvailabilityScreen({
  trainerId,
  title,
  back,
}: {
  trainerId: string
  title?: string
  back: { to: string; label: string }
}) {
  const query = useAvailability(trainerId)
  return (
    <AdminLayout title={title ?? (query.data ? `${query.data.trainerName}'s hours` : 'Trainer hours')} back={back}>
      {query.isPending && <LoadingText />}
      <ErrorText>{errorMessage(query.error)}</ErrorText>
      {query.data && (
        <>
          <HoursForm key={trainerId} view={query.data} />
          <TimeOffSection view={query.data} />
        </>
      )}
    </AdminLayout>
  )
}

// ---------------------------------------------------------------------------
// Weekly hours
// ---------------------------------------------------------------------------

const STEP = 15
/** Start and end choices every 15 minutes, plus any odd value already saved. */
function minuteOptions(from: number, to: number, current: number) {
  const options = new Set<number>([current])
  for (let m = from; m <= to; m += STEP) options.add(m)
  return [...options].sort((a, b) => a - b)
}
const minuteLabel = (m: number) => (m === 1440 ? 'midnight' : formatMinute(m))

interface Range extends AvailabilityWindow {
  key: number
}

let nextKey = 0

/** Problems the server would also refuse, in plain words. */
function rangeProblem(ranges: Range[]): string | null {
  for (const r of ranges) {
    if (r.startMinute >= r.endMinute)
      return `${WEEKDAY_LABELS[r.weekday - 1]}: each time range must end after it starts`
  }
  for (const a of ranges) {
    for (const b of ranges) {
      if (a !== b && a.weekday === b.weekday && a.startMinute < b.endMinute && b.startMinute < a.endMinute) {
        return `${WEEKDAY_LABELS[a.weekday - 1]}: time ranges overlap`
      }
    }
  }
  return null
}

function HoursForm({ view }: { view: TrainerAvailabilityView }) {
  const save = useSaveAvailability(view.trainerId)
  const [minutes, setMinutes] = useState(String(view.sessionMinutes))
  const [ranges, setRanges] = useState<Range[]>(() => view.windows.map((w) => ({ ...w, key: nextKey++ })))
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const change = (next: Range[]) => {
    setSaved(false)
    setRanges(next)
  }
  const update = (key: number, patch: Partial<AvailabilityWindow>) =>
    change(ranges.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const add = (weekday: number) => {
    // After the day's last range, or 6 am to 10 am.
    const last = ranges.filter((r) => r.weekday === weekday).at(-1)
    const startMinute = last ? Math.min(last.endMinute + 60, 1380) : 360
    change([...ranges, { key: nextKey++, weekday, startMinute, endMinute: Math.min(startMinute + 240, 1440) }])
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const sessionMinutes = Number(minutes)
    if (!Number.isInteger(sessionMinutes) || sessionMinutes < 15 || sessionMinutes > 240) {
      return setProblem('Session length must be 15 to 240 minutes')
    }
    const issue = rangeProblem(ranges)
    if (issue) return setProblem(issue)
    setProblem(null)
    const windows = ranges
      .map(({ weekday, startMinute, endMinute }) => ({ weekday, startMinute, endMinute }))
      .sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute)
    save.mutate({ sessionMinutes, windows }, { onSuccess: () => setSaved(true) })
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <div>
          <h2 className="font-semibold">Weekly hours</h2>
          <p className="text-sm text-muted">
            Members can book sessions inside these hours (India time). Changing them never moves sessions already
            booked.
          </p>
        </div>
        <Field label="Session length (minutes)" hint="Sessions run back to back at this length, e.g. 6:00, 7:00, 8:00.">
          {(id) => (
            <TextInput
              id={id}
              type="number"
              inputMode="numeric"
              min={15}
              max={240}
              step={5}
              value={minutes}
              onChange={(e) => {
                setSaved(false)
                setMinutes(e.target.value)
              }}
            />
          )}
        </Field>
        <ul className="flex flex-col divide-y divide-line">
          {WEEKDAY_LABELS.map((label, index) => {
            const weekday = index + 1
            const day = ranges.filter((r) => r.weekday === weekday)
            return (
              <li key={label} className="flex flex-col gap-2 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{label}</span>
                  {day.length === 0 && <span className="text-sm text-muted">Off</span>}
                </div>
                {day.map((r) => (
                  <div key={r.key} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                    <SelectInput
                      aria-label={`${label} from`}
                      className="min-w-0 px-2"
                      value={r.startMinute}
                      onChange={(e) => update(r.key, { startMinute: Number(e.target.value) })}
                    >
                      {minuteOptions(0, 1440 - STEP, r.startMinute).map((m) => (
                        <option key={m} value={m}>
                          {minuteLabel(m)}
                        </option>
                      ))}
                    </SelectInput>
                    <span className="text-sm text-muted">to</span>
                    <SelectInput
                      aria-label={`${label} to`}
                      className="min-w-0 px-2"
                      value={r.endMinute}
                      onChange={(e) => update(r.key, { endMinute: Number(e.target.value) })}
                    >
                      {minuteOptions(STEP, 1440, r.endMinute).map((m) => (
                        <option key={m} value={m}>
                          {minuteLabel(m)}
                        </option>
                      ))}
                    </SelectInput>
                    <button
                      type="button"
                      aria-label={`Remove ${label} ${minuteLabel(r.startMinute)} to ${minuteLabel(r.endMinute)}`}
                      onClick={() => change(ranges.filter((x) => x.key !== r.key))}
                      className="flex size-11 items-center justify-center rounded-xl text-xl text-muted hover:bg-surface-2 hover:text-ink"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  aria-label={`Add hours on ${label}`}
                  onClick={() => add(weekday)}
                  className="self-start py-1 text-sm font-semibold text-accent"
                >
                  + Add hours
                </button>
              </li>
            )
          })}
        </ul>
      </Card>
      <ErrorText>{problem ?? errorMessage(save.error)}</ErrorText>
      {saved && (
        <p role="status" className="text-sm text-accent">
          Saved. Sessions already booked stay as they are.
        </p>
      )}
      <Button type="submit" loading={save.isPending}>
        Save hours
      </Button>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Time off
// ---------------------------------------------------------------------------

/** "Mon 3 Nov – Tue 4 Nov (whole days)" or "Mon 3 Nov, 2:00 pm – 5:00 pm". */
function timeOffLabel(t: TimeOffView, today: string) {
  const startDate = indiaDateOf(t.startsAt)
  const endDate = indiaDateOf(t.endsAt)
  if (indiaMinuteOf(t.startsAt) === 0 && indiaMinuteOf(t.endsAt) === 0) {
    const lastDay = addDays(endDate, -1)
    return lastDay === startDate
      ? `${formatDay(startDate, today)} (whole day)`
      : `${formatDay(startDate, today)} – ${formatDay(lastDay, today)} (whole days)`
  }
  const end = endDate === startDate ? formatMinute(indiaMinuteOf(t.endsAt)) : formatWhen(t.endsAt, today)
  return `${formatWhen(t.startsAt, today)} – ${end}`
}

function TimeOffSection({ view }: { view: TrainerAvailabilityView }) {
  const remove = useRemoveTimeOff(view.trainerId)
  const [adding, setAdding] = useState(false)
  const [cancelled, setCancelled] = useState<PtSessionView[] | null>(null)
  const today = todayInIndia()

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Time off</h2>
        {!adding && (
          <Button
            variant="secondary"
            className="w-auto"
            onClick={() => {
              setCancelled(null)
              setAdding(true)
            }}
          >
            Add time off
          </Button>
        )}
      </div>
      <p className="-mt-2 text-sm text-muted">
        No one can book during time off. Sessions already booked inside it are cancelled for free.
      </p>

      {cancelled && (
        <div role="status" className="rounded-xl bg-surface-2 p-3 text-sm">
          {cancelled.length === 0 ? (
            <p>Time off added. No booked sessions were affected.</p>
          ) : (
            <>
              <p className="font-semibold">
                Time off added. {plural(cancelled.length, 'booked session')} cancelled for free; please let{' '}
                {cancelled.length === 1 ? 'the client' : 'the clients'} know:
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {cancelled.map((s) => (
                  <li key={s.id}>
                    {formatWhen(s.startsAt, today)} · {s.member.name} ·{' '}
                    <a href={`tel:${s.member.phone}`} className="text-muted underline">
                      {formatPhone(s.member.phone)}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {adding && (
        <AddTimeOffForm
          trainerId={view.trainerId}
          onDone={(result) => {
            setAdding(false)
            if (result) setCancelled(result)
          }}
        />
      )}

      {view.timeOff.length === 0 ? (
        !adding && <p className="text-sm text-muted">No time off coming up.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {view.timeOff.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{timeOffLabel(t, today)}</p>
                {t.reason && <p className="text-sm text-muted">{t.reason}</p>}
              </div>
              <Button
                variant="ghost"
                className="w-auto shrink-0"
                disabled={remove.isPending}
                aria-label={`Remove time off ${timeOffLabel(t, today)}`}
                onClick={() => remove.mutate(t.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ErrorText>{errorMessage(remove.error)}</ErrorText>
    </Card>
  )
}

function AddTimeOffForm({ trainerId, onDone }: { trainerId: string; onDone: (cancelled?: PtSessionView[]) => void }) {
  const add = useAddTimeOff(trainerId)
  const today = todayInIndia()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [wholeDays, setWholeDays] = useState(true)
  const [startMinute, setStartMinute] = useState(720)
  const [endMinute, setEndMinute] = useState(1020)
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!from || !to) return setProblem('Pick the dates')
    const startsAt = indiaDateTime(from, wholeDays ? 0 : startMinute)
    const endsAt = wholeDays ? indiaDateTime(addDays(to, 1), 0) : indiaDateTime(to, endMinute)
    if (endsAt <= startsAt) return setProblem('Time off must end after it starts')
    setProblem(null)
    add.mutate(
      { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), reason: reason.trim() || undefined },
      { onSuccess: (result) => onDone(result.cancelledSessions) },
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-xl border border-accent/40 p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          {(id) => (
            <TextInput
              id={id}
              type="date"
              min={today}
              value={from}
              onChange={(e) => {
                setFrom(e.target.value)
                if (e.target.value > to) setTo(e.target.value)
              }}
            />
          )}
        </Field>
        <Field label="To">
          {(id) => <TextInput id={id} type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} />}
        </Field>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-accent"
          checked={wholeDays}
          onChange={(e) => setWholeDays(e.target.checked)}
        />
        Whole days
      </label>
      {!wholeDays && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start time">
            {(id) => (
              <SelectInput id={id} value={startMinute} onChange={(e) => setStartMinute(Number(e.target.value))}>
                {minuteOptions(0, 1440 - STEP, startMinute).map((m) => (
                  <option key={m} value={m}>
                    {minuteLabel(m)}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
          <Field label="End time">
            {(id) => (
              <SelectInput id={id} value={endMinute} onChange={(e) => setEndMinute(Number(e.target.value))}>
                {minuteOptions(STEP, 1440, endMinute).map((m) => (
                  <option key={m} value={m}>
                    {minuteLabel(m)}
                  </option>
                ))}
              </SelectInput>
            )}
          </Field>
        </div>
      )}
      <Field label="Reason (optional)">
        {(id) => (
          <TextInput
            id={id}
            value={reason}
            maxLength={120}
            placeholder="e.g. Family function"
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </Field>
      <ErrorText>{problem ?? errorMessage(add.error)}</ErrorText>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => onDone()}>
          Back
        </Button>
        <Button type="submit" loading={add.isPending}>
          Add time off
        </Button>
      </div>
    </form>
  )
}
