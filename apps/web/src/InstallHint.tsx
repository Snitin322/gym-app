import { useMemo } from 'react'
import { currentDeviceInfo, detectInstallPlatform } from './install'
import { useInstallPrompt } from './useInstallPrompt'

function ShareIcon() {
  return (
    <svg className="inline-icon" viewBox="0 0 24 24" aria-hidden="true">
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

export function InstallHint() {
  const platform = useMemo(() => detectInstallPlatform(currentDeviceInfo()), [])
  const { canPrompt, installed, promptInstall } = useInstallPrompt()

  if (platform === 'installed' || installed) return null

  if (canPrompt) {
    return (
      <section className="install">
        <button type="button" className="install-button" onClick={promptInstall}>
          Install app
        </button>
        <p className="install-note">Adds Onthec Gym to your Home Screen.</p>
      </section>
    )
  }

  if (platform === 'ios') {
    return (
      <section className="install">
        <h2>Add to your Home Screen</h2>
        <ol>
          <li>
            Tap the Share button <ShareIcon /> in Safari
          </li>
          <li>
            Scroll down and tap <strong>Add to Home Screen</strong>
          </li>
          <li>
            Tap <strong>Add</strong>
          </li>
        </ol>
      </section>
    )
  }

  if (platform === 'android') {
    return (
      <section className="install">
        <h2>Add to your Home Screen</h2>
        <ol>
          <li>
            Tap the menu <strong>⋮</strong> in Chrome
          </li>
          <li>
            Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>
          </li>
        </ol>
      </section>
    )
  }

  return null
}
