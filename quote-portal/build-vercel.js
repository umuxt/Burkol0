#!/usr/bin/env node
// Advanced build script for Vercel deployment
// Bundles all components into single files for Vercel compatibility

const fs = require('fs')
const path = require('path')

console.log('Building optimized version for Vercel...')

// Create dist directory
const distDir = path.join(__dirname, 'dist')
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir)
}

// Read and bundle app.js with all components
function bundleComponents() {
  console.log('Bundling components...')
  
  // Read main app.js
  let appContent = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8')
  
  // Component files to inline
  const componentFiles = [
    'components/Field.js',
    'components/Modal.js', 
    'components/DynamicFormRenderer.js',
    'components/admin/Admin.js',
    'components/modals/SettingsModal.js',
    'components/modals/DetailModal.js',
    'components/modals/FilterPopup.js',
    'components/modals/FilesModal.js',
    'hooks/useNotifications.js',
    'i18n/index.js',
    'lib/api.js',
    'lib/utils.js'
  ]
  
  // Replace imports with inline content
  componentFiles.forEach(file => {
    const filePath = path.join(__dirname, file)
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8')
      
      // Remove export statements and make inline
      content = content.replace(/export\s+default\s+/g, '')
      content = content.replace(/export\s+\{[^}]+\}/g, '')
      content = content.replace(/export\s+/g, '')
      
      // Create component variable
      const componentName = path.basename(file, '.js')
      const importRegex = new RegExp(`import\\s+.*?from\\s+['"]\\.\\/.*?${file.replace(/\//g, '\\/')}['"]`, 'g')
      
      appContent = appContent.replace(importRegex, `// Inlined ${componentName}\n${content}`)
    }
  })
  
  // Remove other relative imports that don't exist in bundled version
  appContent = appContent.replace(/import\s+.*?from\s+['"]\.\/.*?['"];?\n/g, '')
  
  return appContent
}

// Bundle app.js
const bundledApp = bundleComponents()
fs.writeFileSync(path.join(distDir, 'app.js'), bundledApp)

// Copy other static files
const staticFiles = [
  'styles.css',
  'i18n.js'
]

staticFiles.forEach(file => {
  const src = path.join(__dirname, file)
  const dest = path.join(distDir, file)
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest)
    console.log(`Copied ${file}`)
  }
})

// Create simplified HTML files for Vercel
function createVercelHTML(template, outputName) {
  let content = fs.readFileSync(path.join(__dirname, template), 'utf8')
  
  // Use bundled app.js
  content = content.replace('./app.js', './app.js')
  
  fs.writeFileSync(path.join(distDir, outputName), content)
  console.log(`Created ${outputName}`)
}

createVercelHTML('index.html', 'index.html')
createVercelHTML('panel-gizli.html', 'panel-gizli.html')

// Copy img directory
const imgSrc = path.join(__dirname, 'img')
const imgDest = path.join(distDir, 'img')
if (fs.existsSync(imgSrc)) {
  copyDir(imgSrc, imgDest)
  console.log('Copied img/')
}

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

console.log('Vercel-optimized build completed!')