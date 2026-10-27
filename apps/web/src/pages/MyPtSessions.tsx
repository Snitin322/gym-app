import { useMyPt } from '../api/admin'
import { useMySessions } from '../api/pt-booking'
import { errorMessage } from '../lib/format'
import { upcomingSessions } from '../lib/pt'
import { Card } from '../ui/Form'
import { PtSessionCard } from '../ui/PtSessionCard'
import { ErrorText } from '../ui/Screen'

/** The member's booked PT sessions, soonest first, with Reschedule and Cancel. Hidden when there are none. */
export function MyPtSessions() {
  // Only members who have bought PT can have sessions.
  const hasPt = (useMyPt().data?.length ?? 0) > 0
  const query = useMySessions(hasPt)
  if (query.error) {
    return (
      <Card>
        <ErrorText>{errorMessage(query.error)}</ErrorText>
      </Card>
    )
  }
  const upcoming = upcomingSessions(query.data ?? [])
  if (upcoming.length === 0) return null

  return (
    <section aria-labelledby="my-sessions-heading" className="flex flex-col gap-3">
      <h2 id="my-sessions-heading" className="text-xl font-bold">
        Upcoming sessions
      </h2>
      <ul className="flex flex-col gap-3">
        {upcoming.map((s) => (
          <li key={s.id}>
            <PtSessionCard session={s} viewer="member" showTrainer />
          </li>
        ))}
      </ul>
    </section>
  )
}
