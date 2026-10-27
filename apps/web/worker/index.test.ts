import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleRequest, type Env } from './index'

function makeEnv() {
  const assets = vi.fn(async () => new Response('<html>app</html>', { headers: { 'content-type': 'text/html' } }))
  const env: Env = { ASSETS: { fetch: assets }, API_ORIGIN: 'https://api.example.com' }
  return { env, assets }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Worker', () => {
  it('serves the app from static assets for non-API paths', async () => {
    const { env, assets } = makeEnv()
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)

    const res = await handleRequest(new Request('https://gym.example.dev/login'), env)

    expect(await res.text()).toBe('<html>app</html>')
    expect(assets).toHaveBeenCalledOnce()
    expect(upstream).not.toHaveBeenCalled()
  })

  it('forwards /api requests to the API with the body, cookies and real client IP', async () => {
    const { env, assets } = makeEnv()
    const upstream = vi.fn<(url: URL, init: RequestInit) => Promise<Response>>(
      async () =>
        new Response('{"ok":true}', {
          headers: { 'content-type': 'application/json', 'set-cookie': 'onthec_refresh=abc; Path=/api/v1/auth; HttpOnly' },
        }),
    )
    vi.stubGlobal('fetch', upstream)

    const res = await handleRequest(
      new Request('https://gym.example.dev/api/v1/auth/otp/verify?x=1', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'onthec_refresh=old',
          'cf-connecting-ip': '203.0.113.7',
          'x-forwarded-for': '6.6.6.6', // spoofed by the client
        },
        body: JSON.stringify({ phone: '+919876543210', code: '123456' }),
      }),
      env,
    )

    expect(assets).not.toHaveBeenCalled()
    const [url, init] = upstream.mock.calls[0]!
    expect(url.toString()).toBe('https://api.example.com/api/v1/auth/otp/verify?x=1')
    expect(init.method).toBe('POST')
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"phone":"+919876543210","code":"123456"}')

    const headers = init.headers as Headers
    expect(headers.get('cookie')).toBe('onthec_refresh=old')
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7')
    expect(headers.get('x-forwarded-proto')).toBe('https')
    expect(headers.get('x-forwarded-host')).toBe('gym.example.dev')

    // The API's cookie comes back unchanged, now first-party to the app's origin.
    expect(res.headers.get('set-cookie')).toContain('onthec_refresh=abc')
    expect(await res.json()).toEqual({ ok: true })
  })

  it('sends no body for GET requests', async () => {
    const { env } = makeEnv()
    const upstream = vi.fn<(url: URL, init: RequestInit) => Promise<Response>>(async () =>
      Response.json({ status: 'ok' }),
    )
    vi.stubGlobal('fetch', upstream)

    await handleRequest(new Request('https://gym.example.dev/api/v1/health'), env)

    expect(upstream.mock.calls[0]?.[1]?.body).toBeUndefined()
  })

  it('returns the standard error shape when the API cannot be reached', async () => {
    const { env } = makeEnv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down')
      }),
    )

    const res = await handleRequest(new Request('https://gym.example.dev/api/v1/me'), env)

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'The server is not available right now. Please try again in a minute.' },
    })
  })
})
