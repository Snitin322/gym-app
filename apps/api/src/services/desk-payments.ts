import type { DeskPaymentMethod, IsoDate } from '@onthec/shared'
import type { TenantTx } from '../db/tenant'
import { issueInvoiceInTx } from './invoices'

export interface DeskPaymentInput {
  memberId: string
  /** What it pays for: a membership or a PT package. */
  membershipId?: string
  ptPurchaseId?: string
  amountPaise: number
  method: DeskPaymentMethod
  reference?: string
  note?: string
}

/** Records money taken at the desk and issues its invoice, in the caller's transaction. */
export async function takeDeskPaymentInTx(
  tx: TenantTx,
  actor: { gymId: string; userId: string },
  input: DeskPaymentInput,
  today: IsoDate,
) {
  const payment = await tx.payment.create({
    data: {
      gymId: actor.gymId,
      memberId: input.memberId,
      membershipId: input.membershipId,
      ptPurchaseId: input.ptPurchaseId,
      amountPaise: input.amountPaise,
      method: input.method,
      status: 'paid',
      reference: input.reference,
      note: input.note,
      paidAt: new Date(),
      recordedById: actor.userId,
    },
  })
  await issueInvoiceInTx(tx, actor.gymId, payment.id, today)
  return payment
}
