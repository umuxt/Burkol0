import admin from 'firebase-admin'
import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { existsSync } from 'fs'
import PriceStatus from '../../server/models/PriceStatus.js'
import dotenv from 'dotenv'

// Load environment variables if not already loaded
if (!process.env.FIREBASE_PROJECT_ID) {
  dotenv.config()
}

// Initialize Firebase Admin SDK if not already done by server.js
if (!admin.apps.length) {
  let credential;
  
  // Try to use environment variables first (recommended for production)
  if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
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
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const serviceAccountPath = path.join(__dirname, '..', '..', 'serviceAccountKey.json')
    if (existsSync(serviceAccountPath)) {
      const raw = await readFile(serviceAccountPath, 'utf8')
      const serviceAccount = JSON.parse(raw)
      credential = admin.credential.cert(serviceAccount)
    } else {
      throw new Error('Firebase credentials not found! Please set environment variables or create serviceAccountKey.json')
    }
  }
  
  admin.initializeApp({
    credential: credential
  })
}

const db = admin.firestore()
const quotesRef = db.collection('quotes')
const usersRef = db.collection('users')
const sessionsRef = db.collection('sessions')
const settingsDoc = db.collection('settings').doc('main')
const systemDoc = db.collection('system').doc('config')
const priceSettingsVersionsRef = db.collection('priceSettingsVersions')
const priceSettingsMetaDoc = priceSettingsVersionsRef.doc('_meta')
const formVersionsRef = db.collection('formVersions')
const formVersionsMetaDoc = formVersionsRef.doc('_meta')

let calculatePriceServerModule = null

const DAILY_COUNTER_RETENTION_DAYS = 30

async function ensurePriceCalculator() {
  if (calculatePriceServerModule) return calculatePriceServerModule
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const calculatorPath = path.join(__dirname, '..', '..', 'server', 'priceCalculator.js')
  calculatePriceServerModule = await import(pathToFileURL(calculatorPath))
  return calculatePriceServerModule
}

function pruneDailyCounters(counters = {}, currentDateKey = null) {
  if (!counters || typeof counters !== 'object') return {}
  const threshold = new Date()
  threshold.setDate(threshold.getDate() - (DAILY_COUNTER_RETENTION_DAYS - 1))
  const thresholdKey = `${threshold.getFullYear()}${String(threshold.getMonth() + 1).padStart(2, '0')}${String(threshold.getDate()).padStart(2, '0')}`

  const pruned = {}
  Object.entries(counters).forEach(([key, value]) => {
    const dateMatch = key.match(/(\d{8})$/)
    const dateKey = dateMatch ? dateMatch[1] : null
    if (!dateKey) return
    if (dateKey >= thresholdKey || dateKey === currentDateKey) {
      pruned[key] = value
    }
  })
  return pruned
}

const state = {
  ready: false,
  quotes: [],
  users: [],
  sessions: [],
  settings: {},
  systemConfig: {},
  priceSettings: null,
  priceSettingsMeta: null,
  formConfig: null,
  formConfigMeta: null
}

function clone(value) {
  return value === undefined || value === null ? value : JSON.parse(JSON.stringify(value))
}

function fireAndForget(promise, label) {
  promise.catch(err => console.error(`[jsondb] ${label} failed:`, err))
}

function defaultPriceSettingsMeta() {
  return {
    versionCounter: 0,
    currentVersionId: null,
    currentVersionNumber: 0,
    lastUpdatedAt: null,
    lastUpdatedBy: null,
    dailyCounters: {}
  }
}

function defaultFormConfigMeta() {
  return {
    versionCounter: 0,
    currentVersionId: null,
    currentVersionNumber: 0,
    lastUpdatedAt: null,
    lastUpdatedBy: null
  }
}

function toIsoString(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString()
    } catch (err) {
      console.error('[jsondb] Failed to convert timestamp to ISO string:', err)
      return null
    }
  }
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return null
}

function formatUserInfo(userInfo) {
  if (!userInfo) return 'System'
  if (typeof userInfo === 'string') return userInfo
  const parts = []
  if (userInfo.name) parts.push(userInfo.name)
  if (userInfo.email) parts.push(`<${userInfo.email}>`)
  if (parts.length === 0 && userInfo.id) parts.push(`User:${userInfo.id}`)
  if (userInfo.action) parts.push(`[${userInfo.action}]`)
  return parts.join(' ').trim() || 'System'
}

function getUserTag(userInfo) {
  const raw = (userInfo && (userInfo.username || userInfo.name || userInfo.email || userInfo.userId)) || 'System'
  const ascii = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
  if (!ascii) return 'User'
  return ascii
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('')
}

function mapPriceSettingsVersionDoc(doc) {
  if (!doc || !doc.exists) return null
  const data = doc.data() || {}
  const snapshot = data.settingsSnapshot || data.settings || data.data || {}
  const parameters = Array.isArray(data.parameters)
    ? data.parameters
    : Array.isArray(snapshot.parameters)
      ? snapshot.parameters
      : []
  const formula = data.formula ?? snapshot.formula ?? ''
  const dateKey = data.dateKey ?? snapshot.dateKey ?? null
  const dailyIndex = data.dailyIndex ?? snapshot.dailyIndex ?? null
  const userTag = data.userTag ?? snapshot.userTag ?? null

  return {
    ...snapshot,
    parameters,
    formula,
    version: data.versionNumber ?? data.version ?? snapshot.version ?? null,
    versionId: data.versionId || doc.id,
    createdAt: toIsoString(data.createdAt || snapshot.createdAt),
    createdBy: data.createdBy || data.savedBy || snapshot.savedBy || null,
    changeSummary: data.changeSummary || data.diffSummary || snapshot.changeSummary || null,
    notes: data.notes || snapshot.notes || null,
    dateKey,
    dailyIndex,
    userTag
  }
}

async function getPriceSettingsVersionSnapshot({ versionId = null, versionNumber = null } = {}) {
  if (!versionId && (versionNumber === null || versionNumber === undefined)) {
    return null
  }

  try {
    let doc = null

    if (versionId) {
      doc = await priceSettingsVersionsRef.doc(versionId).get()
    }

    if ((!doc || !doc.exists) && versionNumber !== null && versionNumber !== undefined) {
      const fallbackQuery = await priceSettingsVersionsRef
        .where('versionNumber', '==', versionNumber)
        .limit(1)
        .get()
      if (!fallbackQuery.empty) {
        doc = fallbackQuery.docs[0]
      }
    }

    return doc && doc.exists ? mapPriceSettingsVersionDoc(doc) : null
  } catch (error) {
    console.error('[jsondb] Failed to load price settings version snapshot:', error)
    return null
  }
}

function settingsFromPriceCalculation(calculation = {}) {
  if (!calculation) return null
  return {
    versionId: calculation.versionId || calculation.settingsVersionId || null,
    version: calculation.version || calculation.settingsVersion || null,
    parameters: Array.isArray(calculation.parameters) ? calculation.parameters : [],
    formula: calculation.formula || '',
    createdAt: calculation.timestamp || calculation.calculatedAt || null
  }
}

function buildVersionInfo(snapshot = null, settings = null) {
  const versionId = snapshot?.versionId || settings?.versionId || null
  const versionNumber = snapshot?.versionNumber || settings?.version || null
  return {
    versionId: versionId || null,
    version: versionNumber || null,
    timestamp: snapshot?.capturedAt || settings?.createdAt || null,
    parameters: settings?.parameters || [],
    formula: settings?.formula || ''
  }
}

