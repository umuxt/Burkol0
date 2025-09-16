// Minimal Express backend for Burkol Quote Portal
// - Persistent storage via JSON file (lib/jsondb.js)
// - TXT export endpoint

import express from 'express'
import path from 'path'
import fs from 'fs'
import fsp from 'fs/promises'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import jsondb from './lib/jsondb.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001
const ROOT = __dirname

// JSON storage file is managed by lib/jsondb (see BURKOL_DATA env)

app.use(express.json({ limit: '5mb' }))
// CORS configuration
app.use((req, res, next) => {
  // Allow all origins for now to support VPS access
  const allowedOrigins = process.env.NODE_ENV === 'production' 
    ? ['https://burkol.com', 'https://admin.burkol.com', `http://${req.get('host')}`, '*'] 
    : [req.headers.origin || 'http://localhost:3000']

  const origin = req.headers.origin
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin)
  } else {
    // Allow all origins for VPS access
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
  res.header('Access-Control-Max-Age', '86400') // 24 hours

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }
  next()
})
// Optional: serve static for direct access; harmless if unused
app.use(express.static(ROOT, {
  setHeaders: (res, path) => {
    // Force reload for JS modules after deployment
    if (path.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
    }
  }
}))
// Explicitly serve uploads for clarity
app.use('/uploads', express.static(path.join(ROOT, 'uploads')))

function readAll() {
  return jsondb.listQuotes()
}
function readOne(id) {
  return jsondb.getQuote(id)
}
function insertOne(obj) {
  jsondb.putQuote({ ...obj, createdAt: obj.createdAt || new Date().toISOString(), status: obj.status || 'new' })
}
function updateOne(id, patch) {
  return jsondb.patchQuote(id, patch)
}
function deleteOne(id) {
  jsondb.removeQuote(id)
}

// --- Auth helpers ---
const AUTH_SECRET = process.env.BURKOL_SECRET || 'dev-secret-change-me'
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('base64')
  const dk = crypto.scryptSync(String(password), Buffer.from(s, 'base64'), 64)
  return { salt: s, hash: dk.toString('base64') }
}
function createUser(email, password, role = 'admin') {
  const { salt, hash } = hashPassword(password)
  jsondb.upsertUser({ email, pw_salt: salt, pw_hash: hash, role, createdAt: new Date().toISOString() })
}
function verifyUser(email, password) {
  console.log('Debug - Login attempt:', { email, password: password.length + ' chars' })
  const rowRaw = jsondb.getUser(email)
  console.log('Debug - User from DB:', rowRaw ? 'found' : 'not found')
  const row = rowRaw ? { email: rowRaw.email, salt: rowRaw.pw_salt, hash: rowRaw.pw_hash, role: rowRaw.role } : null
  if (!row) {
    console.log('Debug - No user found for email:', email)
    return null
  }
  const { hash } = hashPassword(password, row.salt)
  console.log('Debug - Generated hash length:', hash.length)
  console.log('Debug - Stored hash length:', row.hash.length)
  console.log('Debug - Hashes match:', hash === row.hash)
  if (crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(row.hash))) {
    console.log('Debug - Login successful')
    return { email: row.email, role: row.role }
  }
  console.log('Debug - Login failed - password mismatch')
  return null
}
function newToken() { return crypto.randomBytes(32).toString('base64url') }
function createSession(email, days = 30) {
  const token = newToken()
  const now = new Date()
  const exp = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
  const sess = { token, email, createdAt: now.toISOString(), expiresAt: exp.toISOString() }
  jsondb.putSession(sess)
  return { token, email, expiresAt: sess.expiresAt }
}
function getSession(token) {
  if (!token) return null
  const row = jsondb.getSession(token)
  if (!row) return null
  if (new Date(row.expiresAt).getTime() < Date.now()) { jsondb.deleteSession(token); return null }
  return row
}
function deleteSession(token) { if (token) jsondb.deleteSession(token) }
function requireAuth(req, res, next) {
  const h = req.headers['authorization'] || ''
  const m = /^Bearer\s+(.+)$/.exec(h)
  const token = m ? m[1] : null
  const sess = getSession(token)
  if (!sess) return res.status(401).json({ error: 'unauthorized' })
  req.user = { email: sess.email }
  next()
}

