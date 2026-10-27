import { useState } from 'react'
import { formatPaise, todayInIndia } from '@onthec/shared'
import { useMyPt } from '../api/admin'
import { useBookSession } from '../api/pt-booking'
import { errorMessage } from '../lib/format'
import { bookingBlockedReason, freeCancelNote, ptBookingLabel } from '../lib/pt'
import { formatWhen } from '../lib/time'
import { Button } from '../ui/Button'
import { Card } from '../ui/Form'
import { PtPurchaseCard } from '../ui/PtPurchaseCard'
import { ErrorText } from '../ui/Screen'
import { SlotPicker } from '../ui/SlotPicker'

/** The member's PT packages: sessions left, trainer and use-by date. Nothing shows if they've never bought PT. */
export function MyPtCard() {
  const query = useMyPt()
  const today = todayInIndia()
  const book = useBookSession()
  const [booking, setBooking] = useState<string | null>(null)
  const [booked, setBooked] = useState<{ purchaseId: string; startsAt: string } | null>(null)

  if (query.isPending) return null
  if (query.error) {
    return (
      <Card>
        <ErrorText>{errorMessage(query.error)}</ErrorText>
      </Card>
    )
  }
  // Running packages, plus the most recent finished one so the member can see what they had.
  const running = query.data.filter((p) => p.status === 'active')
  const shown = running.length > 0 ? running : query.data.slice(0, 1)
  if (shown.length === 0) return null

  return (
    <section aria-label="Personal training" className="flex flex-col gap-3">
      {shown.map((p) => {
        const blocked = bookingBlockedReason(p)
        return (
          <PtPurchaseCard key={p.id} purchase={p} today={today} title={`PT · ${p.packageName}`} showLedger>
            {p.status === 'active' && <p className="mt-1 text-sm text-muted">{ptBookingLabel(p)}</p>}
            {p.duePaise > 0 && (
              <p className="mt-3 text-sm font-semibold text-warn">
                {formatPaise(p.duePaise)} due · pay at the front desk
              </p>
            )}
            {booking === null && booked?.purchaseId === p.id && (
              <p role="status" className="mt-3 text-sm font-semibold text-accent">
                Booked for {formatWhen(booked.startsAt, today)}. See your upcoming sessions below.
              </p>
            )}
            {booking === p.id ? (
              <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
                <h3 className="font-semibold">Book a session</h3>
                <SlotPicker
                  purchaseId={p.id}
                  confirmLabel="Book session"
                  pending={book.isPending}
                  error={book.error}
                  note={freeCancelNote}
                  onConfirm={(startsAt) =>
                    book.mutate(
                      { purchaseId: p.id, startsAt },
                      {
                        onSuccess: (session) => {
                          setBooking(null)
                          setBooked({ purchaseId: p.id, startsAt: session.startsAt })
                          book.reset()
                        },
                      },
                    )
                  }
                  onCancel={() => {
                    setBooking(null)
                    setBooked(null)
                    book.reset()
                  }}
                />
              </div>
            ) : (
              booking === null &&
              p.status !== 'used_up' && (
                <div className="mt-4 flex flex-col gap-2">
                  <Button
                    disabled={blocked !== null}
                    onClick={() => {
                      setBooked(null)
                      setBooking(p.id)
                    }}
                  >
                    Book a session
                  </Button>
                  {blocked && <p className="text-sm text-muted">{blocked}</p>}
                </div>
              )
            )}
          </PtPurchaseCard>
        )
      })}
    </section>
  )
}
