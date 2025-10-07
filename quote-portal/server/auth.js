// Authentication system - User management and session handling
import crypto from 'crypto'
import jsondb from '../src/lib/jsondb.js'

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

export function verifyUser(email, password) {
  const user = jsondb.getUser(email)
  if (!user) return null
  
  // Kullanıcının aktif olup olmadığını kontrol et
  if (user.active === false) {
    return { error: 'account_deactivated', message: 'Hesabınız devre dışı bırakılmış.' }
  }
  
  // SADECE Admin Panel'den yönetilen şifreler kabul edilir
  if (user.plainPassword && user.plainPassword === password) {
    return { email: user.email, role: user.role }
  }
  
  // Authentication simplified for admin access only
  // - Legacy password fields no longer used
  // - Hash-based authentication removed
  // - Only plain text admin password verification active
  
  return null
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
  const systemConfig = jsondb.getSystemConfig()
  const dailyCounters = systemConfig.dailySessionCounters || {}
  const currentCounter = (dailyCounters[dateKey] || 0) + 1
  
  // Update counter in system config
  const updatedCounters = { ...dailyCounters, [dateKey]: currentCounter }
  jsondb.putSystemConfig({ dailySessionCounters: updatedCounters })
  
  // Format counter with leading zeros (4 digits max)
  const counterStr = String(currentCounter).padStart(4, '0')
  
  return `ss-${dateKey}-${counterStr}`
}

export function createSession(email, days = 30) {
  const token = newToken()
  const sessionId = generateSessionId()
  const loginTime = new Date()
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  
  // Get user info for session
  const user = jsondb.getUser(email)
  const userName = user?.name || user?.email?.split('@')[0] || 'Unknown User'
  
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
      expires: expires.toISOString()
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
    loginTime: loginTime.toISOString(),
    loginDate: loginTime.toISOString().split('T')[0], // YYYY-MM-DD format
    expires: expires.toISOString(),
    lastActivityAt: loginTime.toISOString(),
    isActive: true, // Session aktif durumda
    logoutTime: null, // Henüz çıkış yapılmamış
    activityLog: [loginActivity]
  }
  
  jsondb.putSession(sessionData)
  return token
}

export function getSession(token) {
  if (!token) return null
  const session = jsondb.getSession(token)
  if (!session) return null
  
  if (new Date() > new Date(session.expires)) {
    jsondb.deleteSession(token)
    return null
  }
  return session
}

export function deleteSession(token) { 
  if (token) jsondb.deleteSession(token) 
}

// Middleware
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }
  
  // Development mode: allow dev tokens
  if (token.startsWith('dev-')) {
    req.user = { email: 'dev@burkol.com', role: 'admin' }
    return next()
  }
  
  const session = getSession(token)
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
  
  req.user = session
  next()
}
