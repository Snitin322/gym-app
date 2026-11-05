import { useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import {
  FOOD_UNIT_LABELS,
  FOOD_UNITS,
  dayMacros,
  itemMacros,
  roundMacros,
  type DietPlanInput,
  type Food,
  type FoodUnit,
} from '@onthec/shared'
import { useSaveFood } from '../api/diet'
import {
  key,
  toDay,
  toInput,
  toMeals,
  type DietEditorState,
  type EditorItem,
  type EditorMeal,
  type EditorSupplement,
} from '../lib/diet-editor'
import { errorMessage } from '../lib/format'
import { Button } from './Button'
import { MacroSummary } from './DietPlanView'
import { Field, SelectInput, TextArea, TextInput } from './Form'
import { ErrorText } from './Screen'
import { Segmented } from './Segmented'
import { Sheet } from './Sheet'

// ---------------------------------------------------------------------------
// The editor
// ---------------------------------------------------------------------------

type Tab = 'training' | 'rest' | 'supplements'

/**
 * Edits a diet plan: meals for a training day (and optionally a lighter rest day), each with foods
 * from the gym's list and amounts, with live totals; then supplements, water and notes.
 */
export function DietPlanEditor({
  initial,
  foods,
  saveLabel,
  pending,
  error,
  onSave,
  onCancel,
}: {
  initial: DietEditorState
  /** The food list, including deactivated foods (they show if already in the plan, but can't be added). */
  foods: Food[]
  saveLabel: string
  pending: boolean
  error: string | null
  onSave: (input: DietPlanInput) => void
  onCancel: () => void
}) {
  const [state, setState] = useState(initial)
  const [tab, setTab] = useState<Tab>('training')
  const [picking, setPicking] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const byId = new Map(foods.map((f) => [f.id, f]))
  const day: 'training' | 'rest' = tab === 'rest' ? 'rest' : 'training'
  const meals = state[day]

  const setMeals = (update: (meals: EditorMeal[]) => EditorMeal[]) =>
    setState((s) => ({ ...s, [day]: update(s[day] ?? []) }))
  const setMeal = (mealKey: string, patch: Partial<EditorMeal>) =>
    setMeals((ms) => ms.map((m) => (m.key === mealKey ? { ...m, ...patch } : m)))
  const setItem = (mealKey: string, itemKey: string, patch: Partial<EditorItem>) =>
    setMeals((ms) =>
      ms.map((m) =>
        m.key === mealKey ? { ...m, items: m.items.map((i) => (i.key === itemKey ? { ...i, ...patch } : i)) } : m,
      ),
    )
  const addFood = (mealKey: string, food: Food) =>
    setMeals((ms) =>
      ms.map((m) =>
        m.key === mealKey
          ? {
              ...m,
              items: [
                ...m.items,
                { key: key(), foodId: food.id, amount: food.unit === 'piece' ? '1' : '100', note: '' },
              ],
            }
          : m,
      ),
    )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const checked = toInput(state)
    if ('error' in checked) return setProblem(checked.error)
    setProblem(null)
    onSave(checked.input)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label="Plan name">
        {(id) => (
          <TextInput
            id={id}
            value={state.name}
            maxLength={80}
            onChange={(e) => setState({ ...state, name: e.target.value })}
            placeholder="e.g. Fat loss 1,800 kcal (veg)"
          />
        )}
      </Field>

      <Segmented
        label="Edit"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'training', label: 'Training day' },
          { value: 'rest', label: 'Rest day' },
          { value: 'supplements', label: 'Supplements' },
        ]}
      />

      {tab === 'rest' && !state.rest && (
        <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line/70">
          <p className="text-muted">Rest days use the training-day meals.</p>
          <Button variant="secondary" onClick={() => setState((s) => ({ ...s, rest: toMeals(toDay(s.training)) }))}>
            Make a rest-day version
          </Button>
        </div>
      )}

      {tab !== 'supplements' && (tab === 'training' || state.rest) && (
        <>
          <MacroSummary
            macros={roundMacros(dayMacros(toDay(meals ?? []), byId))}
            label={tab === 'rest' ? 'Rest day total' : 'Training day total'}
          />
          {(meals ?? []).map((meal, index) => (
            <fieldset key={meal.key} className="flex min-w-0 flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line/70">
              <legend className="sr-only">{meal.name || `Meal ${index + 1}`}</legend>
              <div className="grid grid-cols-[1fr_7.5rem] gap-2">
                <TextInput
                  aria-label="Meal name"
                  value={meal.name}
                  maxLength={40}
                  onChange={(e) => setMeal(meal.key, { name: e.target.value })}
                  placeholder="Meal"
                />
                <TextInput
                  aria-label={`${meal.name || 'Meal'} time`}
                  type="time"
                  value={meal.time}
                  onChange={(e) => setMeal(meal.key, { time: e.target.value })}
                />
              </div>
              <ul className="flex flex-col gap-2">
                {meal.items.map((item) => {
                  const food = byId.get(item.foodId)
                  const m = food ? roundMacros(itemMacros({ amount: Number(item.amount) || 0 }, food)) : null
                  return (
                    <li key={item.key} className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{food?.name ?? 'Food'}</p>
                        {m && (
                          <p className="text-xs text-muted">
                            {m.kcal} kcal · {Math.round(m.proteinG)} g protein
                          </p>
                        )}
                      </div>
                      {/* The input is full width by default, so the wrapper sets its size. */}
                      <div className="w-20 shrink-0">
                        <TextInput
                          aria-label={`${food?.name ?? 'Food'} amount`}
                          inputMode="decimal"
                          value={item.amount}
                          onChange={(e) => setItem(meal.key, item.key, { amount: e.target.value })}
                          className="px-2 text-center"
                        />
                      </div>
                      <span className="w-10 shrink-0 text-sm text-muted">
                        {food?.unit === 'piece' ? 'pcs' : food?.unit}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${food?.name ?? 'food'}`}
                        onClick={() => setMeal(meal.key, { items: meal.items.filter((i) => i.key !== item.key) })}
                        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface-2"
                      >
                        <Trash2 aria-hidden="true" size={18} />
                      </button>
                    </li>
                  )
                })}
              </ul>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setPicking(meal.key)}>
                  <span className="inline-flex items-center gap-1">
                    <Plus aria-hidden="true" size={18} /> Add food
                  </span>
                </Button>
                <Button variant="ghost" onClick={() => setMeals((ms) => ms.filter((m) => m.key !== meal.key))}>
                  Remove meal
                </Button>
              </div>
            </fieldset>
          ))}
          <Button
            variant="secondary"
            onClick={() => setMeals((ms) => [...ms, { key: key(), name: '', time: '', note: '', items: [] }])}
          >
            Add meal
          </Button>
          {tab === 'rest' && (
            <Button variant="ghost" onClick={() => setState((s) => ({ ...s, rest: null }))}>
              Use training-day meals on rest days
            </Button>
          )}
        </>
      )}

      {tab === 'supplements' && (
        <>
          {state.supplements.map((s) => {
            const set = (patch: Partial<EditorSupplement>) =>
              setState((st) => ({
                ...st,
                supplements: st.supplements.map((x) => (x.key === s.key ? { ...x, ...patch } : x)),
              }))
            return (
              <fieldset key={s.key} className="flex min-w-0 flex-col gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line/70">
                <legend className="sr-only">{s.name || 'Supplement'}</legend>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Supplement">
                    {(id) => (
                      <TextInput
                        id={id}
                        value={s.name}
                        maxLength={60}
                        onChange={(e) => set({ name: e.target.value })}
                        placeholder="Whey protein"
                      />
                    )}
                  </Field>
                  <Field label="Brand">
                    {(id) => (
                      <TextInput
                        id={id}
                        value={s.brand}
                        maxLength={60}
                        onChange={(e) => set({ brand: e.target.value })}
                        placeholder="Optional"
                      />
                    )}
                  </Field>
                  <Field label="Dose">
                    {(id) => (
                      <TextInput
                        id={id}
                        value={s.dose}
                        maxLength={60}
                        onChange={(e) => set({ dose: e.target.value })}
                        placeholder="1 scoop (30 g)"
                      />
                    )}
                  </Field>
                  <Field label="When">
                    {(id) => (
                      <TextInput
                        id={id}
                        value={s.timing}
                        maxLength={60}
                        onChange={(e) => set({ timing: e.target.value })}
                        placeholder="After workout"
                      />
                    )}
                  </Field>
                </div>
                <Field label="Note">
                  {(id) => (
                    <TextInput
                      id={id}
                      value={s.note}
                      maxLength={200}
                      onChange={(e) => set({ note: e.target.value })}
                      placeholder="Optional"
                    />
                  )}
                </Field>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setState((st) => ({ ...st, supplements: st.supplements.filter((x) => x.key !== s.key) }))
                  }
                >
                  Remove supplement
                </Button>
              </fieldset>
            )
          })}
          <Button
            variant="secondary"
            onClick={() =>
              setState((st) => ({
                ...st,
                supplements: [...st.supplements, { key: key(), name: '', brand: '', dose: '', timing: '', note: '' }],
              }))
            }
          >
            Add supplement
          </Button>
          <Field label="Water (litres a day)">
            {(id) => (
              <TextInput
                id={id}
                inputMode="decimal"
                value={state.water}
                onChange={(e) => setState({ ...state, water: e.target.value })}
                placeholder="3"
              />
            )}
          </Field>
        </>
      )}

      <Field label="Notes for the member (optional)">
        {(id) => (
          <TextArea
            id={id}
            value={state.notes}
            maxLength={1000}
            onChange={(e) => setState({ ...state, notes: e.target.value })}
            placeholder="e.g. Cook in 1 tsp oil per meal. Swap rice for 2 rotis if you like."
          />
        )}
      </Field>

      <ErrorText>{problem ?? error}</ErrorText>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={pending}>
          {saveLabel}
        </Button>
      </div>

      {picking && (
        <FoodPicker
          foods={foods.filter((f) => f.active)}
          onPick={(food) => {
            addFood(picking, food)
            setPicking(null)
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Picking a food (or adding a missing one)
// ---------------------------------------------------------------------------

function FoodPicker({ foods, onPick, onClose }: { foods: Food[]; onPick: (food: Food) => void; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const q = search.trim().toLowerCase()
  const shown = foods.filter((f) => !q || f.name.toLowerCase().includes(q)).slice(0, 60)

  return (
    <Sheet open title={adding ? 'New food' : 'Add food'} onClose={onClose}>
      {adding ? (
        <NewFoodForm initialName={search.trim()} onSaved={onPick} onCancel={() => setAdding(false)} />
      ) : (
        <div className="flex flex-col gap-3">
          <TextInput
            type="search"
            aria-label="Search foods"
            placeholder="Search foods"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ul className="flex flex-col gap-1">
            {shown.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onPick(f)}
                  className="flex w-full items-baseline justify-between gap-3 rounded-xl px-3 py-3 text-left hover:bg-surface-2"
                >
                  <span className="min-w-0 font-semibold">{f.name}</span>
                  <span className="shrink-0 text-sm text-muted">
                    {f.kcal} kcal {f.unit === 'piece' ? `per ${f.pieceName ?? 'piece'}` : FOOD_UNIT_LABELS[f.unit]}
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-3 text-sm text-muted">No food matches.</li>}
          </ul>
          <Button variant="secondary" onClick={() => setAdding(true)}>
            {q ? `Add “${search.trim()}” to the food list` : 'Add a new food'}
          </Button>
        </div>
      )}
    </Sheet>
  )
}

/** Adds a food to the gym's list (name, unit, macros; calories from the macros unless given). */
export function NewFoodForm({
  initialName = '',
  food,
  onSaved,
  onCancel,
}: {
  initialName?: string
  food?: Food
  onSaved: (food: Food) => void
  onCancel: () => void
}) {
  const save = useSaveFood()
  const [name, setName] = useState(food?.name ?? initialName)
  const [unit, setUnit] = useState<FoodUnit>(food?.unit ?? 'g')
  const [pieceName, setPieceName] = useState(food?.pieceName ?? '')
  const [protein, setProtein] = useState(food ? String(food.proteinG) : '')
  const [carbs, setCarbs] = useState(food ? String(food.carbsG) : '')
  const [fat, setFat] = useState(food ? String(food.fatG) : '')
  const [kcal, setKcal] = useState(food ? String(food.kcal) : '')
  const [problem, setProblem] = useState<string | null>(null)
  const per = unit === 'piece' ? `per ${pieceName.trim() || 'piece'}` : FOOD_UNIT_LABELS[unit]

  const submit = (event: FormEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const nums = [protein, carbs, fat].map((v) => Number(v || 0))
    if (name.trim().length < 2) return setProblem('Enter the food name')
    if (nums.some((n) => !(n >= 0))) return setProblem('Protein, carbs and fat are numbers in grams')
    if (kcal.trim() && !(Number(kcal) >= 0)) return setProblem('Calories must be a number')
    setProblem(null)
    save.mutate(
      {
        id: food?.id,
        active: food?.active,
        name: name.trim(),
        unit,
        pieceName: unit === 'piece' ? pieceName.trim() : undefined,
        proteinG: nums[0] as number,
        carbsG: nums[1] as number,
        fatG: nums[2] as number,
        kcal: kcal.trim() ? Math.round(Number(kcal)) : undefined,
      },
      { onSuccess: onSaved },
    )
  }

  return (
    // A separate form: it can sit inside the plan editor's form (portal), so stop submits bubbling.
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label="Food">
        {(id) => (
          <TextInput
            id={id}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="Chicken breast (cooked)"
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Values">
          {(id) => (
            <SelectInput id={id} value={unit} onChange={(e) => setUnit(e.target.value as FoodUnit)}>
              {FOOD_UNITS.map((u) => (
                <option key={u} value={u}>
                  {FOOD_UNIT_LABELS[u]}
                </option>
              ))}
            </SelectInput>
          )}
        </Field>
        {unit === 'piece' && (
          <Field label="One piece is a">
            {(id) => (
              <TextInput
                id={id}
                value={pieceName}
                maxLength={30}
                onChange={(e) => setPieceName(e.target.value)}
                placeholder="egg, roti, scoop"
              />
            )}
          </Field>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Protein (g)">
          {(id) => (
            <TextInput id={id} inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} />
          )}
        </Field>
        <Field label="Carbs (g)">
          {(id) => <TextInput id={id} inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} />}
        </Field>
        <Field label="Fat (g)">
          {(id) => <TextInput id={id} inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} />}
        </Field>
      </div>
      <Field
        label="Calories (optional)"
        hint={`Values are ${per}. Left empty, calories are worked out from the macros.`}
      >
        {(id) => <TextInput id={id} inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} />}
      </Field>
      <ErrorText>{problem ?? errorMessage(save.error)}</ErrorText>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Back
        </Button>
        <Button type="submit" loading={save.isPending}>
          {food ? 'Save' : 'Add food'}
        </Button>
      </div>
    </form>
  )
}
