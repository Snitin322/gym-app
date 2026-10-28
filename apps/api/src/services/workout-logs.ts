import { Prisma } from '@prisma/client'
import { z } from 'zod'
import {
  ErrorCode,
  addDays,
  canLogDate,
  exerciseIdsIn,
  isoWeekday,
  weekStart,
  workoutDayStatus,
  type IsoDate,
  type LoggedItem,
  type WorkoutCalendarDay,
  type WorkoutCalendarWeek,
  type WorkoutDay,
  type WorkoutLogView,
  type WorkoutWeek,
  type saveWorkoutDaySchema,
} from '@onthec/shared'
import type { TenantDb } from '../db/tenant'
import { AppError } from '../errors'
import { fromDbDate, toDbDate } from '../lib/dates'
import { exerciseSelect, loadMemberFor, type Viewer } from './workouts'

/** How far back "last time" looks. */
const HISTORY_LIMIT = 200

const logInclude = { savedBy: { select: { name: true } } } as const satisfies Prisma.WorkoutLogInclude
type LogRow = Prisma.WorkoutLogGetPayload<{ include: typeof logInclude }>

function toLogView(row: LogRow): WorkoutLogView {
  return {
    date: fromDbDate(row.date),
    dayTitle: row.dayTitle,
    items: row.items as LoggedItem[],
    note: row.note,
    savedByName: row.savedBy.name,
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * One week (Monday–Sunday) of a member's workouts: each day's plan (from their current plan), what
 * they logged, its status, and "last time" for every exercise. `self` = the member themself, who can
 * tick days; staff get the same view read-only.
 */
async function buildWeek(
  db: TenantDb,
  memberId: string,
  start: IsoDate,
  today: IsoDate,
  self: boolean,
): Promise<WorkoutCalendarWeek> {
  const monday = weekStart(start)
  const sunday = addDays(monday, 6)
  const [plan, logs] = await Promise.all([
    db.workoutPlan.findUnique({ where: { memberId }, select: { week: true } }),
    // This week's logs and the history before it (newest first) for "last time".
    db.workoutLog.findMany({
      where: { memberId, date: { lte: toDbDate(sunday) } },
      include: logInclude,
      orderBy: { date: 'desc' },
      take: HISTORY_LIMIT,
    }),
  ])
  const week = plan?.week as WorkoutWeek | undefined
  const byDate = new Map(logs.map((l) => [fromDbDate(l.date), l]))

  const days: WorkoutCalendarDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    const planned = (week?.days[i] ?? { rest: false, items: [] }) as WorkoutDay
    const row = byDate.get(date)
    const log = row ? toLogView(row) : null
    const ids = new Set([...planned.items, ...(log?.items ?? [])].map((it) => it.exerciseId))
    const lastTime: WorkoutCalendarDay['lastTime'] = {}
    for (const id of ids) {
      for (const earlier of logs) {
        if (fromDbDate(earlier.date) >= date) continue
        const item = (earlier.items as LoggedItem[]).find((it) => it.exerciseId === id && !it.skipped)
        if (item) {
          lastTime[id] = { date: fromDbDate(earlier.date), item }
          break
        }
      }
    }
    return {
      date,
      title: planned.rest ? null : (planned.title ?? null),
      rest: planned.rest,
      status: workoutDayStatus({ date, rest: planned.rest, logged: Boolean(log) }, today),
      canLog: self && Boolean(week) && !planned.rest && canLogDate(date, today),
      planned: planned.rest ? [] : planned.items,
      log,
      lastTime,
    }
  })

  const ids = new Set([
    ...(week ? exerciseIdsIn(week) : []),
    ...days
      .flatMap((d) => [...(d.log?.items ?? []), ...Object.values(d.lastTime).map((l) => l.item)])
      .map((it) => it.exerciseId),
  ])
  const exercises = ids.size
    ? await db.workoutExercise.findMany({ where: { id: { in: [...ids] } }, select: exerciseSelect })
    : []
  return { start: monday, today, hasPlan: Boolean(week), days, exercises }
}

async function memberIdOf(db: TenantDb, userId: string) {
  const member = await db.member.findUnique({ where: { userId }, select: { id: true } })
  if (!member) throw new AppError(403, ErrorCode.NOT_A_MEMBER, 'Only members have a workout calendar.')
  return member.id
}

export async function getMyWeek(db: TenantDb, userId: string, start: IsoDate | undefined, today: IsoDate) {
  return buildWeek(db, await memberIdOf(db, userId), start ?? today, today, true)
}

/** Read-only for the member's PT trainer and owners/admins. */
export async function getMemberWeek(
  db: TenantDb,
  viewer: Viewer,
  memberId: string,
  start: IsoDate | undefined,
  today: IsoDate,
) {
  await loadMemberFor(db, viewer, memberId, today)
  return buildWeek(db, memberId, start ?? today, today, false)
}

/** Ticks a day ("done as planned" or updated). Today and the past 7 days only; never a rest day. */
export async function saveMyDay(
  db: TenantDb,
  viewer: Viewer,
  date: IsoDate,
  input: z.infer<typeof saveWorkoutDaySchema>,
  today: IsoDate,
): Promise<WorkoutCalendarWeek> {
  const memberId = await memberIdOf(db, viewer.userId)
  if (!canLogDate(date, today)) {
    throw new AppError(409, ErrorCode.WORKOUT_DATE_LOCKED, 'You can tick today and the past 7 days only.')
  }
  const plan = await db.workoutPlan.findUnique({ where: { memberId }, select: { id: true, version: true, week: true } })
  if (!plan) throw new AppError(409, ErrorCode.NO_WORKOUT_PLAN, 'Ask the front desk or your trainer for a plan first.')
  const day = (plan.week as WorkoutWeek).days[isoWeekday(date) - 1] as WorkoutDay
  if (day.rest) throw new AppError(409, ErrorCode.WORKOUT_REST_DAY, 'That’s a rest day in your plan.')

  // Every exercise must be in this gym's library, with the right kind (sets or minutes).
  const ids = [...new Set(input.items.map((i) => i.exerciseId))]
  const found = await db.workoutExercise.findMany({ where: { id: { in: ids } }, select: { id: true, kind: true } })
  const kinds = new Map(found.map((e) => [e.id, e.kind]))
  if (input.items.some((i) => kinds.get(i.exerciseId) !== i.kind)) {
    throw new AppError(400, ErrorCode.UNKNOWN_EXERCISE, 'One of the exercises isn’t in the gym’s library.')
  }

  const data = {
    planId: plan.id,
    planVersion: plan.version,
    dayTitle: day.title ?? null,
    items: input.items as Prisma.InputJsonValue,
    note: input.note ?? null,
    savedById: viewer.userId,
  }
  await db.workoutLog.upsert({
    where: { memberId_date: { memberId, date: toDbDate(date) } },
    create: { ...data, gymId: viewer.gymId, memberId, date: toDbDate(date) },
    update: data,
  })
  return buildWeek(db, memberId, date, today, true)
}
