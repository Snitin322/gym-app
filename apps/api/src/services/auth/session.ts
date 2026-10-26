import { randomUUID } from 'node:crypto'
import { ErrorCode, type Role } from '@onthec/shared'
import type { Db } from '../../db/unscoped'
import type { Env } from '../../env'
import { AppError } from '../../errors'
import { randomToken, sha256 } from '../../lib/crypto'
import { signAccessToken } from './tokens'

export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60

export interface SessionDeps {
  db: Db
  env: Env
}

export interface SessionSubject {
  id: string
  gymId: string
  role: Role
}

export interface IssuedSession {
  accessToken: string
  refreshToken: string
  subject: SessionSubject
}

function invalidRefresh() {
  return new AppError(401, ErrorCode.UNAUTHENTICATED, 'Your session has ended. Please log in again.')
}

async function revokeFamily(db: Db, familyId: string) {
  await db.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } })
}

// Sessions use the unscoped client: refresh happens before there is an access token to scope by.
export async function createSession(
  { db, env }: SessionDeps,
  subject: SessionSubject,
  meta: { userAgent?: string },
  familyId: string = randomUUID(),
): Promise<IssuedSession> {
  const refreshToken = randomToken()
  await db.refreshToken.create({
    data: {
      gymId: subject.gymId,
      userId: subject.id,
      familyId,
      tokenHash: sha256(refreshToken),
      userAgent: meta.userAgent?.slice(0, 255),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  })
  const accessToken = await signAccessToken(env, { userId: subject.id, gymId: subject.gymId, role: subject.role })
  return { accessToken, refreshToken, subject }
}

/**
 * Swaps a refresh token for a new one in the same family. Presenting a token that was already
 * rotated means it was copied, so the whole family (every device of that login) is revoked.
 */
export async function rotateSession(
  deps: SessionDeps,
  presentedToken: string,
  meta: { userAgent?: string },
): Promise<IssuedSession> {
  const { db } = deps
  const existing = await db.refreshToken.findUnique({
    where: { tokenHash: sha256(presentedToken) },
    include: { user: { select: { id: true, gymId: true, role: true, deletedAt: true } } },
  })
  if (!existing) throw invalidRefresh()

  if (existing.revokedAt) {
    await revokeFamily(db, existing.familyId)
    throw invalidRefresh()
  }
  if (existing.expiresAt <= new Date() || existing.user.deletedAt) throw invalidRefresh()

  const { count } = await db.refreshToken.updateMany({
    where: { id: existing.id, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  if (count === 0) {
    // Another request rotated it at the same moment: treat as reuse.
    await revokeFamily(db, existing.familyId)
    throw invalidRefresh()
  }

  return createSession(deps, existing.user, meta, existing.familyId)
}

/** Ends the login this token belongs to. Unknown tokens are ignored. */
export async function endSession(db: Db, presentedToken: string) {
  const existing = await db.refreshToken.findUnique({ where: { tokenHash: sha256(presentedToken) } })
  if (existing) await revokeFamily(db, existing.familyId)
}
