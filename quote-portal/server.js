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
import { setupQuoteRoutes, setupSettingsRoutes, setupExportRoutes } from './server/apiRoutes.js'
import { setupMaterialsRoutes } from './server/materialsRoutes.js'
import { getAllSuppliers, addSupplier, updateSupplier, deleteSupplier, getSuppliersByCategory, getSupplierCategories, addMaterialToSupplier, getSuppliersForMaterial, getMaterialsForSupplier } from './server/suppliersRoutes.js'
import addMigrationRoutes from './server/migrationRoutes.js'
import jsondb from './src/lib/jsondb.js'
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
    ? ['https://burkol.com', 'https://admin.burkol.com', `http://${req.get('host')}`, '*'] 
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:8080', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', req.headers.origin || 'http://localhost:3001']

  const origin = req.headers.origin
  console.log('🌐 CORS check:', { origin, allowedOrigins })
  
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin)
    console.log('✅ CORS allowed for:', origin)
  } else {
    res.header('Access-Control-Allow-Origin', '*')
    console.log('🔓 CORS wildcard allowed for:', origin)
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
setupMaterialsRoutes(app)
setupSettingsRoutes(app)
setupExportRoutes(app)

// Setup suppliers routes
app.get('/api/suppliers', getAllSuppliers)
app.post('/api/suppliers', addSupplier)
app.patch('/api/suppliers/:id', updateSupplier)
app.delete('/api/suppliers/:id', deleteSupplier)
app.get('/api/suppliers/category/:category', getSuppliersByCategory)
app.get('/api/supplier-categories', getSupplierCategories)
app.post('/api/suppliers/:supplierId/materials', addMaterialToSupplier)
app.get('/api/materials/:materialId/suppliers', getSuppliersForMaterial)
app.get('/api/suppliers/:supplierId/materials', getMaterialsForSupplier)

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
