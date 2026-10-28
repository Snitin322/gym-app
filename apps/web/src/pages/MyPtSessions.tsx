import type { PtSessionView } from '@onthec/shared'
import { useMyPt } from '../api/admin'
import { useMySessions } from '../api/pt-booking'
import { errorMessage } from '../lib/format'
import { pastSessions, sessionsToAnswer, upcomingSessions } from '../lib/pt'
import { Card } from '../ui/Form'
import { PtSessionCard } from '../ui/PtSessionCard'
import { ErrorText } from '../ui/Screen'

/**
 * The member's PT sessions: ones to confirm or dispute, upcoming ones (reschedule, cancel), and the
 * last 30 days. Hidden when there are none.
 */
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
  const all = query.data ?? []
  return (
    <>
      <SessionList id="to-answer" title="Please confirm" sessions={sessionsToAnswer(all)} />
      <SessionList id="my-sessions" title="Upcoming sessions" sessions={upcomingSessions(all)} />
      <SessionList id="past-sessions" title="Recent sessions" sessions={pastSessions(all).slice(0, 10)} />
    </>
  )
}

function SessionList({ id, title, sessions }: { id: string; title: string; sessions: PtSessionView[] }) {
  if (sessions.length === 0) return null
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3">
      <h2 id={`${id}-heading`} className="text-xl font-bold">
        {title}
      </h2>
      <ul className="flex flex-col gap-3">
        {sessions.map((s) => (
          <li key={s.id}>
            <PtSessionCard session={s} viewer="member" showTrainer />
          </li>
        ))}
      </ul>
    </section>
  )
}
