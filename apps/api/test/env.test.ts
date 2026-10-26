import { describe, expect, it } from 'vitest'
import { loadEnv } from '../src/env'

const DATABASE_URL = 'postgresql://user:pass@localhost:5432/db'

describe('loadEnv', () => {
  it('fails with a message naming the missing variable', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/)
  })

  it('rejects a DATABASE_URL that is not a URL', () => {
    expect(() => loadEnv({ DATABASE_URL: 'not a url' })).toThrow(/DATABASE_URL/)
  })

  it('applies defaults', () => {
    const env = loadEnv({ DATABASE_URL })
    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBe(3000)
    expect(env.WEB_ORIGINS).toEqual(['http://localhost:5173'])
  })

  it('parses PORT as a number and splits WEB_ORIGINS', () => {
    const env = loadEnv({
      DATABASE_URL,
      PORT: '8080',
      WEB_ORIGINS: 'https://gym-app.example.dev, http://localhost:5173 ,',
    })
    expect(env.PORT).toBe(8080)
    expect(env.WEB_ORIGINS).toEqual(['https://gym-app.example.dev', 'http://localhost:5173'])
  })
})
