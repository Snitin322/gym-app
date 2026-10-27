import { Logo, Screen } from './Screen'

export function SplashScreen() {
  return (
    <Screen centered>
      <div className="flex flex-col items-center gap-4" aria-busy="true" aria-label="Loading">
        <Logo />
        <p className="text-muted">Loading…</p>
      </div>
    </Screen>
  )
}
