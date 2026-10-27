import { ErrorCode } from '@onthec/shared'
import type { Env } from '../env'
import { AppError } from '../errors'
import { hmacSha256, safeEqual } from '../lib/crypto'

export interface RazorpayOrder {
  id: string
  amount: number
  currency: string
}

/** The small part of Razorpay the app uses: create orders and check signatures. */
export interface RazorpayGateway {
  keyId: string
  createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<RazorpayOrder>
  /** Checkout's signature: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean
  /** Webhook signature: HMAC-SHA256 of the raw request body with the webhook secret. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean
}

export interface RazorpayConfig {
  keyId: string
  keySecret: string
  webhookSecret: string
}

const ORDERS_URL = 'https://api.razorpay.com/v1/orders'

export function razorpayGateway(config: RazorpayConfig, fetchImpl: typeof fetch = fetch): RazorpayGateway {
  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')
  return {
    keyId: config.keyId,

    async createOrder({ amountPaise, receipt, notes }) {
      let response: Response
      try {
        response = await fetchImpl(ORDERS_URL, {
          method: 'POST',
          headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json' },
          body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes }),
          signal: AbortSignal.timeout(10_000),
        })
      } catch (cause) {
        throw new AppError(502, ErrorCode.PAYMENT_GATEWAY_ERROR, 'Could not reach Razorpay. Please try again.', { cause })
      }
      const body = (await response.json().catch(() => ({}))) as Partial<RazorpayOrder> & { error?: { description?: string } }
      if (!response.ok || !body.id) {
        throw new AppError(
          502,
          ErrorCode.PAYMENT_GATEWAY_ERROR,
          'Online payment is not available right now. Please pay at the front desk.',
          { cause: new Error(body.error?.description ?? `HTTP ${response.status}`) },
        )
      }
      return { id: body.id, amount: body.amount ?? amountPaise, currency: body.currency ?? 'INR' }
    },

    verifyPaymentSignature(orderId, paymentId, signature) {
      return safeEqual(hmacSha256(config.keySecret, `${orderId}|${paymentId}`), signature)
    },

    verifyWebhookSignature(rawBody, signature) {
      return safeEqual(hmacSha256(config.webhookSecret, rawBody), signature)
    },
  }
}

/** The configured gateway, or null when Razorpay keys aren't set (desk payments only). */
export function createRazorpayGateway(env: Env): RazorpayGateway | null {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET || !env.RAZORPAY_WEBHOOK_SECRET) return null
  return razorpayGateway({
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
  })
}
