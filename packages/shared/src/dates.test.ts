import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, inclusiveDays, isValidIsoDate, membershipEndDate, todayInIndia } from './dates'

describe('membershipEndDate', () => {
  it.each([
    ['2026-01-01', 1, '2026-01-31'],
    ['2026-01-15', 1, '2026-02-14'],
    ['2026-01-01', 3, '2026-03-31'],
    ['2026-01-01', 12, '2026-12-31'],
    ['2026-11-15', 3, '2027-02-14'], // crosses the year
    // The same date doesn't exist next month: run to the end of that month.
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'], // leap year
    ['2026-01-30', 1, '2026-02-28'],
    ['2026-03-31', 1, '2026-04-30'],
    ['2026-12-31', 2, '2027-02-28'],
    ['2026-01-28', 1, '2026-02-27'],
  ])('%s + %i month(s) ends %s', (start, months, end) => {
    expect(membershipEndDate(start, months)).toBe(end)
  })
})

describe('todayInIndia', () => {
  it('uses the India date, not the UTC date', () => {
    expect(todayInIndia(new Date('2026-01-01T18:29:00Z'))).toBe('2026-01-01') // 23:59 IST
    expect(todayInIndia(new Date('2026-01-01T18:30:00Z'))).toBe('2026-01-02') // 00:00 IST
  })
})

describe('day arithmetic', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('counts days between and inclusive ranges', () => {
    expect(daysBetween('2026-02-10', '2026-02-19')).toBe(9)
    expect(inclusiveDays('2026-02-10', '2026-02-19')).toBe(10)
    expect(daysBetween('2026-03-01', '2026-02-28')).toBe(-1)
  })

  it('validates dates', () => {
    expect(isValidIsoDate('2026-02-28')).toBe(true)
    expect(isValidIsoDate('2026-02-29')).toBe(false)
    expect(isValidIsoDate('2026-2-1')).toBe(false)
    expect(isValidIsoDate('yesterday')).toBe(false)
  })
})
