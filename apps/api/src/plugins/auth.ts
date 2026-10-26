import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'
import { ErrorCode, type Role } from '@onthec/shared'
import { forTenant, type TenantDb } from '../db/tenant'
import type { Db } from '../db/unscoped'
import type { Env } from '../env'
import { AppError } from '../errors'
import { verifyAccessToken } from '../services/auth/tokens'

/** Who is calling, and a database client limited to their gym. gymId always comes from the token. */
export interface AuthContext {
  userId: string
  gymId: string
  role: Role
  db: TenantDb
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null
  }
}

/** preHandler that requires a valid access token and attaches `request.auth`. */
export function createAuthenticate(env: Env, db: Db): preHandlerAsyncHookHandler {
  return async (request) => {
    const header = request.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Please log in.')
    }
    const claims = await verifyAccessToken(env, header.slice('Bearer '.length))
    request.auth = { ...claims, db: forTenant(db, claims.gymId) }
  }
}

/** preHandler that allows only the given roles. Register after `authenticate`. */
export function requireRole(...roles: Role[]): preHandlerAsyncHookHandler {
  return async (request) => {
    const auth = getAuth(request)
    if (!roles.includes(auth.role)) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'You do not have access to this.')
    }
  }
}

export function getAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Please log in.')
  return request.auth
}
