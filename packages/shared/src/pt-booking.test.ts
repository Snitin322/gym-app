import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PT_RULES,
  availabilityInputSchema,
  formatMinute,
  freeCancelUntil,
  generateSlots,
  indiaDateTime,
  isoWeekday,
  ptRulesFromSettings,
  timeOffInputSchema,
} from './pt-booking'

// Friday 20 Mar 2026, 9:00 am in India.
const NOW = new Date('2026-03-20T03:30:00Z')
const rules = { bookingHorizonDays: 14, minNoticeHours: 2 }
const at = (date: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return indiaDateTime(date, h * 60 + m)
}
/** "2026-03-21 06:00" style labels in India time, for readable assertions. */
const label = (iso: string) => {
  const d = new Date(Date.parse(iso) + 330 * 60_000)
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

describe('India time helpers', () => {
  it('turns India wall-clock time into UTC and knows the weekday', () => {
    expect(indiaDateTime('2026-03-20', 6 * 60).toISOString()).toBe('2026-03-20T00:30:00.000Z')
    expect(indiaDateTime('2026-03-20', 0).toISOString()).toBe('2026-03-19T18:30:00.000Z')
    expect(isoWeekday('2026-03-20')).toBe(5) // Friday
    expect(isoWeekday('2026-03-22')).toBe(7) // Sunday
    expect(formatMinute(390)).toBe('6:30 am')
    expect(formatMinute(720)).toBe('12:00 pm')
    expect(formatMinute(1020)).toBe('5:00 pm')
  })

  it('free cancellation ends 12 hours before the start by default', () => {
    expect(freeCancelUntil(at('2026-03-21', '07:00'), DEFAULT_PT_RULES).toISOString()).toBe(
      at('2026-03-20', '19:00').toISOString(),
    )
  })
})

describe('generateSlots', () => {
  const saturdayMorning = [{ weekday: 6, startMinute: 6 * 60, endMinute: 9 * 60 + 30 }]

  it('cuts weekly hours into back-to-back sessions; a leftover shorter than a session is skipped', () => {
    const slots = generateSlots({ windows: saturdayMorning, sessionMinutes: 60, busy: [], now: NOW, rules })
    // Saturdays up to the horizon (3 Apr): 21 and 28 Mar.
    expect(slots.map((s) => label(s.startsAt))).toEqual([
      '2026-03-21 06:00',
      '2026-03-21 07:00',
      '2026-03-21 08:00',
      '2026-03-28 06:00',
      '2026-03-28 07:00',
      '2026-03-28 08:00',
    ])
    expect(label(slots[0]!.endsAt)).toBe('2026-03-21 07:00')
  })

  it('uses the trainer’s session length', () => {
    const slots = generateSlots({ windows: saturdayMorning, sessionMinutes: 45, busy: [], now: NOW, rules: { ...rules, bookingHorizonDays: 1 } })
    expect(slots.map((s) => label(s.startsAt))).toEqual([
      '2026-03-21 06:00',
      '2026-03-21 06:45',
      '2026-03-21 07:30',
      '2026-03-21 08:15',
    ])
  })

  it('needs the minimum notice: today 9:00 am, nothing before 11:00 am', () => {
    const friday = [{ weekday: 5, startMinute: 8 * 60, endMinute: 13 * 60 }]
    const slots = generateSlots({ windows: friday, sessionMinutes: 60, busy: [], now: NOW, rules: { ...rules, bookingHorizonDays: 0 } })
    expect(slots.map((s) => label(s.startsAt))).toEqual(['2026-03-20 11:00', '2026-03-20 12:00'])
  })

  it('leaves out time off and booked sessions, including partial overlaps', () => {
    const slots = generateSlots({
      windows: saturdayMorning,
      sessionMinutes: 60,
      busy: [
        { startsAt: at('2026-03-21', '07:30'), endsAt: at('2026-03-21', '08:00') }, // half an hour of time off
        { startsAt: at('2026-03-28', '00:00'), endsAt: at('2026-03-29', '00:00') }, // a whole day off
      ],
      now: NOW,
      rules,
    })
    expect(slots.map((s) => label(s.startsAt))).toEqual(['2026-03-21 06:00', '2026-03-21 08:00'])
  })

  it('stops at the booking horizon and at the package’s use-by date', () => {
    const daily = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 18 * 60, endMinute: 19 * 60 }))
    const all = generateSlots({ windows: daily, sessionMinutes: 60, busy: [], now: NOW, rules })
    expect(label(all.at(-1)!.startsAt)).toBe('2026-04-03 18:00') // today + 14 days
    expect(all).toHaveLength(15)

    const short = generateSlots({ windows: daily, sessionMinutes: 60, busy: [], now: NOW, rules, lastDay: '2026-03-22' })
    expect(short.map((s) => label(s.startsAt))).toEqual(['2026-03-20 18:00', '2026-03-21 18:00', '2026-03-22 18:00'])
  })

  it('a time range ending at midnight works', () => {
    const late = [{ weekday: 6, startMinute: 22 * 60, endMinute: 1440 }]
    const slots = generateSlots({ windows: late, sessionMinutes: 60, busy: [], now: NOW, rules: { ...rules, bookingHorizonDays: 1 } })
    expect(slots.map((s) => label(s.startsAt))).toEqual(['2026-03-21 22:00', '2026-03-21 23:00'])
  })
})

describe('inputs and settings', () => {
  it('weekly hours: ranges on the same day must not overlap', () => {
    const ok = availabilityInputSchema.safeParse({
      sessionMinutes: 60,
      windows: [
        { weekday: 1, startMinute: 360, endMinute: 600 },
        { weekday: 1, startMinute: 600, endMinute: 720 },
        { weekday: 2, startMinute: 360, endMinute: 600 },
      ],
    })
    expect(ok.success).toBe(true)
    const overlap = availabilityInputSchema.safeParse({
      sessionMinutes: 60,
      windows: [
        { weekday: 1, startMinute: 360, endMinute: 600 },
        { weekday: 1, startMinute: 540, endMinute: 720 },
      ],
    })
    expect(overlap.error?.issues[0]?.message).toBe('Time ranges on the same day must not overlap')
    expect(availabilityInputSchema.safeParse({ sessionMinutes: 10, windows: [] }).success).toBe(false)
  })

  it('time off must end after it starts', () => {
    const bad = timeOffInputSchema.safeParse({ startsAt: '2026-03-21T10:00:00Z', endsAt: '2026-03-21T09:00:00Z' })
    expect(bad.error?.issues[0]?.message).toBe('Time off must end after it starts')
  })

  it('PT rules fall back to the defaults', () => {
    expect(ptRulesFromSettings({})).toEqual(DEFAULT_PT_RULES)
    expect(ptRulesFromSettings({ ptRules: { freeCancelHours: 6 } })).toEqual({ ...DEFAULT_PT_RULES, freeCancelHours: 6 })
    expect(ptRulesFromSettings({ ptRules: { freeCancelHours: 'x' } })).toEqual(DEFAULT_PT_RULES)
  })
})
