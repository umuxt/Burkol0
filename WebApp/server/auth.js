// Authentication system - User management and session handling with PostgreSQL
import crypto from 'crypto'
import * as Users from '../db/models/users.js'
import * as Sessions from '../db/models/sessions.js'
import db from '../db/connection.js'

// In-memory cache for sessions and system config
const memory = {
  sessions: new Map(), // key: token
  sessionsById: new Map(), // key: sessionId
  systemConfig: { dailySessionCounters: {} }
}

// Authentication functions
export function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('base64')
  const dk = crypto.scryptSync(String(password), Buffer.from(s, 'base64'), 64)
  return { salt: s, hash: dk.toString('base64') }
}

export function createUser(email, password, role = 'admin') {
  const { salt, hash } = hashPassword(password)
  return { email, pwSalt: salt, pwHash: hash, role }
}

export async function verifyUser(email, password) {
  return await Users.verifyUserCredentials(email, password, hashPassword);
}

// Session management
export function newToken() { 
  return crypto.randomBytes(32).toString('base64url') 
}

// Generate session ID with format: ss-yyyymmdd-000x
export function generateSessionId() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const dateKey = `${year}${month}${day}`
  
  // Get daily counter from system config
  const dailyCounters = memory.systemConfig.dailySessionCounters || {}
  const currentCounter = (dailyCounters[dateKey] || 0) + 1
  
  // Update counter in system config
  const updatedCounters = { ...dailyCounters, [dateKey]: currentCounter }
  memory.systemConfig.dailySessionCounters = updatedCounters
  
  // Format counter with leading zeros (4 digits max)
  const counterStr = String(currentCounter).padStart(4, '0')
  
  return `ss-${dateKey}-${counterStr}`
}

