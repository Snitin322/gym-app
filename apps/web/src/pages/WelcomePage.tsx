import { Link, Navigate } from 'react-router'
import { homePathFor, useAuth } from '../auth/AuthContext'
import { InstallHint } from '../InstallHint'
import { Logo, Screen } from '../ui/Screen'
import { SplashScreen } from '../ui/SplashScreen'

export function WelcomePage() {
  const { state } = useAuth()

  if (state.status === 'loading') return <SplashScreen />
  if (state.status === 'authenticated') return <Navigate to={homePathFor(state.user)} replace />

  return (
    <Screen centered>
      <div className="flex flex-col items-center gap-4 text-center">
        <Logo size={112} />
        <h1 className="mt-2 text-[clamp(1.75rem,8vw,2.25rem)] leading-tight font-extrabold tracking-tight">
          Welcome to <span className="block text-accent">Onthec Gym</span>
        </h1>
        <p className="text-muted">Your membership, PT sessions and check-ins in one place.</p>
        <Link
          to="/login"
          className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-4 font-bold text-accent-ink"
        >
          Log in
        </Link>
        <InstallHint />
      </div>
    </Screen>
  )
}
