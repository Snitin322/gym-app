import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { healthResponseSchema } from '@onthec/shared'
import { buildApp } from '../src/app'
import { fakeDb, testEnv } from './helpers'

let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('GET /api/v1/health', () => {
  it('returns ok when the database answers', async () => {
    app = await buildApp({ env: testEnv(), db: fakeDb(async () => [{ '?column?': 1 }]) })

    const res = await app.inject({ method: 'GET', url: '/api/v1/health' })

    expect(res.statusCode).toBe(200)
    expect(healthResponseSchema.parse(res.json())).toMatchObject({ status: 'ok', db: 'ok' })
  })

  it('returns 503 DB_UNAVAILABLE in the standard error shape when the database is down', async () => {
    app = await buildApp({
      env: testEnv(),
      db: fakeDb(async () => {
        throw new Error('connection refused')
      }),
    })

    const res = await app.inject({ method: 'GET', url: '/api/v1/health' })

    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ error: { code: 'DB_UNAVAILABLE', message: 'Database is not reachable' } })
  })
})

describe('error handling', () => {
  it('returns 404 NOT_FOUND in the standard error shape for unknown routes', async () => {
    app = await buildApp({ env: testEnv(), db: fakeDb(async () => []) })

    const res = await app.inject({ method: 'GET', url: '/api/v1/nope' })

    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Route GET /api/v1/nope not found' } })
  })

  it('hides internal error details from the client', async () => {
    app = await buildApp({ env: testEnv(), db: fakeDb(async () => []) })
    app.get('/boom', async () => {
      throw new Error('secret stack detail')
    })

    const res = await app.inject({ method: 'GET', url: '/boom' })

    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } })
  })
})

describe('CORS', () => {
  it('allows configured web origins only', async () => {
    app = await buildApp({
      env: testEnv({ WEB_ORIGINS: 'https://gym-app.example.dev' }),
      db: fakeDb(async () => []),
    })

    const allowed = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'https://gym-app.example.dev' },
    })
    const blocked = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'https://evil.example.com' },
    })

    expect(allowed.headers['access-control-allow-origin']).toBe('https://gym-app.example.dev')
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined()
  })
})
