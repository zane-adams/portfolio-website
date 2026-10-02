import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Serve the trajectory lab demo (public/trajectory-lab/) at /trajectory-lab
// instead of falling back to the portfolio page. vercel.json does the same in production.
function trajectoryLab() {
  const rewrite = (req, res, next) => {
    if (req.url === '/trajectory-lab' || req.url === '/trajectory-lab/') {
      req.url = '/trajectory-lab/index.html'
    }
    next()
  }
  return {
    name: 'trajectory-lab',
    configureServer(server) {
      server.middlewares.use(rewrite)
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite)
    },
  }
}

export default defineConfig({
  plugins: [react(), trajectoryLab()],
  server: {
    port: 5173,
    open: true,
  },
})
