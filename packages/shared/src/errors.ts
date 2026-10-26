/** Every error code the API can return. Add new codes here, never inline strings. */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DB_UNAVAILABLE: 'DB_UNAVAILABLE',

  // Auth
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  OTP_RATE_LIMITED: 'OTP_RATE_LIMITED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_TOO_MANY_ATTEMPTS: 'OTP_TOO_MANY_ATTEMPTS',
  GYM_SELECTION_INVALID: 'GYM_SELECTION_INVALID',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

/** The one error shape every API error response uses. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode
    message: string
  }
}
