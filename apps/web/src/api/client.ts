import type { ApiErrorBody, ErrorCode, SessionResponse } from '@onthec/shared'

export const API_BASE = '/api/v1'

export type ApiErrorCode = ErrorCode | 'NETWORK_ERROR'

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** The short-lived access token lives only in memory; the refresh token is an httpOnly cookie. */
let accessToken: string | null = null
let refreshing: Promise<SessionResponse | null> | null = null
let sessionListener: ((session: SessionResponse | null) => void) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

/** Called whenever a refresh produces a new session (or ends it). Used by the AuthProvider. */
export function setSessionListener(listener: ((session: SessionResponse | null) => void) | null) {
  sessionListener = listener
}

async function send<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', "Can't reach the server. Check your internet connection and try again.")
  }

  if (res.status === 204) return undefined as T

  // Anything that isn't our JSON (e.g. a proxy error page) means the API isn't reachable.
  if (!res.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError(res.status, 'NETWORK_ERROR', 'The server is not available right now. Please try again later.')
  }

  const body: unknown = await res.json()
  if (!res.ok) {
    const error = (body as Partial<ApiErrorBody>).error
    throw new ApiError(res.status, error?.code ?? 'INTERNAL_ERROR', error?.message ?? 'Something went wrong.')
  }
  return body as T
}

/**
 * Exchanges the refresh cookie for a new session. Concurrent callers share one request, because
 * the server treats a second use of the same refresh token as theft and ends the login.
 * Resolves to null when there is no valid login.
 */
export function refreshSession(): Promise<SessionResponse | null> {
  refreshing ??= send<SessionResponse>('/auth/refresh', { method: 'POST' })
    .then((session) => {
      accessToken = session.accessToken
      sessionListener?.(session)
      return session
    })
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        accessToken = null
        sessionListener?.(null)
        return null
      }
      throw error
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
}

/** Fetches a file (e.g. an invoice PDF) with the access token, refreshing it once if needed. */
export async function apiBlob(path: string): Promise<Blob> {
  const get = () =>
    fetch(`${API_BASE}${path}`, {
      credentials: 'same-origin',
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
    }).catch(() => {
      throw new ApiError(0, 'NETWORK_ERROR', "Can't reach the server. Check your internet connection and try again.")
    })

  let res = await get()
  if (res.status === 401 && (await refreshSession())) res = await get()
  if (!res.ok) {
    const error = res.headers.get('content-type')?.includes('application/json')
      ? ((await res.json()) as Partial<ApiErrorBody>).error
      : undefined
    throw new ApiError(res.status, error?.code ?? 'INTERNAL_ERROR', error?.message ?? 'Could not download the file.')
  }
  return res.blob()
}

/** Downloads a file from the API and saves it with the given name. */
export async function downloadFile(path: string, filename: string) {
  const url = URL.createObjectURL(await apiBlob(path))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** Calls the API with the access token, refreshing it once if it has expired. */
export async function api<T>(path: string, { method = 'GET', body }: RequestOptions = {}): Promise<T> {
  const init = (): RequestInit => ({
    method,
    headers: {
      ...(body !== undefined && { 'content-type': 'application/json' }),
      ...(accessToken && { authorization: `Bearer ${accessToken}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  try {
    return await send<T>(path, init())
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || path.startsWith('/auth/')) throw error
    const session = await refreshSession()
    if (!session) throw error
    return send<T>(path, init())
  }
}
