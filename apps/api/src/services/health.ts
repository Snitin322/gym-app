import { ErrorCode } from '@onthec/shared'
import type { Db } from '../db/unscoped'
import { AppError } from '../errors'

export async function assertDatabaseReachable(db: Pick<Db, '$queryRaw'>) {
  try {
    await db.$queryRaw`SELECT 1`
  } catch (cause) {
    throw new AppError(503, ErrorCode.DB_UNAVAILABLE, 'Database is not reachable', { cause })
  }
}
