import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { DietPlanDoc, DietPlanView, Food, MemberDetail, MemberDietPlan, MyDietPlan } from '@onthec/shared'
import { bearer, createGym, createUser, startApp, testDatabaseUrl, tokenFor, useTestDatabase } from './helpers'

describe.skipIf(!testDatabaseUrl)('Diet: food list and diet plans', () => {
  const ctx = useTestDatabase()
  let app: FastifyInstance
  const t = {} as Record<'owner' | 'admin' | 'ravi' | 'sita' | 'asha' | 'bina' | 'ownerB', string>
  let raviId: string
  let asha: MemberDetail
  let bina: MemberDetail
  let memberB: MemberDetail
  let rice: Food
  let egg: Food

  const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, token: string, payload?: object) =>
    app.inject({ method, url: `/api/v1${url}`, headers: bearer(token), payload })

  const doc = (riceGrams: number, food = rice): DietPlanDoc => ({
    training: {
      meals: [
        { name: 'Breakfast', time: '08:00', items: [{ foodId: egg.id, amount: 3 }] },
        { name: 'Lunch', items: [{ foodId: food.id, amount: riceGrams, note: 'With dal' }] },
      ],
    },
    rest: { meals: [{ name: 'Breakfast', items: [{ foodId: egg.id, amount: 2 }] }] },
    supplements: [{ name: 'Whey protein', brand: 'MuscleBlaze', dose: '1 scoop (30 g)', timing: 'After workout' }],
    waterLitres: 3.5,
  })

  beforeEach(async () => {
    const gymA = (await createGym(ctx.db, 'Alpha Gym')).id
    const gymB = (await createGym(ctx.db, 'Beta Gym')).id
    t.owner = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111101', role: 'owner', name: 'Owner A' }))
    t.admin = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111102', role: 'admin', name: 'Desk A' }))
    const ravi = await createUser(ctx.db, gymA, { phone: '+919811111103', role: 'trainer', name: 'Ravi' })
    raviId = ravi.id
    t.ravi = await tokenFor(ravi)
    t.sita = await tokenFor(await createUser(ctx.db, gymA, { phone: '+919811111104', role: 'trainer', name: 'Sita' }))
    t.ownerB = await tokenFor(
      await createUser(ctx.db, gymB, { phone: '+919822222201', role: 'owner', name: 'Owner B' }),
    )
    ;({ app } = await startApp(ctx.db))

    asha = (await call('POST', '/members', t.admin, { name: 'Asha', phone: '9876500001' })).json()
    bina = (await call('POST', '/members', t.admin, { name: 'Bina', phone: '9876500002' })).json()
    memberB = (await call('POST', '/members', t.ownerB, { name: 'Bela', phone: '9876500009' })).json()
    t.asha = await tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: asha.userId } }))
    t.bina = await tokenFor(await ctx.db.user.findUniqueOrThrow({ where: { id: bina.userId } }))
    await call('PUT', `/members/${asha.id}/coach`, t.admin, { coachId: raviId })

    rice = (
      await call('POST', '/foods', t.ravi, { name: 'Rice (cooked)', unit: 'g', proteinG: 2.7, carbsG: 28, fatG: 0.3 })
    ).json()
    egg = (
      await call('POST', '/foods', t.ravi, {
        name: 'Egg',
        unit: 'piece',
        pieceName: 'egg',
        proteinG: 6.3,
        carbsG: 0.6,
        fatG: 5,
        kcal: 78,
      })
    ).json()
  })
  afterEach(async () => {
    await app.close()
  })

  it('staff keep the food list; calories come from macros unless given', async () => {
    expect(rice.kcal).toBe(126) // 4×2.7 + 4×28 + 9×0.3
    expect(egg.kcal).toBe(78)
    expect(rice.pieceName).toBeNull()

    const dup = await call('POST', '/foods', t.owner, { name: 'Egg', unit: 'piece', proteinG: 6, carbsG: 0, fatG: 5 })
    expect(dup.json().error.code).toBe('FOOD_NAME_TAKEN')
    const tooMuch = await call('POST', '/foods', t.owner, {
      name: 'Odd',
      unit: 'g',
      proteinG: 60,
      carbsG: 30,
      fatG: 20,
    })
    expect(tooMuch.statusCode).toBe(400)
    expect(
      (await call('POST', '/foods', t.asha, { name: 'X', unit: 'g', proteinG: 1, carbsG: 1, fatG: 1 })).statusCode,
    ).toBe(403)

    // Starter foods: added once, skipping names the gym already has.
    const withStarter = (await call('POST', '/foods/starter', t.admin)).json() as Food[]
    expect(withStarter.length).toBeGreaterThan(30)
    expect(withStarter.find((f) => f.name === 'Roti / chapati')).toMatchObject({ unit: 'piece', pieceName: 'roti' })
    expect(((await call('POST', '/foods/starter', t.admin)).json() as Food[]).length).toBe(withStarter.length)

    // Deactivated foods drop out of the list but stay readable with ?all=1.
    await call('PUT', `/foods/${rice.id}`, t.owner, { ...rice, active: false })
    expect(((await call('GET', '/foods', t.ravi)).json() as Food[]).some((f) => f.id === rice.id)).toBe(false)
    expect(((await call('GET', '/foods?all=1', t.ravi)).json() as Food[]).some((f) => f.id === rice.id)).toBe(true)
  })

  it('the coach gives a member a diet plan from a template; saves keep versions', async () => {
    const template = (
      await call('POST', '/diet-templates', t.owner, { name: 'Fat loss 1,800', plan: doc(150) })
    ).json() as DietPlanView
    // Breakfast 3 eggs (234) + 150 g rice (189)
    expect(template.kcal).toBe(423)
    expect((await call('POST', '/diet-templates', t.ravi, { name: 'Nope', plan: doc(100) })).statusCode).toBe(403)
    expect((await call('GET', '/diet-templates', t.ravi)).json()).toHaveLength(1)

    const started = (
      await call('POST', `/members/${asha.id}/diet-plan`, t.ravi, { templateId: template.id })
    ).json() as MemberDietPlan
    expect(started.plan).toMatchObject({ name: 'Fat loss 1,800', version: 1, kcal: 423 })
    expect(started.plan?.foods.map((f) => f.name).sort()).toEqual(['Egg', 'Rice (cooked)'])
    expect(started.plan?.plan.supplements[0]).toMatchObject({ brand: 'MuscleBlaze', timing: 'After workout' })

    const saved = await call('PUT', `/members/${asha.id}/diet-plan`, t.ravi, {
      name: 'Asha – fat loss',
      plan: doc(100),
      version: 1,
    })
    expect(saved.statusCode).toBe(200)
    expect((saved.json() as MemberDietPlan).plan).toMatchObject({ version: 2, kcal: 360 })
    expect(await ctx.db.dietPlanVersion.count({ where: { dietPlan: { memberId: asha.id } } })).toBe(1)

    // A stale save doesn't overwrite.
    const stale = await call('PUT', `/members/${asha.id}/diet-plan`, t.owner, {
      name: 'Old',
      plan: doc(50),
      version: 1,
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error.code).toBe('PLAN_CHANGED')

    // The template is unchanged.
    expect(((await call('GET', `/diet-templates/${template.id}`, t.owner)).json() as DietPlanView).kcal).toBe(423)

    // The member reads their own plan.
    const mine = (await call('GET', '/me/diet-plan', t.asha)).json() as MyDietPlan
    expect(mine.plan?.name).toBe('Asha – fat loss')
    expect(((await call('GET', '/me/diet-plan', t.bina)).json() as MyDietPlan).plan).toBeNull()
  })

  it('only the desk, the coach and a PT trainer manage a member’s diet', async () => {
    expect((await call('POST', `/members/${asha.id}/diet-plan`, t.admin, {})).statusCode).toBe(200)
    expect((await call('GET', `/members/${asha.id}/diet-plan`, t.ravi)).statusCode).toBe(200)
    expect((await call('GET', `/members/${asha.id}/diet-plan`, t.sita)).statusCode).toBe(404)
    expect((await call('GET', `/members/${bina.id}/diet-plan`, t.ravi)).statusCode).toBe(404)
    expect((await call('GET', `/members/${asha.id}/diet-plan`, t.asha)).statusCode).toBe(403)
    // A blank plan has the usual meals and no foods yet.
    const blank = (await call('GET', `/members/${asha.id}/diet-plan`, t.ravi)).json() as MemberDietPlan
    expect(blank.plan?.plan.training.meals.map((m) => m.name)).toEqual(['Breakfast', 'Lunch', 'Snack', 'Dinner'])
  })

  it('rejects unknown or deactivated foods and bad amounts', async () => {
    await call('POST', `/members/${asha.id}/diet-plan`, t.ravi, {})
    const save = (plan: DietPlanDoc) =>
      call('PUT', `/members/${asha.id}/diet-plan`, t.ravi, { name: 'Plan', plan, version: 1 })

    const fake = { ...rice, id: '00000000-0000-4000-8000-000000000000' }
    expect((await save(doc(100, fake))).json().error.code).toBe('UNKNOWN_FOOD')
    await call('PUT', `/foods/${rice.id}`, t.owner, { ...rice, active: false })
    expect((await save(doc(100))).json().error.code).toBe('UNKNOWN_FOOD')
    expect((await save(doc(-5))).statusCode).toBe(400)
    const badTime = doc(100)
    badTime.training.meals[0]!.time = '25:00'
    expect((await save(badTime)).statusCode).toBe(400)
  })

  it('gym A cannot use or change gym B’s foods, templates or plans', async () => {
    const foodB = (
      await call('POST', '/foods', t.ownerB, { name: 'Rice (cooked)', unit: 'g', proteinG: 2.7, carbsG: 28, fatG: 0.3 })
    ).json() as Food
    const templateB = (
      await call('POST', '/diet-templates', t.ownerB, {
        name: 'B plan',
        plan: {
          ...doc(100, foodB),
          training: { meals: [{ name: 'Lunch', items: [{ foodId: foodB.id, amount: 100 }] }] },
          rest: null,
        },
      })
    ).json() as DietPlanView
    await call('POST', `/members/${memberB.id}/diet-plan`, t.ownerB, { templateId: templateB.id })

    expect((await call('PUT', `/foods/${foodB.id}`, t.owner, { ...foodB, name: 'Hacked' })).statusCode).toBe(404)
    expect((await call('GET', `/diet-templates/${templateB.id}`, t.owner)).statusCode).toBe(404)
    expect(
      (await call('POST', `/members/${asha.id}/diet-plan`, t.owner, { templateId: templateB.id })).statusCode,
    ).toBe(404)
    expect((await call('GET', `/members/${memberB.id}/diet-plan`, t.owner)).statusCode).toBe(404)
    expect(((await call('GET', '/foods', t.owner)).json() as Food[]).some((f) => f.id === foodB.id)).toBe(false)

    // Gym B's food can't be put into gym A's plans.
    await call('POST', `/members/${asha.id}/diet-plan`, t.owner, {})
    const save = await call('PUT', `/members/${asha.id}/diet-plan`, t.owner, {
      name: 'Plan',
      plan: doc(100, foodB),
      version: 1,
    })
    expect(save.json().error.code).toBe('UNKNOWN_FOOD')
  })
})
