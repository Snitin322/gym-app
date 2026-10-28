import { saveWorkoutDaySchema, type LoggedItem, type SaveWorkoutDayInput, type WorkoutExercise } from '@onthec/shared'
import type { EditorSet } from './workout-editor'

/** One exercise in the "Update what I did" form; numbers are kept as typed text until saving. */
export interface LogEditorItem {
  key: string
  kind: 'strength' | 'cardio'
  exerciseId: string
  mode: 'reps' | 'seconds'
  sets: EditorSet[]
  minutes: string
  distanceKm: string
  skipped: boolean
}

let nextKey = 0
const key = () => `log-${++nextKey}`
const text = (n: number | undefined) => (n === undefined ? '' : String(n))

export function toLogEditor(items: LoggedItem[]): LogEditorItem[] {
  return items.map((item) =>
    item.kind === 'strength'
      ? {
          key: key(),
          kind: 'strength',
          exerciseId: item.exerciseId,
          mode: item.sets[0]?.seconds !== undefined ? 'seconds' : 'reps',
          sets: item.sets.map((s) => ({ amount: text(s.reps ?? s.seconds), weight: text(s.weightKg) })),
          minutes: '',
          distanceKm: '',
          skipped: item.skipped,
        }
      : {
          key: key(),
          kind: 'cardio',
          exerciseId: item.exerciseId,
          mode: 'reps',
          sets: [],
          minutes: text(item.minutes),
          distanceKm: text(item.distanceKm),
          skipped: item.skipped,
        },
  )
}

/** An exercise added from the library: one set of 10 reps, or 20 minutes of cardio. */
export function newLogItem(exercise: Pick<WorkoutExercise, 'id' | 'kind'>): LogEditorItem {
  return {
    key: key(),
    kind: exercise.kind,
    exerciseId: exercise.id,
    mode: 'reps',
    sets: exercise.kind === 'strength' ? [{ amount: '10', weight: '' }] : [],
    minutes: exercise.kind === 'cardio' ? '20' : '',
    distanceKm: '',
    skipped: false,
  }
}

const num = (value: string) => (value.trim() === '' ? undefined : Number(value.trim().replace(',', '.')))

/** Checks the form with the server's rules; errors name the exercise. */
export function logEditorToInput(
  items: LogEditorItem[],
  note: string,
  exerciseName: (id: string) => string,
): { input: SaveWorkoutDayInput } | { error: string } {
  const raw = {
    note,
    items: items.map((item) =>
      item.kind === 'strength'
        ? {
            kind: 'strength',
            exerciseId: item.exerciseId,
            sets: item.sets.map((s) => ({ [item.mode]: num(s.amount), weightKg: num(s.weight) })),
            skipped: item.skipped,
          }
        : {
            kind: 'cardio',
            exerciseId: item.exerciseId,
            minutes: num(item.minutes),
            distanceKm: num(item.distanceKm),
            skipped: item.skipped,
          },
    ),
  }
  const parsed = saveWorkoutDaySchema.safeParse(raw)
  if (parsed.success) return { input: parsed.data }
  const issue = parsed.error.issues[0]
  if (!issue) return { error: 'Please check the workout' }
  const [, itemIndex] = issue.path // ["items", index, …]
  const where =
    typeof itemIndex === 'number' && issue.path.length > 2
      ? `${exerciseName(items[itemIndex]?.exerciseId ?? '')}: `
      : ''
  return { error: `${where}${issue.code === 'invalid_type' ? 'enter a number in every box' : issue.message}` }
}
