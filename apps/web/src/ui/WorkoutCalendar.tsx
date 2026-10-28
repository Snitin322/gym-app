import { useState } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import {
  WEEKDAY_LABELS,
  addDays,
  formatSet,
  plannedToLogged,
  todayInIndia,
  weekStart,
  type LoggedItem,
  type SaveWorkoutDayInput,
  type WorkoutCalendarDay,
  type WorkoutCalendarWeek,
  type WorkoutDayStatus,
  type WorkoutExercise,
} from '@onthec/shared'
import {
  useExercises,
  useMemberWorkoutWeek,
  useMyWorkoutPlan,
  useMyWorkoutWeek,
  useSaveWorkoutDay,
} from '../api/workouts'
import { errorMessage, formatDate } from '../lib/format'
import type { BadgeTone } from '../lib/membership'
import { formatDay } from '../lib/time'
import { logEditorToInput, newLogItem, toLogEditor, type LogEditorItem } from '../lib/workout-log'
import { Button } from './Button'
import { Field, SelectInput, TextArea, TextInput } from './Form'
import { ErrorText } from './Screen'
import { Badge } from './StatusBadge'

const STATUS: Record<WorkoutDayStatus, { label: string; tone: BadgeTone; mark: string }> = {
  done: { label: 'Done', tone: 'good', mark: '✓' },
  todo: { label: 'To do', tone: 'warn', mark: '•' },
  missed: { label: 'Missed', tone: 'bad', mark: '✕' },
  rest: { label: 'Rest', tone: 'muted', mark: '–' },
  upcoming: { label: 'Coming up', tone: 'muted', mark: '' },
}

/** The signed-in member's week: tick days done (as planned or updated). Hidden without a plan. */
export function MyWorkoutCalendar() {
  const [start, setStart] = useState(() => weekStart(todayInIndia()))
  // Only members with a plan have a week to track (Today's workout loads the plan already).
  const hasPlan = Boolean(useMyWorkoutPlan().data?.plan)
  const query = useMyWorkoutWeek(start, hasPlan)
  if (!hasPlan || (query.data && !query.data.hasPlan)) return null
  return <CalendarView heading="My week" query={query} start={start} onStart={setStart} />
}

/** A member's week for their PT trainer or the desk (read-only). */
export function MemberWorkoutCalendar({ memberId }: { memberId: string }) {
  const [start, setStart] = useState(() => weekStart(todayInIndia()))
  const query = useMemberWorkoutWeek(memberId, start)
  if (query.data && !query.data.hasPlan)
    return <p className="text-sm text-muted">No workout plan, so nothing to track yet.</p>
  return <CalendarView heading="Workout tracking" query={query} start={start} onStart={setStart} />
}

