import { useState, type FormEvent } from 'react'
import { WEEKDAY_LABELS, formatRest, type WorkoutExercise, type WorkoutPlanInput } from '@onthec/shared'
import {
  REST_CHOICES,
  editorToPlan,
  newItem,
  type EditorCardio,
  type EditorDay,
  type EditorItem,
  type EditorPlan,
  type EditorStrength,
} from '../lib/workout-editor'
import { Button } from './Button'
import { Field, SelectInput, TextArea, TextInput } from './Form'
import { ErrorText } from './Screen'

/**
 * Edits a weekly plan: a tab per day (title or rest day), exercises picked from the library, and for
 * each one its sets (reps or seconds, weight), rests and a note; cardio has minutes and distance.
 * Used for templates and for members' own plans.
 */
export function WorkoutPlanEditor({
  initial,
  exercises,
  saveLabel,
  pending,
  error,
  onSave,
  onCancel,
}: {
  initial: EditorPlan
  /** The library, including deactivated exercises (they show if already in the plan, but can't be added). */
  exercises: WorkoutExercise[]
  saveLabel: string
  pending: boolean
  error: string | null
  onSave: (input: WorkoutPlanInput) => void
  onCancel: () => void
}) {
  const [plan, setPlan] = useState(initial)
  const [dayIndex, setDayIndex] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const nameOf = (id: string) => byId.get(id)?.name ?? 'Exercise'
  const day = plan.days[dayIndex] as EditorDay

  const setDay = (patch: Partial<EditorDay>) =>
    setPlan((p) => ({ ...p, days: p.days.map((d, i) => (i === dayIndex ? { ...d, ...patch } : d)) }))
  const setItems = (update: (items: EditorItem[]) => EditorItem[]) => setDay({ items: update(day.items) })
  const setItem = (key: string, patch: Partial<EditorItem>) =>
    setItems((items) => items.map((it) => (it.key === key ? ({ ...it, ...patch } as EditorItem) : it)))
  const move = (index: number, by: -1 | 1) =>
    setItems((items) => {
      const next = [...items]
      const [it] = next.splice(index, 1)
      next.splice(index + by, 0, it as EditorItem)
      return next
    })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const checked = editorToPlan(plan, nameOf)
    if ('error' in checked) return setProblem(checked.error)
    setProblem(null)
    onSave(checked.input)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label="Plan name">
        {(id) => (
          <TextInput
            id={id}
            value={plan.name}
            maxLength={80}
            onChange={(e) => setPlan({ ...plan, name: e.target.value })}
            placeholder="e.g. Beginner 6-day split"
          />
        )}
      </Field>
      <Field label="Notes (optional)">
        {(id) => (
          <TextArea
            id={id}
            value={plan.notes}
            maxLength={1000}
            onChange={(e) => setPlan({ ...plan, notes: e.target.value })}
            placeholder="e.g. Warm up 10 minutes before every session"
          />
        )}
      </Field>

      <div role="tablist" aria-label="Day" className="flex gap-1 overflow-x-auto pb-1">
        {WEEKDAY_LABELS.map((label, i) => {
          const d = plan.days[i] as EditorDay
          return (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={i === dayIndex}
              onClick={() => setDayIndex(i)}
              className={`min-w-10 flex-1 rounded-xl border px-1 py-2 text-sm font-semibold ${
                i === dayIndex ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted'
              }`}
            >
              {label}
              <span className="block text-xs font-normal">{d.rest ? 'Rest' : d.items.length || '–'}</span>
            </button>
          )
        })}
      </div>

      <section aria-label={`${WEEKDAY_LABELS[dayIndex]} plan`} className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={day.rest}
            onChange={(e) => setDay({ rest: e.target.checked })}
            className="size-5 accent-[var(--color-accent)]"
          />
          Rest day
        </label>
        {!day.rest && (
          <>
            <Field label={`${WEEKDAY_LABELS[dayIndex]} title`}>
              {(id) => (
                <TextInput
                  id={id}
                  value={day.title}
                  maxLength={60}
                  onChange={(e) => setDay({ title: e.target.value })}
                  placeholder="e.g. Chest + Triceps"
                />
              )}
            </Field>
            <ol className="flex flex-col gap-3">
              {day.items.map((item, index) => (
                <li key={item.key}>
                  <ItemEditor
                    item={item}
                    name={nameOf(item.exerciseId)}
                    first={index === 0}
                    last={index === day.items.length - 1}
                    onChange={(patch) => setItem(item.key, patch)}
                    onMove={(by) => move(index, by)}
                    onRemove={() => setItems((items) => items.filter((it) => it.key !== item.key))}
                  />
                </li>
              ))}
            </ol>
            <AddExercise
              exercises={exercises.filter((e) => e.active)}
              onAdd={(exercise) => setItems((items) => [...items, newItem(exercise)])}
            />
          </>
        )}
      </section>

      <ErrorText>{problem ?? error}</ErrorText>
      <div className="sticky bottom-0 flex gap-3 bg-bg py-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {saveLabel}
        </Button>
      </div>
    </form>
  )
}

