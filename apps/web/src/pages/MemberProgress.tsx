import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import type { CheckInView } from '@onthec/shared'
import { useCheckInsToReview, useMemberCheckIns, useReviewCheckIn } from '../api/check-ins'
import { useMemberTrainingProgress } from '../api/workouts'
import { errorMessage, formatDate } from '../lib/format'
import { Avatar, SectionTitle } from '../ui/AppShell'
import { Button } from '../ui/Button'
import { CheckInCard } from '../ui/CheckInCard'
import { Card, TextArea } from '../ui/Form'
import { ProgressCharts } from '../ui/ProgressCharts'
import { ErrorText } from '../ui/Screen'
import { useDoneToast } from '../ui/toast-context'

/** A client's progress for their coach or the owner: graphs, then each week's check-in with a reply box. */
export function MemberProgress({ memberId }: { memberId: string }) {
  const query = useMemberCheckIns(memberId)
  // Strength comes from workout tracking; if that isn't shared with this viewer, the graphs just skip it.
  const training = useMemberTrainingProgress(memberId)
  if (query.isPending || (training.isPending && training.failureCount === 0))
    return <div aria-busy="true" aria-label="Loading" className="h-40 animate-pulse rounded-2xl bg-surface-2" />
  if (!query.data) return <ErrorText>{errorMessage(query.error)}</ErrorText>
  const { checkIns, member } = query.data
  if (checkIns.length === 0 && !training.data?.lifts.length) {
    return (
      <Card>
        <p className="text-muted">
          No check-ins yet. {member.name.split(' ')[0]} sends one each week from the Check-in tab: weight, photos and a
          note.
        </p>
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <ProgressCharts checkIns={checkIns} training={training.data} />
      {checkIns.length > 0 && <SectionTitle>Check-ins</SectionTitle>}
      {checkIns.map((c, i) => (
        <CheckInCard key={c.id} checkIn={c} previous={checkIns[i + 1]}>
          <ReplyBox memberId={memberId} checkIn={c} />
        </CheckInCard>
      ))}
    </div>
  )
}

function ReplyBox({ memberId, checkIn }: { memberId: string; checkIn: CheckInView }) {
  const review = useReviewCheckIn(memberId)
  const [open, setOpen] = useState(!checkIn.reviewedAt)
  const [reply, setReply] = useState(checkIn.coachReply ?? '')
  const done = useDoneToast(() => setOpen(false))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!reply.trim()) return
    review.mutate({ id: checkIn.id, reply: reply.trim() }, { onSuccess: done('Reply sent') })
  }
  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Edit reply
      </Button>
    )
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <TextArea
        aria-label="Reply"
        value={reply}
        maxLength={1000}
        onChange={(e) => setReply(e.target.value)}
        placeholder="Feedback for the week, and any change to the plan"
      />
      <ErrorText>{errorMessage(review.error)}</ErrorText>
      <Button type="submit" loading={review.isPending} disabled={!reply.trim()}>
        Send reply
      </Button>
    </form>
  )
}

/** Today screen: the coach's clients whose check-ins are waiting for a reply. */
export function CheckInsToReview({ linkTo }: { linkTo: (memberId: string) => string }) {
  const query = useCheckInsToReview()
  const items = query.data ?? []
  if (items.length === 0) return null
  return (
    <section aria-labelledby="review-heading" className="flex flex-col gap-2">
      <SectionTitle>
        <span id="review-heading">Check-ins to reply to · {items.length}</span>
      </SectionTitle>
      <ul className="flex flex-col gap-2">
        {items.map(({ member, checkIn }) => (
          <li key={checkIn.id}>
            <Link
              to={linkTo(member.id)}
              className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line/70 hover:bg-surface-2"
            >
              <Avatar name={member.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{member.name}</span>
                <span className="block text-sm text-muted">
                  {checkIn.weightKg} kg · week of {formatDate(checkIn.weekOf, { short: true })}
                </span>
              </span>
              <ChevronRight aria-hidden="true" size={20} className="shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
