import { z } from 'zod'
import { addDays, isValidIsoDate, todayInIndia, type IsoDate } from './dates'

// ---------------------------------------------------------------------------
// Gym rules for booking and cancelling
// ---------------------------------------------------------------------------

export const DEFAULT_PT_RULES = {
  /** Members can cancel for free until this many hours before the start; later uses the session. */
  freeCancelHours: 12,
  /** How many days ahead members can book. */
  bookingHorizonDays: 14,
  /** Bookings close this many hours before the start. */
  minNoticeHours: 2,
} as const

export const ptRulesSchema = z.object({
  freeCancelHours: z.number().int().min(0).max(72),
  bookingHorizonDays: z.number().int().min(1).max(60),
  minNoticeHours: z.number().int().min(0).max(48),
})
export type PtRules = z.infer<typeof ptRulesSchema>

export const ptRulesUpdateSchema = ptRulesSchema.partial()

/** The gym's PT rules from its settings JSON, with defaults for anything missing or invalid. */
export function ptRulesFromSettings(settings: unknown): PtRules {
  const stored = (settings as { ptRules?: unknown } | null)?.ptRules
  const parsed = ptRulesSchema.partial().safeParse(stored ?? {})
  return { ...DEFAULT_PT_RULES, ...(parsed.success ? parsed.data : {}) }
}

// ---------------------------------------------------------------------------
// India time (UTC+5:30 all year; no daylight saving)
// ---------------------------------------------------------------------------

