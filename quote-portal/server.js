// Modular Express backend for Burkol Quote Portal
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
// Settings routes (quotes system) are disabled to avoid Firestore bootstrap
import { setupMaterialsRoutes } from './server/materialsRoutes.js'
import { ordersRoutes } from './server/ordersRoutes.js'
import {
    getAllSuppliers,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    getSuppliersByCategory,
    addMaterialToSupplier,
    getSuppliersForMaterial,
    getMaterialsForSupplier
} from './server/suppliersRoutes.js';
import {
    getMaterialCategories,
    createMaterialCategory,
    updateMaterialCategory,
    deleteMaterialCategory,
    getMaterialCategoryUsage
} from './server/materialCategoriesRoutes.js';import { addMigrationRoutes } from './server/migrationRoutes.js'
import admin from 'firebase-admin'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Initialize Firebase Admin SDK if it hasn't been initialized yet
if (!admin.apps.length) {
  let credential;
  
  // Try to use environment variables first (recommended for production)
  if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
    console.log('🔑 Using Firebase credentials from environment variables')
    const serviceAccount = {
      type: process.env.FIREBASE_TYPE || "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: process.env.FIREBASE_AUTH_URI || "https://accounts.google.com/o/oauth2/auth",
      token_uri: process.env.FIREBASE_TOKEN_URI || "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
      universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN || "googleapis.com"
    }
    credential = admin.credential.cert(serviceAccount)
  } else {
    // Fallback to serviceAccountKey.json file (development only)
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json')
    if (existsSync(serviceAccountPath)) {
      console.log('🔑 Using Firebase credentials from serviceAccountKey.json')
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
      credential = admin.credential.cert(serviceAccount)
    } else {
      console.error('❌ Firebase credentials not found!')
      console.error('Please either:')
      console.error('1. Set environment variables (recommended for production)')
      console.error('2. Create serviceAccountKey.json file (development only)')
      process.exit(1)
    }
  }
  
  admin.initializeApp({
    credential: credential
  })
  console.log('🔥 Firebase Admin SDK initialized successfully')
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
    ? ['https://burkol.com', 'https://admin.burkol.com']
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:8080', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001']

  const origin = req.headers.origin

  // Only log CORS details when an Origin header is present
  if (origin) {
    if (allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin)
      if (process.env.CORS_LOG !== 'silent') console.log('✅ CORS allowed for:', origin)
    } else {
      // In dev, allow wildcard for non-allowlisted origins to ease local testing
      if (process.env.NODE_ENV !== 'production') {
        res.header('Access-Control-Allow-Origin', '*')
      }
      if (process.env.CORS_LOG !== 'silent') console.log('⚠️ CORS origin not in allowlist:', origin)
    }
  }

  // Security headers
  res.header('X-Content-Type-Options', 'nosniff')
  res.header('X-Frame-Options', 'DENY')
  res.header('X-XSS-Protection', '1; mode=block')
  res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')

  // CORS headers
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control')
  res.header('Access-Control-Max-Age', '86400')

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }

  next()
})

// Setup API routes
setupAuthRoutes(app)
// Optionally enable quote routes to avoid Firestore bootstrap on startup
try {
  if (process.env.QUOTES_ROUTES_ENABLED === 'true') {
    const apiRoutesMod = await import('./server/apiRoutes.js')
    apiRoutesMod.setupQuoteRoutes(app, uploadsDir)
    apiRoutesMod.setupExportRoutes(app)
    console.log('✅ Quote routes enabled')
  } else {
    console.log('⏭️  Quote routes disabled (set QUOTES_ROUTES_ENABLED=true to enable)')
  }
} catch (e) {
  console.warn('⚠️ Quote routes not initialized:', e?.message)
}

// Always expose minimal form configuration routes for user form
try {
  const apiRoutesMod = await import('./server/apiRoutes.js')
  apiRoutesMod.setupFormConfigRoutes(app)
  console.log('✅ Form config routes enabled')
} catch (e) {
  console.warn('⚠️ Form config routes not initialized:', e?.message)
}
setupMaterialsRoutes(app)
app.use('/api', ordersRoutes)
// Settings routes disabled

// Optionally enable migration routes (avoids Firestore-heavy bootstrap by default)
try {
  if (process.env.MIGRATION_ROUTES_ENABLED === 'true') {
    const jsondbMod = await import('./src/lib/jsondb.js')
    const jsondb = jsondbMod.default || jsondbMod
    addMigrationRoutes(app, jsondb)
    console.log('✅ Migration routes enabled')
  } else {
    console.log('⏭️  Migration routes disabled (set MIGRATION_ROUTES_ENABLED=true to enable)')
  }
} catch (e) {
  console.warn('⚠️ Migration routes not initialized:', e?.message)
}

// Setup suppliers routes
app.get('/api/suppliers', getAllSuppliers)
app.post('/api/suppliers', addSupplier)
app.patch('/api/suppliers/:id', updateSupplier)
app.delete('/api/suppliers/:id', deleteSupplier)
app.get('/api/suppliers/category/:category', getSuppliersByCategory)
app.post('/api/suppliers/:supplierId/materials', addMaterialToSupplier)
app.get('/api/materials/:materialId/suppliers', getSuppliersForMaterial)
app.get('/api/suppliers/:supplierId/materials', getMaterialsForSupplier)

// Setup material categories CRUD routes
app.get('/api/material-categories', getMaterialCategories)
app.post('/api/material-categories', createMaterialCategory)
app.put('/api/material-categories/:id', updateMaterialCategory)
app.delete('/api/material-categories/:id', deleteMaterialCategory)
app.get('/api/material-categories/:id/usage', getMaterialCategoryUsage)


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

// Production mode: Serve static files and SPA fallback
if (process.env.NODE_ENV !== 'development') {
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