// Seed initial admin user if not exists
(() => {
  const users = jsondb.listUsersRaw()
  const count = Array.isArray(users) ? users.length : 0
  if (count === 0) {
    createUser('umutyalcin8@gmail.com', '123456789', 'admin')
    console.log('Seeded default admin user: umutyalcin8@gmail.com / 123456789')
  }
})()

// --- File storage helpers (save data URLs to disk, store URL in DB) ---
const UPLOAD_DIR = path.join(ROOT, 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

// --- Pricing helper (server-side) ---
function calculatePriceServer(quote, settings) {
  try {
    const params = settings.parameters || []
    const paramValues = {}

    console.log('🔧 Price calculation DEBUG:')
    console.log('Quote data:', { id: quote.id, qty: quote.qty, material: quote.material })
    console.log('Settings parameters:', params)

    for (const param of params) {
      if (param.type === 'fixed') {
        paramValues[param.id] = parseFloat(param.value) || 0
        console.log(`Fixed param ${param.id} (${param.name}): ${paramValues[param.id]}`)
        continue
      }
      if (param.type === 'form') {
        let value = 0
        const field = param.formField
        console.log(`Processing form param ${param.id} (${param.name}) from field: ${field}`)
        
        if (field === 'qty') {
          value = parseFloat(quote.qty) || 0
          console.log(`  qty value: ${quote.qty} -> ${value}`)
        } else if (field === 'thickness') {
          value = parseFloat(quote.thickness) || 0
          console.log(`  thickness value: ${quote.thickness} -> ${value}`)
        } else if (field === 'dimensions') {
          // Prefer numeric dimsL x dimsW (area). Fallback to parsing dims string "LxW[xH]".
          const l = parseFloat(quote.dimsL)
          const w = parseFloat(quote.dimsW)
          if (!isNaN(l) && !isNaN(w)) {
            value = l * w
            console.log(`  dimensions from dimsL x dimsW: ${l} x ${w} = ${value}`)
          } else if (quote.dims) {
            const m = String(quote.dims).match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i)
            if (m) {
              value = (parseFloat(m[1]) || 0) * (parseFloat(m[2]) || 0)
              console.log(`  dimensions from dims string: ${quote.dims} -> ${value}`)
            }
          }
        } else {
          const fv = quote[field]
          console.log(`  field '${field}' raw value:`, fv)
          
          if (Array.isArray(fv)) {
            // Sum values from lookup table for each option in array fields (e.g. process)
            if (param.lookupTable && param.lookupTable.length) {
              value = fv.reduce((sum, opt) => {
                const found = param.lookupTable.find(r => r.option === opt)
                const optValue = found ? (parseFloat(found.value) || 0) : 0
                console.log(`    array option '${opt}' -> ${optValue}`)
                return sum + optValue
              }, 0)
              console.log(`  array field total: ${value}`)
            } else {
              value = fv.length || 0
              console.log(`  array length: ${value}`)
            }
          } else if (param.lookupTable && param.lookupTable.length) {
            const item = param.lookupTable.find(r => r.option === fv)
            value = item ? (parseFloat(item.value) || 0) : 0
            console.log(`  lookup for '${fv}': ${value}`)
            if (!item) {
              console.log(`  ⚠️  No lookup found for '${fv}' in:`, param.lookupTable.map(r => r.option))
            }
          } else {
            value = parseFloat(fv) || 0
            console.log(`  direct parse: ${value}`)
          }
        }
        paramValues[param.id] = value
        console.log(`Final param ${param.id}: ${value}`)
      }
    }

    console.log('All parameter values:', paramValues)

    let formula = String(settings.formula || '').replace(/^=/, '')
    console.log('Original formula:', settings.formula)
    console.log('Cleaned formula:', formula)
    
    Object.keys(paramValues).forEach(id => {
      const re = new RegExp(`\\b${id}\\b`, 'g')
      const oldFormula = formula
      formula = formula.replace(re, String(paramValues[id]))
      console.log(`Replace ${id} with ${paramValues[id]}: ${oldFormula} -> ${formula}`)
    })
    
    console.log('Final formula to evaluate:', formula)
    // Evaluate safely with comprehensive Excel/Math functions available
    const mathContext = {
      // Basic Math Functions
      SQRT: Math.sqrt,
      ROUND: Math.round,
      MAX: Math.max,
      MIN: Math.min,
      ABS: Math.abs,
      POWER: Math.pow,
      POW: Math.pow,
      EXP: Math.exp,
      LN: Math.log,
      LOG: Math.log10,
      LOG10: Math.log10,
      
      // Trigonometric Functions
      SIN: Math.sin,
      COS: Math.cos,
      TAN: Math.tan,
      ASIN: Math.asin,
      ACOS: Math.acos,
      ATAN: Math.atan,
      ATAN2: Math.atan2,
      
      // Rounding Functions
      CEILING: Math.ceil,
      CEIL: Math.ceil,
      FLOOR: Math.floor,
      TRUNC: Math.trunc,
      ROUNDUP: (num, digits = 0) => Math.ceil(num * Math.pow(10, digits)) / Math.pow(10, digits),
      ROUNDDOWN: (num, digits = 0) => Math.floor(num * Math.pow(10, digits)) / Math.pow(10, digits),
      
      // Statistical Functions
      AVERAGE: (...args) => args.reduce((a, b) => a + b, 0) / args.length,
      SUM: (...args) => args.reduce((a, b) => a + b, 0),
      COUNT: (...args) => args.filter(x => typeof x === 'number' && !isNaN(x)).length,
      COUNTA: (...args) => args.filter(x => x != null && x !== '').length,
      
      // Logical Functions
      IF: (condition, trueValue, falseValue) => condition ? trueValue : falseValue,
      AND: (...args) => args.every(arg => Boolean(arg)),
      OR: (...args) => args.some(arg => Boolean(arg)),
      NOT: (value) => !Boolean(value),
      
      // Text Functions
      LEN: (text) => String(text || '').length,
      LEFT: (text, num) => String(text || '').substring(0, num),
      RIGHT: (text, num) => String(text || '').substring(String(text || '').length - num),
      MID: (text, start, num) => String(text || '').substring(start - 1, start - 1 + num),
      UPPER: (text) => String(text || '').toUpperCase(),
      LOWER: (text) => String(text || '').toLowerCase(),
      
      // Constants
      PI: Math.PI,
      E: Math.E,
      
      // Custom Functions for Business Logic
      MARGIN: (cost, markup) => cost * (1 + markup / 100),
      DISCOUNT: (price, discountPercent) => price * (1 - discountPercent / 100),
      VAT: (amount, vatRate) => amount * (1 + vatRate / 100),
      MARKUP: (cost, marginPercent) => cost / (1 - marginPercent / 100),
      
      // Range/Array Functions (simplified)
      SUMPRODUCT: (...pairs) => {
        if (pairs.length % 2 !== 0) return 0;
        let sum = 0;
        for (let i = 0; i < pairs.length; i += 2) {
          sum += pairs[i] * pairs[i + 1];
        }
        return sum;
      }
    }
    
    // Add math functions to formula context
    let evalCode = Object.keys(mathContext).map(key => `const ${key} = ${mathContext[key]};`).join(' ')
    evalCode += `return (${formula});`
    
    console.log('Eval code:', evalCode)
    
    const result = Function('"use strict"; ' + evalCode)()
    const finalResult = Number(result)
    
    console.log('Calculation result:', result, '-> final:', finalResult)
    console.log('🔧 Price calculation DEBUG END\n')
    
    return finalResult
  } catch (e) {
    console.error('calculatePriceServer failed:', e)
    return Number(quote.price) || 0
  }
}

