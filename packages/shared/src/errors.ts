/** Every error code the API can return. Add new codes here, never inline strings. */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DB_UNAVAILABLE: 'DB_UNAVAILABLE',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

/** The one error shape every API error response uses. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode
    message: string
  }
}
