// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { emptyDietPlan, type DietPlanDoc, type DietPlanView, type Food, type TrainerClient } from '@onthec/shared'
import App from '../App'
import { AppProviders } from '../AppProviders'
import { setAccessToken } from '../api/client'
import { mockApi, ok, session, sessionUser } from '../test/mockApi'

const rice: Food = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Rice, white (cooked)',
  unit: 'g',
  pieceName: null,
  proteinG: 2.7,
  carbsG: 28,
  fatG: 0.3,
  kcal: 126,
  active: true,
}
const egg: Food = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Egg (whole)',
  unit: 'piece',
  pieceName: 'egg',
  proteinG: 6.3,
  carbsG: 0.6,
  fatG: 5,
  kcal: 78,
  active: true,
}

function dietPlan(plan: DietPlanDoc, overrides: Partial<DietPlanView> = {}): DietPlanView {
  return {
    id: 'diet-1',
    memberId: 'mem-1',
    name: 'Fat loss',
    notes: null,
    kcal: 0,
    version: 1,
    updatedAt: '2026-11-05T06:00:00.000Z',
    updatedByName: 'Ravi Kumar',
    plan,
    foods: [rice, egg],
    ...overrides,
  }
}

function renderAt(path: string, routes: Parameters<typeof mockApi>[0]) {
  const api = mockApi(routes)
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders>
        <App />
      </AppProviders>
    </MemoryRouter>,
  )
  return api
}

