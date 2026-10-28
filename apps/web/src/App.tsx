import { Navigate, Route, Routes } from 'react-router'
import { MANAGER_ROLES } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { RequireRole } from './auth/RequireRole'
import { MyAvailabilityPage, TrainerAvailabilityPage } from './pages/AvailabilityPage'
import { ConsentPage } from './pages/ConsentPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { TrainerClientWorkoutPage } from './pages/TrainerClientWorkoutPage'
import { WelcomePage } from './pages/WelcomePage'
import { GymDetailsPage } from './pages/admin/GymDetailsPage'
import { MemberPage } from './pages/admin/MemberPage'
import { MembersPage } from './pages/admin/MembersPage'
import { NewMemberPage } from './pages/admin/NewMemberPage'
import { PlansPage } from './pages/admin/PlansPage'
import { ExerciseLibraryPage } from './pages/admin/ExerciseLibraryPage'
import { WorkoutTemplatePage } from './pages/admin/WorkoutTemplatePage'
import { WorkoutsPage } from './pages/admin/WorkoutsPage'
import { PtDisputesPage } from './pages/admin/PtDisputesPage'
import { PtPackagesPage } from './pages/admin/PtPackagesPage'
import { StaffPage } from './pages/admin/StaffPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/consent" element={<ConsentPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/trainer" element={<RequireRole roles={['trainer']} />}>
          <Route path="availability" element={<MyAvailabilityPage />} />
          <Route path="clients/:memberId/workout" element={<TrainerClientWorkoutPage />} />
        </Route>
        <Route path="/admin" element={<RequireRole roles={MANAGER_ROLES} />}>
          <Route path="members" element={<MembersPage />} />
          <Route path="members/new" element={<NewMemberPage />} />
          <Route path="members/:id" element={<MemberPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="pt-packages" element={<PtPackagesPage />} />
          <Route path="pt-disputes" element={<PtDisputesPage />} />
          <Route path="workouts" element={<WorkoutsPage />} />
          <Route path="workouts/exercises" element={<ExerciseLibraryPage />} />
          <Route path="workouts/templates/:id" element={<WorkoutTemplatePage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="trainers/:id/availability" element={<TrainerAvailabilityPage />} />
        </Route>
        <Route path="/admin" element={<RequireRole roles={['owner']} />}>
          <Route path="gym" element={<GymDetailsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
