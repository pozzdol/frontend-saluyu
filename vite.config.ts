import path from 'node:path'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    // Same origin for the browser: the SameSite=Strict refresh cookie works and Go needs no CORS.
    proxy: { '/api': 'http://localhost:12152' },
    // Quick Cloudflare tunnels (cloudflared tunnel --url) get a random *.trycloudflare.com name.
    allowedHosts: ['.trycloudflare.com'],
  },
})
