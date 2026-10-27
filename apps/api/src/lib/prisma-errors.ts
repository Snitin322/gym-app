import { Prisma } from '@prisma/client'

/** True for a unique-constraint violation (e.g. a duplicate plan name or phone in the same gym). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}
