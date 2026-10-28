import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LeadDuplicate, LeadFilter, LeadInput, LeadUpdate, LeadView } from '@onthec/shared'
import { api } from './client'

export function useLeads(filter: LeadFilter, q: string) {
  const params = new URLSearchParams({ filter, ...(q ? { q } : {}) })
  return useQuery({
    queryKey: ['leads', filter, q],
    queryFn: () => api<LeadView[]>(`/leads?${params}`),
    placeholderData: (previous) => previous,
  })
}

/** Members and enquiries that already have this number. */
export function checkLeadPhone(phone: string) {
  return api<{ duplicates: LeadDuplicate[] }>(`/leads/check-phone?${new URLSearchParams({ phone })}`)
}

/** Adds or updates a lead; refreshes the lists and the dashboard follow-ups. */
export function useSaveLead() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: (LeadInput | LeadUpdate) & { id?: string }) =>
      id
        ? api<LeadView>(`/leads/${id}`, { method: 'PATCH', body: input })
        : api<LeadView>('/leads', { method: 'POST', body: input }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['leads'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
      ]),
  })
}