function CalendarView({
  heading,
  query,
  start,
  onStart,
}: {
  heading: string
  query: UseQueryResult<WorkoutCalendarWeek>
  start: string
  onStart: (start: string) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const thisWeek = weekStart(todayInIndia())
  const week = query.data
  const day =
    week?.days.find((d) => d.date === selected) ?? week?.days.find((d) => d.date === week.today) ?? week?.days[0]

  const go = (to: string) => {
    setSelected(null)
    onStart(to)
  }

  return (
    <section aria-labelledby="calendar-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="calendar-heading" className="text-xl font-bold">
          {heading}
        </h2>
        <div className="flex items-center gap-1">
          <NavButton label="Previous week" onClick={() => go(addDays(start, -7))}>
            ‹
          </NavButton>
          <span className="px-1 text-sm text-muted">
            {formatDate(start, { short: true })} – {formatDate(addDays(start, 6), { short: true })}
          </span>
          <NavButton label="Next week" disabled={start >= thisWeek} onClick={() => go(addDays(start, 7))}>
            ›
          </NavButton>
        </div>
      </div>

      <ErrorText>{errorMessage(query.error)}</ErrorText>
      {query.isPending && (
        <div aria-busy="true" aria-label="Loading your week" className="h-16 animate-pulse rounded-xl bg-surface-2" />
      )}

      {week && day && (
        <>
          <div role="tablist" aria-label="Day" className="grid grid-cols-7 gap-1">
            {week.days.map((d, i) => {
              const status = STATUS[d.status]
              return (
                <button
                  key={d.date}
                  type="button"
                  role="tab"
                  aria-selected={d.date === day.date}
                  aria-label={`${WEEKDAY_LABELS[i]} ${formatDate(d.date, { short: true })}, ${status.label}`}
                  onClick={() => setSelected(d.date)}
                  className={`flex flex-col items-center rounded-xl border py-2 text-xs ${
                    d.date === day.date ? 'border-accent bg-accent/15' : 'border-line bg-surface'
                  } ${d.date === week.today ? 'font-bold' : ''}`}
                >
                  <span>{WEEKDAY_LABELS[i]}</span>
                  <span className="text-base">{Number(d.date.slice(8))}</span>
                  <span
                    aria-hidden="true"
                    className={
                      d.status === 'done'
                        ? 'text-accent'
                        : d.status === 'missed'
                          ? 'text-danger'
                          : d.status === 'todo'
                            ? 'text-warn'
                            : 'text-muted'
                    }
                  >
                    {status.mark || ' '}
                  </span>
                </button>
              )
            })}
          </div>
          <DayDetail
            key={`${day.date}-${day.log?.updatedAt ?? ''}`}
            day={day}
            exercises={week.exercises}
            today={week.today}
          />
        </>
      )}
      {start !== thisWeek && (
        <Button variant="ghost" onClick={() => go(thisWeek)}>
          Back to this week
        </Button>
      )}
    </section>
  )
}

function DayDetail({
  day,
  exercises,
  today,
}: {
  day: WorkoutCalendarDay
  exercises: WorkoutExercise[]
  today: string
}) {
  const [editing, setEditing] = useState(false)
  const save = useSaveWorkoutDay()
  const names = new Map(exercises.map((e) => [e.id, e.name]))
  const nameOf = (id: string) => names.get(id) ?? 'Exercise'
  const status = STATUS[day.status]
  const shown: LoggedItem[] = day.log ? day.log.items : day.planned.map(plannedToLogged)

  const submit = (input: SaveWorkoutDayInput) =>
    save.mutate({ date: day.date, ...input }, { onSuccess: () => setEditing(false) })

  return (
    <article
      aria-label={formatDay(day.date, today)}
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-bold">
          {formatDay(day.date, today)}
          {(day.log?.dayTitle ?? day.title) && (
            <span className="font-normal text-muted"> · {day.log?.dayTitle ?? day.title}</span>
          )}
        </p>
        <Badge label={status.label} tone={status.tone} />
      </div>

      {day.rest && !day.log ? (
        <p className="text-sm text-muted">Rest day. Recover well.</p>
      ) : editing ? (
        <LogEditor
          initial={shown}
          note={day.log?.note ?? ''}
          nameOf={nameOf}
          pending={save.isPending}
          error={errorMessage(save.error)}
          onSave={submit}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          {shown.length === 0 ? (
            <p className="text-sm text-muted">Nothing planned for this day.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {shown.map((item, i) => (
                <ItemLine
                  key={i}
                  item={item}
                  name={nameOf(item.exerciseId)}
                  last={day.lastTime[item.exerciseId]}
                  today={today}
                />
              ))}
            </ol>
          )}
          {day.log?.note && <p className="text-sm text-muted">Note: {day.log.note}</p>}
          {day.log && <p className="text-xs text-muted">Saved by {day.log.savedByName}</p>}
          {!day.log && day.status === 'upcoming' && (
            <p className="text-sm text-muted">You can tick this day on the day.</p>
          )}
          {!day.log && day.status === 'missed' && (
            <p className="text-sm text-muted">Days older than a week are locked.</p>
          )}

          {day.canLog && (
            <>
              <ErrorText>{errorMessage(save.error)}</ErrorText>
              {day.log ? (
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Update what I did
                </Button>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    loading={save.isPending}
                    disabled={shown.length === 0}
                    onClick={() => submit({ items: shown })}
                  >
                    Mark done
                  </Button>
                  <Button variant="secondary" onClick={() => setEditing(true)}>
                    Update what I did
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </article>
  )
}

function describe(item: LoggedItem) {
  return item.kind === 'strength'
    ? item.sets.map(formatSet).join(', ')
    : `${item.minutes} min${item.distanceKm ? ` · ${item.distanceKm} km` : ''}`
}

function ItemLine({
  item,
  name,
  last,
  today,
}: {
  item: LoggedItem
  name: string
  last: { date: string; item: LoggedItem } | undefined
  today: string
}) {
  return (
    <li className={item.skipped ? 'opacity-60' : ''}>
      <p className="font-semibold">
        {name}
        {item.skipped && <span className="font-normal text-muted"> · Skipped</span>}
      </p>
      <p className="text-sm">{describe(item)}</p>
      {last && (
        <p className="text-xs text-muted">
          Last time ({formatDay(last.date, today)}): {describe(last.item)}
        </p>
      )}
    </li>
  )
}

function LogEditor({
  initial,
  note: initialNote,
  nameOf,
  pending,
  error,
  onSave,
  onCancel,
}: {
  initial: LoggedItem[]
  note: string
  nameOf: (id: string) => string
  pending: boolean
  error: string | null
  onSave: (input: SaveWorkoutDayInput) => void
  onCancel: () => void
}) {
  const library = useExercises()
  const [items, setItems] = useState<LogEditorItem[]>(() => toLogEditor(initial))
  const [note, setNote] = useState(initialNote)
  const [problem, setProblem] = useState<string | null>(null)
  const names = new Map((library.data ?? []).map((e) => [e.id, e.name]))
  const label = (id: string) => names.get(id) ?? nameOf(id)

  const update = (key: string, patch: Partial<LogEditorItem>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)))

  const submit = () => {
    const checked = logEditorToInput(items, note, label)
    if ('error' in checked) return setProblem(checked.error)
    setProblem(null)
    onSave(checked.input)
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {items.map((item) => (
          <li
            key={item.key}
            aria-label={label(item.exerciseId)}
            className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{label(item.exerciseId)}</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.skipped}
                  onChange={(e) => update(item.key, { skipped: e.target.checked })}
                  className="size-5 accent-[var(--color-accent)]"
                />
                Skipped
              </label>
            </div>
            {!item.skipped && item.kind === 'strength' && (
              <>
                {item.sets.map((set, i) => (
                  <div key={i} className="grid grid-cols-[3.5rem_1fr_1fr_auto] items-center gap-2">
                    <span className="text-sm text-muted">Set {i + 1}</span>
                    <TextInput
                      aria-label={`${label(item.exerciseId)} set ${i + 1} ${item.mode}`}
                      inputMode="numeric"
                      placeholder={item.mode === 'reps' ? 'Reps' : 'Seconds'}
                      value={set.amount}
                      onChange={(e) =>
                        update(item.key, {
                          sets: item.sets.map((s, j) => (j === i ? { ...s, amount: e.target.value } : s)),
                        })
                      }
                    />
                    <TextInput
                      aria-label={`${label(item.exerciseId)} set ${i + 1} weight (kg)`}
                      inputMode="decimal"
                      placeholder="kg"
                      value={set.weight}
                      onChange={(e) =>
                        update(item.key, {
                          sets: item.sets.map((s, j) => (j === i ? { ...s, weight: e.target.value } : s)),
                        })
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${label(item.exerciseId)} set ${i + 1}`}
                      disabled={item.sets.length === 1}
                      onClick={() => update(item.key, { sets: item.sets.filter((_, j) => j !== i) })}
                      className="flex size-10 items-center justify-center rounded-xl border border-line text-muted disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  disabled={item.sets.length >= 30}
                  onClick={() =>
                    update(item.key, {
                      sets: [...item.sets, { ...(item.sets.at(-1) ?? { amount: '10', weight: '' }) }],
                    })
                  }
                >
                  Add a set
                </Button>
              </>
            )}
            {!item.skipped && item.kind === 'cardio' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Minutes">
                  {(id) => (
                    <TextInput
                      id={id}
                      inputMode="numeric"
                      value={item.minutes}
                      onChange={(e) => update(item.key, { minutes: e.target.value })}
                    />
                  )}
                </Field>
                <Field label="Distance km (optional)">
                  {(id) => (
                    <TextInput
                      id={id}
                      inputMode="decimal"
                      value={item.distanceKm}
                      onChange={(e) => update(item.key, { distanceKm: e.target.value })}
                    />
                  )}
                </Field>
              </div>
            )}
          </li>
        ))}
      </ol>

      <Field label="Add an exercise">
        {(id) => (
          <SelectInput
            id={id}
            value=""
            onChange={(e) => {
              const exercise = library.data?.find((x) => x.id === e.target.value)
              if (exercise) setItems((list) => [...list, newLogItem(exercise)])
            }}
          >
            <option value="">Choose an exercise…</option>
            {library.data?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </SelectInput>
        )}
      </Field>
      <Field label="Note (optional)">
        {(id) => (
          <TextArea
            id={id}
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Shoulder felt tight"
          />
        )}
      </Field>
      <ErrorText>{problem ?? error}</ErrorText>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button loading={pending} onClick={submit}>
          Save
        </Button>
      </div>
    </div>
  )
}

function NavButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-10 items-center justify-center rounded-xl border border-line text-lg disabled:opacity-30"
    >
      {children}
    </button>
  )
}
