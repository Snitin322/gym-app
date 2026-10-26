import type { FastifyBaseLogger } from 'fastify'
import { maskPhone } from '@onthec/shared'

export interface OtpSender {
  send(phone: string, code: string, log: FastifyBaseLogger): Promise<void>
}

/**
 * Development sender: writes the code to the server log instead of sending an SMS.
 * Replaced by MSG91 once DLT registration is approved.
 */
export const consoleOtpSender: OtpSender = {
  async send(phone, code, log) {
    log.warn(`[console SMS] Onthec Gym login code for ${maskPhone(phone)}: ${code}`)
  },
}
