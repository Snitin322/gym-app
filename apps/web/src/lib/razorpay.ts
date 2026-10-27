import type { OnlineOrder } from '@onthec/shared'

/** What Razorpay Checkout hands back after a successful payment. */
export interface CheckoutResult {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

interface RazorpayInstance {
  open(): void
  on(event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void): void
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance
  }
}

const CHECKOUT_SCRIPT = 'https://checkout.razorpay.com/v1/checkout.js'
let loading: Promise<void> | null = null

/** Loads Razorpay's Checkout script once, only when a member actually pays. */
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = CHECKOUT_SCRIPT
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loading = null
      reject(new Error("Couldn't open the payment window. Check your internet connection and try again."))
    }
    document.head.append(script)
  })
  return loading
}

export class CheckoutCancelled extends Error {
  constructor() {
    super('Payment cancelled.')
    this.name = 'CheckoutCancelled'
  }
}

/**
 * Opens Razorpay Checkout for an order. Resolves with the payment details on success, rejects with
 * CheckoutCancelled if the member closes it. Failed attempts stay inside Checkout so they can retry.
 */
export async function payWithRazorpay(order: OnlineOrder): Promise<CheckoutResult> {
  await loadCheckout()
  const Razorpay = window.Razorpay
  if (!Razorpay) throw new Error("Couldn't open the payment window. Please try again.")

  return new Promise<CheckoutResult>((resolve, reject) => {
    const checkout = new Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amountPaise,
      currency: order.currency,
      name: order.gymName,
      description: order.description,
      prefill: order.prefill,
      theme: { color: '#a3e635' },
      handler: (result: CheckoutResult) => resolve(result),
      modal: { ondismiss: () => reject(new CheckoutCancelled()), confirm_close: true },
    })
    checkout.open()
  })
}

/** How long to wait for Razorpay's confirmation (the webhook) before saying "it'll update shortly". */
export const confirmation = { attempts: 30, intervalMs: 2000 }
