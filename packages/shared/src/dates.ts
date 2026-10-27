/**
 * Calendar dates as "YYYY-MM-DD" strings (no time, no time zone), the way membership dates are
 * stored. All arithmetic is done in UTC on these plain dates, so it never shifts across midnight.
 */
export type IsoDate = string

export const GYM_TIME_ZONE = 'Asia/Kolkata'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [, y, m, d] = match.map(Number) as [number, number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

function parts(date: IsoDate): [number, number, number] {
  const match = ISO_DATE.exec(date)
  if (!match || !isValidIsoDate(date)) throw new Error(`Invalid date: ${date}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function fromUtc(date: Date): IsoDate {
  return date.toISOString().slice(0, 10)
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Today's date at the gym (India), e.g. 23:30 UTC on 1 Jan is already 2 Jan in India. */
export function todayInIndia(now: Date = new Date()): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: GYM_TIME_ZONE }).format(now)
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = parts(date)
  return fromUtc(new Date(Date.UTC(y, m - 1, d + days)))
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const [y1, m1, d1] = parts(from)
  const [y2, m2, d2] = parts(to)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

/** Number of calendar days in an inclusive range, e.g. 10 Feb → 19 Feb = 10. */
export function inclusiveDays(from: IsoDate, to: IsoDate): number {
  return daysBetween(from, to) + 1
}

/**
 * Last valid day of a membership of `months` months starting on `start` (inclusive):
 * the day before the same date `months` later. If that date doesn't exist (31 Jan + 1 month),
 * the membership runs to the end of that month, so nobody loses days.
 *   1 Jan  + 1 → 31 Jan     15 Jan + 1 → 14 Feb
 *   31 Jan + 1 → 28 Feb     31 Mar + 1 → 30 Apr
 */
export function membershipEndDate(start: IsoDate, months: number): IsoDate {
  const [y, m, d] = parts(start)
  const targetIndex = m - 1 + months
  const targetYear = y + Math.floor(targetIndex / 12)
  const targetMonth = (targetIndex % 12) + 1
  const lastDay = daysInMonth(targetYear, targetMonth)
  if (d > lastDay) {
    return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  }
  return addDays(fromUtc(new Date(Date.UTC(targetYear, targetMonth - 1, d))), -1)
}
