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
        'settings-app.js',
        'sw.js',
        'shared/i18n.js',
        'debug-console.js'
      ]
      
      jsFiles.forEach(file => {
        const sourcePath = resolve(__dirname, file)
        if (existsSync(sourcePath)) {
          copyFileSync(sourcePath, resolve(__dirname, `dist/${file}`))
        }
      })
      
      // Copy src files that might be needed
      const srcDir = resolve(__dirname, 'dist/src')
      if (!existsSync(srcDir)) {
        mkdirSync(srcDir, { recursive: true })
      }
      
      const srcFiles = ['shared/i18n.js']
      srcFiles.forEach(file => {
        const sourcePath = resolve(__dirname, file)
        if (existsSync(sourcePath)) {
          copyFileSync(sourcePath, resolve(__dirname, `dist/${file}`))
        }
      })
      
      // Copy manifest.json if it exists
      const manifestPath = resolve(__dirname, 'manifest.json')
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
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
        admin: resolve(__dirname, 'quote-dashboard.html'),
        adminDashboard: resolve(__dirname, 'admin-dashboard.html'),
        materials: resolve(__dirname, 'materials.html'),
        production: resolve(__dirname, 'production.html'),
        settings: resolve(__dirname, 'settings.html'),
        addRecordDebug: resolve(__dirname, 'add-record-debug.html'),
        inputTest: resolve(__dirname, 'input-test.html'),
        debugTest: resolve(__dirname, 'debug-test.html')
      }
    }
  }
})