export async function createSession(email, days = 7) {
  const token = newToken()
  const sessionId = generateSessionId()
  const loginTime = new Date()
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  
  // Get user info for session from PostgreSQL
  let userName = email.split('@')[0] // fallback
  let workerId = null
  
  try {
    const user = await Users.getUserByEmail(email)
    if (user) {
      userName = user.name || user.email?.split('@')[0] || userName
      workerId = user.workerId || null
    }
  } catch (error) {
    console.warn('Warning: Could not fetch user details for session:', error.message)
  }
  
  // Create login activity data
  const loginActivity = {
    id: `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: loginTime.toISOString(),
    type: 'session',
    action: 'login',
    scope: 'auth',
    title: 'Admin panel giriş yapıldı',
    description: `${email} oturumu başlatıldı`,
    metadata: {
      email,
      expires: expires.toISOString(),
      workerId: workerId || undefined
    },
    performedBy: {
      email,
      userName,
      sessionId
    }
  }
  
  const sessionData = {
    sessionId,
    token,
    userName,
    email,
    workerId,
    loginTime: loginTime.toISOString(),
    loginDate: loginTime.toISOString().split('T')[0],
    expires: expires.toISOString(),
    lastActivityAt: loginTime.toISOString(),
    isActive: true,
    logoutTime: null,
    activityLog: [loginActivity]
  }
  
  // Save to memory stores
  memory.sessions.set(token, sessionData)
  memory.sessionsById.set(sessionId, sessionData)
  
  // Persist to PostgreSQL (best-effort)
  try {
    await Sessions.createSession(sessionData)
  } catch (err) {
    console.warn('[auth] Failed to persist session to PostgreSQL:', err?.message)
  }
  
  return token
}

export async function getSession(token) {
  if (!token) return null
  
  // First check memory cache
  let session = memory.sessions.get(token)
  
  // If not in memory, try database (for serverless environments)
  if (!session) {
    try {
      session = await Sessions.getSessionByToken(token)
      if (session) {
        // Cache in memory for subsequent requests in same instance
        memory.sessions.set(token, session)
        memory.sessionsById.set(session.sessionId, session)
      }
    } catch (err) {
      console.warn('[auth] Failed to fetch session from DB:', err?.message)
      return null
    }
  }
  
  if (!session) return null
  
  if (new Date() > new Date(session.expires)) {
    memory.sessions.delete(token)
    // keep sessionsById for admin listing with inactive flag
    return null
  }
  
  // Copy workerId to session object for req.user access
  const sessionWithWorker = { ...session }
  if (session.workerId) {
    sessionWithWorker.workerId = session.workerId
  }
  
  return sessionWithWorker
}

export function deleteSession(token) { 
  if (token) {
    const session = memory.sessions.get(token)
    if (session) memory.sessionsById.delete(session.sessionId)
    memory.sessions.delete(token)
    if (session && session.sessionId) {
      // Best-effort PostgreSQL delete
      Sessions.deleteSessionById(session.sessionId).catch(() => {})
    }
  }
}

// Middleware
export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  
  if (!token) {
    // Development convenience: allow missing token locally
    if ((process.env.NODE_ENV || 'development') !== 'production') {
      req.user = { email: 'dev@beeplan.com', role: 'admin', source: 'dev-missing-token' }
      return next()
    }
    return res.status(401).json({ error: 'No token provided' })
  }
  
  // Development mode: allow dev tokens
  if (token.startsWith('dev-')) {
    req.user = { email: 'dev@beeplan.com', role: 'admin' }
    return next()
  }
  
  try {
    const session = await getSession(token)
    if (!session) {
      if ((process.env.NODE_ENV || 'development') !== 'production') {
        req.user = { email: 'dev@beeplan.com', role: 'admin', source: 'dev-invalid-token' }
        return next()
      }
      return res.status(401).json({ error: 'Invalid or expired token' })
    }
    
    req.user = session
    next()
  } catch (err) {
    console.error('[auth] Error in requireAuth:', err)
    return res.status(500).json({ error: 'Authentication error' })
  }
}

// Admin helpers to replace jsondb usage in routes
export function upsertUser(user) {
  if (user && user.email) memory.users.set(user.email, user)
}

export function getAllSessions() {
  return Array.from(memory.sessionsById.values())
}

export async function updateSession(sessionData) {
  if (!sessionData) return
  const tokenEntry = Array.from(memory.sessions.entries()).find(([, s]) => s.sessionId === sessionData.sessionId)
  const existing = tokenEntry ? tokenEntry[1] : memory.sessionsById.get(sessionData.sessionId)
  const merged = existing ? {
    ...existing,
    ...sessionData,
    activityLog: [...(existing.activityLog || []), ...((sessionData.activityLog) || [])]
  } : sessionData
  if (tokenEntry) {
    memory.sessions.set(tokenEntry[0], merged)
  }
  memory.sessionsById.set(sessionData.sessionId, merged)
  
  // Best-effort PostgreSQL update
  try {
    await Sessions.updateSession(sessionData.sessionId, sessionData)
  } catch (err) {
    console.warn('[auth] Failed to update session in PostgreSQL:', err?.message)
  }
}

export function deleteSessionById(sessionId) {
  if (!sessionId) return false
  const tokenEntry = Array.from(memory.sessions.entries()).find(([, s]) => s.sessionId === sessionId)
  if (tokenEntry) {
    memory.sessions.delete(tokenEntry[0])
  }
  const ok = memory.sessionsById.delete(sessionId)
  // Best-effort PostgreSQL delete
  Sessions.deleteSessionById(sessionId).catch(() => {})
  return ok
}

export function listUsersRaw() {
  return Array.from(memory.users.values())
}

export async function listUsersFromDatabase() {
  try {
    const users = await Users.getAllUsers()
    console.log(`📋 Loaded ${users.length} users from PostgreSQL`)
    return users.map(user => ({
      id: user.id,
      email: user.email,
      role: user.role || 'admin',
      active: user.active !== false,
      createdAt: user.createdAt,
      deactivatedAt: user.deactivatedAt,
      plainPassword: user.plainPassword,
      name: user.name || user.email,
      pwHash: user.pwHash,
      pwSalt: user.pwSalt,
      workerId: user.workerId
    }))
  } catch (error) {
    console.error('❌ Error loading users from PostgreSQL:', error)
    throw error
  }
}

export async function listSessionsFromDatabase() {
  try {
    const sessions = await Sessions.getAllSessions()
    console.log(`📋 Loaded ${sessions.length} sessions from PostgreSQL`)
    return sessions
  } catch (error) {
    console.error('❌ Error loading sessions from PostgreSQL:', error)
    throw error
  }
}

export function getUserByEmail(email) {
  return memory.users.get(email)
}
