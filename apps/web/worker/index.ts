/**
 * Cloudflare Worker in front of the PWA (deployed by wrangler.jsonc at the repo root).
 * - /api/* is forwarded to the API on Render, so app and API share one origin and the refresh
 *   cookie stays first-party (Safari blocks third-party cookies).
 * - Everything else is served from the static assets (with SPA fallback).
 */
export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
  /** e.g. https://onthec-api.onrender.com */
  API_ORIGIN: string
}

const UNAVAILABLE = {
  error: { code: 'INTERNAL_ERROR', message: 'The server is not available right now. Please try again in a minute.' },
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)

  const target = new URL(url.pathname + url.search, env.API_ORIGIN)
  const headers = new Headers(request.headers)
  headers.delete('host')
  // Replace any client-supplied value so the API's rate limits see the real visitor IP.
  headers.delete('x-forwarded-for')
  const clientIp = request.headers.get('cf-connecting-ip')
  if (clientIp) headers.set('x-forwarded-for', clientIp)
  headers.set('x-forwarded-proto', 'https')
  headers.set('x-forwarded-host', url.host)

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  try {
    return await fetch(target, {
      method: request.method,
      headers,
      // API bodies are small JSON; buffering avoids streaming-body differences between runtimes.
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
    })
  } catch {
    return Response.json(UNAVAILABLE, { status: 502 })
  }
}

export default { fetch: handleRequest }
