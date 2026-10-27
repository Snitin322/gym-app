import { z } from 'zod'
import { addDays, type IsoDate } from './dates'
import { salePaymentSchema } from './payments'

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Why a PT balance changed. Every change is one ledger line; the balance is their sum. */
export const PT_LEDGER_REASONS = [
  'purchase',
  'session_completed',
  'late_cancel',
  'no_show',
  'dispute_refund',
  'adjustment',
] as const
export type PtLedgerReason = (typeof PT_LEDGER_REASONS)[number]

export const PT_LEDGER_LABELS: Record<PtLedgerReason, string> = {
  purchase: 'Package bought',
  session_completed: 'Session completed',
  late_cancel: 'Late cancellation',
  no_show: 'No-show',
  dispute_refund: 'Dispute upheld',
  adjustment: 'Adjustment',
}

export type PtPurchaseStatus = 'active' | 'used_up' | 'expired'

/** Last day a package can be used: valid for `validityDays` days including the start day. */
export function ptExpiresOn(startDate: IsoDate, validityDays: number): IsoDate {
  return addDays(startDate, validityDays - 1)
}

/** Expiry is worked out from the date (no job needed): unused sessions simply can't be used after it. */
export function ptPurchaseStatus(p: { sessionsLeft: number; expiresOn: IsoDate }, today: IsoDate): PtPurchaseStatus {
  if (today > p.expiresOn) return 'expired'
  if (p.sessionsLeft <= 0) return 'used_up'
  return 'active'
}

// ---------------------------------------------------------------------------
// API shapes
// ---------------------------------------------------------------------------

export interface PtPackage {
  id: string
  name: string
  sessionCount: number
  validityDays: number
  pricePaise: number
  description: string | null
  active: boolean
}

export interface PtLedgerEntry {
  id: string
  change: number
  reason: PtLedgerReason
  note: string | null
  createdAt: string
  createdByName: string | null
}

export interface PtPurchaseView {
  id: string
  memberId: string
  packageName: string
  sessionCount: number
  /** Sum of the ledger. */
  sessionsLeft: number
  startDate: IsoDate
  expiresOn: IsoDate
  status: PtPurchaseStatus
  trainer: { id: string; name: string }
  pricePaise: number
  listPricePaise: number
  discountReason: string | null
  paidPaise: number
  duePaise: number
  ledger: PtLedgerEntry[]
}

/** A trainer's client: the member and their packages with this trainer. */
export interface TrainerClient {
  memberId: string
  name: string
  phone: string
  purchases: PtPurchaseView[]
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined)

const clearableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null))

export const ptPackageInputSchema = z.object({
  name: z.string().trim().min(2, 'Package name is too short').max(60),
  sessionCount: z.number().int().min(1, 'At least 1 session').max(200),
  validityDays: z.number().int().min(1, 'At least 1 day').max(730),
  pricePaise: z.number().int().min(100, 'Price must be at least ₹1').max(10_000_000_00),
  description: optionalText(300),
})
export type PtPackageInput = z.infer<typeof ptPackageInputSchema>

export const ptPackageUpdateSchema = ptPackageInputSchema
  .partial()
  .extend({ description: clearableText(300), active: z.boolean().optional() })

export const ptSaleSchema = z.object({
  packageId: z.uuid(),
  trainerId: z.uuid(),
  /** Sale price if discounted (never above the package price); a reason is then required. */
  pricePaise: z.number().int().min(0).optional(),
  discountReason: optionalText(120),
  /** Paid at the desk now for the full price; omit for "pay later". */
  payment: salePaymentSchema.optional(),
})

export const ptAdjustSchema = z.object({
  change: z
    .number()
    .int()
    .min(-50)
    .max(50)
    .refine((n) => n !== 0, 'Change must not be zero'),
  note: z.string().trim().min(3, 'Give a reason for the adjustment').max(200),
})

export const ptExtendSchema = z.object({ expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date') })
