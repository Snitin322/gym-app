import { Prisma } from '@prisma/client'
import { z } from 'zod'
import {
  ErrorCode,
  dayMacros,
  emptyDietPlan,
  foodIdsIn,
  kcalFromMacros,
  type DietPlanDoc,
  type DietPlanSummary,
  type DietPlanView,
  type Food,
  type IsoDate,
  type MemberDietPlan,
  type dietPlanInputSchema,
  type foodInputSchema,
  type foodUpdateSchema,
} from '@onthec/shared'
import type { TenantDb, TenantTx } from '../db/tenant'
import { AppError } from '../errors'
import { isUniqueViolation } from '../lib/prisma-errors'
import { STARTER_FOODS } from './diet-starter'
import { loadMemberFor, notFound, type Actor, type Viewer } from './workouts'

// Serializable: a save checks the version it started from, then writes the next one.
const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }

// ---------------------------------------------------------------------------
// Food list
// ---------------------------------------------------------------------------

const foodSelect = {
  id: true,
  name: true,
  unit: true,
  pieceName: true,
  proteinG: true,
  carbsG: true,
  fatG: true,
  kcal: true,
  active: true,
} as const satisfies Prisma.FoodSelect

function foodNameTaken() {
  return new AppError(409, ErrorCode.FOOD_NAME_TAKEN, 'A food with this name already exists.')
}

/** Calories as given, or worked out from the macros. Piece names only for piece foods. */
function foodData(input: z.output<typeof foodInputSchema>) {
  return {
    ...input,
    pieceName: input.unit === 'piece' ? input.pieceName : null,
    kcal: input.kcal ?? kcalFromMacros(input.proteinG, input.carbsG, input.fatG),
  }
}

export async function listFoods(db: TenantDb, { all = false } = {}): Promise<Food[]> {
  return db.food.findMany({ where: all ? {} : { active: true }, select: foodSelect, orderBy: { name: 'asc' } })
}

export async function createFood(db: TenantDb, gymId: string, input: z.output<typeof foodInputSchema>): Promise<Food> {
  try {
    return await db.food.create({ data: { ...foodData(input), gymId }, select: foodSelect })
  } catch (error) {
    if (isUniqueViolation(error)) throw foodNameTaken()
    throw error
  }
}

/** Plans point at the food, so corrected values show up in them; deactivated foods just can't be added again. */
export async function updateFood(db: TenantDb, id: string, input: z.output<typeof foodUpdateSchema>): Promise<Food> {
  try {
    return await db.food.update({ where: { id }, data: foodData(input), select: foodSelect })
  } catch (error) {
    if (isUniqueViolation(error)) throw foodNameTaken()
    throw error
  }
}

/** Adds the common foods the gym doesn't have yet (by name). */
export async function addStarterFoods(db: TenantDb, gymId: string): Promise<Food[]> {
  await db.food.createMany({ data: STARTER_FOODS.map((f) => ({ ...f, gymId })), skipDuplicates: true })
  return listFoods(db)
}

// ---------------------------------------------------------------------------
// Plans (templates and members' own copies)
// ---------------------------------------------------------------------------

const planInclude = { updatedBy: { select: { name: true } } } as const satisfies Prisma.DietPlanInclude
type PlanRow = Prisma.DietPlanGetPayload<{ include: typeof planInclude }>

async function foodsFor(db: TenantDb | TenantTx, doc: DietPlanDoc): Promise<Food[]> {
  const ids = foodIdsIn(doc)
  return ids.length ? db.food.findMany({ where: { id: { in: ids } }, select: foodSelect }) : []
}

function summaryOf(row: PlanRow, foods: Food[]): DietPlanSummary {
  return {
    id: row.id,
    name: row.name,
    kcal: dayMacros((row.plan as DietPlanDoc).training, new Map(foods.map((f) => [f.id, f]))).kcal,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedBy.name,
  }
}

async function toView(db: TenantDb | TenantTx, row: PlanRow): Promise<DietPlanView> {
  const plan = row.plan as DietPlanDoc
  const foods = await foodsFor(db, plan)
  return { ...summaryOf(row, foods), memberId: row.memberId, notes: row.notes, plan, foods }
}

/** Every food must be in this gym's list, and active unless the plan already used it. */
async function checkFoods(tx: TenantTx, doc: DietPlanDoc, alreadyUsed: Set<string>) {
  const ids = foodIdsIn(doc)
  if (ids.length === 0) return
  const found = await tx.food.findMany({ where: { id: { in: ids } }, select: { id: true, active: true } })
  const ok = new Set(found.filter((f) => f.active || alreadyUsed.has(f.id)).map((f) => f.id))
  if (ids.some((id) => !ok.has(id))) {
    throw new AppError(
      400,
      ErrorCode.UNKNOWN_FOOD,
      'One of the foods isn’t in the gym’s food list any more. Please pick it again.',
    )
  }
}

type PlanInput = z.output<typeof dietPlanInputSchema>

export async function listDietTemplates(db: TenantDb): Promise<DietPlanSummary[]> {
  const rows = await db.dietPlan.findMany({ where: { memberId: null }, include: planInclude, orderBy: { name: 'asc' } })
  const foods = await db.food.findMany({ select: foodSelect })
  return rows.map((row) => summaryOf(row, foods))
}

async function loadTemplate(db: TenantDb | TenantTx, id: string) {
  const row = await db.dietPlan.findFirst({ where: { id, memberId: null }, include: planInclude })
  if (!row) throw notFound('Template')
  return row
}