function safeName(name) {
  const base = String(name || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_')
  return base.slice(0, 128)
}
function parseDataUrl(dataUrl) {
  // data:[mime];base64,....
  const m = /^data:([^;,]+)?;base64,(.*)$/s.exec(String(dataUrl || ''))
  if (!m) return null
  return { mime: m[1] || 'application/octet-stream', base64: m[2] }
}
async function persistFilesForQuote(quoteId, files) {
  const dir = path.join(UPLOAD_DIR, quoteId)
  await fsp.mkdir(dir, { recursive: true })
  const out = []
  for (const f of (files || [])) {
    if (f && f.dataUrl) {
      const p = parseDataUrl(f.dataUrl)
      if (p) {
        const name = safeName(f.name || 'file')
        const buf = Buffer.from(p.base64, 'base64')
        const filePath = path.join(dir, name)
        await fsp.writeFile(filePath, buf)
        out.push({ name, type: f.type || p.mime, size: f.size || buf.length, url: `/uploads/${quoteId}/${name}` })
        continue
      }
    }
    // Already persisted or invalid dataUrl; keep as-is but drop dataUrl if both present
    if (f && f.url) out.push({ name: f.name, type: f.type, size: f.size, url: f.url })
  }
  return out
}

// List quotes
app.get('/api/quotes', requireAuth, (req, res) => { return res.json(readAll()) })

// Create quote
app.post('/api/quotes', async (req, res) => {
  try {
    const q = req.body || {}
    if (!q || !q.id) {
      return res.status(400).json({ error: 'invalid payload' })
    }

    // Persist attachments if provided as data URLs
    if (Array.isArray(q.files)) {
      q.files = await persistFilesForQuote(q.id, q.files)
    }
    if (Array.isArray(q.productImages)) {
      q.productImages = await persistFilesForQuote(q.id, q.productImages)
    }

    // Apply server-side price calculation using saved settings
    try {
      const settings = jsondb.getSettings()
      if (settings && settings.parameters && settings.formula) {
        const price = calculatePriceServer(q, settings)
        if (!isNaN(price)) {
          q.price = Number(price)
          q.priceSettingsStamp = settings.lastUpdated || null
          q.priceCalculatedAt = new Date().toISOString()
        }
      }
    } catch (e) {
      console.error('Server price calc error:', e)
    }

    insertOne(q)
    return res.json({ ok: true, id: q.id })
  } catch (error) {
    console.error('insert failed:', error)
    return res.status(500).json({ error: 'insert failed' })
  }
})

// Update status
app.patch('/api/quotes/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const patch = req.body || {}

    if (Array.isArray(patch.files)) {
      patch.files = await persistFilesForQuote(id, patch.files)
    }
    if (Array.isArray(patch.productImages)) {
      patch.productImages = await persistFilesForQuote(id, patch.productImages)
    }

    // If price-related fields are being updated, recalculate price and add timestamp
    const priceFields = ['thickness', 'width', 'length', 'weight', 'area', 'diameter', 'height', 'qty']
    const hasPriceField = priceFields.some(field => patch.hasOwnProperty(field))
    
    if (hasPriceField || patch.hasOwnProperty('price')) {
      try {
        const settings = jsondb.getSettings()
        if (settings && settings.parameters && settings.formula) {
          // Get current quote data to merge with patch
          const currentQuote = readOne(id)
          if (currentQuote) {
            const updatedQuote = { ...currentQuote, ...patch }
            const price = calculatePriceServer(updatedQuote, settings)
            if (!isNaN(price)) {
              patch.price = Number(price)
              patch.priceSettingsStamp = settings.lastUpdated || null
              patch.priceCalculatedAt = new Date().toISOString()
            }
          }
        }
      } catch (e) {
        console.error('Server price calc error during update:', e)
      }
    }

    const ok = updateOne(id, patch)
    if (!ok) {
      return res.status(404).json({ error: 'not found' })
    }

    return res.json({ ok: true })
  } catch (error) {
    console.error('update failed:', error)
    return res.status(500).json({ error: 'update failed' })
  }
})