function mapFormConfigVersionDoc(doc) {
  if (!doc || !doc.exists) return null
  const data = doc.data() || {}
  const snapshot = data.configSnapshot || data.config || data.data || {}

  return {
    ...snapshot,
    version: data.versionNumber ?? data.version ?? snapshot.version ?? null,
    versionId: data.versionId || doc.id,
    createdAt: toIsoString(data.createdAt || snapshot.createdAt),
    createdBy: data.createdBy || data.savedBy || snapshot.savedBy || null,
    changeSummary: data.changeSummary || snapshot.changeSummary || null,
    notes: data.notes || snapshot.notes || null
  }
}

async function refreshPriceSettingsState(versionId) {
  if (!versionId) {
    state.priceSettings = null
    return null
  }

  try {
    const versionDoc = await priceSettingsVersionsRef.doc(versionId).get()
    const mapped = mapPriceSettingsVersionDoc(versionDoc)
    state.priceSettings = mapped
    return mapped
  } catch (error) {
    console.error('[jsondb] Failed to refresh price settings state:', error)
    return null
  }
}

async function refreshFormConfigState(versionId) {
  if (!versionId) {
    state.formConfig = null
    return null
  }

  try {
    const versionDoc = await formVersionsRef.doc(versionId).get()
    const mapped = mapFormConfigVersionDoc(versionDoc)
    state.formConfig = mapped
    return mapped
  } catch (error) {
    console.error('[jsondb] Failed to refresh form config state:', error)
    return null
  }
}

async function loadLatestPriceSettingsVersion(transaction = null) {
  try {
    const query = priceSettingsVersionsRef.orderBy('versionNumber', 'desc').limit(5)
    const snapshot = transaction ? await transaction.get(query) : await query.get()

    for (const doc of snapshot.docs) {
      if (doc.id === '_meta') continue
      const mapped = mapPriceSettingsVersionDoc(doc)
      if (mapped) {
        const docData = doc.data() || {}
        const resolvedVersion = mapped.version ?? mapped.versionNumber ?? docData.versionNumber ?? docData.version ?? 0
        if (mapped.version === undefined) mapped.version = resolvedVersion
        return { doc, mapped }
      }
    }
    return null
  } catch (error) {
    console.error('[jsondb] Failed to load latest price settings version:', error)
    return null
  }
}

async function ensurePriceSettingsStateFromVersions() {
  const latest = await loadLatestPriceSettingsVersion()
  if (!latest) return null

  const { doc, mapped } = latest
  const meta = state.priceSettingsMeta || defaultPriceSettingsMeta()
  const currentVersionNumber = mapped.version || mapped.versionNumber || 0

  state.priceSettingsMeta = {
    ...meta,
    currentVersionId: doc.id,
    currentVersionNumber: currentVersionNumber,
    versionCounter: Math.max(meta.versionCounter || 0, currentVersionNumber),
    lastUpdatedAt: mapped.createdAt || null,
    lastUpdatedBy: mapped.createdBy || null,
    dailyCounters: pruneDailyCounters(meta.dailyCounters)
  }
  state.priceSettings = mapped

  fireAndForget(
    priceSettingsMetaDoc.set({
      currentVersionId: doc.id,
      currentVersionNumber: currentVersionNumber,
      versionCounter: state.priceSettingsMeta.versionCounter,
      lastUpdatedAt: mapped.createdAt || null,
      lastUpdatedBy: mapped.createdBy || null,
      dailyCounters: state.priceSettingsMeta.dailyCounters
    }, { merge: true }),
    'ensurePriceSettingsStateFromVersions'
  )

  return mapped
}

async function bootstrap() {
  const [
    quotesSnap,
    usersSnap,
    sessionsSnap,
    settingsSnap,
    systemSnap,
    priceMetaSnap,
    formMetaSnap
  ] = await Promise.all([
    quotesRef.get(),
    usersRef.get(),
    sessionsRef.get(),
    settingsDoc.get(),
    systemDoc.get(),
    priceSettingsMetaDoc.get().catch(() => null),
    formVersionsMetaDoc.get().catch(() => null)
  ])

  state.quotes = quotesSnap.docs.map(doc => doc.data())
  state.users = usersSnap.docs.map(doc => doc.data())
  state.sessions = sessionsSnap.docs.map(doc => normalizeSessionData({ sessionId: doc.id, ...doc.data() }))

  const settingsData = settingsSnap.exists ? settingsSnap.data() : {}
  const { priceSettings: legacyPriceSettings, formConfig: legacyFormConfig, ...restSettings } = settingsData || {}
  state.settings = restSettings

  state.systemConfig = systemSnap.exists ? systemSnap.data() : {}

  state.priceSettingsMeta = priceMetaSnap && priceMetaSnap.exists
    ? { ...defaultPriceSettingsMeta(), ...priceMetaSnap.data() }
    : defaultPriceSettingsMeta()

  state.formConfigMeta = formMetaSnap && formMetaSnap.exists
    ? { ...defaultFormConfigMeta(), ...formMetaSnap.data() }
    : defaultFormConfigMeta()

  let priceSettingsLoaded = false
  if (state.priceSettingsMeta.currentVersionId) {
    const loaded = await refreshPriceSettingsState(state.priceSettingsMeta.currentVersionId)
    priceSettingsLoaded = !!loaded
  }

  if (!priceSettingsLoaded) {
    const fallback = await ensurePriceSettingsStateFromVersions()
    priceSettingsLoaded = !!fallback
  }

  if (!priceSettingsLoaded && legacyPriceSettings) {
    state.priceSettings = { ...legacyPriceSettings, versionSource: 'legacy' }
  }

  if (state.formConfigMeta.currentVersionId) {
    await refreshFormConfigState(state.formConfigMeta.currentVersionId)
  } else if (legacyFormConfig) {
    state.formConfig = { ...legacyFormConfig, versionSource: 'legacy' }
  }

  state.ready = true
}

await bootstrap()

quotesRef.onSnapshot(snapshot => {
  state.quotes = snapshot.docs.map(doc => doc.data())
}, err => console.error('[jsondb] quotes snapshot error:', err))

usersRef.onSnapshot(snapshot => {
  state.users = snapshot.docs.map(doc => doc.data())
}, err => console.error('[jsondb] users snapshot error:', err))

sessionsRef.onSnapshot(snapshot => {
  state.sessions = snapshot.docs.map(doc => normalizeSessionData({ sessionId: doc.id, ...doc.data() }))
}, err => console.error('[jsondb] sessions snapshot error:', err))

settingsDoc.onSnapshot(doc => {
  const data = doc.exists ? doc.data() : {}
  const { priceSettings: legacyPriceSettings, formConfig: legacyFormConfig, ...rest } = data || {}
  state.settings = rest

  if (legacyPriceSettings && !state.priceSettingsMeta?.currentVersionId) {
    state.priceSettings = { ...legacyPriceSettings, versionSource: 'legacy' }
  }

  if (legacyFormConfig && !state.formConfigMeta?.currentVersionId) {
    state.formConfig = { ...legacyFormConfig, versionSource: 'legacy' }
  }
}, err => console.error('[jsondb] settings snapshot error:', err))

systemDoc.onSnapshot(doc => {
  state.systemConfig = doc.exists ? doc.data() : {}
}, err => console.error('[jsondb] system snapshot error:', err))

