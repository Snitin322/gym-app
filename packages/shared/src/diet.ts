import { z } from 'zod'

// ---------------------------------------------------------------------------
// Food list
// ---------------------------------------------------------------------------

/** Values are per 100 g, per 100 ml, or per piece (an egg, a roti, a scoop). */
export const FOOD_UNITS = ['g', 'ml', 'piece'] as const
export type FoodUnit = (typeof FOOD_UNITS)[number]

export const FOOD_UNIT_LABELS: Record<FoodUnit, string> = {
  g: 'per 100 g',
  ml: 'per 100 ml',
  piece: 'per piece',
}

export interface Food {
  id: string
  name: string
  unit: FoodUnit
  /** For pieces: what one is called, e.g. "egg", "roti", "scoop". */
  pieceName: string | null
  proteinG: number
  carbsG: number
  fatG: number
  kcal: number
  active: boolean
}

/** Calories from macros when none are given: 4 per gram of protein or carbs, 9 per gram of fat. */
export function kcalFromMacros(proteinG: number, carbsG: number, fatG: number) {
  return Math.round(4 * proteinG + 4 * carbsG + 9 * fatG)
}

const grams = (label: string) =>
  z
    .number()
    .min(0, `${label} can’t be negative`)
    .max(200, `${label} looks too high`)
    .transform((v) => Math.round(v * 10) / 10)

const foodFields = {
  name: z.string().trim().min(2, 'Food name is too short').max(80),
  unit: z.enum(FOOD_UNITS),
  pieceName: z
    .string()
    .trim()
    .max(30)
    .nullish()
    .transform((v) => v || null),
  proteinG: grams('Protein'),
  carbsG: grams('Carbs'),
  fatG: grams('Fat'),
  /** Left out: worked out from the macros. */
  kcal: z.number().int().min(0).max(2000).optional(),
}

const per100Fits = (f: { unit: FoodUnit; proteinG: number; carbsG: number; fatG: number }) =>
  f.unit === 'piece' || f.proteinG + f.carbsG + f.fatG <= 100

export const foodInputSchema = z
  .object(foodFields)
  .refine(per100Fits, { message: 'Protein, carbs and fat add up to more than 100 g', path: ['fatG'] })
export type FoodInput = z.input<typeof foodInputSchema>

/** Editing sends the whole food, plus whether it's still offered. */
export const foodUpdateSchema = z
  .object({ ...foodFields, active: z.boolean() })
  .refine(per100Fits, { message: 'Protein, carbs and fat add up to more than 100 g', path: ['fatG'] })

// ---------------------------------------------------------------------------
// A diet plan: meals for a training day (and optionally a rest day), plus supplements
// ---------------------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined)

export const dietItemSchema = z.object({
  foodId: z.uuid(),
  /** Grams or ml (for g/ml foods), or pieces (in halves) for piece foods. */
  amount: z.number().positive('Enter an amount').max(2000, 'Amount looks too high'),
  note: optionalText(100),
})
export type DietItem = z.input<typeof dietItemSchema>

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time as HH:MM')
  .optional()
  .or(z.literal('').transform(() => undefined))

export const mealSchema = z.object({
  /** e.g. "Breakfast", "Pre-workout". */
  name: z.string().trim().min(1, 'Name the meal').max(40),
  time: timeOfDay,
  items: z.array(dietItemSchema).max(20),
  note: optionalText(200),
})
export type Meal = z.input<typeof mealSchema>

export const dietDaySchema = z.object({ meals: z.array(mealSchema).max(10) })
export type DietDay = z.input<typeof dietDaySchema>

export const supplementSchema = z.object({
  name: z.string().trim().min(1, 'Name the supplement').max(60),
  brand: optionalText(60),
  /** e.g. "1 scoop (30 g)", "2 capsules". */
  dose: z.string().trim().min(1, 'Enter the dose').max(60),
  /** e.g. "After workout", "With breakfast". */
  timing: optionalText(60),
  note: optionalText(200),
})
export type Supplement = z.input<typeof supplementSchema>

