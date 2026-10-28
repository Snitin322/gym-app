import {
  addDays,
  indiaDateTime,
  weekStart,
  type DashboardMember,
  type DashboardRevenue,
  type DashboardView,
  type IsoDate,
  type Role,
} from '@onthec/shared'
import type { TenantDb } from '../db/tenant'
import { fromDbDate, toDbDate } from '../lib/dates'
import { leadsForDashboard } from './leads'
import { listMembers } from './members'

/** How far back "recently expired" looks. */
const WIN_BACK_DAYS = 30

const monthStart = (date: IsoDate) => `${date.slice(0, 7)}-01`
const previousMonthStart = (date: IsoDate) => monthStart(addDays(monthStart(date), -1))

/** Start of an India calendar day, as an instant. */
const at = (date: IsoDate) => indiaDateTime(date, 0)

async function revenue(db: TenantDb, today: IsoDate): Promise<DashboardRevenue> {
  const thisMonth = monthStart(today)
  const paid = (from: IsoDate, to: IsoDate) =>
    db.payment.aggregate({
      where: { status: 'paid', paidAt: { gte: at(from), lt: at(to) } },
      _sum: { amountPaise: true },
    })
  const nextMonth = monthStart(addDays(thisMonth, 31))
  const [day, month, lastMonth, byMethod] = await Promise.all([
    paid(today, addDays(today, 1)),
    paid(thisMonth, nextMonth),
    paid(previousMonthStart(today), thisMonth),
    db.payment.groupBy({
      by: ['method'],
      where: { status: 'paid', paidAt: { gte: at(thisMonth), lt: at(nextMonth) } },
      _sum: { amountPaise: true },
    }),
  ])
  return {
    todayPaise: day._sum.amountPaise ?? 0,
    monthPaise: month._sum.amountPaise ?? 0,
    lastMonthPaise: lastMonth._sum.amountPaise ?? 0,
    monthByMethod: Object.fromEntries(byMethod.map((m) => [m.method, m._sum.amountPaise ?? 0])),
  }
}

/**
 * The owner/admin home: who to call (expiring, recently expired, dues, PT running out), money taken
 * (owner only), PT this week and workout engagement. Status rules are the same as everywhere else.
 */
export async function getDashboard(db: TenantDb, role: Role, today: IsoDate, now: Date): Promise<DashboardView> {
  const week = weekStart(today)
  const nextWeek = addDays(week, 7)

  const [members, joinedThisMonth, sessions, openDisputes, unmarked, purchases, withPlan, tracked, money, leads] =
    await Promise.all([
      listMembers(db, { filter: 'all' }, today),
      db.member.count({ where: { joinedOn: { gte: toDbDate(monthStart(today)), lte: toDbDate(today) } } }),
      db.ptSession.groupBy({
        by: ['status'],
        where: { startsAt: { gte: at(week), lt: at(nextWeek) } },
        _count: { _all: true },
      }),
      db.ptSession.count({ where: { disputedAt: { not: null }, resolution: null } }),
      db.ptSession.count({ where: { status: 'booked', endsAt: { lte: now } } }),
      db.ptPurchase.findMany({
        where: { expiresOn: { gte: toDbDate(today), lte: toDbDate(addDays(today, 7)) } },
        include: {
          ledger: { select: { change: true } },
          trainer: { select: { name: true } },
          member: { include: { user: { select: { name: true, phone: true } } } },
        },
        orderBy: { expiresOn: 'asc' },
      }),
      db.workoutPlan.count({ where: { memberId: { not: null } } }),
      db.workoutLog.findMany({
        where: { date: { gte: toDbDate(week), lte: toDbDate(today) } },
        distinct: ['memberId'],
        select: { memberId: true },
      }),
      role === 'owner' ? revenue(db, today) : Promise.resolve(null),
      leadsForDashboard(db, today),
    ])

  const contact = (m: (typeof members)[number]): DashboardMember | null =>
    m.current
      ? { memberId: m.id, name: m.name, phone: m.phone, planName: m.current.planName, endDate: m.current.endDate }
      : null
  const list = (status: string, keep: (m: DashboardMember) => boolean, order: 1 | -1) =>
    members
      .filter((m) => m.status === status)
      .map(contact)
      .filter((m): m is DashboardMember => m !== null && keep(m))
      .sort((a, b) => order * a.endDate.localeCompare(b.endDate))
  const count = (status: string) => sessions.find((s) => s.status === status)?._count._all ?? 0
  const dues = members.filter((m) => m.duePaise > 0).sort((a, b) => b.duePaise - a.duePaise)

  return {
    today,
    members: {
      // Same as the Members screen's "Active" filter: running, frozen, ending soon or starting soon.
      active: members.filter((m) => ['active', 'frozen', 'expiring', 'upcoming'].includes(m.status)).length,
      joinedThisMonth,
      frozen: members.filter((m) => m.status === 'frozen').length,
      noPlan: members.filter((m) => m.status === 'none').length,
      expiringSoon: list('expiring', () => true, 1),
      recentlyExpired: list('expired', (m) => m.endDate >= addDays(today, -WIN_BACK_DAYS), -1),
    },
    revenue: money,
    dues: {
      totalPaise: dues.reduce((sum, m) => sum + m.duePaise, 0),
      members: dues.map((m) => ({ memberId: m.id, name: m.name, phone: m.phone, duePaise: m.duePaise })),
    },
    pt: {
      bookedThisWeek: count('booked'),
      completedThisWeek: count('completed'),
      noShowsThisWeek: count('no_show'),
      openDisputes,
      unmarked,
      runningOut: purchases
        .map((p) => ({ p, left: p.ledger.reduce((sum, l) => sum + l.change, 0) }))
        .filter(({ left }) => left > 0)
        .map(({ p, left }) => ({
          memberId: p.memberId,
          name: p.member.user.name,
          phone: p.member.user.phone,
          packageName: p.packageName,
          trainerName: p.trainer.name,
          sessionsLeft: left,
          expiresOn: fromDbDate(p.expiresOn),
        })),
    },
    workouts: { withPlan, trackedThisWeek: tracked.length },
    leads,
  }
}
