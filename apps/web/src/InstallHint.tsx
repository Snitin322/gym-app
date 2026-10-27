import { useMemo, type ReactNode } from 'react'
import { currentDeviceInfo, detectInstallPlatform } from './install'
import { useInstallPrompt } from './useInstallPrompt'
import { Button } from './ui/Button'

function ShareIcon() {
  return (
    <svg className="inline size-[1.1em] align-[-0.2em] text-info" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5v10h14V11h-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Steps({ children }: { children: ReactNode }) {
  return (
    <section className="mt-2 w-full rounded-2xl bg-surface p-5 text-left">
      <h2 className="mb-2 font-semibold">Add to your Home Screen</h2>
      <ol className="list-decimal space-y-1.5 pl-5 text-muted [&_strong]:text-ink">{children}</ol>
    </section>
  )
}

export function InstallHint() {
  const platform = useMemo(() => detectInstallPlatform(currentDeviceInfo()), [])
  const { canPrompt, installed, promptInstall } = useInstallPrompt()

  if (platform === 'installed' || installed) return null

  if (canPrompt) {
    return (
      <section className="mt-2 w-full">
        <Button variant="secondary" onClick={promptInstall}>
          Install app
        </Button>
        <p className="mt-2 text-center text-sm text-muted">Adds Onthec Gym to your Home Screen.</p>
      </section>
    )
  }

  if (platform === 'ios') {
    return (
      <Steps>
        <li>
          Tap the Share button <ShareIcon /> in Safari
        </li>
        <li>
          Scroll down and tap <strong>Add to Home Screen</strong>
        </li>
        <li>
          Tap <strong>Add</strong>
        </li>
      </Steps>
    )
  }

  if (platform === 'android') {
    return (
      <Steps>
        <li>
          Tap the menu <strong>⋮</strong> in Chrome
        </li>
        <li>
          Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>
        </li>
      </Steps>
    )
  }

  return null
}