// Delete
app.delete('/api/quotes/:id', requireAuth, (req, res) => {
  const { id } = req.params
  deleteOne(id)
  return res.json({ ok: true })
})


// Plain text export
app.get('/api/quotes/:id/txt', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const q = readOne(id)
    if (!q) {
      return res.status(404).send('Not found')
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="burkol_quote_' + id + '.txt"')
    
    const lines = []
  lines.push('Burkol Metal — Teklif Özeti')
  lines.push(`Tarih: ${new Date(q.createdAt || Date.now()).toLocaleString()}`)
  lines.push(`ID: ${q.id}`)
  lines.push('')
  lines.push('[Genel]')
  lines.push(`Durum: ${q.status || ''}`)
  lines.push(`Proje: ${q.proj || ''}`)
  lines.push(`Süreç: ${(q.process || []).join(', ')}`)
  lines.push(`Açıklama: ${q.desc || ''}`)
  lines.push('')
  lines.push('[Müşteri]')
  lines.push(`Ad Soyad: ${q.name || ''}`)
  lines.push(`Firma: ${q.company || ''}`)
  lines.push(`E‑posta: ${q.email || ''}`)
  lines.push(`Telefon: ${q.phone || ''}`)
  lines.push(`Ülke/Şehir: ${(q.country || '')} / ${(q.city || '')}`)
  lines.push('')
  lines.push('[Teknik]')
  lines.push(`Malzeme: ${q.material || ''}`)
  lines.push(`Kalite/Alaşım: ${q.grade || ''}`)
  lines.push(`Kalınlık: ${q.thickness || ''} mm`)
  lines.push(`Adet: ${q.qty || ''}`)
  lines.push(`Boyut: ${q.dims || ''}`)
  lines.push(`Tolerans: ${q.tolerance || ''}`)
  lines.push(`Yüzey: ${q.finish || ''}`)
  lines.push(`Termin: ${q.due || ''}`)
  lines.push(`Tekrarlılık: ${q.repeat || ''}`)
  lines.push(`Bütçe: ${q.budget || ''}`)
  lines.push('')
  const files = q.files || []
  lines.push('[Dosyalar]')
  if (files.length === 0) {
    lines.push('—')
  } else {
    files.forEach((f, i) => {
      lines.push(`${i + 1}. ${f.name} (${Math.round((f.size || 0) / 1024)} KB)`) 
    })
  }
  lines.push('')

    res.send(lines.join('\n'))
  } catch (error) {
    console.error('Error in text export:', error)
    res.status(500).send('Internal Server Error')
  }
})