beforeEach(() => {
  setAccessToken(null)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('diet: coach', () => {
  const client: TrainerClient = {
    memberId: 'mem-1',
    name: 'Asha Patel',
    phone: '+919876500001',
    coached: true,
    purchases: [],
  }

  it('the coach starts a diet, adds foods with amounts and sees live totals', async () => {
    const blank = dietPlan(emptyDietPlan())
    const { callsTo } = renderAt('/trainer/clients/mem-1?view=diet', {
      'POST /auth/refresh': ok(session(sessionUser({ id: 'trainer-1', role: 'trainer', name: 'Ravi Kumar' }))),
      'GET /trainer/clients': ok([client]),
      'GET /members/mem-1/diet-plan': (_, n) =>
        ok({ member: { id: 'mem-1', name: 'Asha Patel' }, plan: n === 1 ? null : blank }),
      'GET /diet-templates': ok([]),
      'POST /members/mem-1/diet-plan': ok({ member: { id: 'mem-1', name: 'Asha Patel' }, plan: blank }),
      'GET /foods?all=1': ok([rice, egg]),
      'PUT /members/mem-1/diet-plan': (body) =>
        ok({ member: { id: 'mem-1', name: 'Asha Patel' }, plan: dietPlan((body as { plan: DietPlanDoc }).plan) }),
    })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Start diet' }))
    // Straight into the editor with the usual four meals.
    const meals = await screen.findAllByLabelText('Meal name')
    expect(meals.map((m) => (m as HTMLInputElement).value)).toEqual(['Breakfast', 'Lunch', 'Snack', 'Dinner'])

    // Breakfast: 3 eggs.
    await user.click(screen.getAllByRole('button', { name: 'Add food' })[0]!)
    const picker = screen.getByRole('dialog', { name: 'Add food' })
    await user.type(within(picker).getByLabelText('Search foods'), 'egg')
    await user.click(within(picker).getByRole('button', { name: /Egg \(whole\)/ }))
    const eggAmount = screen.getByLabelText('Egg (whole) amount')
    await user.clear(eggAmount)
    await user.type(eggAmount, '3')

    // Lunch: rice, 100 g by default.
    await user.click(screen.getAllByRole('button', { name: 'Add food' })[1]!)
    await user.click(within(screen.getByRole('dialog', { name: 'Add food' })).getByRole('button', { name: /Rice/ }))
    expect((screen.getByLabelText('Rice, white (cooked) amount') as HTMLInputElement).value).toBe('100')

    // 3 × 78 + 126 = 360 kcal
    const total = screen.getByRole('region', { name: 'Training day total' })
    expect(total.textContent).toContain('360')

    await user.click(screen.getByRole('tab', { name: 'Supplements' }))
    await user.click(screen.getByRole('button', { name: 'Add supplement' }))
    await user.type(screen.getByLabelText('Supplement'), 'Whey protein')
    await user.type(screen.getByLabelText('Dose'), '1 scoop')
    await user.type(screen.getByLabelText('When'), 'After workout')
    await user.click(screen.getByRole('button', { name: 'Save diet' }))

    await vi.waitFor(() => expect(callsTo('PUT /members/mem-1/diet-plan')).toHaveLength(1))
    const body = callsTo('PUT /members/mem-1/diet-plan')[0]?.body as { plan: DietPlanDoc; version: number }
    expect(body.version).toBe(1)
    expect(body.plan.training.meals[0]?.items).toEqual([{ foodId: egg.id, amount: 3 }])
    expect(body.plan.training.meals[1]?.items).toEqual([{ foodId: rice.id, amount: 100 }])
    expect(body.plan.supplements).toEqual([{ name: 'Whey protein', dose: '1 scoop', timing: 'After workout' }])
    expect((await screen.findByRole('status')).textContent).toBe('Diet saved')
  })
})

describe('diet: member', () => {
  const plan: DietPlanDoc = {
    training: {
      meals: [
        { name: 'Breakfast', time: '08:00', items: [{ foodId: egg.id, amount: 3 }] },
        { name: 'Lunch', items: [{ foodId: rice.id, amount: 150, note: 'With dal' }] },
      ],
    },
    rest: { meals: [{ name: 'Breakfast', items: [{ foodId: egg.id, amount: 2 }] }] },
    supplements: [{ name: 'Whey protein', brand: 'MuscleBlaze', dose: '1 scoop (30 g)', timing: 'After workout' }],
    waterLitres: 3.5,
  }

  it('Home shows today’s calories; Meals shows the day, supplements and water', async () => {
    renderAt('/home', {
      'POST /auth/refresh': ok(session(sessionUser({ id: 'user-9', role: 'member', name: 'Asha Patel' }))),
      'GET /me/diet-plan': ok({ plan: dietPlan(plan) }),
      'GET /me/workout-plan': ok({ plan: null }),
      'GET /me/membership': ok({ current: null, history: [], duePaise: 0, payments: [] }),
      'GET /me/profile': ok({
        member: { id: 'mem-1', name: 'Asha' },
        coach: null,
        profile: null,
        healthConsentAt: null,
      }),
      'GET /me/pt': ok([]),
    })
    const user = userEvent.setup()
    const card = await screen.findByRole('link', { name: 'Today’s meals' })
    // 3 eggs (234) + 150 g rice (189)
    expect(card.textContent).toContain('423 kcal')
    expect(card.textContent).toContain('2 meals · 1 supplement')
    await user.click(card)

    expect(await screen.findByRole('heading', { name: 'Meals' })).toBeTruthy()
    const breakfast = screen.getByRole('region', { name: 'Breakfast' })
    expect(within(breakfast).getByText('3 eggs')).toBeTruthy()
    expect(within(breakfast).getByText('8:00 am')).toBeTruthy()
    expect(screen.getByText('150 g')).toBeTruthy()
    expect(screen.getByText('With dal')).toBeTruthy()
    expect(screen.getByText('1 scoop (30 g) · After workout')).toBeTruthy()
    expect(screen.getByText(/Water: 3.5 litres a day/)).toBeTruthy()

    await user.click(screen.getByRole('tab', { name: 'Rest day' }))
    expect(screen.getByRole('region', { name: 'Rest day total' }).textContent).toContain('156')
    expect(screen.getByText('2 eggs')).toBeTruthy()
  })
})

describe('diet: desk food list', () => {
  it('adds the common foods, then a food of their own with calories worked out', async () => {
    const owner = ok(session(sessionUser({ id: 'owner-1', role: 'owner', name: 'Nitin Sharma' })))
    const { callsTo } = renderAt('/admin/diet/foods', {
      'POST /auth/refresh': owner,
      'GET /foods?all=1': (_, n) => ok(n === 1 ? [] : [egg, rice]),
      'POST /foods/starter': ok([egg, rice]),
      'POST /foods': (body) => ({ status: 201, body: { ...rice, ...(body as object), id: 'food-new', kcal: 165 } }),
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Add common foods' }))
    expect(await screen.findByRole('button', { name: 'Edit Egg (whole)' })).toBeTruthy()
    expect(screen.getByText(/78 kcal per egg/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Add food' }))
    const sheet = screen.getByRole('dialog', { name: 'New food' })
    await user.type(within(sheet).getByLabelText('Food'), 'Chicken breast')
    await user.type(within(sheet).getByLabelText('Protein (g)'), '31')
    await user.type(within(sheet).getByLabelText('Fat (g)'), '3.6')
    await user.click(within(sheet).getByRole('button', { name: 'Add food' }))

    await vi.waitFor(() => expect(callsTo('POST /foods')).toHaveLength(1))
    expect(callsTo('POST /foods')[0]?.body).toEqual({
      name: 'Chicken breast',
      unit: 'g',
      proteinG: 31,
      carbsG: 0,
      fatG: 3.6,
    })
    expect((await screen.findByRole('status')).textContent).toBe('Food added')
  })
})
