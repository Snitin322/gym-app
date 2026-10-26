import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Background used to pad the maskable (Android) and Apple icons, matching the logo tile.
const background = '#0b0f19'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // The logo already sits on its own tile with the ring inside the maskable safe zone,
    // so only a little padding is needed.
    maskable: { ...minimal2023Preset.maskable, padding: 0.1, resizeOptions: { background } },
    apple: { ...minimal2023Preset.apple, padding: 0.1, resizeOptions: { background } },
  },
  images: ['public/logo.svg'],
})
