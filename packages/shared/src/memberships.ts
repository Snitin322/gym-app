import { z } from 'zod'
import { daysBetween, inclusiveDays, isValidIsoDate, type IsoDate } from './dates'
import { phoneSchema } from './phone'

// ---------------------------------------------------------------------------
// Status rules (shared by the API and the app, so both always agree)
// ---------------------------------------------------------------------------

export type MembershipStatus = 'upcoming' | 'active' | 'frozen' | 'expired' | 'cancelled'

export interface FreezeRange {
  fromDate: IsoDate
  toDate: IsoDate
}

export interface MembershipDates {
  startDate: IsoDate
  /** Last valid day, already including any freeze extensions. */
  endDate: IsoDate
  cancelled: boolean
  freezes: FreezeRange[]
}

/** Status is always worked out from the dates, never stored, so it can't go stale. */
export function membershipStatus(m: MembershipDates, today: IsoDate): MembershipStatus {
  if (m.cancelled) return 'cancelled'
  if (today < m.startDate) return 'upcoming'
  if (today > m.endDate) return 'expired'
  if (m.freezes.some((f) => f.fromDate <= today && today <= f.toDate)) return 'frozen'
  return 'active'
}

/** Days the member can still use, counting today: 1 on the last day, 0 once expired. */
export function daysLeft(m: Pick<MembershipDates, 'startDate' | 'endDate'>, today: IsoDate): number {
  const from = today < m.startDate ? m.startDate : today
  return Math.max(0, inclusiveDays(from, m.endDate))
}

export function freezeDaysUsed(freezes: FreezeRange[]): number {
  return freezes.reduce((total, f) => total + inclusiveDays(f.fromDate, f.toDate), 0)
}

/** Default max freeze days offered when creating a plan of this length (the gym can change it). */
export function suggestedMaxFreezeDays(durationMonths: number): number {
  if (durationMonths >= 12) return 45
  if (durationMonths >= 6) return 30
  if (durationMonths >= 3) return 15
  return 0
}

/** "Ends 31 Mar · 12 days left" style summary data for list filters. */
export type MemberListStatus = 'active' | 'frozen' | 'expiring' | 'upcoming' | 'expired' | 'none'

export const EXPIRING_WITHIN_DAYS = 7

export const MEMBER_FILTERS = ['all', 'active', 'expiring', 'expired', 'none'] as const
export type MemberFilter = (typeof MEMBER_FILTERS)[number]

// ---------------------------------------------------------------------------
// API shapes
// ---------------------------------------------------------------------------

export interface MembershipPlan {
  id: string
  name: string
  durationMonths: number
  pricePaise: number
  maxFreezeDays: number
  description: string | null
  active: boolean
}

export interface MembershipFreezeView extends FreezeRange {
  id: string
  reason: string | null
}

export interface MembershipView {
  id: string
  planName: string
  durationMonths: number
  pricePaise: number
  startDate: IsoDate
  endDate: IsoDate
  status: MembershipStatus
  daysLeft: number
  maxFreezeDays: number
  freezeDaysUsed: number
  freezes: MembershipFreezeView[]
  cancelledAt: string | null
  cancelReason: string | null
}

export interface MemberSummary {
  id: string
  userId: string
  name: string
  phone: string
  status: MemberListStatus
  /** The membership that matters today: running/frozen, else next upcoming, else latest. */
  current: MembershipView | null
}

export interface MemberDetail extends MemberSummary {
  joinedOn: IsoDate
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  notes: string | null
  memberships: MembershipView[]
}

export interface MyMembership {
  current: MembershipView | null
  history: MembershipView[]
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

export const isoDateSchema = z.string().refine(isValidIsoDate, 'Enter a valid date (YYYY-MM-DD)')

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined)

export const planInputSchema = z.object({
  name: z.string().trim().min(2, 'Plan name is too short').max(60),
  durationMonths: z.number().int().min(1, 'At least 1 month').max(36, 'At most 36 months'),
  pricePaise: z.number().int().min(100, 'Price must be at least ₹1').max(10_000_000_00),
  maxFreezeDays: z.number().int().min(0).max(365),
  description: optionalText(300),
})
export type PlanInput = z.infer<typeof planInputSchema>

export const planUpdateSchema = planInputSchema.partial().extend({ active: z.boolean().optional() })

export const newMembershipSchema = z.object({
  planId: z.uuid(),
  /** Defaults to the day after the current membership ends, or today. */
  startDate: isoDateSchema.optional(),
})

export const memberInputSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  phone: phoneSchema,
  joinedOn: isoDateSchema.optional(),
  emergencyContactName: optionalText(80),
  emergencyContactPhone: z
    .union([z.literal('').transform(() => undefined), phoneSchema])
    .optional(),
  notes: optionalText(1000),
})

export const createMemberSchema = memberInputSchema.extend({
  firstMembership: newMembershipSchema.optional(),
})

export const updateMemberSchema = memberInputSchema.partial()

export const freezeInputSchema = z
  .object({
    fromDate: isoDateSchema,
    toDate: isoDateSchema,
    reason: optionalText(200),
  })
  .refine((f) => daysBetween(f.fromDate, f.toDate) >= 0, {
    message: 'The freeze must end on or after its start date',
    path: ['toDate'],
  })

export const cancelMembershipSchema = z.object({ reason: optionalText(200) })

export const STAFF_ROLES = ['trainer', 'admin'] as const
export const createStaffSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(80),
  phone: phoneSchema,
  role: z.enum(STAFF_ROLES),
})
