import { todayInIndia } from '@onthec/shared'
import { useTrainerSessions } from '../api/pt-booking'
import { errorMessage, plural } from '../lib/format'
import { scheduleSessions } from '../lib/pt'
import { formatDay, groupByDay } from '../lib/time'
import { Card } from '../ui/Form'
import { PtSessionCard } from '../ui/PtSessionCard'
import { ErrorText } from '../ui/Screen'

/** The trainer's booked sessions for the next two weeks, by day, with client name and phone. */
export function TrainerSchedule({ trainerId }: { trainerId: string }) {
  const query = useTrainerSessions(trainerId)
  const today = todayInIndia()
  const days = groupByDay(scheduleSessions(query.data ?? []), (s) => s.startsAt)

  return (
    <section aria-labelledby="schedule-heading" className="flex flex-col gap-3">
      <h2 id="schedule-heading" className="text-xl font-bold">
        My schedule
      </h2>
      {query.isPending && (
        <Card>
          <div
            aria-busy="true"
            aria-label="Loading your schedule"
            className="h-20 animate-pulse rounded-xl bg-surface-2"
          />
        </Card>
      )}
      <ErrorText>{errorMessage(query.error)}</ErrorText>
      {query.data && days.length === 0 && (
        <Card>
          <p className="text-muted">No sessions booked in the next two weeks.</p>
        </Card>
      )}
      {days.map((day) => (
        <div key={day.date} className="flex flex-col gap-2">
          <h3 className="px-1 text-sm font-semibold text-muted">
            {formatDay(day.date, today)} · {plural(day.items.length, 'session')}
          </h3>
          <ul className="flex flex-col gap-2">
            {day.items.map((s) => (
              <li key={s.id}>
                <PtSessionCard session={s} viewer="staff" showMember showDay={false} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
