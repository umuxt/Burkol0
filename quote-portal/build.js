#!/usr/bin/env node
// Build script for Vercel deployment
// Creates static version of the app for frontend deployment

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Create dist directory
const distDir = path.join(__dirname, 'dist')
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true })
}
fs.mkdirSync(distDir)

// Copy static files - COMPLETE LIST
const staticFiles = [
  'index.html',
  'quote-dashboard.html',
  'settings.html',
  'app.js',
  'shared/i18n.js',
  'settings-app.js',
  'manifest.json',
  'sw.js'
]

console.log('🔄 Starting build process...\n')

staticFiles.forEach(file => {
  const src = path.join(__dirname, file)
  const dest = path.join(distDir, file)
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest)
    console.log(`✅ Copied ${file}`)
  } else {
    console.log(`❌ Missing ${file}`)
  }
})

// Copy directories - COMPLETE LIST
const staticDirs = [
  'components',
  'hooks', 
  'i18n',
  'img',
  'lib',
  'styles',
  'performance',
  'server'
]

console.log('\n📁 Copying directories...\n')

// Recursive directory copy function
function copyDirectoryRecursive(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true })
  
  entries.forEach(entry => {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    
    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true })
      }
      copyDirectoryRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  })
}

staticDirs.forEach(dir => {
  const srcDir = path.join(__dirname, dir)
  const destDir = path.join(distDir, dir)
  
  if (fs.existsSync(srcDir)) {
    // Create destination directory
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }
    
    // Copy directory contents recursively
    copyDirectoryRecursive(srcDir, destDir)
    console.log(`✅ Copied directory: ${dir}/`)
  } else {
    console.log(`❌ Missing directory: ${dir}/`)
  }
})

// Verify critical files exist in dist
console.log('\n🔍 Verifying build...\n')

const criticalFiles = [
  'index.html',
  'quote-dashboard.html', 
  'settings.html',
  'app.js',
  'settings-app.js',
  'domains/admin/components/Admin.js',
  'shared/lib/api.js'
]

let allGood = true
criticalFiles.forEach(file => {
  const filePath = path.join(distDir, file)
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath)
    console.log(`✅ ${file} (${Math.round(stats.size / 1024)}KB)`)
  } else {
    console.log(`❌ MISSING: ${file}`)
    allGood = false
  }
})

console.log('\n' + '='.repeat(50))
if (allGood) {
  console.log('🎉 Build completed successfully for Vercel deployment!')
} else {
  console.log('💥 Build completed with ERRORS! Check missing files above.')
  process.exit(1)
}
console.log('='.repeat(50))