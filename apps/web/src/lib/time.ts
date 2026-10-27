import {
  WEEKDAY_LABELS,
  addDays,
  formatMinute,
  indiaDateTime,
  isoWeekday,
  todayInIndia,
  type IsoDate,
} from '@onthec/shared'
import { formatDate } from './format'

/** The India calendar date of an instant. */
export function indiaDateOf(iso: string): IsoDate {
  return todayInIndia(new Date(iso))
}

/** Minutes after India midnight of an instant (e.g. 6:30 am → 390). */
export function indiaMinuteOf(iso: string): number {
  return Math.round((Date.parse(iso) - indiaDateTime(indiaDateOf(iso), 0).getTime()) / 60_000)
}

/** "6:00 am" in India time. */
export function formatTime(iso: string) {
  return formatMinute(indiaMinuteOf(iso))
}

/** "Today", "Tomorrow" or "Mon 3 Nov". */
export function formatDay(date: IsoDate, today: IsoDate = todayInIndia()) {
  if (date === today) return 'Today'
  if (date === addDays(today, 1)) return 'Tomorrow'
  return `${WEEKDAY_LABELS[isoWeekday(date) - 1]} ${formatDate(date, { short: true })}`
}

/** "Today, 6:00 am" or "Mon 3 Nov, 6:00 am" in India time. */
export function formatWhen(iso: string, today: IsoDate = todayInIndia()) {
  return `${formatDay(indiaDateOf(iso), today)}, ${formatTime(iso)}`
}

/** Groups items by the India date of an instant, keeping their order. */
export function groupByDay<T>(items: T[], instantOf: (item: T) => string): { date: IsoDate; items: T[] }[] {
  const days: { date: IsoDate; items: T[] }[] = []
  for (const item of items) {
    const date = indiaDateOf(instantOf(item))
    const last = days.at(-1)
    if (last?.date === date) last.items.push(item)
    else days.push({ date, items: [item] })
  }
  return days
}
