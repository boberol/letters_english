import { defineConfig, loadEnv } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { VitePWA } from 'vite-plugin-pwa'
import process from 'node:process'
import { Buffer } from 'node:buffer'
import { webcrypto } from 'node:crypto'

// A customer build with no usable licence configuration still builds, still
// precaches, installs fine - and then shows every family "Aplikacja nie jest
// skonfigurowana" and accepts no code. The app fails closed at runtime on
// purpose (see src/utils/license.js), but a customer's tablet is the wrong place
// to find out. So `vite build` checks the two values it is about to bake in and
// refuses to produce something that cannot be activated.
//
// ALLOW_TEST_BUILD=1 turns the refusal into a warning, for a build that is not
// for customers: exercising the service worker locally, or pointing at a
// `wrangler dev` Worker. It is not VITE_-prefixed, so it never reaches the bundle.
const checkLicenceConfig = async (mode) => {
  // loadEnv also picks up VITE_* variables from the process environment, and
  // those win over .env - the same precedence the build itself uses.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const problems = []

  const url = env.VITE_ACTIVATION_URL || ''
  let parsed = null
  if (!url) {
    problems.push('VITE_ACTIVATION_URL is not set.')
  } else {
    try {
      parsed = new URL(url)
    } catch {
      problems.push(`VITE_ACTIVATION_URL is not a URL: ${url}`)
    }
  }
  if (parsed && /your-subdomain/i.test(parsed.hostname)) {
    problems.push('VITE_ACTIVATION_URL is still the placeholder from .env.example.')
  } else if (parsed && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(parsed.hostname)) {
    problems.push(`VITE_ACTIVATION_URL points at this machine (${parsed.host}) - a local test value.`)
  } else if (parsed && parsed.protocol !== 'https:') {
    // An installed app is served over https, and a browser blocks an https page
    // from calling plain http: every activation would fail as "offline".
    problems.push(`VITE_ACTIVATION_URL must be https, not ${parsed.protocol}`)
  }

  const key = env.VITE_LICENSE_PUBLIC_KEY || ''
  if (!key) {
    problems.push('VITE_LICENSE_PUBLIC_KEY is not set.')
  } else {
    // The same import the app does on every launch. A key that fails here fails
    // there too, and then no token - including a freshly issued one - verifies.
    try {
      await webcrypto.subtle.importKey(
        'spki',
        Buffer.from(key, 'base64'),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      )
    } catch {
      problems.push(
        'VITE_LICENSE_PUBLIC_KEY is not a P-256 public key - paste the whole line printed by `node license_keys.mjs`.'
      )
    }
  }

  if (!problems.length) return

  const details = problems.map((p) => `  - ${p}`).join('\n')
  if (process.env.ALLOW_TEST_BUILD === '1') {
    console.warn(`\nALLOW_TEST_BUILD=1: building anyway. This build is NOT for customers:\n${details}\n`)
    return
  }
  throw new Error(
    `\nRefusing to build: the licence configuration would ship an app no code can activate.\n${details}\n\n` +
      'Fix .env (see .env.example). For a local build that is not for customers, set ALLOW_TEST_BUILD=1.\n'
  )
}

const config = {
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    VitePWA({
      // The child cannot read, so there is no version prompt to show them and
      // nobody to dismiss it: a new build installs in the background and takes
      // over the next time the app is opened.
      registerType: 'autoUpdate',
      injectRegister: 'auto',

      workbox: {
        // Everything the app needs is a build artefact - the letter and picture
        // artwork is bundled, the sounds are synthesised - so precaching the
        // whole output is what makes it work with no network at all. The 197
        // word illustrations (webp) are most of it: about 3 MB of the 4 MB.
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        // The app never changes the URL (App.jsx pushes state with no path), so
        // this only matters if someone opens a stale bookmark or a deep link is
        // added later - but it costs nothing to be right about it.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true
      },

      // Not enabled in dev: the dev server would start serving a cached build
      // and edits would stop showing up until the cache was cleared by hand.
      devOptions: { enabled: false },

      manifest: {
        name: 'PlayGoo',
        short_name: 'PlayGoo',
        description: 'Interaktywna aplikacja do nauki pisania liter dla dzieci.',
        lang: 'pl',
        // Pinned so the installed app keeps its identity if start_url ever
        // changes; without it the browser derives one from start_url.
        id: '/',
        start_url: '/',
        scope: '/',
        // Opening the app again (a second click on the desktop icon by a
        // teacher at the board) brings the open window forward instead of
        // starting a second copy beside it.
        launch_handler: { client_mode: 'focus-existing' },
        // Standalone rather than fullscreen: the child needs the system back
        // gesture, which App.jsx already maps onto stepping back a screen.
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#f8fafc',
        categories: ['education', 'kids'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Kept separate from the "any" icons on purpose - a maskable icon is
          // drawn full bleed and gets cropped to the launcher's shape, so
          // listing one file as both would either crop the mark or leave the
          // rounded corners of the other floating inside a circle.
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
}

// https://vite.dev/config/
export default defineConfig(async ({ command, mode }) => {
  if (command === 'build') await checkLicenceConfig(mode)
  return config
})
