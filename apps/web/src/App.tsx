import { Navigate, Route, Routes } from 'react-router'
import { MANAGER_ROLES } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { RequireRole } from './auth/RequireRole'
import { MyAvailabilityPage, TrainerAvailabilityPage } from './pages/AvailabilityPage'
import { ConsentPage } from './pages/ConsentPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import {
  TrainerClientPage,
  TrainerClientsPage,
  TrainerProfilePage,
  TrainerSchedulePage,
} from './pages/trainer/TrainerApp'
import { MemberProfilePage, MemberPtPage, MemberWorkoutPage } from './pages/member/MemberTabs'
import { CheckInPage } from './pages/member/CheckInPage'
import { MyHealthPage } from './pages/member/MyHealthPage'
import { WelcomePage } from './pages/WelcomePage'
import { GymDetailsPage } from './pages/admin/GymDetailsPage'
import { DietPage, DietTemplatePage, FoodListPage, MemberDietPage } from './pages/admin/DietPages'
import { MemberHealthPage, MemberProgressPage } from './pages/admin/MemberHealthPage'
import { MemberPage } from './pages/admin/MemberPage'
import { MembersPage } from './pages/admin/MembersPage'
import { NewMemberPage } from './pages/admin/NewMemberPage'
import { PlansPage } from './pages/admin/PlansPage'
import { ExerciseLibraryPage } from './pages/admin/ExerciseLibraryPage'
import { WorkoutTemplatePage } from './pages/admin/WorkoutTemplatePage'
import { WorkoutsPage } from './pages/admin/WorkoutsPage'
import { LeadsPage } from './pages/admin/LeadsPage'
import { DeskMorePage, DeskPtPage } from './pages/desk/DeskApp'
import { StaffPage } from './pages/admin/StaffPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/consent" element={<ConsentPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route element={<RequireRole roles={['member']} />}>
          <Route path="/workout" element={<MemberWorkoutPage />} />
          <Route path="/pt" element={<MemberPtPage />} />
          <Route path="/profile" element={<MemberProfilePage />} />
          <Route path="/profile/health" element={<MyHealthPage />} />
          <Route path="/meals" element={<Navigate to="/workout?view=meals" replace />} />
          <Route path="/check-in" element={<CheckInPage />} />
        </Route>
        <Route path="/trainer" element={<RequireRole roles={['trainer']} />}>
          <Route path="availability" element={<MyAvailabilityPage />} />
          <Route path="clients" element={<TrainerClientsPage />} />
          <Route path="clients/:memberId" element={<TrainerClientPage />} />
          <Route path="clients/:memberId/workout" element={<TrainerClientPage />} />
          <Route path="schedule" element={<TrainerSchedulePage />} />
          <Route path="profile" element={<TrainerProfilePage />} />
        </Route>
        <Route path="/admin" element={<RequireRole roles={MANAGER_ROLES} />}>
          <Route path="members" element={<MembersPage />} />
          <Route path="members/new" element={<NewMemberPage />} />
          <Route path="members/:id" element={<MemberPage />} />
          <Route path="members/:id/health" element={<MemberHealthPage />} />
          <Route path="members/:id/diet" element={<MemberDietPage />} />
          <Route path="members/:id/progress" element={<MemberProgressPage />} />
          <Route path="diet" element={<DietPage />} />
          <Route path="diet/foods" element={<FoodListPage />} />
          <Route path="diet/templates/:id" element={<DietTemplatePage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="pt" element={<DeskPtPage />} />
          <Route path="pt-packages" element={<Navigate to="/admin/pt?view=packages" replace />} />
          <Route path="pt-disputes" element={<Navigate to="/admin/pt?view=resolve" replace />} />
          <Route path="more" element={<DeskMorePage />} />
          <Route path="leads" element={<LeadsPage />} />
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
