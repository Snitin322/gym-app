import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

export function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function hmacSha256(key: string, value: string) {
  return createHmac('sha256', key).update(value).digest('hex')
}

/** 256-bit URL-safe random token. */
export function randomToken() {
  return randomBytes(32).toString('base64url')
}

/** Uniformly random 6-digit code, e.g. "042917". */
export function randomOtp() {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
