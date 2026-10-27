import { describe, expect, it } from 'vitest'
import type { MembershipView } from '@onthec/shared'
import { formatDate } from './format'
import { membershipRange, membershipSummary, planOptionLabel } from './membership'

function view(overrides: Partial<MembershipView>): MembershipView {
  return {
    id: 'm1',
    planName: '3 months',
    durationMonths: 3,
    pricePaise: 450000,
    startDate: '2026-03-20',
    endDate: '2026-06-19',
    status: 'active',
    daysLeft: 92,
    maxFreezeDays: 15,
    freezeDaysUsed: 0,
    freezes: [],
    cancelledAt: null,
    cancelReason: null,
    ...overrides,
  }
}

describe('membershipSummary', () => {
  it('describes each status in plain words', () => {
    const today = '2026-03-20'
    expect(membershipSummary(view({}), today)).toBe('92 days left')
    expect(membershipSummary(view({ daysLeft: 1 }), today)).toBe('Last day today')
    expect(membershipSummary(view({ status: 'upcoming', startDate: '2026-04-01' }), today)).toBe('Starts 1 Apr')
    expect(membershipSummary(view({ status: 'expired', endDate: '2026-03-19' }), today)).toBe('Expired yesterday')
    expect(membershipSummary(view({ status: 'expired', endDate: '2026-03-17' }), today)).toBe('Expired 3 days ago')
    expect(membershipSummary(view({ status: 'cancelled' }), today)).toBe('Cancelled')
    expect(
      membershipSummary(
        view({ status: 'frozen', freezes: [{ id: 'f', fromDate: '2026-03-18', toDate: '2026-03-25', reason: null }] }),
        today,
      ),
    ).toBe('Frozen until 25 Mar')
  })
})

describe('planOptionLabel', () => {
  it('does not repeat the length when the name already says it', () => {
    expect(planOptionLabel({ name: '3 months', durationMonths: 3, pricePaise: 450000 })).toBe('3 months · ₹4,500')
    expect(planOptionLabel({ name: 'Gold', durationMonths: 12, pricePaise: 1500000 })).toBe('Gold · 12 months · ₹15,000')
  })
})

describe('dates', () => {
  it('formats plain dates without shifting the day', () => {
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026')
    expect(membershipRange(view({}))).toBe('20 Mar 2026 – 19 Jun 2026')
  })
})
