import type { IsoDate, Role } from '@onthec/shared'

/** "2026-03-20" → "20 Mar 2026" (or "20 Mar" with short = true). Plain calendar dates, no time zone shift. */
export function formatDate(date: IsoDate, { short = false }: { short?: boolean } = {}) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(short ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

/** 450050 → "4500.50", 450000 → "4500" for editable amount fields (integer maths, no floats). */
export function paiseToRupeesInput(paise: number) {
  const rest = paise % 100
  return rest === 0 ? String(paise / 100) : `${Math.floor(paise / 100)}.${String(rest).padStart(2, '0')}`
}

export function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** "+919876543210" → "+91 98765 43210" */
export function formatPhone(phone: string) {
  const match = /^\+91(\d{5})(\d{5})$/.exec(phone)
  return match ? `+91 ${match[1]} ${match[2]}` : phone
}

export const ROLE_LABELS: Record<Role, string> = {
  member: 'Member',
  trainer: 'Trainer',
  admin: 'Admin',
  owner: 'Owner',
}

export function errorMessage(error: unknown): string | null {
  if (!error) return null
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
