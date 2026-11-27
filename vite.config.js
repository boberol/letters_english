import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { VitePWA } from 'vite-plugin-pwa'

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
        description: 'A playful app that teaches children to write their letters.',
        lang: 'en',
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
export default defineConfig(config)
