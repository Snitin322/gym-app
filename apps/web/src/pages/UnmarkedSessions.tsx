import { useUnmarkedSessions } from '../api/pt-booking'
import { errorMessage } from '../lib/format'
import { unmarkedSessions } from '../lib/pt'
import { PtSessionCard } from '../ui/PtSessionCard'
import { ErrorText } from '../ui/Screen'

/**
 * Sessions that are over but nobody marked. They stay booked (the session is still reserved) until
 * someone marks them. Trainers see their own; the desk sees everyone's. Hidden when there are none.
 */
export function UnmarkedSessions({ desk = false }: { desk?: boolean }) {
  const query = useUnmarkedSessions()
  const items = unmarkedSessions(query.data ?? [])
  if (!query.error && items.length === 0) return null

  return (
    <section aria-labelledby="unmarked-heading" className="flex flex-col gap-3">
      <h2 id="unmarked-heading" className="text-xl font-bold">
        Not marked yet
      </h2>
      <p className="-mt-2 text-sm text-muted">Mark each one Completed or No-show so the member’s balance is right.</p>
      <ErrorText>{errorMessage(query.error)}</ErrorText>
      <ul className="flex flex-col gap-2">
        {items.map((s) => (
          <li key={s.id}>
            <PtSessionCard session={s} viewer="staff" desk={desk} showMember showTrainer={desk} />
          </li>
        ))}
      </ul>
    </section>
  )
}
