import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, setAccessToken, setSessionListener } from './client'
import { mockApi, ok, session, unauthenticated } from '../test/mockApi'

beforeEach(() => {
  setAccessToken(null)
  setSessionListener(null)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api client', () => {
  it('sends JSON with the access token', async () => {
    const { calls } = mockApi({ 'POST /me/consent': ok({ done: true }) })
    setAccessToken('token-a')

    await api('/me/consent', { method: 'POST', body: { noticeVersion: 'v1' } })

    expect(calls[0]?.body).toEqual({ noticeVersion: 'v1' })
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer token-a')
    expect(calls[0]?.headers.get('content-type')).toBe('application/json')
  })

  it('refreshes an expired access token once and retries the request', async () => {
    const { calls } = mockApi({
      'GET /me': (_body, n) => (n === 1 ? unauthenticated : ok({ name: 'Asha' })),
      'POST /auth/refresh': ok(session(undefined, 'token-b')),
    })
    const listener = vi.fn()
    setSessionListener(listener)
    setAccessToken('token-a')

    await expect(api('/me')).resolves.toEqual({ name: 'Asha' })

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /me', 'POST /auth/refresh', 'GET /me'])
    expect(calls[2]?.headers.get('authorization')).toBe('Bearer token-b')
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'token-b' }))
  })

  it('shares one refresh between requests that expire at the same time', async () => {
    const { callsTo } = mockApi({
      'GET /me': (_body, n) => (n <= 2 ? unauthenticated : ok({})),
      'POST /auth/refresh': ok(session()),
    })

    await Promise.all([api('/me'), api('/me')])

    // Two refreshes would reuse the same refresh token and make the server end the login.
    expect(callsTo('POST /auth/refresh')).toHaveLength(1)
  })

  it('reports the login as ended when the refresh is refused', async () => {
    mockApi({ 'GET /me': unauthenticated, 'POST /auth/refresh': unauthenticated })
    const listener = vi.fn()
    setSessionListener(listener)

    await expect(api('/me')).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' })
    expect(listener).toHaveBeenCalledWith(null)
  })

  it('never refreshes for /auth calls', async () => {
    const { callsTo } = mockApi({ 'POST /auth/select-gym': unauthenticated })

    await expect(api('/auth/select-gym', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError)
    expect(callsTo('POST /auth/refresh')).toHaveLength(0)
  })

  it('turns network failures and non-JSON responses into a readable NETWORK_ERROR', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await expect(api('/me')).rejects.toMatchObject({ code: 'NETWORK_ERROR', message: expect.stringMatching(/internet/) })

    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })))
    await expect(api('/me')).rejects.toMatchObject({ code: 'NETWORK_ERROR', message: expect.stringMatching(/not available/) })
  })
})