/** Picks an exercise from the library, grouped by muscle group. */
function AddExercise({
  exercises,
  onAdd,
}: {
  exercises: WorkoutExercise[]
  onAdd: (exercise: WorkoutExercise) => void
}) {
  const groups = new Map<string, WorkoutExercise[]>()
  for (const e of exercises) {
    const group = e.muscleGroup ?? 'Other'
    groups.set(group, [...(groups.get(group) ?? []), e])
  }
  return (
    <Field label="Add exercise">
      {(id) => (
        <SelectInput
          id={id}
          value=""
          onChange={(e) => {
            const exercise = exercises.find((x) => x.id === e.target.value)
            if (exercise) onAdd(exercise)
          }}
        >
          <option value="">Choose an exercise…</option>
          {[...groups].map(([group, list]) => (
            <optgroup key={group} label={group}>
              {list.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectInput>
      )}
    </Field>
  )
}

function ItemEditor({
  item,
  name,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  item: EditorItem
  name: string
  first: boolean
  last: boolean
  onChange: (patch: Partial<EditorItem>) => void
  onMove: (by: -1 | 1) => void
  onRemove: () => void
}) {
  return (
    <article aria-label={name} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold">{name}</p>
        <div className="flex shrink-0 gap-1">
          <IconButton label={`Move ${name} up`} disabled={first} onClick={() => onMove(-1)}>
            ↑
          </IconButton>
          <IconButton label={`Move ${name} down`} disabled={last} onClick={() => onMove(1)}>
            ↓
          </IconButton>
          <IconButton label={`Remove ${name}`} onClick={onRemove}>
            ✕
          </IconButton>
        </div>
      </div>
      {item.kind === 'strength' ? (
        <StrengthFields item={item} name={name} onChange={onChange} />
      ) : (
        <CardioFields item={item} name={name} onChange={onChange} />
      )}
      <Field label="Note (optional)">
        {(id) => (
          <TextInput
            id={id}
            value={item.note}
            maxLength={200}
            onChange={(e) => onChange({ note: e.target.value })}
            placeholder={item.kind === 'strength' ? 'e.g. Slow on the way down' : 'e.g. Incline 6, speed 5.5'}
          />
        )}
      </Field>
    </article>
  )
}

function StrengthFields({
  item,
  name,
  onChange,
}: {
  item: EditorStrength
  name: string
  onChange: (patch: Partial<EditorStrength>) => void
}) {
  const setSet = (index: number, patch: Partial<EditorStrength['sets'][number]>) =>
    onChange({ sets: item.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)) })
  const unit = item.mode === 'reps' ? 'Reps' : 'Seconds'

  return (
    <>
      <div role="radiogroup" aria-label={`${name} sets count`} className="flex gap-2">
        {(['reps', 'seconds'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={item.mode === mode}
            onClick={() => onChange({ mode })}
            className={`rounded-full border px-3 py-1 text-sm font-semibold ${
              item.mode === mode ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-muted'
            }`}
          >
            {mode === 'reps' ? 'Reps' : 'Timed'}
          </button>
        ))}
      </div>
      <ol className="flex flex-col gap-2">
        {item.sets.map((set, i) => (
          <li key={i} className="grid grid-cols-[3.5rem_1fr_1fr_auto] items-center gap-2">
            <span className="text-sm text-muted">Set {i + 1}</span>
            <TextInput
              aria-label={`${name} set ${i + 1} ${unit.toLowerCase()}`}
              inputMode="numeric"
              value={set.amount}
              placeholder={unit}
              onChange={(e) => setSet(i, { amount: e.target.value })}
            />
            <TextInput
              aria-label={`${name} set ${i + 1} weight (kg)`}
              inputMode="decimal"
              value={set.weight}
              placeholder="kg"
              onChange={(e) => setSet(i, { weight: e.target.value })}
            />
            <IconButton
              label={`Remove ${name} set ${i + 1}`}
              disabled={item.sets.length === 1}
              onClick={() => onChange({ sets: item.sets.filter((_, j) => j !== i) })}
            >
              ✕
            </IconButton>
          </li>
        ))}
      </ol>
      <Button
        variant="secondary"
        disabled={item.sets.length >= 20}
        onClick={() => onChange({ sets: [...item.sets, { ...(item.sets.at(-1) ?? { amount: '10', weight: '' }) }] })}
      >
        Copy last set
      </Button>
      <div className="grid grid-cols-2 gap-3">
        <RestSelect
          label="Rest between sets"
          value={item.restBetweenSetsSec}
          onChange={(v) => onChange({ restBetweenSetsSec: v })}
        />
        <RestSelect label="Rest after" value={item.restAfterSec} onChange={(v) => onChange({ restAfterSec: v })} />
      </div>
    </>
  )
}

function CardioFields({
  item,
  onChange,
}: {
  item: EditorCardio
  name: string
  onChange: (patch: Partial<EditorCardio>) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Minutes">
        {(id) => (
          <TextInput
            id={id}
            inputMode="numeric"
            value={item.minutes}
            onChange={(e) => onChange({ minutes: e.target.value })}
          />
        )}
      </Field>
      <Field label="Distance km (optional)">
        {(id) => (
          <TextInput
            id={id}
            inputMode="decimal"
            value={item.distanceKm}
            onChange={(e) => onChange({ distanceKm: e.target.value })}
          />
        )}
      </Field>
      <RestSelect label="Rest after" value={item.restAfterSec} onChange={(v) => onChange({ restAfterSec: v })} />
    </div>
  )
}

function RestSelect({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const choices = REST_CHOICES.includes(value) ? REST_CHOICES : [...REST_CHOICES, value].sort((a, b) => a - b)
  return (
    <Field label={label}>
      {(id) => (
        <SelectInput id={id} value={value} onChange={(e) => onChange(Number(e.target.value))}>
          {choices.map((s) => (
            <option key={s} value={s}>
              {s === 0 ? 'None' : formatRest(s)}
            </option>
          ))}
        </SelectInput>
      )}
    </Field>
  )
}

function IconButton({
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
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-10 items-center justify-center rounded-xl border border-line text-muted hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  )
}
