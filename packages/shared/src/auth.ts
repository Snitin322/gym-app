import { z } from 'zod'
import { phoneSchema } from './phone'

export const ROLES = ['member', 'trainer', 'admin', 'owner'] as const
export type Role = (typeof ROLES)[number]

/** Bump when the terms or privacy notice text changes; users are asked to accept again. */
export const CURRENT_NOTICE_VERSION = '2026-10-v1'

export const otpRequestBodySchema = z.object({ phone: phoneSchema })

export const otpVerifyBodySchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

export const selectGymBodySchema = z.object({
  selectionToken: z.string().min(1),
  gymId: z.uuid(),
})

export const consentBodySchema = z.object({
  noticeVersion: z.literal(CURRENT_NOTICE_VERSION),
})

export interface GymSummary {
  id: string
  name: string
}

export interface SessionUser {
  id: string
  name: string
  phone: string
  role: Role
  gym: GymSummary
  /** True until the user accepts the current terms and privacy notice. */
  consentRequired: boolean
}

export interface OtpRequestResponse {
  expiresInSeconds: number
}

export interface SessionResponse {
  accessToken: string
  /** Access token lifetime in seconds. */
  expiresIn: number
  user: SessionUser
}

export type VerifyOtpResponse =
  | ({ status: 'authenticated' } & SessionResponse)
  | { status: 'select_gym'; selectionToken: string; gyms: GymSummary[] }

export interface UserSummary {
  id: string
  name: string
  phone: string
  role: Role
}
