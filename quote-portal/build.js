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
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir)
}

// Copy static files
const staticFiles = [
  'index.html',
  'panel-gizli.html', 
  'app.js',
  'i18n.js',
  'manifest.json',
  'sw.js'
]

staticFiles.forEach(file => {
  const src = path.join(__dirname, file)
  const dest = path.join(distDir, file)
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest)
    console.log(`Copied ${file}`)
  }
})

// Copy directories
const staticDirs = [
  'components',
  'hooks', 
  'i18n',
  'img',
  'lib',
  'styles',
  'performance'
]

staticDirs.forEach(dir => {
  const srcDir = path.join(__dirname, dir)
  const destDir = path.join(distDir, dir)
  if (fs.existsSync(srcDir)) {
    copyDir(srcDir, destDir)
    console.log(`Copied ${dir}/`)
  }
})

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true })
  
  for (let entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

console.log('Build completed for Vercel deployment!')