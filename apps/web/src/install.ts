export type InstallPlatform = 'installed' | 'ios' | 'android' | 'other'

export interface DeviceInfo {
  userAgent: string
  maxTouchPoints: number
  /** True when the app is already running from the Home Screen. */
  standalone: boolean
}

/** Decides which "add to Home Screen" help to show on this device. */
export function detectInstallPlatform({ userAgent, maxTouchPoints, standalone }: DeviceInfo): InstallPlatform {
  if (standalone) return 'installed'
  // iPadOS 13+ reports a desktop Mac user agent, so fall back to touch support.
  const isIPadOS = /Macintosh/.test(userAgent) && maxTouchPoints > 1
  if (/iPhone|iPad|iPod/.test(userAgent) || isIPadOS) return 'ios'
  if (/Android/.test(userAgent)) return 'android'
  return 'other'
}

export function currentDeviceInfo(): DeviceInfo {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: iosStandalone || window.matchMedia('(display-mode: standalone)').matches,
  }
}
