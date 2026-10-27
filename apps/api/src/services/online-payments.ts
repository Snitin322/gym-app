import { z } from 'zod'
import {
  ErrorCode,
  addDays,
  type IsoDate,
  type OnlineOrder,
  type OnlinePaymentStatus,
  type RenewalOptions,
  type verifyPaymentSchema,
} from '@onthec/shared'
import type { TenantDb } from '../db/tenant'
import { AppError } from '../errors'
import { fromDbDate } from '../lib/dates'
import { listPlans } from './plans'
import type { RazorpayGateway } from './razorpay'

export interface OnlineActor {
  gymId: string
  userId: string
}

function disabled() {
  return new AppError(503, ErrorCode.ONLINE_PAYMENTS_DISABLED, 'Online payment is not set up. Please pay at the front desk.')
}

async function memberOf(db: TenantDb, userId: string) {
  const member = await db.member.findUnique({
    where: { userId },
    include: {
      user: { select: { name: true, phone: true } },
      memberships: { where: { cancelledAt: null }, select: { endDate: true } },
    },
  })
  if (!member) throw new AppError(403, ErrorCode.NOT_A_MEMBER, 'Only members can renew online.')
  return member
}

/** Same rule as the desk: the day after the latest running or queued membership, or today. */
function renewalStart(endDates: Date[], today: IsoDate): IsoDate {
  const latest = endDates.map(fromDbDate).sort().at(-1)
  return latest && latest >= today ? addDays(latest, 1) : today
}

export async function getRenewalOptions(
  db: TenantDb,
  userId: string,
  today: IsoDate,
  gateway: RazorpayGateway | null,
): Promise<RenewalOptions> {
  const member = await memberOf(db, userId)
  return {
    onlinePayments: gateway !== null,
    startDate: renewalStart(member.memberships.map((m) => m.endDate), today),
    plans: (await listPlans(db)).filter((p) => p.active),
  }
}

/**
 * Starts an online renewal: records a "created" payment for the plan's price (decided here, never
 * by the app) and creates the matching Razorpay order. The membership is only created when
 * Razorpay's webhook confirms the payment.
 */
export async function createOnlineOrder(
  db: TenantDb,
  gateway: RazorpayGateway | null,
  actor: OnlineActor,
  planId: string,
): Promise<OnlineOrder> {
  if (!gateway) throw disabled()
  const member = await memberOf(db, actor.userId)
  const plan = await db.membershipPlan.findUnique({ where: { id: planId } })
  if (!plan) throw new AppError(404, ErrorCode.NOT_FOUND, 'Plan not found')
  if (!plan.active) throw new AppError(409, ErrorCode.PLAN_INACTIVE, 'This plan is no longer offered.')
  const gym = await db.gym.findUniqueOrThrow({ where: { id: actor.gymId }, select: { name: true } })

  const payment = await db.payment.create({
    data: {
      gymId: actor.gymId,
      memberId: member.id,
      planId: plan.id,
      amountPaise: plan.pricePaise,
      method: 'razorpay',
      status: 'created',
    },
  })

  let orderId: string
  try {
    const order = await gateway.createOrder({
      amountPaise: plan.pricePaise,
      receipt: payment.id,
      notes: { gymId: actor.gymId, paymentId: payment.id, memberId: member.id },
    })
    orderId = order.id
  } catch (error) {
    await db.payment.update({ where: { id: payment.id }, data: { status: 'failed' } })
    throw error
  }
  await db.payment.update({ where: { id: payment.id }, data: { razorpayOrderId: orderId } })

  return {
    paymentId: payment.id,
    orderId,
    keyId: gateway.keyId,
    amountPaise: plan.pricePaise,
    currency: 'INR',
    gymName: gym.name,
    description: `${plan.name} membership`,
    prefill: { name: member.user.name, contact: member.user.phone },
  }
}

async function ownPayment(db: TenantDb, userId: string, paymentId: string) {
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { member: { select: { userId: true } }, invoice: { select: { id: true, number: true } } },
  })
  // Someone else's payment looks exactly like a missing one.
  if (!payment || payment.member.userId !== userId) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Payment not found')
  }
  return payment
}

function toStatus(payment: Awaited<ReturnType<typeof ownPayment>>): OnlinePaymentStatus {
  return { paymentId: payment.id, status: payment.status, invoice: payment.invoice }
}

/**
 * Checks the signature Checkout returned. A valid signature proves the payment came from Razorpay
 * for this order, but the payment is only marked paid by the webhook (the source of truth).
 */
export async function verifyOnlinePayment(
  db: TenantDb,
  gateway: RazorpayGateway | null,
  userId: string,
  input: z.infer<typeof verifyPaymentSchema>,
): Promise<OnlinePaymentStatus> {
  if (!gateway) throw disabled()
  const payment = await ownPayment(db, userId, input.paymentId)
  if (
    payment.razorpayOrderId !== input.razorpayOrderId ||
    !gateway.verifyPaymentSignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature)
  ) {
    throw new AppError(400, ErrorCode.INVALID_SIGNATURE, 'This payment could not be verified.')
  }
  // Remember Razorpay's payment id (the webhook may have stored it already).
  await db.payment.updateMany({
    where: { id: payment.id, razorpayPaymentId: null },
    data: { razorpayPaymentId: input.razorpayPaymentId },
  })
  return toStatus(await ownPayment(db, userId, payment.id))
}

export async function getOnlinePaymentStatus(db: TenantDb, userId: string, paymentId: string) {
  return toStatus(await ownPayment(db, userId, paymentId))
}
