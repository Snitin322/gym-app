import { Navigate, Outlet, useLocation } from 'react-router'
import { SplashScreen } from '../ui/SplashScreen'
import { useAuth } from './AuthContext'

/** Guards signed-in pages and sends users who haven't accepted the notice to /consent first. */
export function RequireAuth() {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status === 'loading') return <SplashScreen />
  if (state.status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />

  const onConsent = location.pathname === '/consent'
  if (state.user.consentRequired && !onConsent) return <Navigate to="/consent" replace />
  if (!state.user.consentRequired && onConsent) return <Navigate to="/home" replace />

  return <Outlet />
}
