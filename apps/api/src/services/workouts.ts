import { Prisma } from '@prisma/client'
import { z } from 'zod'
import {
  ErrorCode,
  exerciseIdsIn,
  trainingDays,
  type WorkoutExercise,
  type WorkoutExerciseInput,
  type WorkoutPlanInput,
  type WorkoutPlanSummary,
  type WorkoutPlanVersionView,
  type WorkoutPlanView,
  type WorkoutWeek,
  type workoutExerciseUpdateSchema,
} from '@onthec/shared'
import type { TenantDb, TenantTx } from '../db/tenant'
import { AppError } from '../errors'
import { isUniqueViolation } from '../lib/prisma-errors'
import { STARTER_EXERCISES } from './workout-starter'

export interface Actor {
  gymId: string
  userId: string
}

// Serializable: a save checks the version it started from, then writes the next one.
const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }

function notFound(what: string) {
  return new AppError(404, ErrorCode.NOT_FOUND, `${what} not found`)
}

// ---------------------------------------------------------------------------
// Exercise library
// ---------------------------------------------------------------------------

const exerciseSelect = {
  id: true,
  name: true,
  muscleGroup: true,
  kind: true,
  description: true,
  videoUrl: true,
  active: true,
} as const

function exerciseNameTaken() {
  return new AppError(409, ErrorCode.EXERCISE_NAME_TAKEN, 'An exercise with this name already exists.')
}

export async function listExercises(db: TenantDb, { all = false } = {}): Promise<WorkoutExercise[]> {
  return db.workoutExercise.findMany({
    where: all ? {} : { active: true },
    select: exerciseSelect,
    orderBy: [{ kind: 'asc' }, { muscleGroup: 'asc' }, { name: 'asc' }],
  })
}

export async function createExercise(
  db: TenantDb,
  gymId: string,
  input: WorkoutExerciseInput,
): Promise<WorkoutExercise> {
  try {
    return await db.workoutExercise.create({ data: { ...input, gymId }, select: exerciseSelect })
  } catch (error) {
    if (isUniqueViolation(error)) throw exerciseNameTaken()
    throw error
  }
}

/** Plans keep pointing at the exercise, so edits show up in them; deactivated ones just can't be added again. */
export async function updateExercise(
  db: TenantDb,
  id: string,
  input: z.infer<typeof workoutExerciseUpdateSchema>,
): Promise<WorkoutExercise> {
  try {
    return await db.workoutExercise.update({ where: { id }, data: input, select: exerciseSelect })
  } catch (error) {
    if (isUniqueViolation(error)) throw exerciseNameTaken()
    throw error
  }
}

/** Adds the common exercises the gym doesn't have yet (by name). */
export async function addStarterExercises(db: TenantDb, gymId: string): Promise<WorkoutExercise[]> {
  await db.workoutExercise.createMany({
    data: STARTER_EXERCISES.map((e) => ({ ...e, gymId })),
    skipDuplicates: true,
  })
  return listExercises(db)
}

// ---------------------------------------------------------------------------
// Plans (templates now; members' own copies use the same code)
// ---------------------------------------------------------------------------

const planInclude = { updatedBy: { select: { name: true } } } as const satisfies Prisma.WorkoutPlanInclude
type PlanRow = Prisma.WorkoutPlanGetPayload<{ include: typeof planInclude }>

function toSummary(row: PlanRow): WorkoutPlanSummary {
  return {
    id: row.id,
    name: row.name,
    trainingDays: trainingDays(row.week as WorkoutWeek),
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedBy.name,
  }
}

async function toView(db: TenantDb | TenantTx, row: PlanRow): Promise<WorkoutPlanView> {
  const week = row.week as WorkoutWeek
  const ids = exerciseIdsIn(week)
  const exercises = ids.length
    ? await db.workoutExercise.findMany({ where: { id: { in: ids } }, select: exerciseSelect })
    : []
  return { ...toSummary(row), memberId: row.memberId, notes: row.notes, week, exercises }
}

/**
 * Every exercise in the week must be in this gym's library, active (for anything newly added),
 * and of the same kind as the item (sets for strength, minutes for cardio).
 */
