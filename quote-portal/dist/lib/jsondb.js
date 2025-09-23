import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Very small JSON store for quotes/users/sessions
// Single-process friendly; writes atomically via tmp+rename.

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.join(__dirname, '..')
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
  return q // Return the saved quote
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
function deleteSession(sessionId) {
  const db = loadRaw()
  if (db.sessions && db.sessions[sessionId]) {
    delete db.sessions[sessionId]
    saveRaw(db)
  }
}

// Settings ops
function getSettings() {
  const db = loadRaw()
  return db.settings || null
}
function putSettings(obj) {
  const db = loadRaw()
  if (!db.settings) db.settings = {}
  db.settings = { ...obj }
  saveRaw(db)
}

// Form Config ops
function getSystemConfig() {
  const db = loadRaw()
  return db.systemConfig || getDefaultSystemConfig()
}

function putSystemConfig(obj) {
  const db = loadRaw()
  db.systemConfig = {
    ...obj,
    version: (db.systemConfig?.version || 0) + 1,
    lastModified: nowISO()
  }
  saveRaw(db)
}

function getFormConfig() {
  const systemConfig = getSystemConfig()
  return systemConfig.formConfig
}

function putFormConfig(formConfig) {
  const systemConfig = getSystemConfig()
  
  // Form config güncellendiğinde pricing config'i sıfırla
  const newSystemConfig = {
    ...systemConfig,
    formConfig: {
      ...formConfig,
      version: (systemConfig.formConfig?.version || 0) + 1,
      lastModified: nowISO()
    },
    pricingConfig: {
      version: 1,
      isConfigured: false,
      parameters: [],
      formula: "",
      lastUpdated: nowISO(),
      resetReason: "Form configuration updated"
    },
    migrationStatus: "pending"
  }
  
  putSystemConfig(newSystemConfig)
}

function resetPricingConfig() {
  const systemConfig = getSystemConfig()
  const newSystemConfig = {
    ...systemConfig,
    pricingConfig: {
      version: 1,
      isConfigured: false,
      parameters: [],
      formula: "",
      lastUpdated: nowISO(),
      resetReason: "Manual reset"
    }
  }
  putSystemConfig(newSystemConfig)
}

function getDefaultSystemConfig() {
  return {
    version: 1,
    lastModified: nowISO(),
    migrationStatus: "completed",
    
    formConfig: {
      version: 1,
      lastModified: nowISO(),
      fields: [],
      defaultFields: [
        {
          id: "name",
          label: "Müşteri Adı",
          type: "text",
          required: true,
          deletable: false,
          display: {
            showInTable: true,
            showInFilter: false,
            tableOrder: 1,
            formOrder: 1
          }
        },
        {
          id: "company",
          label: "Şirket",
          type: "text",
          required: false,
          deletable: false,
          display: {
            showInTable: false,
            showInFilter: false,
            tableOrder: 0,
            formOrder: 2
          }
        },
        {
          id: "email",
          label: "E-posta",
          type: "email",
          required: true,
          deletable: false,
          display: {
            showInTable: false,
            showInFilter: false,
            tableOrder: 0,
            formOrder: 3
          }
        },
        {
          id: "phone",
          label: "Telefon",
          type: "phone",
          required: true,
          deletable: false,
          display: {
            showInTable: false,
            showInFilter: false,
            tableOrder: 0,
            formOrder: 4
          }
        },
        {
          id: "proj",
          label: "Proje",
          type: "text",
          required: true,
          deletable: false,
          display: {
            showInTable: true,
            showInFilter: true,
            tableOrder: 3,
            formOrder: 5
          }
        },
        {
          id: "createdAt",
          label: "Tarih",
          type: "date",
          required: true,
          deletable: false,
          display: {
            showInTable: true,
            showInFilter: true,
            tableOrder: 2,
            formOrder: 0
          }
        }
      ]
    },
    
    pricingConfig: {
      version: 1,
      isConfigured: false,
      parameters: [],
      formula: "",
      lastUpdated: nowISO()
    }
  }
}

export default {
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
  // settings
  getSettings,
  putSettings,
  // price settings
  getPriceSettings: getSettings,
  savePriceSettings: putSettings,
  // form config
  getSystemConfig,
  putSystemConfig,
  getFormConfig,
  putFormConfig,
  resetPricingConfig,
  getDefaultSystemConfig,
  // utils
  DATA_FILE,
}

