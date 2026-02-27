import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      }
    }
  },
  // Serve /blog/* as static HTML files in dev (mirrors Vercel's behaviour in prod)
  plugins: [
    react(),
    {
      name: 'serve-blog-static',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url.startsWith('/blog')) return next();
          const publicDir = path.resolve(__dirname, 'public');
          let filePath = path.join(publicDir, req.url.split('?')[0]);
          // Try exact file, then directory index
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.setHeader('Content-Type', 'text/html');
            res.end(fs.readFileSync(filePath));
          } else if (fs.existsSync(path.join(filePath, 'index.html'))) {
            res.setHeader('Content-Type', 'text/html');
            res.end(fs.readFileSync(path.join(filePath, 'index.html')));
          } else {
            next();
          }
        });
      }
    }
  ]
})
