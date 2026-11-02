import { usePtDisputes } from '../../api/pt-booking'
import { errorMessage } from '../../lib/format'
import { LoadingText } from '../../ui/AdminLayout'
import { Card } from '../../ui/Form'
import { PtSessionCard } from '../../ui/PtSessionCard'
import { ErrorText } from '../../ui/Screen'
import { UnmarkedSessions } from '../UnmarkedSessions'

/** Desk: PT sessions members disputed (give the session back or keep it as used), and sessions nobody marked. */
export function PtToResolve() {
  const disputes = usePtDisputes()

  return (
    <>
      <section aria-labelledby="disputes-heading" className="flex flex-col gap-3">
        <h2 id="disputes-heading" className="sr-only">
          Open disputes
        </h2>
        {disputes.isPending && <LoadingText />}
        <ErrorText>{errorMessage(disputes.error)}</ErrorText>
        {disputes.data?.length === 0 && (
          <Card>
            <p className="text-muted">
              No open disputes. Members can dispute a session within 24 hours of it being marked.
            </p>
          </Card>
        )}
        <ul className="flex flex-col gap-3">
          {disputes.data?.map((s) => (
            <li key={s.id}>
              <PtSessionCard session={s} viewer="staff" desk showMember showTrainer />
            </li>
          ))}
        </ul>
      </section>
      <UnmarkedSessions desk />
    </>
  )
}