// Fallbacks: serve index/admin for direct navigation
app.get(['/', '/index.html', '/#/teklif'], (req, res) => { res.sendFile(path.join(ROOT, 'index.html')) })
app.get(['/admin.html'], (req, res) => { res.sendFile(path.join(ROOT, 'admin.html')) })

// --- Auth routes ---
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, remember } = req.body || {}
    
    if (!email || !password) {
      return res.status(400).json({ error: 'missing_credentials', message: 'Email and password are required' })
    }

    const user = verifyUser(email, password)
    if (!user) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid email or password' })
    }

    const session = createSession(email, remember ? 30 : 1) // 30 gün veya 1 gün
    return res.json({ ok: true, token: session.token, user: { email, role: user.role } })
  } catch (error) {
    console.error('Login error:', error)
    return res.status(500).json({ error: 'server_error', message: 'Internal server error' })
  }
})

app.get('/api/auth/me', async (req, res) => {
  try {
    const h = req.headers['authorization'] || ''
    const m = /^Bearer\s+(.+)$/.exec(h)
    const token = m ? m[1] : null
    
    const sess = getSession(token)
    if (!sess) {
      return res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired session' })
    }

    return res.json({ ok: true, user: { email: sess.email } })
  } catch (error) {
    console.error('Auth check error:', error)
    return res.status(500).json({ error: 'server_error', message: 'Internal server error' })
  }
})

app.post('/api/auth/logout', async (req, res) => {
  try {
    const h = req.headers['authorization'] || ''
    const m = /^Bearer\s+(.+)$/.exec(h)
    const token = m ? m[1] : null

    if (token) {
      deleteSession(token)
    }
    
    return res.json({ ok: true, message: 'Successfully logged out' })
  } catch (error) {
    console.error('Logout error:', error)
    return res.status(500).json({ error: 'server_error', message: 'Internal server error' })
  }
})
// Health check
app.get('/health', (req, res) => { res.json({ ok: true, ts: Date.now() }) })
// Manage users (basic)
app.post('/api/auth/users', requireAuth, async (req, res) => {
  try {
    const { email, password, role } = req.body || {}
    
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'missing_fields', 
        message: 'Email and password are required' 
      })
    }

    createUser(email, password, role || 'admin')
    return res.json({ 
      ok: true, 
      message: 'User created successfully' 
    })
  } catch (error) {
    console.error('Create user error:', error)
    return res.status(500).json({ 
      error: 'save_failed', 
      message: 'Failed to create user' 
    })
  }
})

