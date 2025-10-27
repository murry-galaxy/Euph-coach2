import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configure Vite for CodeSandbox/Netlify compatibility
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    hmr: {
      clientPort: 443,
      protocol: 'wss'
    }
  },
  preview: {
    host: true,
    port: 5173,
    strictPort: true
  }
})
