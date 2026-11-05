import { useState } from 'react'
import { Droplets, Pill } from 'lucide-react'
import {
  dayMacros,
  formatAmount,
  mealMacros,
  type DietDay,
  type DietPlanView as Plan,
  type Food,
  type Macros,
} from '@onthec/shared'
import { formatMealTime, type DietDayKind } from '../lib/diet'
import { Card } from './Form'
import { Segmented } from './Segmented'

const grams = (g: number) => `${Math.round(g)} g`

/** Calories large, then protein, carbs and fat. */
export function MacroSummary({ macros, label }: { macros: Macros; label: string }) {
  return (
    <section aria-label={label} className="rounded-2xl bg-accent p-4 text-accent-ink">
      <p className="text-sm opacity-80">{label}</p>
      <p className="text-3xl font-extrabold tracking-tight">
        {macros.kcal.toLocaleString('en-IN')} <span className="text-base font-semibold">kcal</span>
      </p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
        {(
          [
            ['Protein', macros.proteinG],
            ['Carbs', macros.carbsG],
            ['Fat', macros.fatG],
          ] as const
        ).map(([name, value]) => (
          <div key={name} className="rounded-xl bg-accent-ink/10 px-2 py-1.5">
            <dt className="opacity-80">{name}</dt>
            <dd className="font-bold">{grams(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** One day's meals, each with its foods, amounts and totals. */
export function DietDayMeals({ day, foods }: { day: DietDay; foods: Map<string, Food> }) {
  if (day.meals.length === 0) return <p className="text-sm text-muted">No meals planned.</p>
  return (
    <ul className="flex flex-col gap-3">
      {day.meals.map((meal, i) => {
        const totals = mealMacros(meal, foods)
        return (
          <li key={i}>
            <Card>
              <section aria-label={meal.name}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-bold">{meal.name}</h3>
                  {meal.time && <p className="shrink-0 text-sm text-muted">{formatMealTime(meal.time)}</p>}
                </div>
                {meal.items.length > 0 && (
                  <p className="text-sm text-muted">
                    {totals.kcal} kcal · {grams(totals.proteinG)} protein
                  </p>
                )}
                <ul className="mt-2 flex flex-col gap-1.5">
                  {meal.items.map((item, j) => {
                    const food = foods.get(item.foodId)
                    return (
                      <li key={j} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0">
                          {food?.name ?? 'Food'}
                          {item.note && <span className="block text-sm text-muted">{item.note}</span>}
                        </span>
                        <span className="shrink-0 font-semibold">
                          {food ? formatAmount(item.amount, food) : item.amount}
                        </span>
                      </li>
                    )
                  })}
                  {meal.items.length === 0 && <li className="text-sm text-muted">No foods yet.</li>}
                </ul>
                {meal.note && <p className="mt-2 text-sm text-muted">{meal.note}</p>}
              </section>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}

export function SupplementsList({ plan }: { plan: Plan }) {
  const { supplements } = plan.plan
  if (supplements.length === 0) return <p className="text-sm text-muted">No supplements.</p>
  return (
    <ul className="flex flex-col gap-2">
      {supplements.map((s, i) => (
        <li key={i} className="flex gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line/70">
          <Pill aria-hidden="true" size={20} className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="font-semibold">
              {s.name}
              {s.brand && <span className="font-normal text-muted"> · {s.brand}</span>}
            </p>
            <p className="text-sm">{[s.dose, s.timing].filter(Boolean).join(' · ')}</p>
            {s.note && <p className="text-sm text-muted">{s.note}</p>}
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * A whole diet plan: totals for the day, the meals, then supplements and water. When the plan has a
 * rest-day version, a switch shows either day (starting on `day`).
 */
export function DietPlanView({ plan, day = 'training' }: { plan: Plan; day?: DietDayKind }) {
  const hasRest = plan.plan.rest !== null
  const [shown, setShown] = useState<DietDayKind>(hasRest ? day : 'training')
  const foods = new Map(plan.foods.map((f) => [f.id, f]))
  const meals = (shown === 'rest' && plan.plan.rest) || plan.plan.training

  return (
    <div className="flex flex-col gap-3">
      {hasRest && (
        <Segmented
          label="Diet day"
          value={shown}
          onChange={setShown}
          options={[
            { value: 'training', label: 'Training day' },
            { value: 'rest', label: 'Rest day' },
          ]}
        />
      )}
      <MacroSummary macros={dayMacros(meals, foods)} label={shown === 'rest' ? 'Rest day total' : 'Daily total'} />
      <DietDayMeals day={meals} foods={foods} />
      <h3 className="mt-2 font-semibold">Supplements</h3>
      <SupplementsList plan={plan} />
      {plan.plan.waterLitres && (
        <p className="flex items-center gap-2 text-sm">
          <Droplets aria-hidden="true" size={18} className="text-accent" /> Water: {plan.plan.waterLitres} litres a day
        </p>
      )}
      {plan.notes && <p className="whitespace-pre-line text-sm text-muted">{plan.notes}</p>}
    </div>
  )
}
