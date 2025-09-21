// Server Authentication Module - User management and session handling
import crypto from 'crypto'
import jsondb from '../lib/jsondb.js'

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
  
  // Simple password check for admin (not hashed)
  if (user.password && user.password === password) {
    return { email: user.email, role: user.role }
  }
  
  // Fallback to hash-based auth if pw_hash exists
  if (user.pw_hash && user.pw_salt) {
    const { hash } = hashPassword(password, user.pw_salt)
    if (crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(user.pw_hash))) {
      return { email: user.email, role: user.role }
    }
  }
  
  return null
}

// Session management
export function newToken() { 
  return crypto.randomBytes(32).toString('base64url') 
}

export function createSession(email, days = 30) {
  const token = newToken()
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  jsondb.putSession({ token, email, expires })
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