import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
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
