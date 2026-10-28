import type { Db } from './unscoped'

/**
 * Models with a gym_id column. Every query on these through a tenant client is filtered to
 * the session's gym. Add each new tenant-owned model here; a test compares this list with the schema.
 */
export const TENANT_MODELS = [
  'User',
  'RefreshToken',
  'Consent',
  'MembershipPlan',
  'Member',
  'Membership',
  'MembershipFreeze',
  'Payment',
  'Invoice',
  'InvoiceSequence',
  'PtPackage',
  'PtPurchase',
  'PtSessionLedger',
  'TrainerProfile',
  'TrainerAvailability',
  'TrainerTimeOff',
  'PtSession',
  'WorkoutExercise',
  'WorkoutPlan',
  'WorkoutPlanVersion',
  'WorkoutLog',
] as const

const tenantModels = new Set<string>(TENANT_MODELS)

/** Operations whose `where` must contain a unique selector. */
const UNIQUE_WHERE_OPS = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete', 'upsert'])
const FILTER_WHERE_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
])

type Args = Record<string, unknown>

export class TenantViolationError extends Error {
  constructor(model: string) {
    super(`Tenant violation: ${model} data refers to another gym`)
    this.name = 'TenantViolationError'
  }
}

function assertSameGym(data: unknown, gymId: string, model: string) {
  const value = (data as Args | undefined)?.gymId
  if (value !== undefined && value !== gymId) throw new TenantViolationError(model)
}

function withGym(data: unknown, gymId: string, model: string): Args {
  assertSameGym(data, gymId, model)
  return { ...(data as Args), gymId }
}

/**
 * Adds a filter to a where clause without replacing anything in it. Spreading `{ ...where, id }`
 * would overwrite a caller's own `id`/`gymId` and silently return the session gym's row instead.
 * Prisma accepts extra AND filters next to the unique field in findUnique/update/delete/upsert.
 */
function addFilter(where: unknown, filter: Args): Args {
  const current = (where ?? {}) as Args
  const existingAnd = current.AND === undefined ? [] : Array.isArray(current.AND) ? current.AND : [current.AND]
  return { ...current, AND: [...existingAnd, filter] }
}

/**
 * Returns a Prisma client that can only see and write one gym's data.
 * - Tenant models: reads, updates and deletes are filtered by gym_id; creates get gym_id set
 *   (and fail if the data names a different gym).
 * - Gym: only the session's own gym is visible; gyms cannot be created or deleted.
 * Nested writes and raw SQL bypass these checks, so don't use them for tenant data.
 */
export function forTenant(db: Db, gymId: string) {
  return db.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const scoped: Args = { ...((args ?? {}) as Args) }

          if (model === 'Gym') {
            if (operation.startsWith('create') || operation.startsWith('delete') || operation === 'upsert') {
              throw new TenantViolationError(model)
            }
            if (UNIQUE_WHERE_OPS.has(operation) || FILTER_WHERE_OPS.has(operation)) {
              scoped.where = addFilter(scoped.where, { id: gymId })
            }
            return query(scoped as typeof args)
          }

          if (!tenantModels.has(model)) return query(args)

          if (UNIQUE_WHERE_OPS.has(operation) || FILTER_WHERE_OPS.has(operation)) {
            scoped.where = addFilter(scoped.where, { gymId })
          }

          if (operation === 'create') scoped.data = withGym(scoped.data, gymId, model)
          if (operation === 'createMany' || operation === 'createManyAndReturn') {
            const rows = Array.isArray(scoped.data) ? scoped.data : [scoped.data]
            scoped.data = rows.map((row) => withGym(row, gymId, model))
          }
          if (operation === 'update' || operation === 'updateMany' || operation === 'updateManyAndReturn') {
            assertSameGym(scoped.data, gymId, model)
          }
          if (operation === 'upsert') {
            scoped.create = withGym(scoped.create, gymId, model)
            assertSameGym(scoped.update, gymId, model)
          }

          return query(scoped as typeof args)
        },
      },
    },
  })
}

export type TenantDb = ReturnType<typeof forTenant>

/** The client inside `TenantDb.$transaction(async (tx) => ...)` — still tenant-scoped. */
export type TenantTx = Parameters<Parameters<TenantDb['$transaction']>[0]>[0]
