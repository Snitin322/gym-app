import { z } from 'zod'
import type { IsoDate } from './dates'

// ---------------------------------------------------------------------------
// Weekly check-in: weight, optional measurements, three photos and a note
// ---------------------------------------------------------------------------

export const CHECK_IN_POSES = ['front', 'left', 'right'] as const
export type CheckInPose = (typeof CHECK_IN_POSES)[number]

export const POSE_LABELS: Record<CheckInPose, string> = { front: 'Front', left: 'Left side', right: 'Right side' }

/** Tape measurements in cm, all optional. */
export const MEASUREMENTS = ['waistCm', 'chestCm', 'hipsCm', 'armCm', 'thighCm'] as const
export type Measurement = (typeof MEASUREMENTS)[number]

export const MEASUREMENT_LABELS: Record<Measurement, string> = {
  waistCm: 'Waist',
  chestCm: 'Chest',
  hipsCm: 'Hips',
  armCm: 'Arm',
  thighCm: 'Thigh',
}

/** Photos are JPEG, PNG or WebP, resized in the browser; this is the most the API accepts. */
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024

/** Check-ins are weekly, Monday to Sunday (India): see `weekStart`. */
export interface CheckInView {
  id: string
  memberId: string
  /** The Monday of the week it belongs to. */
  weekOf: IsoDate
  submittedAt: string
  weightKg: number
  bodyFatPct: number | null
  waistCm: number | null
  chestCm: number | null
  hipsCm: number | null
  armCm: number | null
  thighCm: number | null
  note: string | null
  /** Short-lived links to the photos that were added. */
  photos: Partial<Record<CheckInPose, string>>
  coachReply: string | null
  reviewedAt: string | null
  reviewedByName: string | null
}

/** GET /me/check-ins */
export interface MyCheckIns {
  /** This week's Monday. */
  weekOf: IsoDate
  /** This week's check-in, if sent. */
  current: CheckInView | null
  /** Every check-in, newest first (including this week's). */
  history: CheckInView[]
  coach: { id: string; name: string } | null
  /** False until photo storage is set up; then the photo step is skipped. */
  photosEnabled: boolean
}

/** GET /members/:id/check-ins (coach or owner) */
export interface MemberCheckIns {
  member: { id: string; name: string }
  checkIns: CheckInView[]
  photosEnabled: boolean
}

/** GET /coach/check-ins: check-ins the coach hasn't replied to yet. */
export interface CheckInToReview {
  member: { id: string; name: string }
  checkIn: CheckInView
}

const measure = (min: number, max: number, label: string) =>
  z
    .number()
    .min(min, `${label} looks too low`)
    .max(max, `${label} looks too high`)
    .transform((v) => Math.round(v * 10) / 10)

const optionalMeasure = (label: string) => measure(10, 250, label).nullable().optional()

export const checkInInputSchema = z.object({
  weightKg: measure(25, 300, 'Weight'),
  bodyFatPct: measure(3, 70, 'Body fat').nullable().optional(),
  waistCm: optionalMeasure('Waist'),
  chestCm: optionalMeasure('Chest'),
  hipsCm: optionalMeasure('Hips'),
  armCm: optionalMeasure('Arm'),
  thighCm: optionalMeasure('Thigh'),
  /** How the week went: energy, hunger, sleep, anything hard. */
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
})
export type CheckInInput = z.input<typeof checkInInputSchema>

export const checkInReviewSchema = z.object({
  reply: z.string().trim().min(1, 'Write a reply').max(1000),
})

// ---------------------------------------------------------------------------
// Progress: series for graphs
// ---------------------------------------------------------------------------

export type ProgressMetric = 'weightKg' | 'bodyFatPct' | Measurement

export interface ProgressPoint {
  date: IsoDate
  value: number
}

/** One metric over time, oldest first, skipping weeks without a value. */
export function progressSeries(checkIns: CheckInView[], metric: ProgressMetric): ProgressPoint[] {
  return checkIns
    .filter((c) => c[metric] !== null)
    .map((c) => ({ date: c.weekOf, value: c[metric] as number }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}
