import { describe, expect, it } from 'vitest'
import { detectInstallPlatform } from './install'

const UA = {
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  ipadDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
}

describe('detectInstallPlatform', () => {
  it('reports installed when running standalone, whatever the device', () => {
    expect(detectInstallPlatform({ userAgent: UA.iphone, maxTouchPoints: 5, standalone: true })).toBe('installed')
    expect(detectInstallPlatform({ userAgent: UA.android, maxTouchPoints: 5, standalone: true })).toBe('installed')
  })

  it('detects iPhone', () => {
    expect(detectInstallPlatform({ userAgent: UA.iphone, maxTouchPoints: 5, standalone: false })).toBe('ios')
  })

  it('detects iPad that reports a Mac user agent', () => {
    expect(detectInstallPlatform({ userAgent: UA.ipadDesktopMode, maxTouchPoints: 5, standalone: false })).toBe('ios')
  })

  it('treats a real Mac (no touch) as other', () => {
    expect(detectInstallPlatform({ userAgent: UA.ipadDesktopMode, maxTouchPoints: 0, standalone: false })).toBe('other')
  })

  it('detects Android', () => {
    expect(detectInstallPlatform({ userAgent: UA.android, maxTouchPoints: 5, standalone: false })).toBe('android')
  })

  it('treats desktop browsers as other', () => {
    expect(detectInstallPlatform({ userAgent: UA.windows, maxTouchPoints: 0, standalone: false })).toBe('other')
  })
})