export const dietPlanDocSchema = z.object({
  training: dietDaySchema,
  /** A lighter rest-day version; null means rest days follow the training-day meals. */
  rest: dietDaySchema.nullable(),
  supplements: z.array(supplementSchema).max(15),
  waterLitres: z.number().min(0.5).max(8).optional(),
})
export type DietPlanDoc = z.input<typeof dietPlanDocSchema>

export function emptyDietPlan(): DietPlanDoc {
  return {
    training: {
      meals: ['Breakfast', 'Lunch', 'Snack', 'Dinner'].map((name) => ({ name, items: [] })),
    },
    rest: null,
    supplements: [],
  }
}

export function foodIdsIn(doc: DietPlanDoc): string[] {
  const days = [doc.training, ...(doc.rest ? [doc.rest] : [])]
  return [...new Set(days.flatMap((d) => d.meals.flatMap((m) => m.items.map((i) => i.foodId))))]
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export interface Macros {
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

const ZERO: Macros = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }

type FoodMacros = Pick<Food, 'unit' | 'proteinG' | 'carbsG' | 'fatG' | 'kcal'>

export function itemMacros(item: Pick<DietItem, 'amount'>, food: FoodMacros): Macros {
  const factor = food.unit === 'piece' ? item.amount : item.amount / 100
  return {
    kcal: food.kcal * factor,
    proteinG: food.proteinG * factor,
    carbsG: food.carbsG * factor,
    fatG: food.fatG * factor,
  }
}

function add(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    proteinG: a.proteinG + b.proteinG,
    carbsG: a.carbsG + b.carbsG,
    fatG: a.fatG + b.fatG,
  }
}

/** Calories to whole numbers, grams to one decimal place. */
export function roundMacros(m: Macros): Macros {
  const r = (v: number) => Math.round(v * 10) / 10
  return { kcal: Math.round(m.kcal), proteinG: r(m.proteinG), carbsG: r(m.carbsG), fatG: r(m.fatG) }
}

export function mealMacros(meal: Pick<Meal, 'items'>, foods: Map<string, FoodMacros>): Macros {
  return roundMacros(
    meal.items.reduce((sum, item) => {
      const food = foods.get(item.foodId)
      return food ? add(sum, itemMacros(item, food)) : sum
    }, ZERO),
  )
}

export function dayMacros(day: DietDay, foods: Map<string, FoodMacros>): Macros {
  return roundMacros(day.meals.reduce((sum, meal) => add(sum, mealMacros(meal, foods)), ZERO))
}

/** "150 g", "200 ml", "2 rotis", "1 egg", "1.5 scoops" */
export function formatAmount(amount: number, food: Pick<Food, 'unit' | 'pieceName'>) {
  if (food.unit !== 'piece') return `${amount} ${food.unit}`
  const name = food.pieceName ?? 'piece'
  return `${amount} ${amount === 1 ? name : `${name}s`}`
}

// ---------------------------------------------------------------------------
// Plans (templates and members' own copies)
// ---------------------------------------------------------------------------

export const dietPlanInputSchema = z.object({
  name: z.string().trim().min(2, 'Plan name is too short').max(80),
  notes: optionalText(1000),
  plan: dietPlanDocSchema,
})
export type DietPlanInput = z.input<typeof dietPlanInputSchema>

export const saveDietPlanSchema = dietPlanInputSchema.extend({ version: z.number().int().min(1) })

export const startDietPlanSchema = z.object({ templateId: z.uuid().optional() })

export interface DietPlanSummary {
  id: string
  name: string
  /** Training-day calories, worked out from the food list. */
  kcal: number
  version: number
  updatedAt: string
  updatedByName: string
}

export interface DietPlanView extends DietPlanSummary {
  memberId: string | null
  notes: string | null
  plan: DietPlanDoc
  /** Every food the plan uses (including deactivated ones), so it can be shown on its own. */
  foods: Food[]
}

/** A member's diet as staff see it (null until their coach or the desk gives them one). */
export interface MemberDietPlan {
  member: { id: string; name: string }
  plan: DietPlanView | null
}

/** GET /me/diet-plan */
export interface MyDietPlan {
  plan: DietPlanView | null
}
