import { describe, expect, it } from 'vitest'
import { daysLeft, freezeDaysUsed, membershipStatus, suggestedMaxFreezeDays, type MembershipDates } from './memberships'
import { formatPaise, rupeesToPaise } from './money'

const base: MembershipDates = { startDate: '2026-01-01', endDate: '2026-03-31', cancelled: false, freezes: [] }

describe('membershipStatus', () => {
  it('is upcoming before the start date and active from it', () => {
    expect(membershipStatus(base, '2025-12-31')).toBe('upcoming')
    expect(membershipStatus(base, '2026-01-01')).toBe('active')
  })

  it('is still active on the last day and expired the day after', () => {
    expect(membershipStatus(base, '2026-03-31')).toBe('active')
    expect(membershipStatus(base, '2026-04-01')).toBe('expired')
  })

  it('is frozen on the first and last freeze day only', () => {
    const frozen = { ...base, freezes: [{ fromDate: '2026-02-10', toDate: '2026-02-19' }] }
    expect(membershipStatus(frozen, '2026-02-09')).toBe('active')
    expect(membershipStatus(frozen, '2026-02-10')).toBe('frozen')
    expect(membershipStatus(frozen, '2026-02-19')).toBe('frozen')
    expect(membershipStatus(frozen, '2026-02-20')).toBe('active')
  })

  it('is cancelled whatever the dates', () => {
    expect(membershipStatus({ ...base, cancelled: true }, '2026-02-01')).toBe('cancelled')
  })
})

describe('daysLeft', () => {
  it('counts today, so the last day shows 1', () => {
    expect(daysLeft(base, '2026-03-31')).toBe(1)
    expect(daysLeft(base, '2026-03-20')).toBe(12)
  })

  it('is 0 once expired and the full length before it starts', () => {
    expect(daysLeft(base, '2026-04-05')).toBe(0)
    expect(daysLeft(base, '2025-12-01')).toBe(90)
  })
})

describe('freezes', () => {
  it('adds up frozen days inclusively', () => {
    expect(
      freezeDaysUsed([
        { fromDate: '2026-02-10', toDate: '2026-02-19' },
        { fromDate: '2026-03-01', toDate: '2026-03-01' },
      ]),
    ).toBe(11)
  })

  it('suggests the gym’s default limits by plan length', () => {
    expect([1, 2, 3, 5, 6, 11, 12, 24].map(suggestedMaxFreezeDays)).toEqual([0, 0, 15, 15, 30, 30, 45, 45])
  })
})

describe('money', () => {
  it.each([
    ['4500', 450000],
    ['4,500', 450000],
    ['₹ 1,00,000', 10000000],
    ['4500.5', 450050],
    ['4500.05', 450005],
    ['0.99', 99],
  ])('%s rupees → %i paise', (input, paise) => {
    expect(rupeesToPaise(input)).toBe(paise)
  })

  it.each(['', 'abc', '-100', '4500.123', '1e5'])('rejects %j', (input) => {
    expect(rupeesToPaise(input)).toBeNull()
  })

  it('formats with Indian digit grouping', () => {
    expect(formatPaise(450000)).toBe('₹4,500')
    expect(formatPaise(10000000)).toBe('₹1,00,000')
    expect(formatPaise(450050)).toBe('₹4,500.50')
  })
})