async function checkExercises(tx: TenantTx, week: WorkoutWeek, alreadyUsed: Set<string>) {
  const ids = exerciseIdsIn(week)
  if (ids.length === 0) return
  const found = await tx.workoutExercise.findMany({
    where: { id: { in: ids } },
    select: { id: true, kind: true, active: true },
  })
  const byId = new Map(found.map((e) => [e.id, e]))
  for (const item of week.days.flatMap((d) => d.items)) {
    const exercise = byId.get(item.exerciseId)
    if (!exercise || (!exercise.active && !alreadyUsed.has(exercise.id)) || exercise.kind !== item.kind) {
      throw new AppError(
        400,
        ErrorCode.UNKNOWN_EXERCISE,
        'One of the exercises isn’t in the gym’s library any more. Please pick it again.',
      )
    }
  }
}

export async function listTemplates(db: TenantDb): Promise<WorkoutPlanSummary[]> {
  const rows = await db.workoutPlan.findMany({
    where: { memberId: null },
    include: planInclude,
    orderBy: { name: 'asc' },
  })
  return rows.map(toSummary)
}

async function loadTemplate(db: TenantDb | TenantTx, id: string) {
  const row = await db.workoutPlan.findFirst({ where: { id, memberId: null }, include: planInclude })
  if (!row) throw notFound('Template')
  return row
}

export async function getTemplate(db: TenantDb, id: string): Promise<WorkoutPlanView> {
  return toView(db, await loadTemplate(db, id))
}

export async function createTemplate(db: TenantDb, actor: Actor, input: WorkoutPlanInput): Promise<WorkoutPlanView> {
  return db.$transaction(async (tx) => {
    await checkExercises(tx, input.week, new Set())
    const row = await tx.workoutPlan.create({
      data: {
        gymId: actor.gymId,
        name: input.name,
        notes: input.notes,
        week: input.week,
        createdById: actor.userId,
        updatedById: actor.userId,
      },
      include: planInclude,
    })
    return toView(tx, row)
  })
}

/**
 * Saves a new version of a plan. `version` is the one the editor started from: if someone else
 * saved in the meantime, nothing is overwritten. The previous version is kept.
 */
export async function savePlan(
  tx: TenantTx,
  actor: Actor,
  row: PlanRow,
  input: WorkoutPlanInput & { version: number },
): Promise<WorkoutPlanView> {
  if (input.version !== row.version) {
    throw new AppError(
      409,
      ErrorCode.PLAN_CHANGED,
      `${row.updatedBy.name} saved this plan just now. Reload to see their changes, then make yours again.`,
    )
  }
  await checkExercises(tx, input.week, new Set(exerciseIdsIn(row.week as WorkoutWeek)))
  await tx.workoutPlanVersion.create({
    data: {
      gymId: actor.gymId,
      planId: row.id,
      version: row.version,
      name: row.name,
      notes: row.notes,
      week: row.week as Prisma.InputJsonValue,
      savedById: row.updatedById,
      savedAt: row.updatedAt,
    },
  })
  const saved = await tx.workoutPlan.update({
    where: { id: row.id },
    data: {
      name: input.name,
      notes: input.notes ?? null,
      week: input.week,
      version: row.version + 1,
      updatedById: actor.userId,
    },
    include: planInclude,
  })
  return toView(tx, saved)
}

export async function saveTemplate(
  db: TenantDb,
  actor: Actor,
  id: string,
  input: WorkoutPlanInput & { version: number },
): Promise<WorkoutPlanView> {
  return db.$transaction(async (tx) => savePlan(tx, actor, await loadTemplate(tx, id), input), SERIALIZABLE)
}

/** Members' plans are copies, so deleting a template never changes them. */
export async function deleteTemplate(db: TenantDb, id: string) {
  await db.$transaction(async (tx) => {
    await loadTemplate(tx, id)
    await tx.workoutPlanVersion.deleteMany({ where: { planId: id } })
    await tx.workoutPlan.deleteMany({ where: { id, memberId: null } })
  })
}

export async function listVersions(db: TenantDb | TenantTx, planId: string): Promise<WorkoutPlanVersionView[]> {
  const rows = await db.workoutPlanVersion.findMany({
    where: { planId },
    include: { savedBy: { select: { name: true } } },
    orderBy: { version: 'desc' },
  })
  return rows.map((v) => ({
    version: v.version,
    name: v.name,
    notes: v.notes,
    week: v.week as WorkoutWeek,
    savedAt: v.savedAt.toISOString(),
    savedByName: v.savedBy.name,
  }))
}

export async function getTemplateVersions(db: TenantDb, id: string) {
  await loadTemplate(db, id)
  return listVersions(db, id)
}
