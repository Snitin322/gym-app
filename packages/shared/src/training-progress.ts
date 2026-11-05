import type { IsoDate } from './dates'

/** How many lifts get a strength graph: the ones trained most often with a weight. */
export const STRENGTH_LIFTS = 3
/** Weeks of history the strength graphs look back over. */
export const STRENGTH_WEEKS = 26
/** Weeks shown in the "workouts per week" bars, ending with this week. */
export const CONSISTENCY_WEEKS = 8

/** The heaviest set of a lift in one week (from the days the member ticked off). */
export interface LiftPoint {
  /** Monday of the week. */
  date: IsoDate
  weightKg: number
  reps: number | null
}

export interface LiftProgress {
  exerciseId: string
  name: string
  /** Oldest first. */
  points: LiftPoint[]
}

export interface WeekCount {
  /** Monday of the week. */
  weekOf: IsoDate
  /** Days ticked off as done. */
  done: number
}

/** GET /me/training-progress and GET /members/:id/training-progress */
export interface TrainingProgress {
  lifts: LiftProgress[]
  /** The last few weeks, oldest first; the last is this week. */
  weeks: WeekCount[]
  /** Training days a week in the current workout plan; null without a plan. */
  plannedPerWeek: number | null
}
