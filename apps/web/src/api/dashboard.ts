import { useQuery } from '@tanstack/react-query'
import type { DashboardView } from '@onthec/shared'
import { api } from './client'

/** The owner/admin dashboard (money taken is included for the owner only). */
export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => api<DashboardView>('/dashboard') })
}
