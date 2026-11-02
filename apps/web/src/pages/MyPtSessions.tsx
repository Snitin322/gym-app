import type { PtSessionView } from '@onthec/shared'
import { useMyPt } from '../api/admin'
import { useMySessions } from '../api/pt-booking'
import { errorMessage } from '../lib/format'
import { pastSessions, sessionsToAnswer, upcomingSessions } from '../lib/pt'
import { Card } from '../ui/Form'
import { PtSessionCard } from '../ui/PtSessionCard'
import { ErrorText } from '../ui/Screen'

/**
 * The member's PT sessions. "upcoming": ones to confirm or dispute, then upcoming ones (reschedule,
 * cancel). "history": the last 30 days.
 */
export function MyPtSessions({ show }: { show: 'upcoming' | 'history' }) {
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
  if (!query.data) return null
  const all = query.data
  if (show === 'history') {
    const past = pastSessions(all).slice(0, 20)
    return past.length === 0 ? (
      <EmptyNote>No sessions in the last 30 days.</EmptyNote>
    ) : (
      <SessionList id="past-sessions" title="Recent sessions" sessions={past} />
    )
  }
  const toAnswer = sessionsToAnswer(all)
  const upcoming = upcomingSessions(all)
  return (
    <>
      <SessionList id="to-answer" title="Please confirm" sessions={toAnswer} />
      {upcoming.length === 0 && toAnswer.length === 0 ? (
        <EmptyNote>Nothing booked. Book a session from the Book tab.</EmptyNote>
      ) : (
        <SessionList id="my-sessions" title="Upcoming sessions" sessions={upcoming} />
      )}
    </>
  )
}

function EmptyNote({ children }: { children: string }) {
  return (
    <Card>
      <p className="text-sm text-muted">{children}</p>
    </Card>
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
