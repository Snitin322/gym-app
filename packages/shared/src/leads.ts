import { z } from 'zod'
import { isValidIsoDate, type IsoDate } from './dates'
import { phoneSchema } from './phone'

export const LEAD_SOURCES = ['walk_in', 'phone_call', 'instagram', 'facebook', 'google', 'referral', 'other'] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  walk_in: 'Walk-in',
  phone_call: 'Phone call',
  instagram: 'Instagram',
  facebook: 'Facebook',
  google: 'Google',
  referral: 'Referral',
  other: 'Other',
}

export const LEAD_STATUSES = ['new', 'contacted', 'trial', 'joined', 'lost'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]
/** Still being followed up. */
export const OPEN_LEAD_STATUSES = ['new', 'contacted', 'trial'] as const satisfies readonly LeadStatus[]

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  trial: 'Trial',
  joined: 'Joined',
  lost: 'Lost',
}

export const LEAD_FILTERS = ['open', 'joined', 'lost', 'all'] as const
export type LeadFilter = (typeof LEAD_FILTERS)[number]

/** The same phone number already belongs to a member, or to another enquiry. */
export interface LeadDuplicate {
  kind: 'member' | 'lead'
  id: string
  name: string
}

export interface LeadView {
  id: string
  name: string
  phone: string
  source: LeadSource
  interest: string | null
  note: string | null
  followUpOn: IsoDate | null
  status: LeadStatus
  lostReason: string | null
  memberId: string | null
  createdAt: string
  createdByName: string
  duplicates: LeadDuplicate[]
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined)
const clearableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null))
const date = z.string().refine(isValidIsoDate, 'Enter a valid date')

export const leadInputSchema = z.object({
  name: z.string().trim().min(2, 'Enter their name').max(80),
  phone: phoneSchema,
  source: z.enum(LEAD_SOURCES),
  interest: optionalText(120),
  note: optionalText(500),
  followUpOn: date.optional(),
})
export type LeadInput = z.input<typeof leadInputSchema>

/** Joining happens by adding them as a member (same phone), not by setting the status. */
export const leadUpdateSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter their name').max(80).optional(),
    phone: phoneSchema.optional(),
    source: z.enum(LEAD_SOURCES).optional(),
    interest: clearableText(120),
    note: clearableText(500),
    followUpOn: date.nullable().optional(),
    status: z.enum(['new', 'contacted', 'trial', 'lost']).optional(),
    lostReason: clearableText(120),
  })
  .refine((u) => u.status !== 'lost' || Boolean(u.lostReason), {
    message: 'Say why they didn’t join',
    path: ['lostReason'],
  })
export type LeadUpdate = z.input<typeof leadUpdateSchema>
