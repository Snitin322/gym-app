import { describe, expect, it } from 'vitest'
import { loadEnv } from '../src/env'

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(32),
  OTP_SECRET: 'b'.repeat(32),
}

describe('loadEnv', () => {
  it('fails with a message naming each missing variable', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL[\s\S]*JWT_SECRET[\s\S]*OTP_SECRET/)
  })

  it('rejects a DATABASE_URL that is not a URL', () => {
    expect(() => loadEnv({ ...base, DATABASE_URL: 'not a url' })).toThrow(/DATABASE_URL/)
  })

  it('rejects short secrets', () => {
    expect(() => loadEnv({ ...base, JWT_SECRET: 'too-short' })).toThrow(/32 characters[\s\S]*JWT_SECRET/)
  })

  it('applies defaults', () => {
    const env = loadEnv(base)
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      TRUST_PROXY: false,
      SMS_PROVIDER: 'console',
      WEB_ORIGINS: ['http://localhost:5173'],
      OTP_TEST_PHONES: [],
    })
  })

  it('parses PORT as a number and splits WEB_ORIGINS', () => {
    const env = loadEnv({
      ...base,
      PORT: '8080',
      WEB_ORIGINS: 'https://gym-app.example.dev, http://localhost:5173 ,',
    })
    expect(env.PORT).toBe(8080)
    expect(env.WEB_ORIGINS).toEqual(['https://gym-app.example.dev', 'http://localhost:5173'])
  })

  it('normalises OTP test phones and requires a test code with them', () => {
    expect(() => loadEnv({ ...base, OTP_TEST_PHONES: '9876543210' })).toThrow(/OTP_TEST_CODE/)
    expect(() => loadEnv({ ...base, OTP_TEST_PHONES: '12345', OTP_TEST_CODE: '123456' })).toThrow(/OTP_TEST_PHONES/)

    const env = loadEnv({ ...base, OTP_TEST_PHONES: '98765 43210, +919800000001', OTP_TEST_CODE: '123456' })
    expect(env.OTP_TEST_PHONES).toEqual(['+919876543210', '+919800000001'])
  })

  it('treats blank optional values (as in .env.example) as unset', () => {
    const env = loadEnv({ ...base, OTP_TEST_PHONES: '', OTP_TEST_CODE: '' })
    expect(env.OTP_TEST_PHONES).toEqual([])
    expect(env.OTP_TEST_CODE).toBeUndefined()
  })
})
