import { InstallHint } from './InstallHint'

export default function App() {
  return (
    <main className="screen">
      <img className="logo" src="/logo.svg" alt="" width={112} height={112} />
      <h1>
        Welcome to <span className="brand">Onthec Gym</span>
      </h1>
      <p className="tagline">Your membership, PT sessions and check-ins — coming soon.</p>
      <InstallHint />
    </main>
  )
}
