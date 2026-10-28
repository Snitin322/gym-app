import { z } from 'zod'
import { addDays, isValidIsoDate, type IsoDate } from './dates'
import { isoWeekday } from './pt-booking'
import { workoutSetSchema, type WorkoutExercise, type WorkoutItem } from './workouts'

/** Members can tick today and this many days back; older days lock. */
export const LOG_DAYS_BACK = 7

export function canLogDate(date: IsoDate, today: IsoDate) {
  return date <= today && date >= addDays(today, -LOG_DAYS_BACK)
}

/** The Monday of the week a date is in. */
export function weekStart(date: IsoDate): IsoDate {
  return addDays(date, 1 - isoWeekday(date))
}

export type WorkoutDayStatus = 'done' | 'rest' | 'todo' | 'missed' | 'upcoming'

export function workoutDayStatus(
  d: { date: IsoDate; rest: boolean; logged: boolean },
  today: IsoDate,
): WorkoutDayStatus {
  if (d.logged) return 'done'
  if (d.rest) return 'rest'
  if (d.date > today) return 'upcoming'
  return canLogDate(d.date, today) ? 'todo' : 'missed'
}

// ---------------------------------------------------------------------------
// What was done
// ---------------------------------------------------------------------------

const exerciseId = z.uuid()

export const loggedStrengthSchema = z.object({
  kind: z.literal('strength'),
  exerciseId,
  sets: z.array(workoutSetSchema).min(1, 'Add at least one set').max(30),
  skipped: z.boolean(),
})

export const loggedCardioSchema = z.object({
  kind: z.literal('cardio'),
  exerciseId,
  minutes: z.number().int().min(1).max(600),
  distanceKm: z
    .number()
    .min(0)
    .max(200)
    .refine((d) => Number.isInteger(Math.round(d * 100) / 10), 'Distance in steps of 0.1 km')
    .optional(),
  skipped: z.boolean(),
})

export const loggedItemSchema = z.discriminatedUnion('kind', [loggedStrengthSchema, loggedCardioSchema])
export type LoggedItem = z.input<typeof loggedItemSchema>

export const saveWorkoutDaySchema = z.object({
  items: z
    .array(loggedItemSchema)
    .min(1)
    .max(30)
    .refine((items) => items.some((i) => !i.skipped), 'Mark at least one exercise as done'),
  note: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || undefined),
})
export type SaveWorkoutDayInput = z.input<typeof saveWorkoutDaySchema>

export const isoDateParam = z.string().refine(isValidIsoDate, 'Enter a valid date')

/** A plan item as "done as planned". */
export function plannedToLogged(item: WorkoutItem): LoggedItem {
  return item.kind === 'strength'
    ? { kind: 'strength', exerciseId: item.exerciseId, sets: item.sets.map((s) => ({ ...s })), skipped: false }
    : {
        kind: 'cardio',
        exerciseId: item.exerciseId,
        minutes: item.minutes,
        ...(item.distanceKm !== undefined ? { distanceKm: item.distanceKm } : {}),
        skipped: false,
      }
}

// ---------------------------------------------------------------------------
// API shapes
// ---------------------------------------------------------------------------

export interface WorkoutLogView {
  date: IsoDate
  dayTitle: string | null
  items: LoggedItem[]
  note: string | null
  savedByName: string
  updatedAt: string
}

export interface WorkoutCalendarDay {
  date: IsoDate
  /** From the current plan for this weekday. */
  title: string | null
  rest: boolean
  status: WorkoutDayStatus
  /** The member can tick or update this day (staff views are read-only). */
  canLog: boolean
  planned: WorkoutItem[]
  log: WorkoutLogView | null
  /** The previous time each exercise was done before this date (not skipped). */
  lastTime: Record<string, { date: IsoDate; item: LoggedItem }>
}

export interface WorkoutCalendarWeek {
  start: IsoDate
  today: IsoDate
  hasPlan: boolean
  days: WorkoutCalendarDay[]
  /** Every exercise the week mentions (including deactivated ones). */
  exercises: WorkoutExercise[]
}
