import { workoutPlanInputSchema, type WorkoutExercise, type WorkoutPlanInput, type WorkoutWeek } from '@onthec/shared'

/**
 * The plan editor keeps numbers as typed text (so "22." or an empty box can be edited naturally)
 * and turns them into the API's week when saving.
 */
export interface EditorSet {
  amount: string
  weight: string
}

export interface EditorStrength {
  key: string
  kind: 'strength'
  exerciseId: string
  /** Sets count reps, or seconds (e.g. plank). */
  mode: 'reps' | 'seconds'
  sets: EditorSet[]
  restBetweenSetsSec: number
  restAfterSec: number
  note: string
}

export interface EditorCardio {
  key: string
  kind: 'cardio'
  exerciseId: string
  minutes: string
  distanceKm: string
  restAfterSec: number
  note: string
}

export type EditorItem = EditorStrength | EditorCardio

export interface EditorDay {
  title: string
  rest: boolean
  items: EditorItem[]
}

export interface EditorPlan {
  name: string
  notes: string
  days: EditorDay[]
}

export const REST_CHOICES = [0, 15, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300]

let nextKey = 0
const key = () => `item-${++nextKey}`

const text = (n: number | undefined) => (n === undefined ? '' : String(n))

export function toEditor(plan: { name: string; notes?: string | null; week: WorkoutWeek }): EditorPlan {
  return {
    name: plan.name,
    notes: plan.notes ?? '',
    days: plan.week.days.map((d) => ({
      title: d.title ?? '',
      rest: d.rest,
      items: d.items.map((item): EditorItem =>
        item.kind === 'strength'
          ? {
              key: key(),
              kind: 'strength',
              exerciseId: item.exerciseId,
              mode: item.sets[0]?.seconds !== undefined ? 'seconds' : 'reps',
              sets: item.sets.map((s) => ({ amount: text(s.reps ?? s.seconds), weight: text(s.weightKg) })),
              restBetweenSetsSec: item.restBetweenSetsSec,
              restAfterSec: item.restAfterSec,
              note: item.note ?? '',
            }
          : {
              key: key(),
              kind: 'cardio',
              exerciseId: item.exerciseId,
              minutes: text(item.minutes),
              distanceKm: text(item.distanceKm),
              restAfterSec: item.restAfterSec,
              note: item.note ?? '',
            },
      ),
    })),
  }
}

/** A new item for an exercise: 3 × 10 reps for strength, 20 minutes for cardio. */
export function newItem(exercise: Pick<WorkoutExercise, 'id' | 'kind'>): EditorItem {
  return exercise.kind === 'strength'
    ? {
        key: key(),
        kind: 'strength',
        exerciseId: exercise.id,
        mode: 'reps',
        sets: [1, 2, 3].map(() => ({ amount: '10', weight: '' })),
        restBetweenSetsSec: 60,
        restAfterSec: 90,
        note: '',
      }
    : { key: key(), kind: 'cardio', exerciseId: exercise.id, minutes: '20', distanceKm: '', restAfterSec: 60, note: '' }
}

/** "" → undefined, "22.5" → 22.5, "abc" → NaN (the schema then explains what's wrong). */
const num = (value: string) => (value.trim() === '' ? undefined : Number(value.trim().replace(',', '.')))

function toInput(plan: EditorPlan): unknown {
  return {
    name: plan.name,
    notes: plan.notes,
    week: {
      days: plan.days.map((d) => ({
        title: d.title,
        rest: d.rest,
        items: d.rest
          ? []
          : d.items.map((item) =>
              item.kind === 'strength'
                ? {
                    kind: 'strength',
                    exerciseId: item.exerciseId,
                    sets: item.sets.map((s) => ({ [item.mode]: num(s.amount), weightKg: num(s.weight) })),
                    restBetweenSetsSec: item.restBetweenSetsSec,
                    restAfterSec: item.restAfterSec,
                    note: item.note,
                  }
                : {
                    kind: 'cardio',
                    exerciseId: item.exerciseId,
                    minutes: num(item.minutes),
                    distanceKm: num(item.distanceKm),
                    restAfterSec: item.restAfterSec,
                    note: item.note,
                  },
            ),
      })),
    },
  }
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Checks the plan with the same rules as the server; errors say which day and exercise. */
export function editorToPlan(
  plan: EditorPlan,
  exerciseName: (id: string) => string,
): { input: WorkoutPlanInput } | { error: string } {
  const parsed = workoutPlanInputSchema.safeParse(toInput(plan))
  if (parsed.success) return { input: parsed.data }
  const issue = parsed.error.issues[0]
  if (!issue) return { error: 'Please check the plan' }
  const [, , dayIndex, , itemIndex] = issue.path // ["week", "days", day, "items", item, …]
  const where =
    typeof dayIndex === 'number'
      ? `${DAY_NAMES[dayIndex]}${
          typeof itemIndex === 'number'
            ? `, ${exerciseName(plan.days[dayIndex]?.items[itemIndex]?.exerciseId ?? '')}`
            : ''
        }: `
      : ''
  const message = issue.code === 'invalid_type' ? 'enter a number in every box' : issue.message
  return { error: `${where}${message}` }
}
