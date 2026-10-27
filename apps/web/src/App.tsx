import { Navigate, Route, Routes } from 'react-router'
import { MANAGER_ROLES } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { RequireRole } from './auth/RequireRole'
import { ConsentPage } from './pages/ConsentPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { WelcomePage } from './pages/WelcomePage'
import { GymDetailsPage } from './pages/admin/GymDetailsPage'
import { MemberPage } from './pages/admin/MemberPage'
import { MembersPage } from './pages/admin/MembersPage'
import { NewMemberPage } from './pages/admin/NewMemberPage'
import { PlansPage } from './pages/admin/PlansPage'
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
        <Route path="/admin" element={<RequireRole roles={MANAGER_ROLES} />}>
          <Route path="members" element={<MembersPage />} />
          <Route path="members/new" element={<NewMemberPage />} />
          <Route path="members/:id" element={<MemberPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="pt-packages" element={<PtPackagesPage />} />
          <Route path="staff" element={<StaffPage />} />
        </Route>
        <Route path="/admin" element={<RequireRole roles={['owner']} />}>
          <Route path="gym" element={<GymDetailsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
