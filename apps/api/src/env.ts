import { z } from 'zod'
import { phoneSchema } from '@onthec/shared'

function splitList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const secret = z.string().min(32, 'must be at least 32 characters (generate with: openssl rand -base64 48)')

/** Optional text setting; a blank value (as in .env.example) means "not set". */
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)

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
    /** How login codes are delivered: "console" writes them to the API log; "whatsapp" sends them. */
    OTP_PROVIDER: z.enum(['console', 'whatsapp']).default('console'),
    /** Numbers that log in with OTP_TEST_CODE instead of a real message. Only honoured with OTP_PROVIDER=console. */
    OTP_TEST_PHONES: z.string().default('').transform(splitList).pipe(z.array(phoneSchema)),
    /** A blank value (as in .env.example) means "not set". */
    OTP_TEST_CODE: z
      .union([z.literal('').transform(() => undefined), z.string().regex(/^\d{6}$/, 'must be 6 digits')])
      .optional(),

    // WhatsApp Cloud API (Meta). Required when OTP_PROVIDER=whatsapp.
    WHATSAPP_PHONE_NUMBER_ID: optionalText,
    WHATSAPP_ACCESS_TOKEN: optionalText,
    /** Approved "Authentication" template with a copy-code button. */
    WHATSAPP_OTP_TEMPLATE: z.string().default('login_code'),
    WHATSAPP_TEMPLATE_LANGUAGE: z.string().default('en_US'),
    WHATSAPP_API_VERSION: z.string().regex(/^v\d+\.\d+$/, 'must look like v26.0').default('v26.0'),

    // Razorpay (online payments). All three or none; without them the app offers desk payments only.
    RAZORPAY_KEY_ID: optionalText,
    RAZORPAY_KEY_SECRET: optionalText,
    RAZORPAY_WEBHOOK_SECRET: optionalText,
  })
  .refine(
    (env) => {
      const set = [env.RAZORPAY_KEY_ID, env.RAZORPAY_KEY_SECRET, env.RAZORPAY_WEBHOOK_SECRET].filter(Boolean).length
      return set === 0 || set === 3
    },
    {
      message: 'set all three of RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET, or none',
      path: ['RAZORPAY_KEY_ID'],
    },
  )
  .refine((env) => !env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_ID !== env.RAZORPAY_KEY_SECRET, {
    message: 'must be the Key Secret, not the Key Id (they are different values)',
    path: ['RAZORPAY_KEY_SECRET'],
  })
  .refine((env) => env.OTP_TEST_PHONES.length === 0 || env.OTP_TEST_CODE, {
    message: 'is required when OTP_TEST_PHONES is set',
    path: ['OTP_TEST_CODE'],
  })
  .refine((env) => env.OTP_PROVIDER !== 'whatsapp' || env.WHATSAPP_PHONE_NUMBER_ID, {
    message: 'is required when OTP_PROVIDER=whatsapp',
    path: ['WHATSAPP_PHONE_NUMBER_ID'],
  })
  .refine((env) => env.OTP_PROVIDER !== 'whatsapp' || env.WHATSAPP_ACCESS_TOKEN, {
    message: 'is required when OTP_PROVIDER=whatsapp',
    path: ['WHATSAPP_ACCESS_TOKEN'],
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
