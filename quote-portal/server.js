// Modular Express backend for Burkol Quote Portal
// - Authentication and session management
// - File upload handling
// - Price calculation with comprehensive formulas
// - Organized API routes

import express from 'express'
import path from 'path'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import mime from 'mime-types'
import { setupAuthRoutes } from './server/authRoutes.js'
import { setupQuoteRoutes, setupSettingsRoutes, setupExportRoutes } from './server/apiRoutes.js'
import addMigrationRoutes from './server/migrationRoutes.js'
import jsondb from './src/lib/jsondb.js'
import admin from 'firebase-admin'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json')
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))

// Initialize Firebase Admin SDK if it hasn't been initialized yet
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  })
}

// Configure JSX MIME type
mime.types['jsx'] = 'application/javascript'

const app = express()
const PORT = process.env.PORT || 3000
const ROOT = __dirname
const uploadsDir = path.join(ROOT, 'uploads')

// Middleware
app.use(express.json({ limit: '5mb' }))

// CORS configuration
app.use((req, res, next) => {
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? ['https://burkol.com', 'https://admin.burkol.com', `http://${req.get('host')}`, '*'] 
    : [req.headers.origin || 'http://localhost:3000']

  const origin = req.headers.origin
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin)
  } else {
    res.header('Access-Control-Allow-Origin', '*')
  }

  // Security headers
  res.header('X-Content-Type-Options', 'nosniff')
  res.header('X-Frame-Options', 'DENY')
  res.header('X-XSS-Protection', '1; mode=block')
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')

  // CORS headers
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.header('Access-Control-Max-Age', '86400')

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }
  
  next()
})

// Setup API routes
setupAuthRoutes(app)
setupQuoteRoutes(app, uploadsDir)
setupSettingsRoutes(app)
setupExportRoutes(app)

// Expose migration management API routes used by admin tooling
addMigrationRoutes(app, jsondb)

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir))

// Set proper MIME types for static files
app.use((req, res, next) => {
  const mimeType = mime.lookup(req.path)
  if (mimeType) {
    res.type(mimeType)
  }
  next()
})

// Production mode: Serve static files and SPA fallback
if (process.env.NODE_ENV !== 'development') {
  app.use(express.static(ROOT))
  
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      return res.status(404).json({ error: 'Not found' })
    }
    res.sendFile(path.join(ROOT, 'index.html'))
  })
}

// Development mode: Only serve API endpoints
// Frontend is handled by Vite on port 3001

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Burkol Quote Portal running on port ${PORT}`)
  console.log(`📁 Uploads directory: ${uploadsDir}`)
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`)
})
