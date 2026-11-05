import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from 'fastify'
import { z } from 'zod'
import {
  CHECK_IN_POSES,
  ErrorCode,
  MAX_PHOTO_BYTES,
  checkInInputSchema,
  checkInReviewSchema,
  type IsoDate,
} from '@onthec/shared'
import { AppError } from '../errors'
import { getAuth, requireRole } from '../plugins/auth'
import {
  checkInsToReview,
  getMemberCheckIns,
  getMyCheckIns,
  reviewCheckIn,
  saveMyCheckIn,
  saveMyPhoto,
} from '../services/check-ins'
import { MemoryStore, type PhotoStore } from '../storage'

const idParams = z.object({ id: z.uuid() })
const photoParams = z.object({ id: z.uuid(), pose: z.enum(CHECK_IN_POSES) })
const fileQuery = z.object({ expires: z.coerce.number(), sig: z.string() })

interface Deps {
  authenticate: preHandlerAsyncHookHandler
  today: () => IsoDate
  store: PhotoStore | null
}

/** Weekly check-ins: the member sends them, their coach (or the owner) replies. */
export function checkInRoutes({ authenticate, today, store }: Deps): FastifyPluginAsync {
  return async (app) => {
    // Photos arrive as the raw image body (resized in the browser first).
    app.addContentTypeParser(
      ['image/jpeg', 'image/png', 'image/webp'],
      { parseAs: 'buffer', bodyLimit: MAX_PHOTO_BYTES + 1024 },
      (_request, body, done) => done(null, body),
    )

    // Local development and tests: photos are served by the API from memory, behind a signed link.
    if (store instanceof MemoryStore) {
      app.get('/files/*', async (request, reply) => {
        const key = (request.params as { '*': string })['*']
        const { expires, sig } = fileQuery.parse(request.query)
        const file = store.read(key, expires, sig)
        if (!file) throw new AppError(404, ErrorCode.NOT_FOUND, 'File not found')
        return reply
          .header('content-type', file.contentType)
          .header('cache-control', 'private, max-age=600')
          .send(Buffer.from(file.body))
      })
    }

    app.register(async (secured) => {
      secured.addHook('preHandler', authenticate)
      const coaches = requireRole('trainer', 'owner')

      secured.get('/me/check-ins', async (request) => {
        const auth = getAuth(request)
        return getMyCheckIns(auth.db, auth.userId, store, today())
      })
      secured.put('/me/check-ins/current', async (request) => {
        const auth = getAuth(request)
        return saveMyCheckIn(auth.db, auth, checkInInputSchema.parse(request.body), store, today())
      })
      secured.put('/me/check-ins/:id/photos/:pose', async (request) => {
        const { id, pose } = photoParams.parse(request.params)
        if (!Buffer.isBuffer(request.body)) {
          throw new AppError(400, ErrorCode.BAD_PHOTO, 'Send the photo as a JPEG, PNG or WebP image.')
        }
        const auth = getAuth(request)
        return saveMyPhoto(auth.db, auth, id, pose, request.body, store, today())
      })

      secured.get('/members/:id/check-ins', { preHandler: coaches }, async (request) => {
        const { id } = idParams.parse(request.params)
        const auth = getAuth(request)
        return getMemberCheckIns(auth.db, auth, id, store)
      })
      secured.post('/check-ins/:id/review', { preHandler: coaches }, async (request) => {
        const { id } = idParams.parse(request.params)
        const { reply } = checkInReviewSchema.parse(request.body)
        const auth = getAuth(request)
        return reviewCheckIn(auth.db, auth, id, reply, store)
      })
      secured.get('/coach/check-ins', { preHandler: coaches }, async (request) => {
        const auth = getAuth(request)
        return checkInsToReview(auth.db, auth, store)
      })
    })
  }
}
