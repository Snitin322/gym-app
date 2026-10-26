import { SignJWT, errors as joseErrors, jwtVerify } from 'jose'
import { ErrorCode, ROLES, type Role } from '@onthec/shared'
import type { Env } from '../../env'
import { AppError } from '../../errors'

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60
export const SELECTION_TOKEN_TTL_SECONDS = 5 * 60
export const JWT_ISSUER = 'onthec-api'
export const ACCESS_AUDIENCE = 'onthec-web'
export const SELECTION_AUDIENCE = 'onthec-gym-select'

export interface AccessClaims {
  userId: string
  gymId: string
  role: Role
}

function signingKey(env: Env) {
  return new TextEncoder().encode(env.JWT_SECRET)
}

function unauthenticated(message = 'Please log in again.') {
  return new AppError(401, ErrorCode.UNAUTHENTICATED, message)
}

export async function signAccessToken(env: Env, claims: AccessClaims) {
  return new SignJWT({ gym: claims.gymId, role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuer(JWT_ISSUER)
    .setAudience(ACCESS_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(signingKey(env))
}

export async function verifyAccessToken(env: Env, token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, signingKey(env), {
      issuer: JWT_ISSUER,
      audience: ACCESS_AUDIENCE,
      algorithms: ['HS256'],
    })
    const { sub, gym, role } = payload
    if (typeof sub !== 'string' || typeof gym !== 'string' || !ROLES.includes(role as Role)) {
      throw unauthenticated()
    }
    return { userId: sub, gymId: gym, role: role as Role }
  } catch (error) {
    if (error instanceof AppError) throw error
    if (error instanceof joseErrors.JWTExpired) throw unauthenticated('Your session has expired.')
    throw unauthenticated()
  }
}

/** Short-lived proof that this phone passed OTP, used only to pick a gym. */
export async function signSelectionToken(env: Env, phone: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(phone)
    .setIssuer(JWT_ISSUER)
    .setAudience(SELECTION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SELECTION_TOKEN_TTL_SECONDS}s`)
    .sign(signingKey(env))
}

export async function verifySelectionToken(env: Env, token: string): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, signingKey(env), {
      issuer: JWT_ISSUER,
      audience: SELECTION_AUDIENCE,
      algorithms: ['HS256'],
    })
    if (typeof payload.sub !== 'string') throw new Error('missing subject')
    return payload.sub
  } catch {
    throw new AppError(401, ErrorCode.UNAUTHENTICATED, 'Your login has timed out. Please start again.')
  }
}
