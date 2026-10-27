import type { FastifyBaseLogger } from 'fastify'
import { Prisma } from '@prisma/client'
import { ErrorCode, type IsoDate } from '@onthec/shared'
import { forTenant } from '../db/tenant'
import type { Db } from '../db/unscoped'
import { AppError } from '../errors'
import { isUniqueViolation } from '../lib/prisma-errors'
import { issueInvoiceInTx } from './invoices'
import { addMembershipInTx } from './memberships'
import type { RazorpayGateway } from './razorpay'

interface PaymentEntity {
  id?: string
  order_id?: string
  amount?: number
  currency?: string
}

interface RazorpayEvent {
  event?: string
  payload?: {
    payment?: { entity?: PaymentEntity }
    order?: { entity?: { id?: string } }
  }
}

export interface WebhookDeps {
  // Webhooks arrive without a session, so the payment's own gym decides the tenant (see below).
  db: Db
  gateway: RazorpayGateway | null
  log: FastifyBaseLogger
  today: () => IsoDate
}

export type WebhookOutcome = 'processed' | 'duplicate' | 'ignored'

/**
 * Razorpay's webhook is the source of truth for online payments. Safe to receive any number of
 * times: repeats are skipped by event id, and a payment is only ever fulfilled once.
 */
export async function handleRazorpayWebhook(
  { db, gateway, log, today }: WebhookDeps,
  rawBody: string,
  signature: string | undefined,
  eventId: string | undefined,
): Promise<WebhookOutcome> {
  if (!gateway) throw new AppError(503, ErrorCode.ONLINE_PAYMENTS_DISABLED, 'Online payments are not configured')
  if (!signature || !gateway.verifyWebhookSignature(rawBody, signature)) {
    throw new AppError(400, ErrorCode.INVALID_SIGNATURE, 'Invalid webhook signature')
  }

  let event: RazorpayEvent
  try {
    event = JSON.parse(rawBody) as RazorpayEvent
  } catch {
    throw new AppError(400, ErrorCode.BAD_REQUEST, 'Invalid JSON')
  }

  if (eventId && (await db.webhookEvent.findUnique({ where: { provider_eventId: { provider: 'razorpay', eventId } } }))) {
    return 'duplicate'
  }

  const entity = event.payload?.payment?.entity
  const orderId = entity?.order_id ?? event.payload?.order?.entity?.id
  let outcome: WebhookOutcome = 'ignored'

  if ((event.event === 'payment.captured' || event.event === 'order.paid') && orderId && entity?.id) {
    outcome = await fulfil(db, log, today(), orderId, entity)
  } else if (event.event === 'payment.failed' && orderId) {
    // Only an unpaid order can be marked failed (a later attempt on the same order may still succeed).
    await db.payment.updateMany({ where: { razorpayOrderId: orderId, status: 'created' }, data: { status: 'failed' } })
    outcome = 'processed'
  }

  if (eventId) {
    try {
      await db.webhookEvent.create({
        data: { provider: 'razorpay', eventId, type: event.event ?? 'unknown', payload: event as Prisma.InputJsonValue },
      })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error // a parallel delivery recorded it first: fine
    }
  }
  return outcome
}

async function fulfil(
  db: Db,
  log: FastifyBaseLogger,
  today: IsoDate,
  orderId: string,
  entity: PaymentEntity,
): Promise<WebhookOutcome> {
  // Unscoped lookup only to learn which gym the order belongs to; everything after is tenant-scoped.
  const found = await db.payment.findUnique({ where: { razorpayOrderId: orderId }, select: { id: true, gymId: true } })
  if (!found) {
    log.warn({ orderId }, 'Razorpay webhook for an unknown order: ignored')
    return 'ignored'
  }

  const tenant = forTenant(db, found.gymId)
  return tenant.$transaction(
    async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: found.id },
        include: { member: { select: { userId: true } } },
      })
      if (payment.status === 'paid') return 'duplicate' as const
      if (entity.amount !== payment.amountPaise || entity.currency !== 'INR' || !payment.planId) {
        log.error(
          { paymentId: payment.id, expected: payment.amountPaise, received: entity.amount, currency: entity.currency },
          'Razorpay amount or currency does not match the order: NOT fulfilled',
        )
        return 'ignored' as const
      }

      const membership = await addMembershipInTx(
        tx,
        { gymId: payment.gymId, userId: payment.member.userId },
        payment.memberId,
        { planId: payment.planId, discountReason: undefined },
        today,
        { paidOrder: true },
      )
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'paid', paidAt: new Date(), razorpayPaymentId: entity.id, membershipId: membership.id },
      })
      await issueInvoiceInTx(tx, payment.gymId, payment.id, today)
      log.info({ paymentId: payment.id, membershipId: membership.id }, 'Online payment confirmed')
      return 'processed' as const
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  )
}
