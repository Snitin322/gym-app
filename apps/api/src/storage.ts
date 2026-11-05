import { createHmac, timingSafeEqual } from 'node:crypto'
import { AwsClient } from 'aws4fetch'
import type { Env } from './env'

/**
 * Private file storage for progress photos. Files are never public: readers get short-lived signed
 * links, made only after the API has checked who is asking.
 */
export interface PhotoStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>
  /** A link that works for `ttlSeconds`. */
  signedUrl(key: string, ttlSeconds: number): Promise<string>
  delete(key: string): Promise<void>
}

/** Cloudflare R2 through its S3-compatible API. */
export class R2Store implements PhotoStore {
  private readonly client: AwsClient
  private readonly base: string

  constructor(accountId: string, accessKeyId: string, secretAccessKey: string, bucket: string) {
    this.client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })
    this.base = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`
  }

  private url(key: string) {
    return `${this.base}/${key.split('/').map(encodeURIComponent).join('/')}`
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    const res = await this.client.fetch(this.url(key), {
      method: 'PUT',
      body,
      headers: { 'content-type': contentType },
    })
    if (!res.ok) throw new Error(`R2 upload failed: ${res.status} ${await res.text()}`)
  }

  async signedUrl(key: string, ttlSeconds: number) {
    const signed = await this.client.sign(new Request(`${this.url(key)}?X-Amz-Expires=${ttlSeconds}`), {
      aws: { signQuery: true },
    })
    return signed.url
  }

  async delete(key: string) {
    const res = await this.client.fetch(this.url(key), { method: 'DELETE' })
    if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed: ${res.status}`)
  }
}

/**
 * Keeps files in memory and serves them from the API (GET /api/v1/files/...) with an HMAC-signed
 * link. For local development and tests only: files are gone when the API restarts.
 */
export class MemoryStore implements PhotoStore {
  readonly files = new Map<string, { body: Uint8Array; contentType: string }>()

  constructor(
    private readonly secret: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private sign(key: string, expires: number) {
    return createHmac('sha256', this.secret).update(`${key}\n${expires}`).digest('base64url')
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    this.files.set(key, { body, contentType })
  }

  async signedUrl(key: string, ttlSeconds: number) {
    const expires = Math.floor(this.now().getTime() / 1000) + ttlSeconds
    return `/api/v1/files/${key}?expires=${expires}&sig=${this.sign(key, expires)}`
  }

  async delete(key: string) {
    this.files.delete(key)
  }

  /** The file, if the link is genuine and hasn't expired. */
  read(key: string, expires: number, sig: string) {
    if (!Number.isFinite(expires) || expires * 1000 < this.now().getTime()) return null
    const expected = Buffer.from(this.sign(key, expires))
    const given = Buffer.from(sig)
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
    return this.files.get(key) ?? null
  }
}

/** R2 when it's configured; in development and tests, memory; otherwise none (no photos). */
export function photoStoreFromEnv(env: Env): PhotoStore | null {
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET) {
    return new R2Store(env.R2_ACCOUNT_ID, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, env.R2_BUCKET)
  }
  return env.NODE_ENV === 'production' ? null : new MemoryStore(env.JWT_SECRET)
}
