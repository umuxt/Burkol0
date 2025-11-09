// Authentication system - User management and session handling with Firestore
import crypto from 'crypto'
import admin from 'firebase-admin'

// Firestore database instance
let db
export function getDb() {
  if (!db) {
    if (!admin.apps.length) {
      try { admin.initializeApp() } catch {}
    }
    db = admin.firestore()
  }
  return db
}

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
  return { email, pw_salt: salt, pw_hash: hash, role }
}

export async function verifyUser(email, password) {
  try {
    // Firestore'dan kullanıcıyı al
    const usersSnapshot = await getDb().collection('users').where('email', '==', email).get()
    
    if (usersSnapshot.empty) {
      console.log('❌ User not found:', email)
      return null
    }
    
    const userDoc = usersSnapshot.docs[0]
    const user = userDoc.data()
    
    // Kullanıcının aktif olup olmadığını kontrol et
    if (user.active === false) {
      return { error: 'account_deactivated', message: 'Hesabınız devre dışı bırakılmış.' }
    }
    
    // Plain password kontrolü (admin panel kullanıcıları için)
    if (user.plainPassword && user.plainPassword === password) {
      console.log('✅ User verified with plain password:', email)
      return { 
        id: userDoc.id,
        email: user.email, 
        role: user.role || 'admin',
        name: user.name || user.email
      }
    }
    
    // Hash-based authentication
    if (user.pw_hash && user.pw_salt) {
      const { hash } = hashPassword(password, user.pw_salt)
      if (hash === user.pw_hash) {
        console.log('✅ User verified with hash:', email)
        return { 
          id: userDoc.id,
          email: user.email, 
          role: user.role || 'admin',
          name: user.name || user.email
        }
      }
    }
    
    console.log('❌ Invalid password for user:', email)
    return null
    
  } catch (error) {
    console.error('❌ Error verifying user:', error)
    return null
  }
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
  
  // Get user info for session from Firestore
  let userName = email.split('@')[0] // fallback
  let workerId = null // Worker ID if user is a worker
  
  try {
    const usersSnapshot = await getDb().collection('users').where('email', '==', email).get()
    if (!usersSnapshot.empty) {
      const userData = usersSnapshot.docs[0].data()
      userName = userData.name || userData.email?.split('@')[0] || userName
      workerId = userData.workerId || null // Extract workerId if exists
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
    workerId, // Include workerId in session
    loginTime: loginTime.toISOString(),
    loginDate: loginTime.toISOString().split('T')[0], // YYYY-MM-DD format
    expires: expires.toISOString(),
    lastActivityAt: loginTime.toISOString(),
    isActive: true, // Session aktif durumda
    logoutTime: null, // Henüz çıkış yapılmamış
    activityLog: [loginActivity]
  }
  
  // Save to memory stores
  memory.sessions.set(token, sessionData)
  memory.sessionsById.set(sessionId, sessionData)
  
  // Persist to Firestore (best-effort)
  try {
    await getDb().collection('sessions').doc(sessionId).set({
      sessionId,
      token,
      email,
      userName,
      workerId, // Persist workerId to Firestore
      loginTime: sessionData.loginTime,
      loginDate: sessionData.loginDate,
      expires: sessionData.expires,
      lastActivityAt: sessionData.lastActivityAt,
      isActive: true,
      logoutTime: null
    }, { merge: true })
  } catch (err) {
    console.warn('[auth] Failed to persist session to Firestore:', err?.message)
  }
  return token
}

export function getSession(token) {
  if (!token) return null
  const session = memory.sessions.get(token)
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
      // Best-effort Firestore delete
      getDb().collection('sessions').doc(session.sessionId).delete().catch(() => {})
    }
  }
}

// Middleware
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  
  if (!token) {
    // Development convenience: allow missing token locally
    if ((process.env.NODE_ENV || 'development') !== 'production') {
      req.user = { email: 'dev@burkol.com', role: 'admin', source: 'dev-missing-token' }
      return next()
    }
    return res.status(401).json({ error: 'No token provided' })
  }
  
  // Development mode: allow dev tokens
  if (token.startsWith('dev-')) {
    req.user = { email: 'dev@burkol.com', role: 'admin' }
    return next()
  }
  
  const session = getSession(token)
  if (!session) {
    if ((process.env.NODE_ENV || 'development') !== 'production') {
      req.user = { email: 'dev@burkol.com', role: 'admin', source: 'dev-invalid-token' }
      return next()
    }
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
  
  req.user = session
  next()
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
  
  // Best-effort Firestore update
  try {
    const patch = { ...sessionData }
    if (patch.activityLog) delete patch.activityLog
    await getDb().collection('sessions').doc(sessionData.sessionId).set(patch, { merge: true })
  } catch (err) {
    console.warn('[auth] Failed to update session in Firestore:', err?.message)
  }
}

export function deleteSessionById(sessionId) {
  if (!sessionId) return false
  const tokenEntry = Array.from(memory.sessions.entries()).find(([, s]) => s.sessionId === sessionId)
  if (tokenEntry) {
    memory.sessions.delete(tokenEntry[0])
  }
  const ok = memory.sessionsById.delete(sessionId)
  // Best-effort Firestore delete
  getDb().collection('sessions').doc(sessionId).delete().catch(() => {})
  return ok
}

export function listUsersRaw() {
  return Array.from(memory.users.values())
}

export async function listUsersFromFirebase() {
  try {
    const usersSnapshot = await getDb().collection('users').get()
    const users = []
    
    usersSnapshot.forEach(doc => {
      const userData = doc.data()
      users.push({
        id: doc.id,
        email: userData.email,
        role: userData.role || 'admin',
        active: userData.active !== false,
        createdAt: userData.createdAt,
        deactivatedAt: userData.deactivatedAt,
        plainPassword: userData.plainPassword,
        name: userData.name || userData.email,
        pw_hash: userData.pw_hash,
        pw_salt: userData.pw_salt
      })
    })
    
    console.log(`📋 Loaded ${users.length} users from Firebase`)
    return users
  } catch (error) {
    console.error('❌ Error loading users from Firebase:', error)
    throw error
  }
}

export async function listSessionsFromFirebase() {
  try {
    const db = getDb()
    // Primary: sessions collection
    const sessionsSnap = await db.collection('sessions').orderBy('lastActivityAt', 'desc').limit(200).get()
    const sessions = sessionsSnap.docs.map(doc => ({ sessionId: doc.id, ...(doc.data() || {}) }))

    // Enrich with audit logs (support both names)
    const auditCollections = ['audit_logs', 'auditLogs']
    let audits = []
    for (const coll of auditCollections) {
      try {
        const snap = await db.collection(coll).orderBy('timestamp', 'desc').limit(200).get()
        audits = audits.concat(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch {}
    }
    if (audits.length) {
      const latestBySession = new Map()
      for (const a of audits) {
        const sid = a?.performedBy?.sessionId
        if (!sid) continue
        const prev = latestBySession.get(sid)
        if (!prev || (a.timestamp > prev.timestamp)) latestBySession.set(sid, a)
      }
      for (const s of sessions) {
        if (!s.lastActivityAt && latestBySession.has(s.sessionId)) {
          s.lastActivityAt = latestBySession.get(s.sessionId).timestamp
        }
      }
    }

    console.log(`📋 Loaded ${sessions.length} sessions from Firestore`)
    return sessions
  } catch (error) {
    console.error('❌ Error loading sessions from Firebase:', error)
    throw error
  }
}

export function getUserByEmail(email) {
  return memory.users.get(email)
}
