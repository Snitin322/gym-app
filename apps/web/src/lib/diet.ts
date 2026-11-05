import { todayInIndia, workoutDayFor } from '@onthec/shared'
import { useMyWorkoutPlan } from '../api/workouts'

export type DietDayKind = 'training' | 'rest'

/** "08:00" → "8:00 am" */
export function formatMealTime(time: string) {
  const [h = 0, m = 0] = time.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

/** Today is a rest day when the member's workout plan says so; otherwise a training day. */
export function useTodaysDietDay(): DietDayKind {
  const workout = useMyWorkoutPlan()
  const week = workout.data?.plan?.week
  return week && workoutDayFor(week, todayInIndia()).rest ? 'rest' : 'training'
}
