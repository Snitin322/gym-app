import { ErrorCode, maskPhone } from '@onthec/shared'
import { AppError } from '../../errors'
import type { OtpSender } from './senders'

export interface WhatsAppConfig {
  phoneNumberId: string
  accessToken: string
  /** Name of an approved "Authentication" template with a copy-code button. */
  templateName: string
  languageCode: string
  apiVersion: string
}

const SEND_TIMEOUT_MS = 10_000

/**
 * Cloud API message for an authentication template. The code goes in twice: once for the
 * message body ("123456 is your verification code") and once for the "Copy code" button.
 */
export function buildOtpTemplateMessage(config: WhatsAppConfig, phone: string, code: string) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: config.templateName,
      language: { code: config.languageCode },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
      ],
    },
  }
}

function deliveryFailed(cause?: unknown) {
  return new AppError(
    502,
    ErrorCode.OTP_DELIVERY_FAILED,
    'We could not send your code on WhatsApp. Please try again in a minute.',
    { cause },
  )
}

/** Sends login codes through Meta's WhatsApp Cloud API. */
export function whatsappOtpSender(config: WhatsAppConfig, fetchImpl: typeof fetch = fetch): OtpSender {
  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`

  return {
    async send(phone, code, log) {
      let response: Response
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: { authorization: `Bearer ${config.accessToken}`, 'content-type': 'application/json' },
          body: JSON.stringify(buildOtpTemplateMessage(config, phone, code)),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        })
      } catch (error) {
        log.error({ err: error, phone: maskPhone(phone) }, 'WhatsApp login code: request failed')
        throw deliveryFailed(error)
      }

      if (!response.ok) {
        // Meta's error body explains the cause (expired token, number not in the test allow-list, ...).
        const detail = (await response.text().catch(() => '')).slice(0, 1000)
        log.error({ status: response.status, detail, phone: maskPhone(phone) }, 'WhatsApp login code: Meta rejected it')
        throw deliveryFailed()
      }

      log.info({ phone: maskPhone(phone) }, 'WhatsApp login code sent')
    },
  }
}
