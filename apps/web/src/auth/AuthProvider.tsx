import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SessionResponse, SessionUser } from '@onthec/shared'
import { logout } from '../api/auth'
import { refreshSession, setAccessToken, setSessionListener } from '../api/client'
import { AuthContext, type AuthContextValue, type AuthState } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const queryClient = useQueryClient()

  useEffect(() => {
    setSessionListener((session) =>
      setState(session ? { status: 'authenticated', user: session.user } : { status: 'anonymous' }),
    )
    // Restore the login from the refresh cookie, so reopening the app keeps you signed in.
    refreshSession().catch(() => setState({ status: 'anonymous' }))
    return () => setSessionListener(null)
  }, [])

  const signIn = useCallback((session: SessionResponse) => {
    setAccessToken(session.accessToken)
    setState({ status: 'authenticated', user: session.user })
  }, [])

  const updateUser = useCallback((user: SessionUser) => {
    setState({ status: 'authenticated', user })
  }, [])

  const signOut = useCallback(async () => {
    try {
      await logout()
    } catch {
      // Even if the server can't be reached, forget the session on this device.
    } finally {
      setAccessToken(null)
      queryClient.clear()
      setState({ status: 'anonymous' })
    }
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({ state, signIn, updateUser, signOut }),
    [state, signIn, updateUser, signOut],
  )
  return <AuthContext value={value}>{children}</AuthContext>
}
