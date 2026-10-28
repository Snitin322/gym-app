import { useState } from 'react'
import { isoWeekday, todayInIndia, workoutDayFor } from '@onthec/shared'
import { useMyWorkoutPlan } from '../api/workouts'
import { errorMessage } from '../lib/format'
import { Button } from '../ui/Button'
import { Card } from '../ui/Form'
import { ErrorText } from '../ui/Screen'
import { WorkoutDayView, WorkoutWeekView } from '../ui/WorkoutWeekView'

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** The member's workout for today (India date), with the full week one tap away. */
export function TodaysWorkout() {
  const query = useMyWorkoutPlan()
  const [showWeek, setShowWeek] = useState(false)

  if (query.isPending) return null
  if (query.error) {
    return (
      <Card>
        <ErrorText>{errorMessage(query.error)}</ErrorText>
      </Card>
    )
  }
  const plan = query.data.plan
  if (!plan) {
    return (
      <Card>
        <h2 className="font-semibold">Your workout plan</h2>
        <p className="mt-1 text-sm text-muted">Ask the front desk or your trainer for a plan.</p>
      </Card>
    )
  }

  const today = todayInIndia()
  const weekday = isoWeekday(today)
  return (
    <section aria-labelledby="workout-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="workout-heading" className="text-xl font-bold">
          Today’s workout
        </h2>
        <p className="text-sm text-muted">
          {plan.name}
          {plan.notes && ` · ${plan.notes}`}
        </p>
      </div>
      <WorkoutDayView
        label={DAY_NAMES[weekday - 1] as string}
        day={workoutDayFor(plan.week, today)}
        exercises={plan.exercises}
      />
      <Button variant="secondary" aria-expanded={showWeek} onClick={() => setShowWeek(!showWeek)}>
        {showWeek ? 'Hide the week' : 'See the whole week'}
      </Button>
      {showWeek && <WorkoutWeekView week={plan.week} exercises={plan.exercises} />}
    </section>
  )
}
