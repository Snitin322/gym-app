import { z } from 'zod'
import { phoneSchema } from '@onthec/shared'

function splitList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const secret = z.string().min(32, 'must be at least 32 characters (generate with: openssl rand -base64 48)')

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    /** Set when running behind a proxy (Render, Cloudflare) so rate limits see the real client IP. */
    TRUST_PROXY: z.stringbool().default(false),
    DATABASE_URL: z.url(),
    WEB_ORIGINS: z.string().default('http://localhost:5173').transform(splitList),

    JWT_SECRET: secret,
    OTP_SECRET: secret,
    /** Only "console" until DLT registration is approved; then "msg91" is added. */
    SMS_PROVIDER: z.enum(['console']).default('console'),
    /** Numbers that log in with OTP_TEST_CODE instead of a real SMS. Ignored once a real SMS provider is used. */
    OTP_TEST_PHONES: z.string().default('').transform(splitList).pipe(z.array(phoneSchema)),
    /** A blank value (as in .env.example) means "not set". */
    OTP_TEST_CODE: z
      .union([z.literal('').transform(() => undefined), z.string().regex(/^\d{6}$/, 'must be 6 digits')])
      .optional(),
  })
  .refine((env) => env.OTP_TEST_PHONES.length === 0 || env.OTP_TEST_CODE, {
    message: 'is required when OTP_TEST_PHONES is set',
    path: ['OTP_TEST_CODE'],
  })

export type Env = z.infer<typeof envSchema>

/** Parses and validates configuration; throws a readable error listing every bad variable. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
