import { vi } from 'vitest'
import type { SessionResponse, SessionUser } from '@onthec/shared'

/** `file` returns a binary body (e.g. a PDF) instead of JSON. */
type MockResponse = { status: number; body?: unknown; file?: { content: string; type: string } }
type Route = MockResponse | ((body: unknown, callNumber: number) => MockResponse)

export interface ApiCall {
  method: string
  path: string
  body: unknown
  headers: Headers
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/**
 * Replaces global fetch with a fake API. Routes are keyed "METHOD /path" (path after /api/v1).
 * Unknown routes return 404 so a missing mock fails loudly.
 */
export function mockApi(routes: Record<string, Route>) {
  const calls: ApiCall[] = []
  const counts = new Map<string, number>()

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^.*\/api\/v1/, '')
    const method = init?.method ?? 'GET'
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ method, path, body, headers: new Headers(init?.headers) })

    const key = `${method} ${path}`
    const callNumber = (counts.get(key) ?? 0) + 1
    counts.set(key, callNumber)

    const route = routes[key]
    if (!route) return json(404, { error: { code: 'NOT_FOUND', message: `No mock for ${key}` } })
    const response = typeof route === 'function' ? route(body, callNumber) : route
    if (response.file) {
      return new Response(response.file.content, { status: response.status, headers: { 'content-type': response.file.type } })
    }
    return response.status === 204 ? new Response(null, { status: 204 }) : json(response.status, response.body)
  })

  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock, callsTo: (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key) }
}

export function sessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: 'user-1',
    name: 'Asha Patel',
    phone: '+919876543210',
    role: 'member',
    gym: { id: 'gym-1', name: 'Onthec Gym' },
    consentRequired: false,
    ...overrides,
  }
}

export function session(user: SessionUser = sessionUser(), accessToken = 'access-1'): SessionResponse {
  return { accessToken, expiresIn: 900, user }
}

export const ok = (body: unknown): MockResponse => ({ status: 200, body })

export const unauthenticated: MockResponse = {
  status: 401,
  body: { error: { code: 'UNAUTHENTICATED', message: 'Please log in.' } },
}
