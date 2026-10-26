import type { FastifyBaseLogger } from 'fastify'
import { maskPhone } from '@onthec/shared'
import type { Env } from '../../env'
import { whatsappOtpSender } from './whatsapp'

export interface OtpSender {
  /** Delivers the code, or throws an AppError the user can understand. */
  send(phone: string, code: string, log: FastifyBaseLogger): Promise<void>
}

/** Development sender: writes the code to the server log instead of sending it. */
export const consoleOtpSender: OtpSender = {
  async send(phone, code, log) {
    log.warn(`[console OTP] Onthec Gym login code for ${maskPhone(phone)}: ${code}`)
  },
}

export function createOtpSender(env: Env): OtpSender {
  switch (env.OTP_PROVIDER) {
    case 'console':
      return consoleOtpSender
    case 'whatsapp':
      return whatsappOtpSender({
        // Presence is guaranteed by env validation when OTP_PROVIDER=whatsapp.
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID as string,
        accessToken: env.WHATSAPP_ACCESS_TOKEN as string,
        templateName: env.WHATSAPP_OTP_TEMPLATE,
        languageCode: env.WHATSAPP_TEMPLATE_LANGUAGE,
        apiVersion: env.WHATSAPP_API_VERSION,
      })
  }
}
