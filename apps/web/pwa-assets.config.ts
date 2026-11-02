import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Background used to pad the maskable (Android) and Apple icons, matching the logo tile.
const background = '#4a5141'

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // The logo is a square olive tile, so padding in the same olive keeps the wordmark clear of the mask.
    maskable: { ...minimal2023Preset.maskable, padding: 0.1, resizeOptions: { background } },
    apple: { ...minimal2023Preset.apple, padding: 0.1, resizeOptions: { background } },
  },
  images: ['public/logo.png'],
})
