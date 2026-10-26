import { PrismaClient } from '@prisma/client'

export type Db = PrismaClient

// Phase 2 wraps this in a tenant-scoped extension; services must not use the raw client for tenant data.
export function createDb(datasourceUrl?: string): Db {
  return new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined)
}
