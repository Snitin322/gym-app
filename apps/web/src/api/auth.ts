import {
  CURRENT_NOTICE_VERSION,
  type OtpRequestResponse,
  type SessionResponse,
  type SessionUser,
  type VerifyOtpResponse,
} from '@onthec/shared'
import { api } from './client'

export function requestOtp(phone: string) {
  return api<OtpRequestResponse>('/auth/otp/request', { method: 'POST', body: { phone } })
}

export function verifyOtp(phone: string, code: string) {
  return api<VerifyOtpResponse>('/auth/otp/verify', { method: 'POST', body: { phone, code } })
}

export function selectGym(selectionToken: string, gymId: string) {
  return api<SessionResponse>('/auth/select-gym', { method: 'POST', body: { selectionToken, gymId } })
}

export function logout() {
  return api<void>('/auth/logout', { method: 'POST' })
}

export function acceptConsent() {
  return api<SessionUser>('/me/consent', { method: 'POST', body: { noticeVersion: CURRENT_NOTICE_VERSION } })
}
