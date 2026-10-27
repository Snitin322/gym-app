import type { IsoDate } from '@onthec/shared'

/** Prisma maps Postgres `date` columns to JS Dates at UTC midnight. */
export function toDbDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`)
}

export function fromDbDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10)
}