priceSettingsMetaDoc.onSnapshot(doc => {
  const data = doc.exists ? doc.data() : {}
  const prunedCounters = pruneDailyCounters(data?.dailyCounters)
  state.priceSettingsMeta = doc.exists
    ? { ...defaultPriceSettingsMeta(), ...data, dailyCounters: prunedCounters }
    : defaultPriceSettingsMeta()

  const desiredVersionId = state.priceSettingsMeta.currentVersionId
  if (!desiredVersionId) {
    ensurePriceSettingsStateFromVersions()
    return
  }

  if (desiredVersionId && state.priceSettings?.versionId !== desiredVersionId) {
    refreshPriceSettingsState(desiredVersionId)
  }
}, err => console.error('[jsondb] price settings meta snapshot error:', err))

formVersionsMetaDoc.onSnapshot(doc => {
  state.formConfigMeta = doc.exists
    ? { ...defaultFormConfigMeta(), ...doc.data() }
    : defaultFormConfigMeta()

  const desiredVersionId = state.formConfigMeta.currentVersionId
  if (!desiredVersionId && state.formConfig) {
    state.formConfig = null
    return
  }

  if (desiredVersionId && state.formConfig?.versionId !== desiredVersionId) {
    refreshFormConfigState(desiredVersionId)
  }
}, err => console.error('[jsondb] form config meta snapshot error:', err))

function ensureReady() {
  if (!state.ready) {
    throw new Error('jsondb not ready yet; Firestore bootstrap incomplete')
  }
}

