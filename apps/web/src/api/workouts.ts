import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  SaveWorkoutDayInput,
  WorkoutCalendarWeek,
  MemberWorkoutPlan,
  MyWorkoutPlan,
  WorkoutExercise,
  WorkoutExerciseInput,
  WorkoutPlanInput,
  WorkoutPlanSummary,
  WorkoutPlanVersionView,
  WorkoutPlanView,
} from '@onthec/shared'
import { api } from './client'

export const workoutKeys = {
  exercises: (all: boolean) => ['workout-exercises', all] as const,
  templates: ['workout-templates'] as const,
  template: (id: string) => ['workout-templates', id] as const,
  versions: (id: string) => ['workout-templates', id, 'versions'] as const,
}

// --- Exercise library ----------------------------------------------------------------

export function useExercises(all = false) {
  return useQuery({
    queryKey: workoutKeys.exercises(all),
    queryFn: () => api<WorkoutExercise[]>(`/workout-exercises${all ? '?all=1' : ''}`),
  })
}

export function useSaveExercise() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: Partial<Omit<WorkoutExerciseInput, 'muscleGroup' | 'description' | 'videoUrl'>> & {
      id?: string
      muscleGroup?: string
      description?: string
      videoUrl?: string
      active?: boolean
    }) =>
      id
        ? api<WorkoutExercise>(`/workout-exercises/${id}`, { method: 'PATCH', body: input })
        : api<WorkoutExercise>('/workout-exercises', { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['workout-exercises'] }),
  })
}

export function useAddStarterExercises() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api<WorkoutExercise[]>('/workout-exercises/starter', { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['workout-exercises'] }),
  })
}

// --- Templates -------------------------------------------------------------------------

export function useWorkoutTemplates() {
  return useQuery({ queryKey: workoutKeys.templates, queryFn: () => api<WorkoutPlanSummary[]>('/workout-templates') })
}

export function useWorkoutTemplate(id: string | undefined) {
  return useQuery({
    queryKey: workoutKeys.template(id ?? ''),
    queryFn: () => api<WorkoutPlanView>(`/workout-templates/${id}`),
    enabled: Boolean(id),
  })
}

export function useTemplateVersions(id: string | undefined) {
  return useQuery({
    queryKey: workoutKeys.versions(id ?? ''),
    queryFn: () => api<WorkoutPlanVersionView[]>(`/workout-templates/${id}/versions`),
    enabled: Boolean(id),
  })
}

/** Creates a template (no id) or saves a new version of one (id + the version the editor started from). */
export function useSaveTemplate() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: WorkoutPlanInput & { id?: string; version?: number }) =>
      id
        ? api<WorkoutPlanView>(`/workout-templates/${id}`, { method: 'PUT', body: input })
        : api<WorkoutPlanView>('/workout-templates', { method: 'POST', body: input }),
    onSuccess: async (plan) => {
      client.setQueryData(workoutKeys.template(plan.id), plan)
      await client.invalidateQueries({ queryKey: workoutKeys.templates })
    },
  })
}

export function useDeleteTemplate() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/workout-templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: workoutKeys.templates }),
  })
}

// --- Members' own plans --------------------------------------------------------------

const memberPlanKey = (memberId: string) => ['member-workout-plan', memberId] as const

export function useMemberPlan(memberId: string) {
  return useQuery({
    queryKey: memberPlanKey(memberId),
    queryFn: () => api<MemberWorkoutPlan>(`/members/${memberId}/workout-plan`),
  })
}

export function useMemberPlanVersions(memberId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...memberPlanKey(memberId), 'versions'],
    queryFn: () => api<WorkoutPlanVersionView[]>(`/members/${memberId}/workout-plan/versions`),
    enabled,
  })
}

/** Gives the member a copy of a template (or a blank week); an existing plan moves to the history. */
export function useStartMemberPlan(memberId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (templateId: string | undefined) =>
      api<MemberWorkoutPlan>(`/members/${memberId}/workout-plan`, {
        method: 'POST',
        body: templateId ? { templateId } : {},
      }),
    onSuccess: async (data) => {
      client.setQueryData(memberPlanKey(memberId), data)
      await client.invalidateQueries({ queryKey: [...memberPlanKey(memberId), 'versions'] })
    },
  })
}

export function useSaveMemberPlan(memberId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: WorkoutPlanInput & { version: number }) =>
      api<MemberWorkoutPlan>(`/members/${memberId}/workout-plan`, { method: 'PUT', body: input }),
    onSuccess: async (data) => {
      client.setQueryData(memberPlanKey(memberId), data)
      await client.invalidateQueries({ queryKey: [...memberPlanKey(memberId), 'versions'] })
    },
  })
}

export function useMyWorkoutPlan() {
  return useQuery({ queryKey: ['me', 'workout-plan'], queryFn: () => api<MyWorkoutPlan>('/me/workout-plan') })
}

// --- Workout tracking (weekly calendar) ------------------------------------------------

const myWeekKey = (start: string) => ['me', 'workout-week', start] as const

export function useMyWorkoutWeek(start: string, enabled = true) {
  return useQuery({
    queryKey: myWeekKey(start),
    queryFn: () => api<WorkoutCalendarWeek>(`/me/workout-week?start=${start}`),
    enabled,
  })
}

export function useMemberWorkoutWeek(memberId: string, start: string) {
  return useQuery({
    queryKey: ['member-workout-week', memberId, start],
    queryFn: () => api<WorkoutCalendarWeek>(`/members/${memberId}/workout-week?start=${start}`),
  })
}

/** Ticks a day (done as planned, or updated). The answer is the refreshed week. */
export function useSaveWorkoutDay() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ date, ...input }: SaveWorkoutDayInput & { date: string }) =>
      api<WorkoutCalendarWeek>(`/me/workout-days/${date}`, { method: 'PUT', body: input }),
    onSuccess: async (week) => {
      client.setQueryData(myWeekKey(week.start), week)
      // "Last time" in later weeks may change too.
      await client.invalidateQueries({ queryKey: ['me', 'workout-week'] })
    },
  })
}
