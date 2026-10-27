import type { Role } from '@onthec/shared'

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