const INDIA_OFFSET_MS = 330 * 60_000
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/** The instant of `minute` minutes after midnight on `date` in India. */
export function indiaDateTime(date: IsoDate, minute: number): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) + minute * MINUTE_MS - INDIA_OFFSET_MS)
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: IsoDate): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** 390 → "6:30 am", 1020 → "5:00 pm", 1440 → "12:00 am" (midnight). */
export function formatMinute(minute: number): string {
  const h24 = Math.floor(minute / 60) % 24
  const m = minute % 60
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`
}

/** Until when a member can cancel for free. */
export function freeCancelUntil(startsAt: Date, rules: Pick<PtRules, 'freeCancelHours'>): Date {
  return new Date(startsAt.getTime() - rules.freeCancelHours * HOUR_MS)
}

// ---------------------------------------------------------------------------
// Open slots
// ---------------------------------------------------------------------------

export interface AvailabilityWindow {
  weekday: number
  startMinute: number
  endMinute: number
}

export interface PtSlot {
  startsAt: string
  endsAt: string
}

export interface SlotInput {
  windows: AvailabilityWindow[]
  sessionMinutes: number
  /** Time off and booked sessions (trainer's and member's): no slot may overlap them. */
  busy: { startsAt: Date; endsAt: Date }[]
  now: Date
  rules: Pick<PtRules, 'bookingHorizonDays' | 'minNoticeHours'>
  /** Last date a session may be on (the package's use-by date). */
  lastDay?: IsoDate
}

/**
 * Bookable start times: the trainer's weekly hours on each day from today to the booking horizon
 * (and not after `lastDay`), cut back to back into session-length blocks, minus anything that
 * overlaps busy time or starts sooner than the minimum notice.
 */
export function generateSlots({ windows, sessionMinutes, busy, now, rules, lastDay }: SlotInput): PtSlot[] {
  const today = todayInIndia(now)
  const horizon = addDays(today, rules.bookingHorizonDays)
  const last = lastDay && lastDay < horizon ? lastDay : horizon
  const earliest = now.getTime() + rules.minNoticeHours * HOUR_MS
  const length = sessionMinutes * MINUTE_MS
  const busyMs = busy.map((b) => [b.startsAt.getTime(), b.endsAt.getTime()] as const)

  const starts = new Set<number>()
  for (let date = today; date <= last; date = addDays(date, 1)) {
    const weekday = isoWeekday(date)
    for (const w of windows) {
      if (w.weekday !== weekday) continue
      for (let m = w.startMinute; m + sessionMinutes <= w.endMinute; m += sessionMinutes) {
        const start = indiaDateTime(date, m).getTime()
        const end = start + length
        if (start < earliest) continue
        if (busyMs.some(([s, e]) => s < end && start < e)) continue
        starts.add(start)
      }
    }
  }
  return [...starts]
    .sort((a, b) => a - b)
    .map((start) => ({ startsAt: new Date(start).toISOString(), endsAt: new Date(start + length).toISOString() }))
}

// ---------------------------------------------------------------------------
// API shapes
// ---------------------------------------------------------------------------

export const PT_SESSION_STATUSES = ['booked', 'cancelled', 'completed', 'no_show'] as const
export type PtSessionStatus = (typeof PT_SESSION_STATUSES)[number]

export interface PtSessionView {
  id: string
  purchaseId: string
  packageName: string
  trainer: { id: string; name: string }
  member: { id: string; name: string; phone: string }
  startsAt: string
  endsAt: string
  status: PtSessionStatus
  /** Cancelled by the member after the free-cancel time: the session was used up. */
  lateCancel: boolean
  cancelledAt: string | null
  cancelReason: string | null
  cancelledByName: string | null
  bookedByName: string
  /** Member cancellations after this time use up the session. */
  freeCancelUntil: string
  /** Set once the trainer (or desk) marks it completed or no-show. */
  trainerNotes: string | null
  markedAt: string | null
  markedByName: string | null
  /** Null until the session is marked. */
  confirmation: PtConfirmation | null
  /** The member can confirm or dispute until then (null if not marked). */
  disputeUntil: string | null
  /** Whoever marked it can undo until then (null if not marked). */
  undoUntil: string | null
  disputedAt: string | null
  disputeReason: string | null
  resolution: PtDisputeResolution | null
  resolutionNote: string | null
  resolvedByName: string | null
  resolvedAt: string | null
}

// ---------------------------------------------------------------------------
// Completing sessions and disputes
// ---------------------------------------------------------------------------

/** How long the member has to confirm or dispute a marked session. */
export const DISPUTE_WINDOW_HOURS = 24
/** How long a trainer can undo their own mark. */
export const UNDO_WINDOW_MINUTES = 60

export const PT_MARK_OUTCOMES = ['completed', 'no_show'] as const
export type PtMarkOutcome = (typeof PT_MARK_OUTCOMES)[number]

export type PtDisputeResolution = 'upheld' | 'rejected'

/**
 * Where a marked session stands with the member. "auto_confirmed" is worked out from the time:
 * no reply within the dispute window counts as confirmed (no background job needed).
 */
export type PtConfirmation = 'pending' | 'confirmed' | 'auto_confirmed' | 'disputed' | 'upheld' | 'rejected'

export function disputeUntil(markedAt: Date): Date {
  return new Date(markedAt.getTime() + DISPUTE_WINDOW_HOURS * HOUR_MS)
}

export function undoUntil(markedAt: Date): Date {
  return new Date(markedAt.getTime() + UNDO_WINDOW_MINUTES * MINUTE_MS)
}

export function ptConfirmation(
  s: {
    markedAt: Date | null
    confirmedAt: Date | null
    disputedAt: Date | null
    resolution: PtDisputeResolution | null
  },
  now: Date,
): PtConfirmation | null {
  if (!s.markedAt) return null
  if (s.resolution) return s.resolution
  if (s.disputedAt) return 'disputed'
  if (s.confirmedAt) return 'confirmed'
  return now.getTime() > disputeUntil(s.markedAt).getTime() ? 'auto_confirmed' : 'pending'
}

export const PT_CONFIRMATION_LABELS: Record<PtConfirmation, string> = {
  pending: 'Waiting for the member',
  confirmed: 'Confirmed',
  auto_confirmed: 'Confirmed (no reply in 24 h)',
  disputed: 'Disputed',
  upheld: 'Session given back',
  rejected: 'Dispute closed, session used',
}

export interface TimeOffView {
  id: string
  startsAt: string
  endsAt: string
  reason: string | null
}

export interface TrainerAvailabilityView {
  trainerId: string
  trainerName: string
  sessionMinutes: number
  windows: AvailabilityWindow[]
  /** Time off that hasn't ended yet. */
  timeOff: TimeOffView[]
}

export interface PtSlotsResponse {
  purchaseId: string
  trainer: { id: string; name: string }
  sessionMinutes: number
  rules: PtRules
  slots: PtSlot[]
}

/** Adding time off cancels (free) any sessions booked inside it. */
export interface TimeOffResult {
  timeOff: TimeOffView
  cancelledSessions: PtSessionView[]
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const instant = z.iso.datetime({ offset: true, message: 'Enter a valid date and time' })

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined)

const windowSchema = z
  .object({
    weekday: z.number().int().min(1).max(7),
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine((w) => w.startMinute < w.endMinute, 'Each time range must end after it starts')

export const availabilityInputSchema = z
  .object({
    sessionMinutes: z.number().int().min(15, 'Sessions are at least 15 minutes').max(240, 'Sessions are at most 4 hours'),
    windows: z.array(windowSchema).max(70),
  })
  .refine(
    ({ windows }) =>
      windows.every((a, i) =>
        windows.every(
          (b, j) => i === j || a.weekday !== b.weekday || a.endMinute <= b.startMinute || b.endMinute <= a.startMinute,
        ),
      ),
    'Time ranges on the same day must not overlap',
  )
export type AvailabilityInput = z.infer<typeof availabilityInputSchema>

export const timeOffInputSchema = z
  .object({ startsAt: instant, endsAt: instant, reason: optionalText(120) })
  .refine((t) => Date.parse(t.endsAt) > Date.parse(t.startsAt), 'Time off must end after it starts')
  .refine((t) => Date.parse(t.endsAt) - Date.parse(t.startsAt) <= 90 * 24 * HOUR_MS, 'Time off can be at most 90 days')

export const bookSessionSchema = z.object({ startsAt: instant })

export const cancelSessionSchema = z.object({ reason: optionalText(200) })

export const sessionRangeQuerySchema = z.object({
  from: z.string().refine(isValidIsoDate, 'Enter a valid date').optional(),
  days: z.coerce.number().int().min(1).max(62).default(14),
})

export const markSessionSchema = z.object({
  outcome: z.enum(PT_MARK_OUTCOMES),
  note: optionalText(500),
})

export const disputeSessionSchema = z.object({
  reason: z.string().trim().min(3, 'Tell the gym what went wrong').max(300),
})

export const resolveDisputeSchema = z.object({
  resolution: z.enum(['upheld', 'rejected']),
  note: z.string().trim().min(3, 'Add a short note for the member').max(300),
})
