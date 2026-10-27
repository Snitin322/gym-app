import { z } from 'zod'
import type { IsoDate } from './dates'
import type { MembershipPlan } from './memberships'
import type { PaymentStatus } from './payments'

/** What a member can renew to, and whether paying online is available. */
export interface RenewalOptions {
  onlinePayments: boolean
  /** When a renewal bought now would start (day after the current membership ends, or today). */
  startDate: IsoDate
  plans: MembershipPlan[]
}

export const createOrderSchema = z.object({ planId: z.uuid() })

/** Everything the app needs to open Razorpay Checkout. The amount always comes from the server. */
export interface OnlineOrder {
  paymentId: string
  orderId: string
  keyId: string
  amountPaise: number
  currency: 'INR'
  gymName: string
  description: string
  prefill: { name: string; contact: string }
}

/** What Razorpay Checkout returns to the app after a successful payment. */
export const verifyPaymentSchema = z.object({
  paymentId: z.uuid(),
  razorpayOrderId: z.string().min(1).max(64),
  razorpayPaymentId: z.string().min(1).max(64),
  razorpaySignature: z.string().min(1).max(256),
})

export interface OnlinePaymentStatus {
  paymentId: string
  /** "created" until Razorpay's webhook confirms the payment. */
  status: PaymentStatus
  invoice: { id: string; number: string } | null
}
