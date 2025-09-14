const fs = require('fs')
const path = require('path')

// Very small JSON store for quotes/users/sessions
// Single-process friendly; writes atomically via tmp+rename.

const ROOT = __dirname ? path.join(__dirname, '..') : process.cwd()
const DATA_FILE = process.env.BURKOL_DATA || path.join(ROOT, 'db.json')

function ensureDir(p) {
  const dir = path.dirname(p)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function loadRaw() {
  try {
    const buf = fs.readFileSync(DATA_FILE)
    const obj = JSON.parse(String(buf))
    if (obj && typeof obj === 'object') return obj
  } catch {}
  return { quotes: {}, users: {}, sessions: {} }
}

function saveRaw(obj) {
  ensureDir(DATA_FILE)
  const tmp = DATA_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2))
  fs.renameSync(tmp, DATA_FILE)
}

function nowISO() { return new Date().toISOString() }

// Quote ops
function listQuotes() {
  const db = loadRaw()
  return Object.values(db.quotes || {}).sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime()
    const tb = new Date(b.createdAt || 0).getTime()
    return tb - ta
  })
}
function getQuote(id) {
  const db = loadRaw()
  return (db.quotes && db.quotes[id]) || null
}
function putQuote(obj) {
  const db = loadRaw()
  if (!db.quotes) db.quotes = {}
  const q = { ...obj }
  if (!q.createdAt) q.createdAt = nowISO()
  if (!q.status) q.status = 'new'
  db.quotes[q.id] = q
  saveRaw(db)
}
function patchQuote(id, patch) {
  const db = loadRaw()
  if (!db.quotes || !db.quotes[id]) return false
  const cur = db.quotes[id]
  const merged = { ...cur, ...patch }
  if (!merged.createdAt) merged.createdAt = cur.createdAt || nowISO()
  if (!merged.status) merged.status = cur.status || 'new'
  db.quotes[id] = merged
  saveRaw(db)
  return true
}
function removeQuote(id) {
  const db = loadRaw()
  if (db.quotes && db.quotes[id]) { delete db.quotes[id]; saveRaw(db) }
}

// Users
function getUser(email) {
  const db = loadRaw()
  return (db.users && db.users[email]) || null
}
function upsertUser(user) {
  const db = loadRaw()
  if (!db.users) db.users = {}
  db.users[user.email] = user
  saveRaw(db)
}
function listUsersRaw() {
  const db = loadRaw()
  return Object.values(db.users || {}).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
}
function deleteUser(email) {
  const db = loadRaw()
  if (db.users && db.users[email]) { delete db.users[email]; saveRaw(db) }
}

// Sessions
function putSession(sess) {
  const db = loadRaw()
  if (!db.sessions) db.sessions = {}
  db.sessions[sess.token] = sess
  saveRaw(db)
}
function getSession(token) {
  const db = loadRaw()
  return (db.sessions && db.sessions[token]) || null
}
function deleteSession(token) {
  const db = loadRaw()
  if (db.sessions && db.sessions[token]) { delete db.sessions[token]; saveRaw(db) }
}

module.exports = {
  // quotes
  listQuotes,
  getQuote,
  putQuote,
  patchQuote,
  removeQuote,
  // users
  getUser,
  upsertUser,
  listUsersRaw,
  deleteUser,
  // sessions
  putSession,
  getSession,
  deleteSession,
  // utils
  DATA_FILE,
}

