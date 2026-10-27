import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  AvailabilityInput,
  PtRules,
  PtSessionView,
  PtSlotsResponse,
  TimeOffResult,
  TrainerAvailabilityView,
} from '@onthec/shared'
import { api } from './client'
import { queryKeys } from './admin'

export const bookingKeys = {
  slots: (purchaseId: string) => ['pt-slots', purchaseId] as const,
  mySessions: ['pt-sessions', 'me'] as const,
  memberSessions: (memberId: string) => ['pt-sessions', 'member', memberId] as const,
  trainerSessions: (trainerId: string) => ['pt-sessions', 'trainer', trainerId] as const,
  availability: (trainerId: string) => ['trainer-availability', trainerId] as const,
  rules: ['pt-rules'] as const,
}

/** A booking changed: refresh every session list, open slots and the "booked" counts on PT cards. */
function refreshBookings(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['pt-sessions'] }),
    client.invalidateQueries({ queryKey: ['pt-slots'] }),
    client.invalidateQueries({ queryKey: queryKeys.myPt }),
    client.invalidateQueries({ queryKey: ['member'] }),
    client.invalidateQueries({ queryKey: queryKeys.trainerClients }),
  ])
}

// --- Sessions --------------------------------------------------------------------

export function usePtSlots(purchaseId: string) {
  return useQuery({
    queryKey: bookingKeys.slots(purchaseId),
    queryFn: () => api<PtSlotsResponse>(`/pt-purchases/${purchaseId}/slots`),
    staleTime: 0,
  })
}

export function useMySessions(enabled = true) {
  return useQuery({
    queryKey: bookingKeys.mySessions,
    queryFn: () => api<PtSessionView[]>('/me/pt-sessions'),
    enabled,
  })
}

export function useMemberSessions(memberId: string) {
  return useQuery({
    queryKey: bookingKeys.memberSessions(memberId),
    queryFn: () => api<PtSessionView[]>(`/members/${memberId}/pt-sessions`),
  })
}

export function useTrainerSessions(trainerId: string) {
  return useQuery({
    queryKey: bookingKeys.trainerSessions(trainerId),
    queryFn: () => api<PtSessionView[]>(`/trainers/${trainerId}/sessions`),
  })
}

export function useBookSession() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ purchaseId, startsAt }: { purchaseId: string; startsAt: string }) =>
      api<PtSessionView>(`/pt-purchases/${purchaseId}/sessions`, { method: 'POST', body: { startsAt } }),
    onSuccess: () => refreshBookings(client),
  })
}

export function useCancelSession() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, reason }: { sessionId: string; reason?: string }) =>
      api<PtSessionView>(`/pt-sessions/${sessionId}/cancel`, { method: 'POST', body: reason ? { reason } : {} }),
    onSuccess: () => refreshBookings(client),
  })
}

export function useRescheduleSession() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, startsAt }: { sessionId: string; startsAt: string }) =>
      api<PtSessionView>(`/pt-sessions/${sessionId}/reschedule`, { method: 'POST', body: { startsAt } }),
    onSuccess: () => refreshBookings(client),
  })
}

// --- Trainer hours and time off ----------------------------------------------------

export function useAvailability(trainerId: string) {
  return useQuery({
    queryKey: bookingKeys.availability(trainerId),
    queryFn: () => api<TrainerAvailabilityView>(`/trainers/${trainerId}/availability`),
  })
}

export function useSaveAvailability(trainerId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: AvailabilityInput) =>
      api<TrainerAvailabilityView>(`/trainers/${trainerId}/availability`, { method: 'PUT', body: input }),
    onSuccess: async (view) => {
      client.setQueryData(bookingKeys.availability(trainerId), view)
      await client.invalidateQueries({ queryKey: ['pt-slots'] })
    },
  })
}

export function useAddTimeOff(trainerId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { startsAt: string; endsAt: string; reason?: string }) =>
      api<TimeOffResult>(`/trainers/${trainerId}/time-off`, { method: 'POST', body: input }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: bookingKeys.availability(trainerId) }),
        refreshBookings(client),
      ]),
  })
}

export function useRemoveTimeOff(trainerId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (timeOffId: string) => api<void>(`/trainers/${trainerId}/time-off/${timeOffId}`, { method: 'DELETE' }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: bookingKeys.availability(trainerId) }),
        client.invalidateQueries({ queryKey: ['pt-slots'] }),
      ]),
  })
}

// --- Gym rules -----------------------------------------------------------------------

export function usePtRules() {
  return useQuery({ queryKey: bookingKeys.rules, queryFn: () => api<PtRules>('/pt-rules') })
}

export function useSavePtRules() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<PtRules>) => api<PtRules>('/pt-rules', { method: 'PATCH', body: input }),
    onSuccess: (rules) => client.setQueryData(bookingKeys.rules, rules),
  })
}
