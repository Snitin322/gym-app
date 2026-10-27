import type { FastifyPluginAsync } from 'fastify'
import type { IsoDate } from '@onthec/shared'
import type { Db } from '../db/unscoped'
import { handleRazorpayWebhook } from '../services/razorpay-webhook'
import type { RazorpayGateway } from '../services/razorpay'

/** Payment provider callbacks. No login: they are authenticated by signature instead. */
export function webhooksRoutes(deps: {
  db: Db
  gateway: RazorpayGateway | null
  today: () => IsoDate
}): FastifyPluginAsync {
  return async (app) => {
    // The signature covers the exact bytes Razorpay sent, so keep the body as a raw string here.
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => done(null, body))

    app.post('/webhooks/razorpay', { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (request) => {
      const outcome = await handleRazorpayWebhook(
        { ...deps, log: request.log },
        typeof request.body === 'string' ? request.body : '',
        request.headers['x-razorpay-signature'] as string | undefined,
        request.headers['x-razorpay-event-id'] as string | undefined,
      )
      return { ok: true, outcome }
    })
  }
}