app.get('/api/auth/users', requireAuth, async (req, res) => {
  try {
    const rows = (jsondb.listUsersRaw() || []).map(u => ({
      email: u.email,
      role: u.role,
      createdAt: u.createdAt
    }))

    return res.json({ 
      ok: true, 
      users: rows 
    })
  } catch (error) {
    console.error('List users error:', error)
    return res.status(500).json({ 
      error: 'fetch_failed', 
      message: 'Failed to fetch users' 
    })
  }
})

app.delete('/api/auth/users/:email', requireAuth, async (req, res) => {
  try {
    const { email } = req.params

    if (!email) {
      return res.status(400).json({ 
        error: 'missing_email', 
        message: 'Email is required' 
      })
    }

    jsondb.deleteUser(email)
    return res.json({ 
      ok: true, 
      message: 'User deleted successfully' 
    })
  } catch (error) {
    console.error('Delete user error:', error)
    return res.status(500).json({ 
      error: 'delete_failed', 
      message: 'Failed to delete user' 
    })
  }
})

// Migration endpoint for ID format update
app.post('/api/migrate/ids', requireAuth, async (req, res) => {
  try {
    const quotes = readAll()
    let migrated = 0
    
    quotes.forEach(quote => {
      // Check if ID is in old format (starts with 'q_')
      if (quote.id && quote.id.startsWith('q_')) {
        const createdAt = new Date(quote.createdAt || Date.now())
        const year = createdAt.getFullYear()
        const month = String(createdAt.getMonth() + 1).padStart(2, '0')
        
        // Generate new sequential ID based on creation date
        const newId = `BK${year}${month}${String(migrated + 1).padStart(5, '0')}`
        
        // Update the quote with new ID
        deleteOne(quote.id) // Remove old
        quote.id = newId
        insertOne(quote) // Insert with new ID
        
        migrated++
      }
    })
    
    res.json({ 
      ok: true, 
      migrated: migrated,
      message: `${migrated} records migrated to new ID format` 
    })
  } catch (error) {
    console.error('Migration error:', error)
    res.status(500).json({ 
      error: 'migration_failed', 
      message: error.message 
    })
  }
})

// Settings endpoints for pricing formula
app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const settings = jsondb.getSettings() || {
      parameters: [],
      formula: '',
      lastUpdated: null
    }
    res.json(settings)
  } catch (error) {
    console.error('Get settings error:', error)
    res.status(500).json({ 
      error: 'get_settings_failed', 
      message: error.message 
    })
  }
})

app.post('/api/settings', requireAuth, async (req, res) => {
  try {
    const { parameters, formula } = req.body
    const settings = {
      parameters: parameters || [],
      formula: formula || '',
      lastUpdated: new Date().toISOString()
    }
    
    jsondb.putSettings(settings)
    
    res.json({ 
      ok: true, 
      message: 'Settings saved successfully',
      settings: settings
    })
  } catch (error) {
    console.error('Save settings error:', error)
    res.status(500).json({ 
      error: 'save_settings_failed', 
      message: error.message 
    })
  }
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Burkol Quote server on http://0.0.0.0:${PORT}`)
  console.log(`External access: http://136.244.86.113:${PORT}`)
  
  // Test: Create user if it doesn't exist
  const testUser = jsondb.getUser('umutyalcin8@gmail.com')
  if (!testUser) {
    console.log('Creating test user...')
    createUser('umutyalcin8@gmail.com', 'burkol123', 'admin')
    console.log('Test user created: umutyalcin8@gmail.com / burkol123')
  } else {
    console.log('Test user already exists: umutyalcin8@gmail.com')
    // Let's recreate to ensure password is correct
    console.log('Recreating user with fresh password hash...')
    createUser('umutyalcin8@gmail.com', 'burkol123', 'admin')
    console.log('User recreated with password: burkol123')
  }
})
