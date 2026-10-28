import {
  WEEKDAY_LABELS,
  formatRest,
  formatSet,
  type WorkoutDay,
  type WorkoutExercise,
  type WorkoutWeek,
} from '@onthec/shared'

/** A read-only week: each day's title and exercises with sets, weights, rests and cardio. */
export function WorkoutWeekView({ week, exercises }: { week: WorkoutWeek; exercises: WorkoutExercise[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {week.days.map((day, i) => (
        <li key={WEEKDAY_LABELS[i]}>
          <WorkoutDayView label={WEEKDAY_LABELS[i] as string} day={day} exercises={exercises} />
        </li>
      ))}
    </ol>
  )
}

export function WorkoutDayView({
  label,
  day,
  exercises,
}: {
  label: string
  day: WorkoutDay
  exercises: WorkoutExercise[]
}) {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const empty = day.rest || day.items.length === 0
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h3 className="font-bold">
        {label}
        <span className="font-normal text-muted">
          {' '}
          · {day.rest ? 'Rest day' : day.title || (empty ? 'Nothing planned' : 'Workout')}
        </span>
      </h3>
      {!empty && (
        <ol className="mt-3 flex flex-col gap-3">
          {day.items.map((item, i) => {
            const exercise = byId.get(item.exerciseId)
            return (
              <li key={i} className="border-t border-line pt-3 first:border-t-0 first:pt-0">
                <p className="font-semibold">
                  {i + 1}. {exercise?.name ?? 'Exercise'}
                  {exercise?.videoUrl && (
                    <a
                      href={exercise.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 text-sm font-normal text-accent underline"
                    >
                      Video
                    </a>
                  )}
                </p>
                {item.kind === 'strength' ? (
                  <>
                    <ul className="mt-1 text-sm">
                      {item.sets.map((set, j) => (
                        <li key={j}>
                          Set {j + 1}: {formatSet(set)}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs text-muted">
                      Rest {formatRest(item.restBetweenSetsSec)} between sets · {formatRest(item.restAfterSec)} before
                      the next exercise
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm">
                    {item.minutes} min{item.distanceKm ? ` · ${item.distanceKm} km` : ''}
                  </p>
                )}
                {item.note && <p className="mt-1 text-sm text-muted">{item.note}</p>}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
