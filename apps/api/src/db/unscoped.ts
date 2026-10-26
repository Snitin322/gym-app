import { PrismaClient } from '@prisma/client'

/**
 * The raw Prisma client. It can read and write every gym's data, so only bootstrap code,
 * health checks and the auth services (which run before a gym is known) may use it.
 * Everything else uses the tenant-scoped client from `./tenant` (enforced by ESLint).
 */
export type Db = PrismaClient

export function createDb(datasourceUrl?: string): Db {
  return new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined)
}
