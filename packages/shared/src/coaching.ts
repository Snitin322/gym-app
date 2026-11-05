import { z } from 'zod'
import { isValidIsoDate, type IsoDate } from './dates'

// ---------------------------------------------------------------------------
// Coach and client health profile
// ---------------------------------------------------------------------------

export const SEXES = ['female', 'male', 'other'] as const
export type Sex = (typeof SEXES)[number]

export const SEX_LABELS: Record<Sex, string> = { female: 'Female', male: 'Male', other: 'Other' }

export const DIET_PREFERENCES = ['veg', 'eggetarian', 'non_veg', 'vegan'] as const
export type DietPreference = (typeof DIET_PREFERENCES)[number]

export const DIET_PREFERENCE_LABELS: Record<DietPreference, string> = {
  veg: 'Vegetarian',
  eggetarian: 'Eggetarian',
  non_veg: 'Non-vegetarian',
  vegan: 'Vegan',
}

/** Roles that can coach clients. */
export const COACH_ROLES = ['trainer', 'owner'] as const

/** What a coach needs to know before planning training and diet. Every field can be left empty. */
export interface ClientProfile {
  dateOfBirth: IsoDate | null
  sex: Sex | null
  heightCm: number | null
  startWeightKg: number | null
  bodyFatPct: number | null
  goal: string | null
  dietPreference: DietPreference | null
  medicalConditions: string | null
  injuries: string | null
  foodAllergies: string | null
  medicines: string | null
  lifestyle: string | null
  trainingExperience: string | null
  updatedAt: string
  updatedByName: string
}

/** A member's health profile as their coach, the owner or the member sees it. */
export interface ClientProfileView {
  member: { id: string; name: string }
  coach: { id: string; name: string } | null
  profile: ClientProfile | null
  /** When the member agreed in the app to share health details; null if they haven't yet. */
  healthConsentAt: string | null
}

/** Age in whole years on `today`. */
export function ageOn(dateOfBirth: IsoDate, today: IsoDate): number {
  const years = Number(today.slice(0, 4)) - Number(dateOfBirth.slice(0, 4))
  // Birthday not reached yet this year (MM-DD compares as text).
  return dateOfBirth.slice(5) > today.slice(5) ? years - 1 : years
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** Empty text clears the field. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters`)
    .nullable()
    .transform((v) => v || null)

/** A number in a range, or null. Rounded to one decimal place. */
const measure = (min: number, max: number, label: string) =>
  z
    .number()
    .min(min, `${label} looks too low`)
    .max(max, `${label} looks too high`)
    .transform((v) => Math.round(v * 10) / 10)
    .nullable()

/** The whole profile is saved at once (a form), so every field is required but may be null. */
export const clientProfileInputSchema = z.object({
  dateOfBirth: z
    .string()
    .refine(isValidIsoDate, 'Enter a valid date (YYYY-MM-DD)')
    .refine((d) => d >= '1920-01-01', 'Check the date of birth')
    .nullable(),
  sex: z.enum(SEXES).nullable(),
  heightCm: z
    .number()
    .int('Height in whole cm')
    .min(100, 'Height looks too low')
    .max(250, 'Height looks too high')
    .nullable(),
  startWeightKg: measure(25, 300, 'Weight'),
  bodyFatPct: measure(3, 70, 'Body fat'),
  goal: text(300),
  dietPreference: z.enum(DIET_PREFERENCES).nullable(),
  medicalConditions: text(1000),
  injuries: text(1000),
  foodAllergies: text(500),
  medicines: text(500),
  lifestyle: text(1000),
  trainingExperience: text(500),
})
export type ClientProfileInput = z.input<typeof clientProfileInputSchema>

/** A member saving their own details also agrees to share them (needed the first time). */
export const myClientProfileInputSchema = clientProfileInputSchema.extend({
  healthConsent: z.boolean().optional(),
})

export const setCoachSchema = z.object({ coachId: z.uuid().nullable() })
