// Authentication API Routes
import crypto from 'crypto'
import { createUser, verifyUser, createSession, deleteSession } from './auth.js'

export function setupAuthRoutes(app) {
  // Login endpoint
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }
    
    const user = verifyUser(email, password)
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    
    const token = createSession(email)
    res.json({ token, user })
  })

  // Logout endpoint
  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    
    if (token) {
      deleteSession(token)
    }
    
    res.json({ success: true })
  })

  // Register endpoint (for initial setup)
  app.post('/api/auth/register', (req, res) => {
    const { email, password } = req.body
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }
    
    try {
      const user = createUser(email, password, 'admin')
      // Note: In production, you'd save this to database
      res.json({ success: true, message: 'User created successfully' })
    } catch (error) {
      res.status(500).json({ error: 'User creation failed' })
    }
  })
}