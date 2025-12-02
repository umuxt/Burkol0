// Modular Express backend for BeePlan WebApp
// - Authentication and session management
// - File upload handling
// - Price calculation with comprehensive formulas
// - Organized API routes

import express from 'express'
import path from 'path'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import mime from 'mime-types'
import { setupAuthRoutes } from './server/authRoutes.js'
// Quotes routes - PostgreSQL migrated
import { setupCRMRoutes } from './domains/crm/api/index.js'
import { testConnection } from './db/connection.js'
import dotenv from 'dotenv'

// Domain routes - Modular architecture
import mesRoutes from './domains/production/api/index.js';
import materialsRoutes from './domains/materials/api/index.js';

// Load environment variables
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Test PostgreSQL connection on startup
console.log('🔌 Testing PostgreSQL connection...')
testConnection().then(success => {
  if (success) {
    console.log('✅ PostgreSQL connection successful')
  } else {
    console.error('❌ PostgreSQL connection failed - check your .env file')
    process.exit(1)
  }
}).catch(err => {
  console.error('❌ PostgreSQL connection error:', err.message)
  process.exit(1)
})

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
    ? ['https://beeplan.com', 'https://admin.beeplan.com']
    : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001']

  const origin = req.headers.origin

  // In development, always allow the requesting origin
  if (process.env.NODE_ENV !== 'production') {
    // Always set CORS headers in development
    const allowOrigin = origin || 'http://localhost:3000'
    res.header('Access-Control-Allow-Origin', allowOrigin)
    res.header('Access-Control-Allow-Credentials', 'true')
    if (origin && process.env.CORS_LOG !== 'silent') {
      console.log('🔓 CORS (dev mode) allowed for:', origin)
    }
  } else {
    // Production mode - strict origin checking
    if (origin && allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin)
      res.header('Access-Control-Allow-Credentials', 'true')
      if (process.env.CORS_LOG !== 'silent') console.log('✅ CORS allowed for:', origin)
    } else {
      if (process.env.CORS_LOG !== 'silent') console.log('❌ CORS blocked origin:', origin)
    }
  }

  // Security headers (relax DENY in development for iframe testing)
  res.header('X-Content-Type-Options', 'nosniff')
  res.header('X-Frame-Options', process.env.NODE_ENV === 'production' ? 'DENY' : 'SAMEORIGIN')
  res.header('X-XSS-Protection', '1; mode=block')
  if (process.env.NODE_ENV === 'production') {
    res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  // CORS headers
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, X-Requested-With')
  res.header('Access-Control-Max-Age', '86400')

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }

  next()
})

// Setup API routes
setupAuthRoutes(app)

// CRM routes - PostgreSQL (quotes, pricing, forms)
setupCRMRoutes(app)

// Materials domain routes (materials, orders, suppliers, categories)
app.use('/api', materialsRoutes)

// Production domain routes (MES, work orders, production)
app.use('/api/mes', mesRoutes);

// Settings routes (System config)
import settingsRoutes from './server/settingsRoutes.js'
app.use('/api/settings', settingsRoutes)


// Expose migration management API routes used by admin tooling
// (disabled by default above; enable with MIGRATION_ROUTES_ENABLED=true)

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

// Development mode: Serve static files too
app.use(express.static(ROOT))

// Serve specific HTML files directly
app.get('/admin-dashboard.html', (req, res) => {
  res.sendFile(path.join(ROOT, 'admin-dashboard.html'))
})

app.get('/quote-dashboard.html', (req, res) => {
  res.sendFile(path.join(ROOT, 'quote-dashboard.html'))
})

app.get('/materials.html', (req, res) => {
  res.sendFile(path.join(ROOT, 'materials.html'))
})

app.get('/production.html', (req, res) => {
  res.sendFile(path.join(ROOT, 'production.html'))
})

app.get('/settings.html', (req, res) => {
  res.sendFile(path.join(ROOT, 'settings.html'))
})

// Production mode: Serve static files and SPA fallback
if (process.env.NODE_ENV !== 'development') {
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
      return res.status(404).json({ error: 'Not found' })
    }
    // Check if it's an HTML file that exists
    if (req.path.endsWith('.html')) {
      const filePath = path.join(ROOT, req.path)
      if (existsSync(filePath)) {
        return res.sendFile(filePath)
      }
    }
    res.sendFile(path.join(ROOT, 'index.html'))
  })
}

// Development mode: Frontend is handled by Vite on port 3001

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 BeePlan WebApp running on port ${PORT}`)
  console.log(`📁 Uploads directory: ${uploadsDir}`)
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`)
})
