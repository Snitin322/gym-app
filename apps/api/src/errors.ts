import type { FastifyError, FastifyInstance } from 'fastify'
import { ZodError, z } from 'zod'
import { ErrorCode, type ApiErrorBody } from '@onthec/shared'

/** Throw from services for expected failures; the error handler turns it into the API error shape. */
export class AppError extends Error {
  readonly statusCode: number
  readonly code: ErrorCode

  constructor(statusCode: number, code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
  }
}

export function errorBody(code: ErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } }
}

export function registerErrorHandling(app: FastifyInstance) {
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send(errorBody(ErrorCode.NOT_FOUND, `Route ${request.method} ${request.url} not found`)),
  )

  app.setErrorHandler((error: Error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(errorBody(error.code, error.message))
    }
    if (error instanceof ZodError) {
      return reply.status(400).send(errorBody(ErrorCode.VALIDATION_ERROR, z.prettifyError(error)))
    }

    // Fastify's own client errors (bad JSON, payload too large, ...) carry a 4xx statusCode.
    const statusCode = (error as Partial<FastifyError>).statusCode ?? 500
    if (statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send(errorBody(ErrorCode.BAD_REQUEST, error.message))
    }

    request.log.error({ err: error }, 'Unhandled error')
    return reply.status(500).send(errorBody(ErrorCode.INTERNAL_ERROR, 'Something went wrong'))
  })
}
