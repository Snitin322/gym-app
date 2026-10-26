import { describe, expect, it, vi } from 'vitest'
import type { FastifyBaseLogger } from 'fastify'
import { AppError } from '../src/errors'
import { createOtpSender, consoleOtpSender } from '../src/services/auth/senders'
import { whatsappOtpSender, type WhatsAppConfig } from '../src/services/auth/whatsapp'
import { testEnv } from './helpers'

const config: WhatsAppConfig = {
  phoneNumberId: '1234567890',
  accessToken: 'EAAG-test-token',
  templateName: 'login_code',
  languageCode: 'en_US',
  apiVersion: 'v23.0',
}

function fakeLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger & {
    error: ReturnType<typeof vi.fn>
  }
}

describe('WhatsApp OTP sender', () => {
  it('posts the authentication template with the code in the body and the copy-code button', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] })))

    await whatsappOtpSender(config, fetchMock).send('+919876543210', '042917', fakeLog())

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://graph.facebook.com/v23.0/1234567890/messages')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ authorization: 'Bearer EAAG-test-token' })
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '919876543210',
      type: 'template',
      template: {
        name: 'login_code',
        language: { code: 'en_US' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: '042917' }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '042917' }] },
        ],
      },
    })
  })

  it('turns a Meta error into OTP_DELIVERY_FAILED and logs the reason without the token', async () => {
    const metaError = { error: { message: 'Recipient phone number not in allowed list', code: 131030 } }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(metaError), { status: 400 }))
    const log = fakeLog()

    const sending = whatsappOtpSender(config, fetchMock).send('+919876543210', '042917', log)

    await expect(sending).rejects.toBeInstanceOf(AppError)
    await expect(sending).rejects.toMatchObject({ statusCode: 502, code: 'OTP_DELIVERY_FAILED' })
    const logged = JSON.stringify(log.error.mock.calls)
    expect(logged).toContain('not in allowed list')
    expect(logged).toContain('+91******3210')
    expect(logged).not.toContain('EAAG-test-token')
    expect(logged).not.toContain('9876543210')
  })

  it('turns network failures and timeouts into OTP_DELIVERY_FAILED', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })

    await expect(whatsappOtpSender(config, fetchMock).send('+919876543210', '042917', fakeLog())).rejects.toMatchObject(
      { code: 'OTP_DELIVERY_FAILED' },
    )
  })
})

describe('createOtpSender', () => {
  it('uses the console sender by default', () => {
    expect(createOtpSender(testEnv())).toBe(consoleOtpSender)
  })

  it('uses WhatsApp when configured', () => {
    const sender = createOtpSender(
      testEnv({ OTP_PROVIDER: 'whatsapp', WHATSAPP_PHONE_NUMBER_ID: '123', WHATSAPP_ACCESS_TOKEN: 'token' }),
    )
    expect(sender).not.toBe(consoleOtpSender)
  })
})
