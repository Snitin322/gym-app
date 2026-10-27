import { z } from 'zod'
import { INDIAN_STATES, isValidGstin } from './gst'
import { phoneSchema } from './phone'

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/** Ways the front desk can take money. "razorpay" is online only (Phase 4c). */
export const DESK_PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank_transfer'] as const
export type DeskPaymentMethod = (typeof DESK_PAYMENT_METHODS)[number]
export type PaymentMethod = DeskPaymentMethod | 'razorpay'
export type PaymentStatus = 'created' | 'paid' | 'failed'

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  razorpay: 'Online',
}

export interface PaymentView {
  id: string
  amountPaise: number
  method: PaymentMethod
  status: PaymentStatus
  reference: string | null
  note: string | null
  paidAt: string | null
  membershipId: string | null
  /** e.g. "3 months" — what the payment was for. */
  description: string
  recordedByName: string | null
  /** The invoice issued for this payment (null only for payments from before invoices existed). */
  invoice: { id: string; number: string } | null
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined)

/** Payment taken at the desk while selling a membership (always the full sale price). */
export const salePaymentSchema = z.object({
  method: z.enum(DESK_PAYMENT_METHODS),
  reference: optionalText(80),
})

/** "Record payment" for an existing membership with money due. Partial payments are allowed. */
export const recordPaymentSchema = z.object({
  amountPaise: z.number().int().min(100, 'Amount must be at least ₹1'),
  method: z.enum(DESK_PAYMENT_METHODS),
  reference: optionalText(80),
  note: optionalText(200),
})

// ---------------------------------------------------------------------------
// Gym details (used on invoices)
// ---------------------------------------------------------------------------

export interface GymDetails {
  id: string
  name: string
  legalName: string | null
  address: string | null
  city: string | null
  pincode: string | null
  stateCode: string | null
  gstin: string | null
  sacCode: string
  invoicePrefix: string
  contactPhone: string | null
  email: string | null
}

/** Clearable text: "" removes the value (null), missing leaves it unchanged. */
const clearable = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null))

const stateCodes = INDIAN_STATES.map((s) => s.code) as [string, ...string[]]

export const gymDetailsSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    legalName: clearable(120),
    address: clearable(300),
    city: clearable(60),
    pincode: z
      .union([z.literal('').transform(() => null), z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a 6-digit PIN code')])
      .optional(),
    stateCode: z.union([z.literal('').transform(() => null), z.enum(stateCodes)]).optional(),
    gstin: z
      .union([
        z.literal('').transform(() => null),
        z
          .string()
          .trim()
          .toUpperCase()
          .refine(isValidGstin, 'This GSTIN is not valid. Check for typos.'),
      ])
      .optional(),
    sacCode: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'SAC code is 6 digits')
      .optional(),
    // Invoice numbers are PREFIX/26-27/0001 and GST allows at most 16 characters.
    invoicePrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{1,5}$/, 'Use 1–5 letters or digits')
      .optional(),
    contactPhone: z.union([z.literal('').transform(() => null), phoneSchema]).optional(),
    email: z.union([z.literal('').transform(() => null), z.email('Enter a valid email')]).optional(),
  })
  .refine((g) => !g.gstin || !g.stateCode || g.gstin.slice(0, 2) === g.stateCode, {
    message: 'The GSTIN belongs to a different state than the one selected.',
    path: ['gstin'],
  })
