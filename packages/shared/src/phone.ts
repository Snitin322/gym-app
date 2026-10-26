import { z } from 'zod'

/**
 * Normalises an Indian mobile number to E.164 (`+91XXXXXXXXXX`).
 * Accepts "98765 43210", "098765-43210", "919876543210", "+91 98765 43210".
 * Returns null if it is not a valid Indian mobile number.
 */
export function normalizePhone(input: string): string | null {
  const compact = input.replace(/[\s\-()]/g, '')
  const match = /^(?:\+?91|0)?([6-9]\d{9})$/.exec(compact)
  return match ? `+91${match[1]}` : null
}

/** "+919876543210" → "+91******3210", for logs. */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}******${phone.slice(-4)}`
}

/** Validates any accepted format and outputs E.164. */
export const phoneSchema = z
  .string()
  .refine((value) => normalizePhone(value) !== null, 'Enter a valid 10-digit Indian mobile number')
  .transform((value) => normalizePhone(value) as string)
