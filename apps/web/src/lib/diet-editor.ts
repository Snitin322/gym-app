import type { DietDay, DietPlanDoc, DietPlanInput } from '@onthec/shared'

/** Diet plan editor state: strings for inputs, keys for React lists. */

let nextKey = 0
export const key = () => `k${++nextKey}`

export interface EditorItem {
  key: string
  foodId: string
  amount: string
  note: string
}
export interface EditorMeal {
  key: string
  name: string
  time: string
  note: string
  items: EditorItem[]
}
export interface EditorSupplement {
  key: string
  name: string
  brand: string
  dose: string
  timing: string
  note: string
}
export interface DietEditorState {
  name: string
  notes: string
  training: EditorMeal[]
  rest: EditorMeal[] | null
  supplements: EditorSupplement[]
  water: string
}

export const toMeals = (day: DietDay): EditorMeal[] =>
  day.meals.map((m) => ({
    key: key(),
    name: m.name,
    time: m.time ?? '',
    note: m.note ?? '',
    items: m.items.map((i) => ({ key: key(), foodId: i.foodId, amount: String(i.amount), note: i.note ?? '' })),
  }))

export function toDietEditor(plan: { name: string; notes?: string | null; plan: DietPlanDoc }): DietEditorState {
  return {
    name: plan.name,
    notes: plan.notes ?? '',
    training: toMeals(plan.plan.training),
    rest: plan.plan.rest ? toMeals(plan.plan.rest) : null,
    supplements: plan.plan.supplements.map((s) => ({
      key: key(),
      name: s.name,
      brand: s.brand ?? '',
      dose: s.dose,
      timing: s.timing ?? '',
      note: s.note ?? '',
    })),
    water: plan.plan.waterLitres ? String(plan.plan.waterLitres) : '',
  }
}

/** Editor meals as a plan day; amounts that aren't numbers yet count as 0 (for live totals). */
export function toDay(meals: EditorMeal[]): DietDay {
  return {
    meals: meals.map((m) => ({
      name: m.name.trim(),
      time: m.time || undefined,
      note: m.note.trim() || undefined,
      items: m.items.map((i) => ({
        foodId: i.foodId,
        amount: Number(i.amount) || 0,
        note: i.note.trim() || undefined,
      })),
    })),
  }
}

export function toInput(s: DietEditorState): { input: DietPlanInput } | { error: string } {
  if (s.name.trim().length < 2) return { error: 'Give the plan a name' }
  for (const meals of [s.training, ...(s.rest ? [s.rest] : [])]) {
    for (const m of meals) {
      if (!m.name.trim()) return { error: 'Every meal needs a name' }
      if (m.items.some((i) => !(Number(i.amount) > 0))) return { error: `Check the amounts in ${m.name}` }
    }
  }
  if (s.supplements.some((x) => !x.name.trim() || !x.dose.trim()))
    return { error: 'Each supplement needs a name and a dose' }
  const water = s.water.trim() ? Number(s.water) : undefined
  if (water !== undefined && !(water >= 0.5 && water <= 8)) return { error: 'Water: between 0.5 and 8 litres' }
  return {
    input: {
      name: s.name.trim(),
      notes: s.notes.trim() || undefined,
      plan: {
        training: toDay(s.training),
        rest: s.rest ? toDay(s.rest) : null,
        supplements: s.supplements.map((x) => ({
          name: x.name.trim(),
          brand: x.brand.trim() || undefined,
          dose: x.dose.trim(),
          timing: x.timing.trim() || undefined,
          note: x.note.trim() || undefined,
        })),
        waterLitres: water,
      },
    },
  }
}
