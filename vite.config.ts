import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { GET as apiHandler } from './api/[action].ts'

/** Lokalnie obsługuje /api/* tą samą funkcją, która na Vercelu działa jako serverless. */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const request = new Request(`http://localhost${req.url}`, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
        })
        const response = await apiHandler(request)
        res.statusCode = response.status
        response.headers.forEach((v, k) => res.setHeader(k, v))
        res.end(Buffer.from(await response.arrayBuffer()))
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    devApi(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Przepiśnik',
        short_name: 'Przepiśnik',
        description: 'Twoje przepisy z TikToka, Instagrama i nie tylko – w jednym miejscu, z kaloriami i makro.',
        lang: 'pl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FBF7F1',
        theme_color: '#FBF7F1',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Pozwala wybrać Przepiśnik w menu „Udostępnij” (Android, po zainstalowaniu).
        share_target: {
          action: '/udostepnij',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Biblioteki do OCR i transkrypcji ładowane są na żądanie – nie trzymamy ich w cache instalacji.
        globIgnores: ['**/transformers*.js', '**/ort*.js', '**/tesseract*.js', '**/whisper*.js'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  worker: { format: 'es' },
})
