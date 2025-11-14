import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync } from 'fs'

// Custom plugin to copy components
const copyComponents = () => {
  return {
    name: 'copy-components',
    generateBundle() {
      const componentsDir = resolve(__dirname, 'dist/components')
      if (!existsSync(componentsDir)) {
        mkdirSync(componentsDir, { recursive: true })
      }
      
      // Copy components
      const componentFiles = ['BurkolNavigation.js', 'AuthGuard.js']
      componentFiles.forEach(file => {
        const sourcePath = resolve(__dirname, `components/${file}`)
        if (existsSync(sourcePath)) {
          copyFileSync(sourcePath, resolve(__dirname, `dist/components/${file}`))
        }
      })
      
      // Copy essential JS files
      const jsFiles = [
        'domains/admin/settings-app.js',
        'public/sw.js'
      ]
      
      jsFiles.forEach(file => {
        const sourcePath = resolve(__dirname, file)
        if (existsSync(sourcePath)) {
          copyFileSync(sourcePath, resolve(__dirname, `dist/${file}`))
        }
      })
      
      // Copy manifest.json if it exists
      const manifestPath = resolve(__dirname, 'config/manifest.json')
      if (existsSync(manifestPath)) {
        copyFileSync(manifestPath, resolve(__dirname, 'dist/manifest.json'))
      }
      
      // Copy img directory
      const imgSourceDir = resolve(__dirname, 'img')
      const imgDestDir = resolve(__dirname, 'dist/img')
      if (existsSync(imgSourceDir)) {
        if (!existsSync(imgDestDir)) {
          mkdirSync(imgDestDir, { recursive: true })
        }
        const imgFiles = ['filter-icon.png', 'info.png']
        imgFiles.forEach(file => {
          const sourcePath = resolve(imgSourceDir, file)
          if (existsSync(sourcePath)) {
            copyFileSync(sourcePath, resolve(imgDestDir, file))
          }
        })
      }
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), copyComponents()],
  server: {
    port: 3001,
    host: 'localhost', // Listen only on localhost for faster startup
    hmr: {
      port: 3001,
      overlay: true // Enable error overlay to see issues
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      }
    },
    // Multi-page application HTML routing
    middlewareMode: false,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Handle direct HTML page requests
        if (req.url && req.url.endsWith('.html') && !req.url.includes('/@') && !req.url.includes('vite')) {
          let htmlPath = req.url;
          
          // Map root-level HTML requests to pages directory
          if (!req.url.startsWith('/pages/')) {
            const pageMap = {
              '/login.html': '/pages/login.html',
              '/admin-dashboard.html': '/pages/admin-dashboard.html',
              '/quote-dashboard.html': '/pages/quote-dashboard.html',
              '/materials.html': '/pages/materials.html',
              '/production.html': '/pages/production.html',
              '/settings.html': '/pages/settings.html'
            };
            
            htmlPath = pageMap[req.url] || req.url;
          }
          
          console.log(`[VITE] HTML Request: ${req.url} → ${htmlPath}`);
          req.url = htmlPath;
        }
        next();
      });
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'pages/login.html'),
        admin: resolve(__dirname, 'pages/quote-dashboard.html'),
        adminDashboard: resolve(__dirname, 'pages/admin-dashboard.html'),
        materials: resolve(__dirname, 'pages/materials.html'),
        production: resolve(__dirname, 'pages/production.html'),
        settings: resolve(__dirname, 'pages/settings.html')
      }
    }
  }
})
