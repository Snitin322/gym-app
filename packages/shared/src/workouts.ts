import { z } from 'zod'
import { WEEKDAY_LABELS, isoWeekday } from './pt-booking'
import type { IsoDate } from './dates'

// ---------------------------------------------------------------------------
// Exercise library
// ---------------------------------------------------------------------------

export const WORKOUT_EXERCISE_KINDS = ['strength', 'cardio'] as const
export type WorkoutExerciseKind = (typeof WORKOUT_EXERCISE_KINDS)[number]

export const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Legs',
  'Glutes',
  'Core',
  'Full body',
  'Cardio',
] as const

export interface WorkoutExercise {
  id: string
  name: string
  muscleGroup: string | null
  kind: WorkoutExerciseKind
  description: string | null
  videoUrl: string | null
  active: boolean
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined)

const clearableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null))

const videoUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === '' || /^https:\/\/\S+$/.test(v), 'Video link must start with https://')

export const workoutExerciseInputSchema = z.object({
  name: z.string().trim().min(2, 'Exercise name is too short').max(80),
  muscleGroup: optionalText(40),
  kind: z.enum(WORKOUT_EXERCISE_KINDS),
  description: optionalText(1000),
  videoUrl: videoUrl.optional().transform((v) => v || undefined),
})
export type WorkoutExerciseInput = z.infer<typeof workoutExerciseInputSchema>

export const workoutExerciseUpdateSchema = z.object({
  name: z.string().trim().min(2, 'Exercise name is too short').max(80).optional(),
  muscleGroup: clearableText(40),
  kind: z.enum(WORKOUT_EXERCISE_KINDS).optional(),
  description: clearableText(1000),
  videoUrl: videoUrl.optional().transform((v) => (v === undefined ? undefined : v || null)),
  active: z.boolean().optional(),
})

// ---------------------------------------------------------------------------
// The week
// ---------------------------------------------------------------------------

/** Weights are whole multiples of 0.25 kg (25, 22.5, 1.25 …). */
const weightKg = z
  .number()
  .min(0, 'Weight can’t be negative')
  .max(500, 'Weight is at most 500 kg')
  .refine((w) => Number.isInteger(w * 4), 'Weight must be in steps of 0.25 kg')

/** Types are the input shape (optional fields may be left out); the server stores the parsed result. */
/** One set: a number of reps, or a time in seconds (e.g. plank), with an optional weight. */
export const workoutSetSchema = z
  .object({
    reps: z.number().int().min(1).max(100).optional(),
    seconds: z.number().int().min(1).max(3600).optional(),
    weightKg: weightKg.optional(),
  })
  .refine((s) => (s.reps === undefined) !== (s.seconds === undefined), 'Each set needs reps or seconds (one of them)')
export type WorkoutSet = z.input<typeof workoutSetSchema>

const itemNote = optionalText(200)

export const strengthItemSchema = z.object({
  kind: z.literal('strength'),
  exerciseId: z.uuid(),
  sets: z.array(workoutSetSchema).min(1, 'Add at least one set').max(20),
  /** Rest between the sets of this exercise. */
  restBetweenSetsSec: z.number().int().min(0).max(600),
  /** Rest before the next exercise. */
  restAfterSec: z.number().int().min(0).max(900),
  note: itemNote,
})

export const cardioItemSchema = z.object({
  kind: z.literal('cardio'),
  exerciseId: z.uuid(),
  minutes: z.number().int().min(1).max(300),
  distanceKm: z
    .number()
    .min(0)
    .max(100)
    .refine((d) => Number.isInteger(Math.round(d * 100) / 10), 'Distance in steps of 0.1 km')
    .optional(),
  restAfterSec: z.number().int().min(0).max(900),
  note: itemNote,
})

export const workoutItemSchema = z.discriminatedUnion('kind', [strengthItemSchema, cardioItemSchema])
export type WorkoutItem = z.input<typeof workoutItemSchema>
export type StrengthItem = z.input<typeof strengthItemSchema>
export type CardioItem = z.input<typeof cardioItemSchema>

export const workoutDaySchema = z
  .object({
    /** e.g. "Chest + Triceps". */
    title: optionalText(60),
    rest: z.boolean(),
    items: z.array(workoutItemSchema).max(25),
  })
  .refine((d) => !d.rest || d.items.length === 0, 'A rest day has no exercises')

/** Monday to Sunday, in that order. */
export const workoutWeekSchema = z.object({
  days: z.array(workoutDaySchema).length(7, 'A week has 7 days'),
})
export type WorkoutDay = z.input<typeof workoutDaySchema>
export type WorkoutWeek = z.input<typeof workoutWeekSchema>

export function emptyWeek(): WorkoutWeek {
  return { days: WEEKDAY_LABELS.map(() => ({ rest: false, items: [] })) }
}

/** The day of the plan for a date (India): Monday is days[0]. */
export function workoutDayFor(week: WorkoutWeek, date: IsoDate): WorkoutDay {
  return week.days[isoWeekday(date) - 1] as WorkoutDay
}

/** Every exercise a week refers to (checked against the gym's library on save). */
export function exerciseIdsIn(week: WorkoutWeek): string[] {
  return [...new Set(week.days.flatMap((d) => d.items.map((i) => i.exerciseId)))]
}

/** "90 s", "2 min", "1 min 30 s" */
export function formatRest(seconds: number) {
  if (seconds < 60) return `${seconds} s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? `${m} min` : `${m} min ${s} s`
}

/** "12 reps × 20 kg", "60 s", "10 reps" */
export function formatSet(set: WorkoutSet) {
  const amount = set.reps !== undefined ? `${set.reps} reps` : `${set.seconds} s`
  return set.weightKg ? `${amount} × ${set.weightKg} kg` : amount
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export const workoutPlanInputSchema = z.object({
  name: z.string().trim().min(2, 'Plan name is too short').max(80),
  notes: optionalText(1000),
  week: workoutWeekSchema,
})
export type WorkoutPlanInput = z.infer<typeof workoutPlanInputSchema>

export interface WorkoutPlanSummary {
  id: string
  name: string
  /** Days that have exercises, e.g. 6 for a 6-day split. */
  trainingDays: number
  version: number
  updatedAt: string
  updatedByName: string
}

export interface WorkoutPlanView extends WorkoutPlanSummary {
  memberId: string | null
  notes: string | null
  week: WorkoutWeek
  /** Every exercise the week uses (including deactivated ones), so the plan can be shown on its own. */
  exercises: WorkoutExercise[]
}

export interface WorkoutPlanVersionView {
  version: number
  name: string
  notes: string | null
  week: WorkoutWeek
  savedAt: string
  savedByName: string
}

export function trainingDays(week: WorkoutWeek) {
  return week.days.filter((d) => !d.rest && d.items.length > 0).length
}
