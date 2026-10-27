import { createContext, useContext } from 'react'
import type { SessionResponse, SessionUser } from '@onthec/shared'

export type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: SessionUser }

export interface AuthContextValue {
  state: AuthState
  /** Stores a session returned by OTP verify / gym selection. */
  signIn(session: SessionResponse): void
  /** Replaces the cached user, e.g. after accepting consent. */
  updateUser(user: SessionUser): void
  signOut(): Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

/** The signed-in user, for pages behind <RequireAuth>. */
export function useSignedInUser(): SessionUser {
  const { state } = useAuth()
  if (state.status !== 'authenticated') throw new Error('useSignedInUser must be used behind <RequireAuth>')
  return state.user
}

/** Where a signed-in user belongs: the consent screen until they accept, then home. */
export function homePathFor(user: SessionUser) {
  return user.consentRequired ? '/consent' : '/home'
}
