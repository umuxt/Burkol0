// Authentication API Routes
import crypto from 'crypto'
import { createUser, verifyUser, createSession, deleteSession, getSession, requireAuth } from './auth.js'

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

  // Test endpoint for debugging
  app.get('/api/test', (req, res) => {
    res.json({ message: 'Server updated successfully', timestamp: new Date().toISOString() })
  })

  // Me endpoint - get current user info
  app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }
    
    const session = getSession(token)
    if (!session) {
      // For development - allow access without valid session if token starts with 'dev-'
      if (token.startsWith('dev-')) {
        return res.json({ 
          email: 'dev@burkol.com', 
          role: 'admin',
          name: 'Dev User'
        })
      }
      return res.status(401).json({ error: 'Invalid or expired session' })
    }
    
    // Return user info from session
    res.json({ 
      email: session.email, 
      role: 'admin',
      name: 'Admin User'
    })
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

  // List users endpoint
  app.get('/api/auth/users', requireAuth, (req, res) => {
    try {
      // In a real app, fetch from database
      // For now, return mock data or empty array
      res.json([])
    } catch (error) {
      res.status(500).json({ error: 'Failed to list users' })
    }
  })

  // Add user endpoint
  app.post('/api/auth/users', requireAuth, (req, res) => {
    const { email, password, role = 'admin' } = req.body
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }
    
    try {
      const user = createUser(email, password, role)
      // In a real app, save to database
      res.json({ success: true, message: 'User created successfully' })
    } catch (error) {
      res.status(500).json({ error: 'User creation failed' })
    }
  })

  // Delete user endpoint
  app.delete('/api/auth/users/:email', requireAuth, (req, res) => {
    const { email } = req.params
    
    try {
      // In a real app, delete from database
      res.json({ success: true, message: 'User deleted successfully' })
    } catch (error) {
      res.status(500).json({ error: 'User deletion failed' })
    }
  })
}