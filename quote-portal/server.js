// Minimal Express backend for Burkol Quote Portal
// - Persistent storage via JSON file (lib/jsondb.js)
// - TXT export endpoint

const express = require('express')
const path = require('path')
const fs = require('fs')
const fsp = require('fs').promises
const crypto = require('crypto')
const jsondb = require('./lib/jsondb')

const app = express()
const PORT = process.env.PORT || 3001
const ROOT = __dirname

// JSON storage file is managed by lib/jsondb (see BURKOL_DATA env)

app.use(express.json({ limit: '5mb' }))
// Simple CORS for local dev (e.g., 127.0.0.1:5500)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})
// Optional: serve static for direct access; harmless if unused
app.use(express.static(ROOT))
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
  const rowRaw = jsondb.getUser(email)
  const row = rowRaw ? { email: rowRaw.email, salt: rowRaw.pw_salt, hash: rowRaw.pw_hash, role: rowRaw.role } : null
  if (!row) return null
  const { hash } = hashPassword(password, row.salt)
  if (crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(row.hash))) {
    return { email: row.email, role: row.role }
  }
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
app.post('/api/quotes', (req, res) => {
  const q = req.body || {}
  if (!q || !q.id) return res.status(400).json({ error: 'invalid payload' })
  (async () => {
    try {
      // Persist attachments if provided as data URLs
      if (Array.isArray(q.files)) q.files = await persistFilesForQuote(q.id, q.files)
      if (Array.isArray(q.productImages)) q.productImages = await persistFilesForQuote(q.id, q.productImages)
      insertOne(q)
      return res.json({ ok: true, id: q.id })
    } catch (e) {
      console.error('insert failed', e)
      return res.status(500).json({ error: 'insert failed' })
    }
  })()
})

// Update status
app.patch('/api/quotes/:id', requireAuth, (req, res) => {
  const { id } = req.params
  const patch = req.body || {}
  ;(async () => {
    try {
      if (Array.isArray(patch.files)) patch.files = await persistFilesForQuote(id, patch.files)
      if (Array.isArray(patch.productImages)) patch.productImages = await persistFilesForQuote(id, patch.productImages)
      const ok = updateOne(id, patch)
      if (!ok) return res.status(404).json({ error: 'not found' })
      return res.json({ ok: true })
    } catch (e) {
      console.error('update failed', e)
      return res.status(500).json({ error: 'update failed' })
    }
  })()
})

// Delete
app.delete('/api/quotes/:id', requireAuth, (req, res) => {
  const { id } = req.params
  deleteOne(id)
  return res.json({ ok: true })
})


// Plain text export
app.get('/api/quotes/:id/txt', requireAuth, (req, res) => {
  const { id } = req.params
  const q = readOne(id)
  if (!q) return res.status(404).send('Not found')

  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="burkol_quote_${id}.txt"`)

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
})

// Fallbacks: serve index/admin for direct navigation
app.get(['/', '/index.html', '/#/teklif'], (req, res) => { res.sendFile(path.join(ROOT, 'index.html')) })
app.get(['/admin.html'], (req, res) => { res.sendFile(path.join(ROOT, 'admin.html')) })

// --- Auth routes ---
app.post('/api/auth/login', (req, res) => {
  const { email, password, remember } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'missing' })
  const ok = verifyUser(email, password)
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' })
  const session = createSession(email, remember ? 30 : 1) // 30 gün veya 1 gün
  return res.json({ ok: true, token: session.token, user: { email } })
})
app.get('/api/auth/me', (req, res) => {
  const h = req.headers['authorization'] || ''
  const m = /^Bearer\s+(.+)$/.exec(h)
  const token = m ? m[1] : null
  const sess = getSession(token)
  if (!sess) return res.status(401).json({ error: 'unauthorized' })
  return res.json({ ok: true, user: { email: sess.email } })
})
app.post('/api/auth/logout', (req, res) => {
  const h = req.headers['authorization'] || ''
  const m = /^Bearer\s+(.+)$/.exec(h)
  const token = m ? m[1] : null
  deleteSession(token)
  return res.json({ ok: true })
})
// Health check
app.get('/health', (req, res) => { res.json({ ok: true, ts: Date.now() }) })
// Manage users (basic)
app.post('/api/auth/users', requireAuth, (req, res) => {
  const { email, password, role } = req.body || {}
  if (!email || !password) return res.status(400).json({ error: 'missing' })
  try { createUser(email, password, role || 'admin'); return res.json({ ok: true }) } catch (e) { return res.status(500).json({ error: 'save_failed' }) }
})
app.get('/api/auth/users', requireAuth, (req, res) => {
  const rows = (jsondb.listUsersRaw() || []).map(u => ({ email: u.email, role: u.role, createdAt: u.createdAt }))
  return res.json({ ok: true, users: rows })
})
app.delete('/api/auth/users/:email', requireAuth, (req, res) => {
  const email = req.params.email
  if (!email) return res.status(400).json({ error: 'missing' })
  jsondb.deleteUser(email)
  return res.json({ ok: true })
})

app.listen(PORT, () => console.log(`Burkol Quote server on http://localhost:${PORT}`))
