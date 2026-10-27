import { Navigate, Outlet } from 'react-router'
import type { Role } from '@onthec/shared'
import { useSignedInUser } from './AuthContext'

/** Use inside <RequireAuth>. Sends users without one of these roles back to their home screen. */
export function RequireRole({ roles }: { roles: Role[] }) {
  const user = useSignedInUser()
  return roles.includes(user.role) ? <Outlet /> : <Navigate to="/home" replace />
}