export async function getDietTemplate(db: TenantDb, id: string): Promise<DietPlanView> {
  return toView(db, await loadTemplate(db, id))
}

export async function createDietTemplate(db: TenantDb, actor: Actor, input: PlanInput): Promise<DietPlanView> {
  return db.$transaction(async (tx) => {
    await checkFoods(tx, input.plan, new Set())
    const row = await tx.dietPlan.create({
      data: {
        gymId: actor.gymId,
        name: input.name,
        notes: input.notes,
        plan: input.plan,
        createdById: actor.userId,
        updatedById: actor.userId,
      },
      include: planInclude,
    })
    return toView(tx, row)
  })
}

/**
 * Saves a new version. `version` is the one the editor started from: if someone else saved in the
 * meantime, nothing is overwritten. The previous version is kept.
 */
async function savePlan(
  tx: TenantTx,
  actor: Actor,
  row: PlanRow,
  input: { name: string; notes?: string; plan: DietPlanDoc; version: number },
) {
  if (input.version !== row.version) {
    throw new AppError(
      409,
      ErrorCode.PLAN_CHANGED,
      `${row.updatedBy.name} saved this plan just now. Reload to see their changes, then make yours again.`,
    )
  }
  await checkFoods(tx, input.plan, new Set(foodIdsIn(row.plan as DietPlanDoc)))
  await tx.dietPlanVersion.create({
    data: {
      gymId: actor.gymId,
      planId: row.id,
      version: row.version,
      name: row.name,
      notes: row.notes,
      plan: row.plan as Prisma.InputJsonValue,
      savedById: row.updatedById,
      savedAt: row.updatedAt,
    },
  })
  return tx.dietPlan.update({
    where: { id: row.id },
    data: {
      name: input.name,
      notes: input.notes ?? null,
      plan: input.plan as Prisma.InputJsonValue,
      version: row.version + 1,
      updatedById: actor.userId,
    },
    include: planInclude,
  })
}

export async function saveDietTemplate(
  db: TenantDb,
  actor: Actor,
  id: string,
  input: PlanInput & { version: number },
): Promise<DietPlanView> {
  return db.$transaction(
    async (tx) => toView(tx, await savePlan(tx, actor, await loadTemplate(tx, id), input)),
    SERIALIZABLE,
  )
}

/** Members' plans are copies, so deleting a template never changes them. */
export async function deleteDietTemplate(db: TenantDb, id: string) {
  await db.$transaction(async (tx) => {
    await loadTemplate(tx, id)
    await tx.dietPlanVersion.deleteMany({ where: { planId: id } })
    await tx.dietPlan.deleteMany({ where: { id, memberId: null } })
  })
}

// Members' own plans: the same people who manage their workout plan (desk, coach, active PT trainer).

async function memberPlanRow(db: TenantDb | TenantTx, memberId: string) {
  return db.dietPlan.findUnique({ where: { memberId }, include: planInclude })
}

export async function getMemberDietPlan(
  db: TenantDb,
  viewer: Viewer,
  memberId: string,
  today: IsoDate,
): Promise<MemberDietPlan> {
  const member = await loadMemberFor(db, viewer, memberId, today)
  const row = await memberPlanRow(db, memberId)
  return { member: { id: member.id, name: member.user.name }, plan: row ? await toView(db, row) : null }
}

/** Gives the member their own copy of a template (or a blank plan); an existing plan becomes history. */
export async function startMemberDietPlan(
  db: TenantDb,
  viewer: Viewer,
  memberId: string,
  templateId: string | undefined,
  today: IsoDate,
): Promise<MemberDietPlan> {
  await db.$transaction(async (tx) => {
    await loadMemberFor(tx, viewer, memberId, today)
    const template = templateId ? await loadTemplate(tx, templateId) : null
    const source = template
      ? { name: template.name, notes: template.notes ?? undefined, plan: template.plan as DietPlanDoc }
      : { name: 'Diet plan', notes: undefined, plan: emptyDietPlan() }
    const existing = await memberPlanRow(tx, memberId)
    if (existing) {
      await savePlan(tx, viewer, existing, { ...source, version: existing.version })
    } else {
      await tx.dietPlan.create({
        data: {
          gymId: viewer.gymId,
          memberId,
          name: source.name,
          notes: source.notes,
          plan: source.plan as Prisma.InputJsonValue,
          createdById: viewer.userId,
          updatedById: viewer.userId,
        },
      })
    }
  }, SERIALIZABLE)
  return getMemberDietPlan(db, viewer, memberId, today)
}

export async function saveMemberDietPlan(
  db: TenantDb,
  viewer: Viewer,
  memberId: string,
  input: PlanInput & { version: number },
  today: IsoDate,
): Promise<MemberDietPlan> {
  await db.$transaction(async (tx) => {
    await loadMemberFor(tx, viewer, memberId, today)
    const row = await memberPlanRow(tx, memberId)
    if (!row) throw notFound('Diet plan')
    await savePlan(tx, viewer, row, input)
  }, SERIALIZABLE)
  return getMemberDietPlan(db, viewer, memberId, today)
}

/** The signed-in member's own plan (read-only), or null. */
export async function getMyDietPlan(db: TenantDb, userId: string): Promise<DietPlanView | null> {
  const member = await db.member.findUnique({ where: { userId }, select: { id: true } })
  const row = member ? await memberPlanRow(db, member.id) : null
  return row ? toView(db, row) : null
}