function generateActivityId() {
  return `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeSessionActivity(activity) {
  if (!activity || typeof activity !== 'object') return null

  const timestamp = activity.timestamp || activity.createdAt || new Date().toISOString()
  const normalized = {
    id: activity.id || activity.activityId || generateActivityId(),
    timestamp,
    type: activity.type || activity.event || 'general',
    action: activity.action || 'update',
    scope: activity.scope || 'system',
    title: activity.title || activity.summary || activity.action || 'Aktivite',
    description: activity.description || activity.details || null,
    metadata: activity.metadata || activity.data || null,
    performedBy: activity.performedBy || activity.actor || null
  }

  return normalized
}

function normalizeSessionData(raw = {}) {
  if (!raw || typeof raw !== 'object') return null

  const normalizedActivities = Array.isArray(raw.activityLog)
    ? raw.activityLog.map(normalizeSessionActivity).filter(Boolean)
    : []

  const normalized = {
    ...raw,
    sessionId: raw.sessionId || raw.id || null,
    token: raw.token || raw.accessToken || null,
    userName: raw.userName || raw.username || raw.name || 'Unknown User',
    email: raw.email || null,
    loginTime: raw.loginTime || null,
    loginDate: raw.loginDate || (raw.loginTime ? String(raw.loginTime).split('T')[0] : null),
    expires: raw.expires || null,
    lastActivityAt: raw.lastActivityAt || (normalizedActivities.length ? normalizedActivities[normalizedActivities.length - 1].timestamp : null),
    activityLog: normalizedActivities
  }

  return normalized
}

function appendSessionActivity(sessionId, activity) {
  ensureReady()
  if (!sessionId || !activity) return null

  const entry = normalizeSessionActivity(activity)
  if (!entry) return null

  const index = state.sessions.findIndex(s => s.sessionId === sessionId)
  if (index === -1) {
    console.warn(`[jsondb] appendSessionActivity: session ${sessionId} not found in memory, writing directly`)

    fireAndForget(
      sessionsRef.doc(sessionId).set({
        activityLog: admin.firestore.FieldValue.arrayUnion(entry),
        lastActivityAt: entry.timestamp
      }, { merge: true }),
      `appendSessionActivity(${sessionId})`
    )

    const placeholder = normalizeSessionData({ sessionId, activityLog: [entry], lastActivityAt: entry.timestamp })
    if (placeholder) {
      state.sessions.push(placeholder)
    }
    return entry
  }

  const session = state.sessions[index]
  const updatedLog = Array.isArray(session.activityLog) ? [...session.activityLog, entry] : [entry]
  const updatedSession = {
    ...session,
    activityLog: updatedLog,
    lastActivityAt: entry.timestamp
  }

  state.sessions[index] = updatedSession

  fireAndForget(
    sessionsRef.doc(sessionId).set({
      activityLog: admin.firestore.FieldValue.arrayUnion(entry),
      lastActivityAt: entry.timestamp
    }, { merge: true }),
    `appendSessionActivity(${sessionId})`
  )

  return entry
}

function generateQuoteId() {
  ensureReady()
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const datePrefix = `${year}${month}${day}`
  
  // Find existing quotes for today
  const todayQuotes = state.quotes.filter(q => q.id && q.id.startsWith(datePrefix + '.'))
  
  // Get the highest index for today
  let maxIndex = 0
  todayQuotes.forEach(q => {
    const parts = q.id.split('.')
    if (parts.length === 2) {
      const index = parseInt(parts[1], 10)
      if (!isNaN(index) && index > maxIndex) {
        maxIndex = index
      }
    }
  })
  
  // Generate next index
  const nextIndex = maxIndex + 1
  const indexStr = String(nextIndex).padStart(4, '0')
  
  return `${datePrefix}.${indexStr}`
}

function listQuotes() {
  ensureReady()
  const normalized = state.quotes.map(q => normalizeQuoteVersionInfo(q))
  return clone(normalized)
}

function getQuote(id) {
  ensureReady()
  const found = state.quotes.find(q => q.id === id)
  return clone(found ? normalizeQuoteVersionInfo(found) : null)
}

function putQuote(quote) {
  ensureReady()
  const stored = { ...quote }
  
  // Auto-generate ID if not provided or if it's in legacy UUID format
  if (!stored.id || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored.id)) {
    stored.id = generateQuoteId()
  }
  
  // Deep filter out undefined values to avoid Firestore errors
  const cleanStored = filterUndefinedValues(stored)
  
  const idx = state.quotes.findIndex(q => q.id === cleanStored.id)
  if (!cleanStored.createdAt) cleanStored.createdAt = new Date().toISOString()
  if (!cleanStored.status) cleanStored.status = 'new'
  
  if (idx >= 0) state.quotes[idx] = cleanStored
  else state.quotes.push(cleanStored)
  
  fireAndForget(quotesRef.doc(cleanStored.id).set(cleanStored), `putQuote(${cleanStored.id})`)
  return clone(cleanStored)
}

function patchQuote(id, patch) {
  ensureReady()
  const idx = state.quotes.findIndex(q => q.id === id)
  if (idx === -1) return false
  
  // Deep filter out undefined values to avoid Firestore errors
  const cleanPatch = filterUndefinedValues(patch)
  
  const merged = { ...state.quotes[idx], ...cleanPatch }
  state.quotes[idx] = merged
  fireAndForget(quotesRef.doc(id).set(merged, { merge: true }), `patchQuote(${id})`)
  return true
}

// Helper function to recursively filter undefined values
function filterUndefinedValues(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj === undefined ? null : obj
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => filterUndefinedValues(item)).filter(item => item !== undefined)
  }
  
  const cleaned = {}
  Object.keys(obj).forEach(key => {
    const value = obj[key]
    if (value !== undefined) {
      if (value === null) {
        cleaned[key] = null
      } else if (typeof value === 'object') {
        const cleanedValue = filterUndefinedValues(value)
        if (cleanedValue !== undefined) {
          cleaned[key] = cleanedValue
        }
      } else {
        cleaned[key] = value
      }
    }
  })
  
  return cleaned
}

function normalizeQuoteVersionInfo(sourceQuote) {
  if (!sourceQuote) return sourceQuote

  const normalized = { ...sourceQuote }

  if (!normalized.priceVersionOriginal) {
    if (normalized.priceVersion) {
      normalized.priceVersionOriginal = normalized.priceVersion
    } else if (normalized.priceCalculation) {
      normalized.priceVersionOriginal = {
        versionId: normalized.priceCalculation.versionId || null,
        versionNumber: normalized.priceCalculation.version || null,
        capturedAt: normalized.priceCalculation.timestamp || normalized.createdAt || null
      }
    }
  }

  if (!normalized.priceVersionApplied) {
    if (normalized.priceVersion) {
      normalized.priceVersionApplied = normalized.priceVersion
    } else if (normalized.priceVersionOriginal) {
      normalized.priceVersionApplied = normalized.priceVersionOriginal
    }
  }

  if (!normalized.priceStatus?.differenceSummary && normalized.pendingPriceVersion?.differenceSummary) {
    normalized.priceStatus = {
      ...(normalized.priceStatus || {}),
      differenceSummary: normalized.pendingPriceVersion.differenceSummary
    }
  }

  return normalized
}

function buildUserMetadata(userInfo = {}) {
  if (!userInfo || typeof userInfo !== 'object') return null
  const { id, uid, userId, email, username, name, role } = userInfo
  const metadata = {}
  if (id || uid || userId) metadata.id = id || uid || userId
  if (email) metadata.email = email
  if (username) metadata.username = username
  if (name) metadata.name = name
  if (role) metadata.role = role
  return Object.keys(metadata).length ? metadata : null
}

function appendPriceHistory(quote, entry) {
  const currentHistory = Array.isArray(quote.priceHistory) ? [...quote.priceHistory] : []
  currentHistory.push(entry)
  return currentHistory
}

function createManualOverrideSnapshot({ price, setAt, userInfo, note }, quote) {
  return {
    active: true,
    price,
    setAt,
    setBy: buildUserMetadata(userInfo),
    setByLabel: formatUserInfo(userInfo),
    note: note || null,
    userTag: getUserTag(userInfo),
    previousStatus: quote?.priceStatus?.status || null,
    previousCalculatedPrice: quote?.priceStatus?.calculatedPrice ?? null,
    previousAppliedPrice: quote?.priceStatus?.appliedPrice ?? quote?.price ?? null,
    releasedAt: null,
    releasedBy: null
  }
}

function validateManualPrice(price) {
  const parsed = typeof price === 'number' ? price : Number(price)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Manual fiyat değeri geçerli bir sayı olmalıdır')
  }
  return parsed
}

function ensureQuoteExists(quoteId) {
  const quote = getQuote(quoteId)
  if (!quote) {
    const error = new Error(`Quote ${quoteId} not found`)
    error.status = 404
    throw error
  }
  return quote
}

function setManualOverride(quoteId, { price, note = null, userInfo = {} } = {}) {
  ensureReady()
  const quote = ensureQuoteExists(quoteId)
  const parsedPrice = validateManualPrice(price)
  const setAt = new Date().toISOString()
  const overrideSnapshot = createManualOverrideSnapshot({ price: parsedPrice, setAt, userInfo, note }, quote)

  const statusInstance = PriceStatus.fromJSON(quote.priceStatus)
  statusInstance.activateManualOverride({
    price: parsedPrice,
    setAt,
    setBy: overrideSnapshot.setByLabel,
    note,
    previousStatus: quote.priceStatus?.status || null,
    previousCalculatedPrice: quote.priceStatus?.calculatedPrice ?? null,
    previousAppliedPrice: quote.priceStatus?.appliedPrice ?? quote.price ?? null
  })

  const historyEntry = {
    timestamp: setAt,
    price: parsedPrice,
    calculatedPrice: parsedPrice,
    changeReason: 'Manuel fiyat belirlendi',
    manualOverride: {
      action: 'set',
      setBy: overrideSnapshot.setByLabel,
      note
    }
  }

  const patch = {
    price: parsedPrice,
    calculatedPrice: parsedPrice,
    manualOverride: overrideSnapshot,
    priceStatus: statusInstance.toJSON(),
    priceHistory: appendPriceHistory(quote, historyEntry),
    priceUpdateInfo: {
      timestamp: setAt,
      updatedBy: userInfo,
      reason: 'manual-override-set'
    },
    pendingPriceVersion: null,
    pendingFormVersion: null,
    pendingCalculatedPrice: null,
    priceVersionLatest: null
  }

  patchQuote(quoteId, patch)
  return getQuote(quoteId)
}

function clearManualOverride(quoteId, { userInfo = {}, reason = 'Manual fiyat kilidi kaldırıldı' } = {}) {
  ensureReady()
  const quote = ensureQuoteExists(quoteId)
  if (!quote.manualOverride?.active) {
    return quote
  }

  const releasedAt = new Date().toISOString()
  const statusInstance = PriceStatus.fromJSON(quote.priceStatus)
  statusInstance.clearManualOverride({
    releasedAt,
    releasedBy: formatUserInfo(userInfo),
    reason
  })

  const updatedOverride = {
    ...quote.manualOverride,
    active: false,
    releasedAt,
    releasedBy: formatUserInfo(userInfo)
  }

  const historyEntry = {
    timestamp: releasedAt,
    price: quote.price,
    calculatedPrice: quote.calculatedPrice ?? quote.price,
    changeReason: reason,
    manualOverride: {
      action: 'clear',
      releasedBy: formatUserInfo(userInfo)
    }
  }

  const patch = {
    manualOverride: updatedOverride,
    priceStatus: statusInstance.toJSON(),
    priceHistory: appendPriceHistory(quote, historyEntry),
    priceUpdateInfo: {
      timestamp: releasedAt,
      updatedBy: userInfo,
      reason: 'manual-override-clear'
    }
  }

  patchQuote(quoteId, patch)
  return getQuote(quoteId)
}

function removeQuote(id) {
  ensureReady()
  const idx = state.quotes.findIndex(q => q.id === id)
  if (idx === -1) return false
  state.quotes.splice(idx, 1)
  fireAndForget(quotesRef.doc(id).delete(), `removeQuote(${id})`)
  return true
}

function getPriceSettings() {
  ensureReady()
  return clone(state.priceSettings || null)
}

function savePriceSettings(settings, userInfo = null) {
  ensureReady()
  return savePriceSettingsWithVersioning(settings, userInfo)
    .then(result => clone(result.settings || state.priceSettings || null))
}

// VERSION MANAGEMENT SYSTEM

async function savePriceSettingsWithVersioning(settings, userInfo = null, options = {}) {
  ensureReady()

  try {
    const cleanedSettings = filterUndefinedValues({ ...settings })
    const savedBy = formatUserInfo(userInfo)
    const userTag = getUserTag(userInfo)
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const dateKey = `${year}${month}${day}`
    const dailyCounterKey = `${userTag}-${dateKey}`

    const { versionId, version } = await db.runTransaction(async tx => {
      const metaSnap = await tx.get(priceSettingsMetaDoc)
      const existingMeta = metaSnap.exists
        ? { ...defaultPriceSettingsMeta(), ...metaSnap.data() }
        : defaultPriceSettingsMeta()

      let baseCounter = existingMeta.versionCounter || 0

      if (!baseCounter) {
        const latest = await loadLatestPriceSettingsVersion(tx)
        const latestVersionNumber = latest?.mapped?.version ?? 0
        baseCounter = Math.max(baseCounter, latestVersionNumber)
      }

      const dailyCounters = { ...(existingMeta.dailyCounters || {}) }
      const nextDailyIndex = (dailyCounters[dailyCounterKey] || 0) + 1
      dailyCounters[dailyCounterKey] = nextDailyIndex
      const prunedDailyCounters = pruneDailyCounters(dailyCounters, dateKey)

      const nextVersionNumber = baseCounter + 1
      const resolvedVersionId = `${userTag}-${dateKey}-${String(nextDailyIndex).padStart(2, '0')}`
      const timestamp = admin.firestore.FieldValue.serverTimestamp()

      const versionDocRef = priceSettingsVersionsRef.doc(resolvedVersionId)
      tx.set(versionDocRef, {
        versionId: resolvedVersionId,
        versionNumber: nextVersionNumber,
        userTag,
        dateKey,
        dailyIndex: nextDailyIndex,
        createdAt: timestamp,
        createdBy: savedBy,
        parameters: cleanedSettings.parameters || [],
        formula: cleanedSettings.formula || '',
        settingsSnapshot: cleanedSettings,
        changeSummary: options.changeSummary || null
      })

      tx.set(priceSettingsMetaDoc, {
        currentVersionId: resolvedVersionId,
        currentVersionNumber: nextVersionNumber,
        versionCounter: nextVersionNumber,
        lastUpdatedAt: timestamp,
        lastUpdatedBy: savedBy,
        dailyCounters: prunedDailyCounters
      }, { merge: true })

      return { versionId: resolvedVersionId, version: nextVersionNumber, dailyCounters: prunedDailyCounters, nextDailyIndex }
    })

    const latestMetaSnap = await priceSettingsMetaDoc.get()
    const latestDailyCounters = latestMetaSnap.exists
      ? { ...defaultPriceSettingsMeta().dailyCounters, ...pruneDailyCounters(latestMetaSnap.data().dailyCounters, dateKey) }
      : {}

    state.priceSettingsMeta = {
      ...(state.priceSettingsMeta || defaultPriceSettingsMeta()),
      currentVersionId: versionId,
      currentVersionNumber: version,
      versionCounter: version,
      dailyCounters: latestDailyCounters
    }

    await refreshPriceSettingsState(versionId)

    fireAndForget(
      settingsDoc.set({
        currentPriceSettingsVersion: version,
        currentPriceSettingsVersionId: versionId,
        currentPriceSettingsUpdatedAt: state.priceSettings?.createdAt || null,
        lastPriceSettingsUpdater: savedBy
      }, { merge: true }),
      'savePriceSettings_reference'
    )

    return {
      success: true,
      versionId,
      version,
      userTag,
      dateKey,
      settings: clone(state.priceSettings)
    }
  } catch (error) {
    console.error('❌ Version save failed:', error)
    throw error
  }
}

async function getPriceSettingsVersions(limit = 15) {
  ensureReady()

  try {
    const snapshot = await priceSettingsVersionsRef
      .orderBy('versionNumber', 'desc')
      .limit(limit)
      .get()

    const versions = snapshot.docs
      .filter(doc => doc.id !== '_meta')
      .map(doc => {
        const mapped = mapPriceSettingsVersionDoc(doc) || {}
        return {
          id: doc.id,
          version: mapped.version,
          timestamp: mapped.createdAt,
          savedBy: mapped.createdBy,
          parameters: mapped.parameters || [],
          formula: mapped.formula || '',
          changeSummary: mapped.changeSummary || null,
          notes: mapped.notes || null,
          userTag: mapped.userTag || doc.data().userTag || null,
          dailyIndex: mapped.dailyIndex || doc.data().dailyIndex || null,
          dateKey: mapped.dateKey || doc.data().dateKey || null,
          versionId: mapped.versionId || doc.id,
          data: {
            parameters: mapped.parameters || [],
            formula: mapped.formula || ''
          }
        }
      })

    return { versions }
  } catch (error) {
    console.error('❌ Failed to get versions:', error)
    return { versions: [] }
  }
}

async function restorePriceSettingsVersion(versionId, userInfo = null) {
  ensureReady()

  try {
    const versionDoc = await priceSettingsVersionsRef.doc(versionId).get()

    if (!versionDoc.exists) {
      throw new Error('Version not found')
    }

    const mapped = mapPriceSettingsVersionDoc(versionDoc)
    const rawData = versionDoc.data() || {}
    const snapshot = { ...rawData.settingsSnapshot, ...rawData.settings, ...rawData.data }

    if (!snapshot.parameters && mapped?.parameters) snapshot.parameters = mapped.parameters
    if (snapshot.formula === undefined && mapped?.formula !== undefined) snapshot.formula = mapped.formula

    delete snapshot.version
    delete snapshot.versionId
    delete snapshot.createdAt
    delete snapshot.createdBy

    const newVersionResult = await savePriceSettingsWithVersioning(snapshot, {
      ...userInfo,
      action: `Restored from version ${mapped?.version || versionId}`
    }, { changeSummary: `Restored from ${versionId}` })

    return {
      success: true,
      restoredVersion: newVersionResult.version,
      originalVersion: mapped?.version || null
    }
  } catch (error) {
    console.error('❌ Failed to restore version:', error)
    throw error
  }
}

async function saveFormConfigWithVersioning(config, userInfo = null, options = {}) {
  ensureReady()

  try {
    const cleanedConfig = filterUndefinedValues({ ...config })
    const savedBy = formatUserInfo(userInfo)

    const { versionId, version } = await db.runTransaction(async tx => {
      const metaSnap = await tx.get(formVersionsMetaDoc)
      const existingMeta = metaSnap.exists
        ? { ...defaultFormConfigMeta(), ...metaSnap.data() }
        : defaultFormConfigMeta()

      const nextVersionNumber = (existingMeta.versionCounter || 0) + 1
      const resolvedVersionId = options.versionId || `f${String(nextVersionNumber).padStart(4, '0')}`
      const timestamp = admin.firestore.FieldValue.serverTimestamp()

      const versionDocRef = formVersionsRef.doc(resolvedVersionId)
      tx.set(versionDocRef, {
        versionId: resolvedVersionId,
        versionNumber: nextVersionNumber,
        createdAt: timestamp,
        createdBy: savedBy,
        configSnapshot: cleanedConfig,
        changeSummary: options.changeSummary || null
      })

      tx.set(formVersionsMetaDoc, {
        currentVersionId: resolvedVersionId,
        currentVersionNumber: nextVersionNumber,
        versionCounter: nextVersionNumber,
        lastUpdatedAt: timestamp,
        lastUpdatedBy: savedBy
      }, { merge: true })

      return { versionId: resolvedVersionId, version: nextVersionNumber }
    })

    state.formConfigMeta = {
      ...(state.formConfigMeta || defaultFormConfigMeta()),
      currentVersionId: versionId,
      currentVersionNumber: version,
      versionCounter: version
    }

    await refreshFormConfigState(versionId)

    fireAndForget(
      settingsDoc.set({
        formConfigRef: versionId,
        currentFormVersion: version,
        currentFormVersionId: versionId
      }, { merge: true }),
      'saveFormConfig_reference'
    )

    return {
      success: true,
      versionId,
      version,
      config: clone(state.formConfig)
    }
  } catch (error) {
    console.error('❌ Failed to save form config version:', error)
    throw error
  }
}

async function getFormConfigVersions(limit = 15) {
  ensureReady()

  try {
    const snapshot = await formVersionsRef
      .orderBy('versionNumber', 'desc')
      .limit(limit)
      .get()

    const versions = snapshot.docs.map(doc => {
      const mapped = mapFormConfigVersionDoc(doc) || {}
      return {
        id: doc.id,
        version: mapped.version,
        timestamp: mapped.createdAt,
        savedBy: mapped.createdBy,
        changeSummary: mapped.changeSummary || null,
        notes: mapped.notes || null
      }
    })

    return { versions }
  } catch (error) {
    console.error('❌ Failed to get form config versions:', error)
    return { versions: [] }
  }
}

async function restoreFormConfigVersion(versionId, userInfo = null) {
  ensureReady()

  try {
    const versionDoc = await formVersionsRef.doc(versionId).get()

    if (!versionDoc.exists) {
      throw new Error('Form version not found')
    }

    const mapped = mapFormConfigVersionDoc(versionDoc)
    const rawData = versionDoc.data() || {}
    const snapshot = { ...rawData.configSnapshot, ...rawData.config, ...rawData.data }

    delete snapshot.version
    delete snapshot.versionId
    delete snapshot.createdAt
    delete snapshot.createdBy

    const result = await saveFormConfigWithVersioning(snapshot, {
      ...userInfo,
      action: `Restored from version ${mapped?.version || versionId}`
    }, { changeSummary: `Restored from ${versionId}` })

    return {
      success: true,
      restoredVersion: result.version,
      restoredVersionId: result.versionId,
      originalVersion: mapped?.version || null,
      originalVersionId: mapped?.versionId || versionId
    }
  } catch (error) {
    console.error('❌ Failed to restore form config version:', error)
    throw error
  }
}

function getFormConfig() {
  ensureReady()
  return clone(state.formConfig || null)
}

function putFormConfig(config, userInfo = null) {
  ensureReady()
  return saveFormConfigWithVersioning(config, userInfo)
    .then(result => clone(result))
}

function resetPricingConfig(reason = 'Form configuration updated') {
  ensureReady()
  const entry = { reason, timestamp: new Date().toISOString() }
  const history = Array.isArray(state.settings.pricingResets)
    ? [...state.settings.pricingResets, entry]
    : [entry]
  state.settings.pricingResets = history
  state.settings.lastPricingReset = entry
  fireAndForget(settingsDoc.set({ pricingResets: history, lastPricingReset: entry }, { merge: true }), 'resetPricingConfig')
}

function getSettings() {
  ensureReady()
  const combined = {
    ...state.settings,
    currentPriceSettingsVersion: state.priceSettingsMeta?.currentVersionNumber || null,
    currentPriceSettingsVersionId: state.priceSettingsMeta?.currentVersionId || null,
    priceSettings: state.priceSettings || null,
    formConfig: state.formConfig || null
  }
  return clone(combined)
}

function putSettings(settings) {
  ensureReady()
  if (!settings || typeof settings !== 'object') {
    return clone({ ...state.settings, priceSettings: state.priceSettings, formConfig: state.formConfig })
  }

  const { priceSettings: inlinePriceSettings, formConfig: inlineFormConfig, ...rest } = settings
  state.settings = { ...state.settings, ...rest }
  fireAndForget(settingsDoc.set(state.settings, { merge: true }), 'putSettings')

  if (inlinePriceSettings) {
    fireAndForget(
      savePriceSettingsWithVersioning(inlinePriceSettings),
      'putSettings_priceSettingsVersion'
    )
  }

  if (inlineFormConfig) {
    fireAndForget(
      saveFormConfigWithVersioning(inlineFormConfig),
      'putSettings_formConfigVersion'
    )
  }

  return clone({
    ...state.settings,
    priceSettings: state.priceSettings,
    formConfig: state.formConfig
  })
}

function listUsersRaw() {
  ensureReady()
  return clone(state.users)
}

function getUser(email) {
  ensureReady()
  return clone(state.users.find(u => u.email === email) || null)
}

function upsertUser(user) {
  ensureReady()
  if (!user?.email) throw new Error('User must include an email')
  const idx = state.users.findIndex(u => u.email === user.email)
  const stored = idx === -1 ? { ...user } : { ...state.users[idx], ...user }
  if (idx === -1) state.users.push(stored)
  else state.users[idx] = stored
  fireAndForget(usersRef.doc(user.email).set(stored, { merge: true }), `upsertUser(${user.email})`)
  return clone(stored)
}

function deleteUser(email) {
  ensureReady()
  const idx = state.users.findIndex(u => u.email === email)
  if (idx === -1) return false
  state.users.splice(idx, 1)
  fireAndForget(usersRef.doc(email).delete(), `deleteUser(${email})`)
  return true
}

function putSession(session) {
  ensureReady()
  if (!session?.token) throw new Error('Session must include a token')
  if (!session?.sessionId) throw new Error('Session must include a sessionId')
  
  const existing = state.sessions.find(s => s.sessionId === session.sessionId || s.token === session.token)

  // Remove existing session with same token or sessionId
  state.sessions = state.sessions.filter(s => s.token !== session.token && s.sessionId !== session.sessionId)
  const normalized = normalizeSessionData({
    ...existing,
    ...session,
    sessionId: session.sessionId,
    token: session.token
  })

  state.sessions.push(normalized)

  const cleanStored = filterUndefinedValues(normalized)

  // Store in Firestore using sessionId as document ID
  fireAndForget(sessionsRef.doc(session.sessionId).set(cleanStored, { merge: true }), `putSession(${session.sessionId})`)
}

function getSession(token) {
  ensureReady()
  return clone(state.sessions.find(s => s.token === token) || null)
}

function getSessionById(sessionId) {
  ensureReady()
  return clone(state.sessions.find(s => s.sessionId === sessionId) || null)
}

function getAllSessions() {
  ensureReady()
  return clone(state.sessions)
}

function deleteSessionById(sessionId) {
  ensureReady()
  const session = state.sessions.find(s => s.sessionId === sessionId)
  if (session) {
    state.sessions = state.sessions.filter(s => s.sessionId !== sessionId)
    fireAndForget(sessionsRef.doc(sessionId).delete(), `deleteSessionById(${sessionId})`)
    return true
  }
  return false
}

function deleteSession(token) {
  ensureReady()
  const session = state.sessions.find(s => s.token === token)
  if (session) {
    state.sessions = state.sessions.filter(s => s.token !== token)
    // Delete from Firestore using sessionId
    fireAndForget(sessionsRef.doc(session.sessionId).delete(), `deleteSession(${session.sessionId})`)
  }
}

function getSystemConfig() {
  ensureReady()
  return clone(state.systemConfig)
}

function putSystemConfig(config) {
  ensureReady()
  state.systemConfig = { ...state.systemConfig, ...config }
  fireAndForget(systemDoc.set(state.systemConfig, { merge: true }), 'putSystemConfig')
  return clone(state.systemConfig)
}

// Quote-based price version tracking
export async function saveQuoteWithPriceVersion(quoteData) {
  try {
    ensureReady()

    const now = new Date().toISOString()
    const currentPriceSettings = getPriceSettings()
    const priceMeta = state.priceSettingsMeta || defaultPriceSettingsMeta()
    const currentFormConfig = getFormConfig()

    const priceVersionId = currentPriceSettings?.versionId || state.priceSettingsMeta?.currentVersionId || null
    const priceVersionNumber = currentPriceSettings?.version || state.priceSettingsMeta?.currentVersionNumber || null

    const formVersionId = currentFormConfig?.versionId || state.formConfigMeta?.currentVersionId || null
    const formVersionNumber = currentFormConfig?.version || state.formConfigMeta?.currentVersionNumber || null

    const quoteId = quoteData.id || generateQuoteId()

    const priceCalculationSnapshot = {
      versionId: priceVersionId,
      version: priceVersionNumber,
      timestamp: now,
      parameters: currentPriceSettings?.parameters || [],
      formula: currentPriceSettings?.formula || '',
      calculatedPrice: quoteData.calculatedPrice
    }

    const versionSnapshot = priceVersionId || priceVersionNumber ? {
      versionId: priceVersionId,
      versionNumber: priceVersionNumber,
      capturedAt: now
    } : null

    const originalSnapshot = quoteData.priceVersionOriginal || versionSnapshot || null

    const quoteWithVersion = {
      ...quoteData,
      id: quoteId,
      priceCalculation: priceCalculationSnapshot,
      priceVersionOriginal: originalSnapshot,
      priceVersionApplied: versionSnapshot,
      priceVersion: versionSnapshot,
      formVersion: formVersionId || formVersionNumber ? {
        versionId: formVersionId,
        versionNumber: formVersionNumber,
        capturedAt: now
      } : null
    }

    await quotesRef.doc(quoteId).set(quoteWithVersion, { merge: true })
    return { id: quoteId, ...quoteWithVersion }
  } catch (error) {
    console.error('Error saving quote with price version:', error)
    throw error
  }
}

export async function compareQuotePriceVersions(quoteId) {
  try {
    // Get quote with its original price version
    const quoteDoc = await quotesRef.doc(quoteId).get()
    if (!quoteDoc.exists) {
      const notFoundError = new Error(`Quote ${quoteId} not found`)
      notFoundError.status = 404
      throw notFoundError
    }

    const quoteData = quoteDoc.data()
    if (quoteData.manualOverride?.active) {
      const manualInfo = quoteData.manualOverride
      const lockedPrice = validateManualPrice(manualInfo.price ?? quoteData.price ?? 0)
      const reasons = [
        `Fiyat manuel olarak ${manualInfo.setByLabel || 'admin'} tarafından kilitlendi`,
        manualInfo.note ? `Not: ${manualInfo.note}` : null
      ].filter(Boolean)

      const differences = {
        parameters: {
          added: [],
          removed: [],
          modified: []
        },
        formula: {
          changed: false,
          originalFormula: '',
          currentFormula: ''
        },
        reasons
      }

      const differenceSummary = {
        priceDiff: 0,
        oldPrice: lockedPrice,
        newPrice: lockedPrice,
        comparisonBaseline: 'manual',
        reasons,
        manualOverride: manualInfo,
        evaluatedAt: new Date().toISOString()
      }

      return {
        quote: {
          id: quoteId,
          originalPrice: lockedPrice,
          appliedPrice: lockedPrice,
          latestPrice: lockedPrice,
          priceChanged: false,
          status: 'manual-override'
        },
        comparisonBaseline: 'manual',
        versions: {
          original: null,
          applied: null,
          latest: null
        },
        differences,
        differenceSummary
      }
    }

    const originalPriceCalc = quoteData.priceCalculation || {}

    const currentPriceSettings = getPriceSettings() || {}
    const currentVersionId = state.priceSettingsMeta?.currentVersionId || currentPriceSettings?.versionId || null
    const currentVersionNumber = state.priceSettingsMeta?.currentVersionNumber || currentPriceSettings?.version || null

    const originalSnapshot = quoteData.priceVersionOriginal || quoteData.priceVersion || null
    const appliedSnapshot = quoteData.priceVersionApplied || quoteData.priceVersion || originalSnapshot

    const [originalVersionSettings, appliedVersionSettings] = await Promise.all([
      getPriceSettingsVersionSnapshot({
        versionId: originalSnapshot?.versionId || originalPriceCalc.versionId || null,
        versionNumber: originalSnapshot?.versionNumber || originalPriceCalc.version || null
      }),
      getPriceSettingsVersionSnapshot({
        versionId: appliedSnapshot?.versionId || null,
        versionNumber: appliedSnapshot?.versionNumber || null
      })
    ])

    await ensurePriceCalculator()
    const { calculatePriceServer } = calculatePriceServerModule

    const originalSettingsResolved = originalVersionSettings || settingsFromPriceCalculation(originalPriceCalc) || {}
    const appliedSettingsResolved = appliedVersionSettings || originalSettingsResolved
    const latestSettingsResolved = currentPriceSettings || {}

    const originalPrice = calculatePriceServer(quoteData, originalSettingsResolved)
    const appliedPrice = calculatePriceServer(quoteData, appliedSettingsResolved)
    const latestPrice = calculatePriceServer(quoteData, latestSettingsResolved)

    const priceDiff = Number(((latestPrice || 0) - (appliedPrice || 0)).toFixed(2))

    const differences = findPriceSettingsDifferences(appliedSettingsResolved || {}, latestSettingsResolved || {})

    const comparisonBaseline = appliedSnapshot ? 'applied' : 'original'

    let status = 'current'
    if (Math.abs(priceDiff) > 0.01) {
      status = 'price-drift'
    } else if (differences.reasons.length > 0) {
      status = 'content-drift'
    } else if (
      (appliedSnapshot?.versionNumber || appliedSnapshot?.versionId) &&
      (appliedSnapshot?.versionNumber !== currentVersionNumber || appliedSnapshot?.versionId !== currentVersionId)
    ) {
      status = 'outdated'
    }

    const evaluatedAt = new Date().toISOString()

    const differenceSummary = {
      priceDiff,
      oldPrice: appliedPrice,
      newPrice: latestPrice,
      comparisonBaseline,
      reasons: differences.reasons,
      parameterChanges: {
        added: differences.parameters.added,
        removed: differences.parameters.removed,
        modified: differences.parameters.modified
      },
      formulaChanged: differences.formula.changed,
      previousVersion: appliedSnapshot?.versionNumber || null,
      previousVersionId: appliedSnapshot?.versionId || null,
      originalVersion: originalSnapshot?.versionNumber || null,
      originalVersionId: originalSnapshot?.versionId || null,
      nextVersion: currentVersionNumber,
      nextVersionId: currentVersionId,
      evaluatedAt
    }

    return {
      quote: {
        id: quoteId,
        originalPrice,
        appliedPrice,
        latestPrice,
        priceChanged: Math.abs(priceDiff) > 0.01,
        status
      },
      comparisonBaseline,
      versions: {
        original: buildVersionInfo(originalSnapshot, originalSettingsResolved),
        applied: buildVersionInfo(appliedSnapshot, appliedSettingsResolved),
        latest: buildVersionInfo({ versionId: currentVersionId, versionNumber: currentVersionNumber }, latestSettingsResolved)
      },
      differences,
      differenceSummary
    }
  } catch (error) {
    console.error('Error comparing quote price versions:', error)
    
    // Add more context to the error
    if (error.status === 404) {
      throw error // Already well-formatted
    }
    
    const contextError = new Error(`Price comparison failed for quote ${quoteId}: ${error.message}`)
    contextError.originalError = error
    contextError.quoteId = quoteId
    throw contextError
  }
}

export async function updateQuotePrice(quoteId, newPrice, userInfo = {}) {
  try {
    await ensurePriceCalculator()
    const { calculatePriceServer } = calculatePriceServerModule

    const quoteDoc = await quotesRef.doc(quoteId).get()
    if (!quoteDoc.exists) {
      throw new Error('Quote not found')
    }

    const quoteData = quoteDoc.data()
    if (quoteData.manualOverride?.active) {
      const error = new Error('Cannot update price: quote is manually locked')
      error.code = 'MANUAL_OVERRIDE_ACTIVE'
      error.quoteId = quoteId
      throw error
    }
    const currentPriceSettings = getPriceSettings()
    const priceMeta = state.priceSettingsMeta || defaultPriceSettingsMeta()
    const appliedAt = new Date().toISOString()

    const recalculatedPrice = calculatePriceServer(quoteData, currentPriceSettings || {})
    const finalPrice = newPrice ?? recalculatedPrice

    const settingsVersion = currentPriceSettings?.version || priceMeta.currentVersionNumber || null
    const settingsVersionId = currentPriceSettings?.versionId || priceMeta.currentVersionId || null

    const originalVersionSnapshot = quoteData.priceVersionOriginal
      || quoteData.priceVersion
      || (quoteData.priceCalculation ? {
        versionId: quoteData.priceCalculation.versionId || null,
        versionNumber: quoteData.priceCalculation.version || null,
        capturedAt: quoteData.priceCalculation.timestamp || quoteData.priceCalculation.calculatedAt || null
      } : null)

    const statusInstance = PriceStatus.fromJSON(quoteData.priceStatus)
    const updatedStatus = statusInstance
      .updateCalculation(recalculatedPrice, settingsVersion, null, {
        settingsVersionId,
        formVersionId: quoteData.formVersion?.versionId || statusInstance.formVersionId || null,
        differenceSummary: null
      })
      .applyPrice()

    const priceVersionSnapshot = {
      versionId: settingsVersionId,
      versionNumber: settingsVersion,
      capturedAt: appliedAt,
      appliedBy: userInfo?.username || userInfo?.email || userInfo?.userId || 'system'
    }

    const updatePatch = {
      price: finalPrice,
      calculatedPrice: recalculatedPrice,
      priceStatus: updatedStatus.toJSON(),
      priceVersionOriginal: originalVersionSnapshot || priceVersionSnapshot,
      priceVersionApplied: priceVersionSnapshot,
      priceVersion: priceVersionSnapshot,
      appliedPriceVersion: priceVersionSnapshot,
      priceVersionLatest: null,
      pendingPriceVersion: null,
      pendingFormVersion: null,
      pendingCalculatedPrice: null,
      priceUpdateInfo: {
        timestamp: appliedAt,
        updatedBy: userInfo
      }
    }

    patchQuote(quoteId, updatePatch)
    const mergedQuote = getQuote(quoteId)

    return {
      success: true,
      updatedPrice: finalPrice,
      calculatedPrice: recalculatedPrice,
      priceVersion: priceVersionSnapshot,
      quote: mergedQuote
    }
  } catch (error) {
    console.error('Error updating quote price:', error)
    
    // Add context to the error
    const contextError = new Error(`Failed to update price for quote ${quoteId}: ${error.message}`)
    contextError.originalError = error
    contextError.quoteId = quoteId
    contextError.code = error.code || 'PRICE_UPDATE_FAILED'
    throw contextError
  }
}

function findPriceSettingsDifferences(original, current) {
  const differences = {
    parameters: {
      added: [],
      removed: [],
      modified: []
    },
    formula: {
      changed: (original.formula || '') !== (current.formula || ''),
      originalFormula: original.formula || '',
      currentFormula: current.formula || ''
    },
    reasons: []
  }

  const originalParams = Array.isArray(original.parameters) ? original.parameters : []
  const currentParams = Array.isArray(current.parameters) ? current.parameters : []

  const originalParamMap = new Map(originalParams.map(p => [p.id, p]))
  const currentParamMap = new Map(currentParams.map(p => [p.id, p]))

  const extractParamValue = (param) => {
    if (!param) return null
    if (param.type === 'fixed') {
      if (param.value === undefined || param.value === null) return null
      const num = Number(param.value)
      return Number.isNaN(num) ? param.value : num
    }
    if (param.type === 'lookup' && Array.isArray(param.lookupTable)) {
      return param.lookupTable.map(entry => `${entry.option || '?'}:${entry.value ?? '-'}`).join(', ')
    }
    if (param.type === 'form') {
      return param.formField || null
    }
    return param.value ?? param.defaultValue ?? null
  }

  const added = []
  currentParams.forEach(param => {
    if (!originalParamMap.has(param.id)) {
      added.push({
        changeType: 'added',
        id: param.id,
        name: param.name || param.id,
        newParam: param,
        newValue: extractParamValue(param)
      })
    }
  })

  const removed = []
  originalParams.forEach(param => {
    if (!currentParamMap.has(param.id)) {
      removed.push({
        changeType: 'removed',
        id: param.id,
        name: param.name || param.id,
        oldParam: param,
        oldValue: extractParamValue(param)
      })
    }
  })

  const modified = []
  currentParams.forEach(param => {
    const originalParam = originalParamMap.get(param.id)
    if (!originalParam) return
    if (JSON.stringify(originalParam) === JSON.stringify(param)) return
    modified.push({
      changeType: 'modified',
      id: param.id,
      name: param.name || param.id,
      oldParam: originalParam,
      newParam: param,
      oldValue: extractParamValue(originalParam),
      newValue: extractParamValue(param)
    })
  })

  differences.parameters.added = added
  differences.parameters.removed = removed
  differences.parameters.modified = modified

  const reasons = []

  added.forEach(change => {
    const valueText = change.newValue !== null && change.newValue !== undefined ? ` = ${change.newValue}` : ''
    reasons.push(`Yeni parametre eklendi: ${change.name}${valueText}`)
  })

  removed.forEach(change => {
    const valueText = change.oldValue !== null && change.oldValue !== undefined ? ` (eski: ${change.oldValue})` : ''
    reasons.push(`Parametre kaldırıldı: ${change.name}${valueText}`)
  })

  modified.forEach(change => {
    const oldVal = change.oldValue !== null && change.oldValue !== undefined ? change.oldValue : '—'
    const newVal = change.newValue !== null && change.newValue !== undefined ? change.newValue : '—'
    reasons.push(`${change.name}: ${oldVal} → ${newVal}`)
  })

  if (differences.formula.changed) {
    reasons.push('Fiyat formülü güncellendi')
  }

  differences.reasons = reasons

  return differences
}

export default {
  listQuotes,
  getQuote,
  putQuote,
  patchQuote,
  removeQuote,
  delete: removeQuote,
  generateQuoteId,
  getPriceSettings,
  savePriceSettings,
  // New version management functions
  savePriceSettingsWithVersioning,
  getPriceSettingsVersions,
  restorePriceSettingsVersion,
  getFormConfig,
  putFormConfig,
  saveFormConfigWithVersioning,
  getFormConfigVersions,
  restoreFormConfigVersion,
  resetPricingConfig,
  getSettings,
  putSettings,
  listUsersRaw,
  getUser,
  upsertUser,
  deleteUser,
  putSession,
  getSession,
  getSessionById,
  getAllSessions,
  appendSessionActivity,
  deleteSession,
  deleteSessionById,
  getSystemConfig,
  putSystemConfig,
  // Quote price version functions
  saveQuoteWithPriceVersion,
  getPriceSettingsVersionSnapshot,
  compareQuotePriceVersions,
  updateQuotePrice,
  setManualOverride,
  clearManualOverride,
  findPriceSettingsDifferences,
  // Firebase collections
  getQuotesCollection: () => quotesRef
}
