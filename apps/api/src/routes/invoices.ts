import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from 'fastify'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { ErrorCode, type IsoDate } from '@onthec/shared'
import { AppError } from '../errors'
import { getAuth, requireRole } from '../plugins/auth'
import { renderInvoicePdf } from '../services/invoice-pdf'
import { issueInvoiceInTx } from '../services/invoices'

const idParams = z.object({ id: z.uuid() })

function notFound() {
  return new AppError(404, ErrorCode.NOT_FOUND, 'Invoice not found')
}

export function invoicesRoutes({
  authenticate,
  today,
}: {
  authenticate: preHandlerAsyncHookHandler
  today: () => IsoDate
}): FastifyPluginAsync {
  return async (app) => {
    app.addHook('preHandler', authenticate)

    /** The invoice PDF. Owners and admins can open any invoice of their gym; everyone else only their own. */
    app.get('/invoices/:id/pdf', async (request, reply) => {
      const { id } = idParams.parse(request.params)
      const auth = getAuth(request)
      const invoice = await auth.db.invoice.findUnique({
        where: { id },
        include: { member: { select: { userId: true } } },
      })
      const manager = auth.role === 'owner' || auth.role === 'admin'
      if (!invoice || (!manager && invoice.member.userId !== auth.userId)) throw notFound()

      const pdf = await renderInvoicePdf(invoice)
      return reply
        .header('content-type', 'application/pdf')
        .header('content-disposition', `attachment; filename="${invoice.number.replace(/\//g, '-')}.pdf"`)
        .header('cache-control', 'private, no-store')
        .send(pdf)
    })

    /** Issues the invoice for a paid payment that doesn't have one (payments from before invoices existed). */
    app.post('/payments/:id/invoice', { preHandler: requireRole('owner', 'admin') }, async (request, reply) => {
      const { id } = idParams.parse(request.params)
      const auth = getAuth(request)
      const invoice = await auth.db.$transaction(
        async (tx) => {
          const payment = await tx.payment.findUnique({ where: { id }, select: { id: true, status: true } })
          if (!payment || payment.status !== 'paid') {
            throw new AppError(404, ErrorCode.NOT_FOUND, 'Payment not found')
          }
          await issueInvoiceInTx(tx, auth.gymId, payment.id, today())
          return tx.invoice.findUniqueOrThrow({ where: { paymentId: payment.id }, select: { id: true, number: true } })
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      return reply.status(201).send(invoice)
    })
  }
}
