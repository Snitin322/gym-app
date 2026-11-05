import {
  CONSISTENCY_WEEKS,
  ErrorCode,
  STRENGTH_LIFTS,
  STRENGTH_WEEKS,
  addDays,
  trainingDays,
  weekStart,
  type IsoDate,
  type LiftPoint,
  type LoggedItem,
  type TrainingProgress,
  type WorkoutWeek,
} from '@onthec/shared'
import type { TenantDb } from '../db/tenant'
import { AppError } from '../errors'
import { fromDbDate, toDbDate } from '../lib/dates'
import { loadMemberFor, type Viewer } from './workouts'

/**
 * Strength and consistency from the days a member ticked off: for their most-trained weighted
 * lifts, the heaviest set each week; and how many days they trained in each of the last weeks.
 */
async function buildProgress(db: TenantDb, memberId: string, today: IsoDate): Promise<TrainingProgress> {
  const thisWeek = weekStart(today)
  const from = addDays(thisWeek, -7 * (STRENGTH_WEEKS - 1))
  const [logs, plan] = await Promise.all([
    db.workoutLog.findMany({
      where: { memberId, date: { gte: toDbDate(from), lte: toDbDate(today) } },
      select: { date: true, items: true },
      orderBy: { date: 'asc' },
    }),
    db.workoutPlan.findUnique({ where: { memberId }, select: { week: true } }),
  ])

  // Heaviest set per lift per week (more reps wins a tie).
  const best = new Map<string, Map<IsoDate, LiftPoint>>()
  for (const log of logs) {
    const week = weekStart(fromDbDate(log.date))
    for (const item of log.items as LoggedItem[]) {
      if (item.kind !== 'strength' || item.skipped) continue
      for (const set of item.sets) {
        if (!set.weightKg) continue
        const point: LiftPoint = { date: week, weightKg: set.weightKg, reps: set.reps ?? null }
        const weeks = best.get(item.exerciseId) ?? new Map<IsoDate, LiftPoint>()
        const current = weeks.get(week)
        if (
          !current ||
          point.weightKg > current.weightKg ||
          (point.weightKg === current.weightKg && (point.reps ?? 0) > (current.reps ?? 0))
        ) {
          weeks.set(week, point)
        }
        best.set(item.exerciseId, weeks)
      }
    }
  }

  // The lifts trained in the most weeks; ties go to the more recently trained one (then a fixed order).
  const recent = (points: LiftPoint[]) => points[points.length - 1]?.date ?? ''
  const top = [...best.entries()]
    .map(([exerciseId, weeks]) => ({
      exerciseId,
      points: [...weeks.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    }))
    .sort(
      (a, b) =>
        b.points.length - a.points.length ||
        recent(b.points).localeCompare(recent(a.points)) ||
        a.exerciseId.localeCompare(b.exerciseId),
    )
    .slice(0, STRENGTH_LIFTS)
  const names = top.length
    ? await db.workoutExercise.findMany({
        where: { id: { in: top.map((t) => t.exerciseId) } },
        select: { id: true, name: true },
      })
    : []
  const nameOf = new Map(names.map((n) => [n.id, n.name]))

  const counts = new Map<IsoDate, number>()
  for (const log of logs) {
    const week = weekStart(fromDbDate(log.date))
    counts.set(week, (counts.get(week) ?? 0) + 1)
  }
  const weeks = Array.from({ length: CONSISTENCY_WEEKS }, (_, i) => {
    const weekOf = addDays(thisWeek, -7 * (CONSISTENCY_WEEKS - 1 - i))
    return { weekOf, done: counts.get(weekOf) ?? 0 }
  })

  return {
    lifts: top.map((t) => ({
      exerciseId: t.exerciseId,
      name: nameOf.get(t.exerciseId) ?? 'Exercise',
      points: t.points,
    })),
    weeks,
    plannedPerWeek: plan ? trainingDays(plan.week as WorkoutWeek) : null,
  }
}

export async function getMyTrainingProgress(db: TenantDb, userId: string, today: IsoDate) {
  const member = await db.member.findUnique({ where: { userId }, select: { id: true } })
  if (!member) throw new AppError(404, ErrorCode.NOT_A_MEMBER, 'Only members have training progress.')
  return buildProgress(db, member.id, today)
}

/** The same people who see the member's workout tracking: the desk, their coach and an active PT trainer. */
export async function getMemberTrainingProgress(db: TenantDb, viewer: Viewer, memberId: string, today: IsoDate) {
  await loadMemberFor(db, viewer, memberId, today)
  return buildProgress(db, memberId, today)
}
