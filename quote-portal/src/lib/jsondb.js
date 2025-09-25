import admin from 'firebase-admin'
import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

if (!admin.apps.length) {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const serviceAccountPath = path.join(__dirname, '..', '..', 'serviceAccountKey.json')
  const raw = await readFile(serviceAccountPath, 'utf8')
  const serviceAccount = JSON.parse(raw)
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  })
}

const db = admin.firestore()
const quotesRef = db.collection('quotes')
const usersRef = db.collection('users')
const sessionsRef = db.collection('sessions')
const settingsDoc = db.collection('settings').doc('main')
const systemDoc = db.collection('system').doc('config')

const state = {
  ready: false,
  quotes: [],
  users: [],
  sessions: [],
  settings: {},
  systemConfig: {}
}

function clone(value) {
  return value === undefined || value === null ? value : JSON.parse(JSON.stringify(value))
}

function fireAndForget(promise, label) {
  promise.catch(err => console.error(`[jsondb] ${label} failed:`, err))
}

async function bootstrap() {
  const [quotesSnap, usersSnap, sessionsSnap, settingsSnap, systemSnap] = await Promise.all([
    quotesRef.get(),
    usersRef.get(),
    sessionsRef.get(),
    settingsDoc.get(),
    systemDoc.get()
  ])

  state.quotes = quotesSnap.docs.map(doc => doc.data())
  state.users = usersSnap.docs.map(doc => doc.data())
  state.sessions = sessionsSnap.docs.map(doc => doc.data())
  state.settings = settingsSnap.exists ? settingsSnap.data() : {}
  state.systemConfig = systemSnap.exists ? systemSnap.data() : {}
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
  state.sessions = snapshot.docs.map(doc => doc.data())
}, err => console.error('[jsondb] sessions snapshot error:', err))

settingsDoc.onSnapshot(doc => {
  state.settings = doc.exists ? doc.data() : {}
}, err => console.error('[jsondb] settings snapshot error:', err))

systemDoc.onSnapshot(doc => {
  state.systemConfig = doc.exists ? doc.data() : {}
}, err => console.error('[jsondb] system snapshot error:', err))

function ensureReady() {
  if (!state.ready) {
    throw new Error('jsondb not ready yet; Firestore bootstrap incomplete')
  }
}

function listQuotes() {
  ensureReady()
  return clone(state.quotes)
}

function getQuote(id) {
  ensureReady()
  return clone(state.quotes.find(q => q.id === id) || null)
}

function putQuote(quote) {
  ensureReady()
  if (!quote?.id) throw new Error('Quote must include an id')
  const idx = state.quotes.findIndex(q => q.id === quote.id)
  const stored = { ...quote }
  if (!stored.createdAt) stored.createdAt = new Date().toISOString()
  if (!stored.status) stored.status = 'new'
  if (idx >= 0) state.quotes[idx] = stored
  else state.quotes.push(stored)
  fireAndForget(quotesRef.doc(stored.id).set(stored), `putQuote(${stored.id})`)
  return clone(stored)
}

function patchQuote(id, patch) {
  ensureReady()
  const idx = state.quotes.findIndex(q => q.id === id)
  if (idx === -1) return false
  const merged = { ...state.quotes[idx], ...patch }
  state.quotes[idx] = merged
  fireAndForget(quotesRef.doc(id).set(merged, { merge: true }), `patchQuote(${id})`)
  return true
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
  return clone(state.settings.priceSettings || null)
}

function savePriceSettings(settings) {
  ensureReady()
  state.settings.priceSettings = { ...settings }
  fireAndForget(settingsDoc.set({ priceSettings: state.settings.priceSettings }, { merge: true }), 'savePriceSettings')
  return clone(state.settings.priceSettings)
}

function getFormConfig() {
  ensureReady()
  return clone(state.settings.formConfig || null)
}

function putFormConfig(config) {
  ensureReady()
  state.settings.formConfig = { ...config }
  fireAndForget(settingsDoc.set({ formConfig: state.settings.formConfig }, { merge: true }), 'putFormConfig')
  return clone(state.settings.formConfig)
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
  return clone(state.settings)
}

function putSettings(settings) {
  ensureReady()
  state.settings = { ...state.settings, ...settings }
  fireAndForget(settingsDoc.set(state.settings, { merge: true }), 'putSettings')
  return clone(state.settings)
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
  state.sessions = state.sessions.filter(s => s.token !== session.token)
  state.sessions.push({ ...session })
  fireAndForget(sessionsRef.doc(session.token).set({ ...session }), `putSession(${session.token})`)
}

function getSession(token) {
  ensureReady()
  return clone(state.sessions.find(s => s.token === token) || null)
}

function deleteSession(token) {
  ensureReady()
  state.sessions = state.sessions.filter(s => s.token !== token)
  fireAndForget(sessionsRef.doc(token).delete(), `deleteSession(${token})`)
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

export default {
  listQuotes,
  getQuote,
  putQuote,
  patchQuote,
  removeQuote,
  delete: removeQuote,
  getPriceSettings,
  savePriceSettings,
  getFormConfig,
  putFormConfig,
  resetPricingConfig,
  getSettings,
  putSettings,
  listUsersRaw,
  getUser,
  upsertUser,
  deleteUser,
  putSession,
  getSession,
  deleteSession,
  getSystemConfig,
  putSystemConfig
}
