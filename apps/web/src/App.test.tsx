// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import App from './App'
import { AppProviders } from './AppProviders'
import { setAccessToken } from './api/client'
import { mockApi, ok, session, sessionUser, unauthenticated } from './test/mockApi'

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders>
        <App />
      </AppProviders>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  setAccessToken(null)
  // jsdom has no matchMedia; the install hint uses it.
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function enterPhone(user: ReturnType<typeof userEvent.setup>, phone = '98765 43210') {
  await user.type(await screen.findByLabelText('Mobile number'), phone)
  await user.click(screen.getByRole('button', { name: 'Send code' }))
}

describe('signed out', () => {
  it('shows the welcome page with a Log in link', async () => {
    mockApi({ 'POST /auth/refresh': unauthenticated })
    renderApp('/')

    expect(await screen.findByRole('heading', { name: /Welcome to Onthec Gym/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Log in' }).getAttribute('href')).toBe('/login')
  })

  it('sends visitors of signed-in pages to the login page', async () => {
    mockApi({ 'POST /auth/refresh': unauthenticated })
    renderApp('/home')

    expect(await screen.findByLabelText('Mobile number')).toBeTruthy()
  })
})

describe('logging in', () => {
  it('logs in with phone and WhatsApp code, then asks for consent before home', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': unauthenticated,
      'POST /auth/otp/request': ok({ expiresInSeconds: 300, channel: 'whatsapp' }),
      'POST /auth/otp/verify': ok({ status: 'authenticated', ...session(sessionUser({ consentRequired: true })) }),
      'POST /me/consent': ok(sessionUser({ consentRequired: false })),
    })
    const user = userEvent.setup()
    renderApp('/login')

    await enterPhone(user)
    expect(callsTo('POST /auth/otp/request')[0]?.body).toEqual({ phone: '+919876543210' })
    expect(await screen.findByText(/WhatsApp/)).toBeTruthy()
    expect(screen.getByText('+91 98765 43210')).toBeTruthy()

    // Typing the 6th digit submits on its own (as with autofill).
    await user.type(screen.getByLabelText('6-digit code'), '123456')
    expect(callsTo('POST /auth/otp/verify')[0]?.body).toEqual({ phone: '+919876543210', code: '123456' })

    expect(await screen.findByRole('heading', { name: 'Before you start' })).toBeTruthy()
    const agree = screen.getByRole('button', { name: 'Agree and continue' })
    expect(agree.hasAttribute('disabled')).toBe(true)

    await user.click(screen.getByRole('checkbox'))
    await user.click(agree)

    expect(await screen.findByRole('heading', { name: 'Hi Asha' })).toBeTruthy()
    expect(callsTo('POST /me/consent')[0]?.headers.get('authorization')).toBe('Bearer access-1')
  })

  it('rejects an invalid number without calling the API', async () => {
    const { callsTo } = mockApi({ 'POST /auth/refresh': unauthenticated })
    const user = userEvent.setup()
    renderApp('/login')

    await enterPhone(user, '12345')

    expect((await screen.findByRole('alert')).textContent).toMatch(/valid 10-digit/)
    expect(callsTo('POST /auth/otp/request')).toHaveLength(0)
  })

  it("shows the API's message for an unregistered number", async () => {
    mockApi({
      'POST /auth/refresh': unauthenticated,
      'POST /auth/otp/request': {
        status: 404,
        body: { error: { code: 'ACCOUNT_NOT_FOUND', message: 'This number is not registered with the gym.' } },
      },
    })
    const user = userEvent.setup()
    renderApp('/login')

    await enterPhone(user)

    expect((await screen.findByRole('alert')).textContent).toBe('This number is not registered with the gym.')
  })

  it('shows a wrong code error and clears the code', async () => {
    mockApi({
      'POST /auth/refresh': unauthenticated,
      'POST /auth/otp/request': ok({ expiresInSeconds: 300, channel: 'console' }),
      'POST /auth/otp/verify': {
        status: 400,
        body: { error: { code: 'OTP_INVALID', message: 'That code is not correct.' } },
      },
    })
    const user = userEvent.setup()
    renderApp('/login')

    await enterPhone(user)
    expect(await screen.findByText(/Development mode/)).toBeTruthy()
    await user.type(screen.getByLabelText('6-digit code'), '000000')

    expect((await screen.findByRole('alert')).textContent).toBe('That code is not correct.')
    expect((screen.getByLabelText('6-digit code') as HTMLInputElement).value).toBe('')
  })

  it('lets a number registered at two gyms choose one', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': unauthenticated,
      'POST /auth/otp/request': ok({ expiresInSeconds: 300, channel: 'whatsapp' }),
      'POST /auth/otp/verify': ok({
        status: 'select_gym',
        selectionToken: 'select-1',
        gyms: [
          { id: 'gym-1', name: 'Onthec Gym' },
          { id: 'gym-2', name: 'Beta Gym' },
        ],
      }),
      'POST /auth/select-gym': ok(session(sessionUser({ role: 'trainer', gym: { id: 'gym-2', name: 'Beta Gym' } }))),
    })
    const user = userEvent.setup()
    renderApp('/login')

    await enterPhone(user)
    await user.type(await screen.findByLabelText('6-digit code'), '123456')
    await user.click(await screen.findByRole('button', { name: 'Beta Gym' }))

    expect(callsTo('POST /auth/select-gym')[0]?.body).toEqual({ selectionToken: 'select-1', gymId: 'gym-2' })
    expect(await screen.findByRole('heading', { name: 'Hi Asha' })).toBeTruthy()
    expect(screen.getByText(/trainer at Beta Gym/)).toBeTruthy()
  })
})

describe('signed in', () => {
  it('restores the login on reload, and logs out', async () => {
    const { callsTo } = mockApi({
      'POST /auth/refresh': ok(session(sessionUser({ role: 'owner', name: 'Nitin Sharma' }))),
      'POST /auth/logout': { status: 204 },
    })
    const user = userEvent.setup()
    renderApp('/')

    expect(await screen.findByRole('heading', { name: 'Hi Nitin' })).toBeTruthy()
    expect(screen.getByText(/owner at Onthec Gym/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    // Signed-out users on a signed-in page land on the login screen.
    expect(await screen.findByLabelText('Mobile number')).toBeTruthy()
    expect(callsTo('POST /auth/logout')).toHaveLength(1)
  })
})
