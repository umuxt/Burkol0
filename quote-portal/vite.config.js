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
      // Copy BurkolNavigation.js
      copyFileSync(
        resolve(__dirname, 'components/BurkolNavigation.js'),
        resolve(__dirname, 'dist/components/BurkolNavigation.js')
      )
      // Copy settings-app.js
      copyFileSync(
        resolve(__dirname, 'settings-app.js'),
        resolve(__dirname, 'dist/settings-app.js')
      )
      // Copy manifest.json if it exists
      const manifestPath = resolve(__dirname, 'manifest.json')
      if (existsSync(manifestPath)) {
        copyFileSync(manifestPath, resolve(__dirname, 'dist/manifest.json'))
      }
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), copyComponents()],
  server: {
    port: 3001,
    host: true, // Listen on all addresses
    hmr: {
      port: 3001,
      overlay: false // Disable error overlay for minor issues
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'quote-dashboard.html'),
        adminDashboard: resolve(__dirname, 'admin-dashboard.html'),
        materials: resolve(__dirname, 'materials.html'),
        production: resolve(__dirname, 'production.html'),
        settings: resolve(__dirname, 'settings.html')
      }
    }
  }
})
