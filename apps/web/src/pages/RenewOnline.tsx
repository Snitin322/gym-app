import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { formatPaise, membershipEndDate, type OnlinePaymentStatus } from '@onthec/shared'
import {
  createOnlineOrder,
  getOnlinePaymentStatus,
  queryKeys,
  useRenewalOptions,
  verifyOnlinePayment,
} from '../api/admin'
import { downloadFile } from '../api/client'
import { errorMessage, formatDate } from '../lib/format'
import { monthsLabel } from '../lib/membership'
import { CheckoutCancelled, confirmation, payWithRazorpay } from '../lib/razorpay'
import { Button } from '../ui/Button'
import { Card } from '../ui/Form'
import { ErrorText } from '../ui/Screen'

type Stage =
  | { name: 'choose' }
  | { name: 'paying' }
  | { name: 'confirming' }
  | { name: 'done'; status: OnlinePaymentStatus }
  | { name: 'pending' }

async function waitForConfirmation(paymentId: string): Promise<OnlinePaymentStatus> {
  let status = await getOnlinePaymentStatus(paymentId)
  for (let i = 1; i < confirmation.attempts && status.status === 'created'; i++) {
    await new Promise((resolve) => setTimeout(resolve, confirmation.intervalMs))
    status = await getOnlinePaymentStatus(paymentId)
  }
  return status
}

/** Member pays for a renewal with Razorpay. The webhook (not this screen) marks it paid. */
export function RenewOnline({ onClose }: { onClose: () => void }) {
  const options = useRenewalOptions(true)
  const client = useQueryClient()
  const [planId, setPlanId] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>({ name: 'choose' })
  const [error, setError] = useState<string | null>(null)

  const plans = options.data?.plans ?? []
  const plan = plans.find((p) => p.id === (planId ?? plans[0]?.id))
  const startDate = options.data?.startDate

  const refresh = () => {
    void client.invalidateQueries({ queryKey: queryKeys.myMembership })
    void client.invalidateQueries({ queryKey: ['me', 'renewal-options'] })
  }

  const pay = async () => {
    if (!plan) return
    setError(null)
    setStage({ name: 'paying' })
    try {
      const order = await createOnlineOrder(plan.id)
      const result = await payWithRazorpay(order)
      setStage({ name: 'confirming' })
      await verifyOnlinePayment({
        paymentId: order.paymentId,
        razorpayOrderId: result.razorpay_order_id,
        razorpayPaymentId: result.razorpay_payment_id,
        razorpaySignature: result.razorpay_signature,
      })
      const status = await waitForConfirmation(order.paymentId)
      refresh()
      setStage(status.status === 'paid' ? { name: 'done', status } : { name: 'pending' })
    } catch (e) {
      setStage({ name: 'choose' })
      if (!(e instanceof CheckoutCancelled)) setError(errorMessage(e))
    }
  }

  if (stage.name === 'done') {
    const invoice = stage.status.invoice
    return (
      <Card className="flex flex-col gap-3 border border-accent/40">
        <h2 className="text-lg font-bold text-accent">Payment successful</h2>
        <p className="text-muted">Your membership has been renewed. Thank you!</p>
        {invoice && (
          <Button
            variant="secondary"
            onClick={() => void downloadFile(`/invoices/${invoice.id}/pdf`, `${invoice.number.replace(/\//g, '-')}.pdf`)}
          >
            Download invoice {invoice.number}
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </Card>
    )
  }

  if (stage.name === 'pending') {
    return (
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Payment received</h2>
        <p className="text-muted">
          It is taking a little longer to confirm. Your membership and invoice will appear here automatically within a
          few minutes — no need to pay again.
        </p>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </Card>
    )
  }

  const busy = stage.name === 'paying' || stage.name === 'confirming'
  return (
    <Card className="flex flex-col gap-4 border border-accent/40">
      <h2 className="text-lg font-bold">Renew online</h2>
      {options.isPending && <p className="text-muted">Loading plans…</p>}
      {options.data && plans.length === 0 && <p className="text-muted">No plans are available online. Please ask at the front desk.</p>}

      <div role="radiogroup" aria-label="Choose a plan" className="flex flex-col gap-2">
        {plans.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={plan?.id === p.id}
            disabled={busy}
            onClick={() => setPlanId(p.id)}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left ${
              plan?.id === p.id ? 'border-accent bg-accent/10' : 'border-line bg-surface'
            }`}
          >
            <span>
              <span className="block font-semibold">{p.name}</span>
              <span className="text-sm text-muted">{monthsLabel(p.durationMonths)}</span>
            </span>
            <span className="font-bold">{formatPaise(p.pricePaise)}</span>
          </button>
        ))}
      </div>

      {plan && startDate && (
        <p className="text-sm text-muted">
          {formatDate(startDate)} – {formatDate(membershipEndDate(startDate, plan.durationMonths))}. Price includes GST.
        </p>
      )}
      <ErrorText>{error}</ErrorText>
      {stage.name === 'confirming' && (
        <p role="status" className="text-sm text-info">
          Confirming your payment…
        </p>
      )}
      <Button onClick={() => void pay()} loading={busy} disabled={!plan}>
        {plan ? `Pay ${formatPaise(plan.pricePaise)}` : 'Pay'}
      </Button>
      <Button variant="ghost" onClick={onClose} disabled={busy}>
        Cancel
      </Button>
    </Card>
  )
}

/** "Renew online" button that opens the panel; hidden when the gym hasn't set up online payments. */
export function RenewOnlineEntry() {
  const options = useRenewalOptions(true)
  const [open, setOpen] = useState(false)
  if (!options.data?.onlinePayments || options.data.plans.length === 0) return null
  return open ? <RenewOnline onClose={() => setOpen(false)} /> : <Button onClick={() => setOpen(true)}>Renew online</Button>
}
