// Authentication API Routes
import crypto from 'crypto'
import { createUser, verifyUser, createSession, deleteSession, getSession, requireAuth, hashPassword } from './auth.js'
import jsondb from '../src/lib/jsondb.js'
import auditSessionActivity from './auditTrail.js'

export function setupAuthRoutes(app) {
  // Login endpoint
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }
    
    const result = verifyUser(email, password)
    
    // Kullanıcı bulunamadı
    if (!result) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    
    // Hesap devre dışı bırakılmış
    if (result.error === 'account_deactivated') {
      return res.status(403).json({ 
        error: 'account_deactivated', 
        message: result.message 
      })
    }
    
    // Başarılı login
    const token = createSession(email)
    const session = getSession(token)
    res.json({ 
      token, 
      user: result,
      session: {
        sessionId: session?.sessionId,
        loginTime: session?.loginTime,
        loginDate: session?.loginDate,
        expires: session?.expires
      }
    })
  })

  // Logout endpoint
  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    
    if (token) {
      const session = getSession(token)
      if (session) {
        // Session'a logout bilgisi ekle
        const logoutActivity = {
          id: `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          type: 'session',
          action: 'logout', 
          scope: 'auth',
          title: 'Admin panel çıkış yapıldı',
          description: `${session.email} oturumu sonlandırıldı`,
          metadata: {
            email: session.email,
            sessionDuration: new Date() - new Date(session.loginTime)
          },
          performedBy: {
            email: session.email,
            userName: session.userName,
            sessionId: session.sessionId
          }
        }

        // Session'ı güncelle - logout time ekle
        const updatedSession = {
          ...session,
          logoutTime: new Date().toISOString(),
          isActive: false,
          lastActivityAt: new Date().toISOString(),
          activityLog: [...(session.activityLog || []), logoutActivity]
        }
        
        // Firebase'de session'ı güncelle (sil değil)
        jsondb.putSession(updatedSession)
      }
      
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
    // In development mode, bypass authentication for easier testing
    if (process.env.NODE_ENV === 'development') {
      return res.json({ 
        email: 'dev@burkol.com', 
        role: 'admin',
        name: 'Dev User'
      })
    }
    
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
      name: session.userName || 'Admin User',
      sessionId: session.sessionId,
      loginTime: session.loginTime,
      loginDate: session.loginDate
    })
  })

  // Admin panel access verification (no new session creation, just log access)
  app.post('/api/auth/verify-admin', requireAuth, async (req, res) => {
    const { email, password } = req.body
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    try {
      // Kullanıcı doğrulaması (yeni session oluşturmadan) - verifyUser fonksiyonunu kullan
      const result = verifyUser(email, password)
      
      if (!result || result.error) {
        return res.status(401).json({ error: 'Invalid credentials' })
      }
      
      // Admin kontrolü
      if (result.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' })
      }

      // Mevcut session'a admin panel erişim logu ekle (yeni session oluşturmadan)
      const currentSession = req.user // requireAuth middleware'den gelen session
      if (currentSession && currentSession.sessionId) {
        await auditSessionActivity(req, 'admin-panel', 'access', 'Admin panel kullanıcı yönetimi paneline erişim', {
          targetPanel: 'users-management',
          verifiedWith: email,
          accessTime: new Date().toISOString()
        })
      }

      res.json({ 
        success: true,
        user: result,
        message: 'Admin access verified'
      })
      
    } catch (error) {
      console.error('Admin verification error:', error)
      res.status(500).json({ error: 'Verification failed' })
    }
  })

    // Register endpoint (for initial setup)
  app.post('/api/auth/register', (req, res) => {
    const { email, password } = req.body
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }
    
    const user = createUser(email, password)
    
    try {
      jsondb.upsertUser(user)
      res.json({ message: 'User created successfully' })
    } catch (error) {
      res.status(500).json({ error: 'Failed to create user' })
    }
  })

  // Admin: List all sessions
  app.get('/api/admin/sessions', (req, res) => {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }
    
    const session = getSession(token)
    if (!session && !token.startsWith('dev-')) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }
    
    const allSessions = jsondb.getAllSessions()
    console.log('DEBUG: /api/admin/sessions called by:', session?.email, 'token:', token.slice(0, 10) + '...')
    console.log('DEBUG: allSessions count:', allSessions.length)
    
    // Bu çağrıda yeni session oluşturulmadığını doğrula
    const currentSessionsCount = allSessions.length
    console.log('DEBUG: Current sessions count before response:', currentSessionsCount)
    
    res.json({ sessions: allSessions })
  })

  // Admin: Delete session by ID
  app.delete('/api/admin/sessions/:sessionId', (req, res) => {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }
    
    const session = getSession(token)
    if (!session && !token.startsWith('dev-')) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }
    
    const { sessionId } = req.params
    const deleted = jsondb.deleteSessionById(sessionId)
    
    if (deleted) {
      res.json({ message: 'Session deleted successfully' })
    } else {
      res.status(404).json({ error: 'Session not found' })
    }
  })

  // List users endpoint
  app.get('/api/auth/users', requireAuth, (req, res) => {
    try {
      const users = jsondb.listUsersRaw()
      // Şifreleri frontend'e gönder (sadece plain-text olanları)
      const safeUsers = users.map(user => ({
        email: user.email,
        role: user.role || 'admin',
        active: user.active !== false, // Varsayılan olarak true
        createdAt: user.createdAt,
        deactivatedAt: user.deactivatedAt,
        // Plain-text password varsa göster, yoksa maskeli göster
        password: user.plainPassword || '••••••••',
        hasPlainPassword: !!user.plainPassword
      }))
      res.json(safeUsers)
    } catch (error) {
      console.error('List users error:', error)
      res.status(500).json({ error: 'Failed to list users' })
    }
  })

  // Add user endpoint
  app.post('/api/auth/users', requireAuth, (req, res) => {
    const { email, password, role = 'admin' } = req.body
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }
    
    try {
      // Kullanıcı zaten var mı kontrol et
      const existingUser = jsondb.getUser(email)
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' })
      }
      
      // Yeni kullanıcı oluştur (hem hash hem plain-text)
      const { salt, hash } = hashPassword(password)
      const user = {
        email,
        pw_salt: salt,
        pw_hash: hash,
        plainPassword: password, // Development için plain-text de sakla
        role,
        active: true, // Yeni kullanıcılar varsayılan olarak aktif
        createdAt: new Date().toISOString()
      }
      
      jsondb.upsertUser(user)

      auditSessionActivity(req, {
        type: 'user-management',
        action: 'create',
        scope: 'users',
        title: `Yeni kullanıcı eklendi (${email})`,
        description: `Rol: ${role}`,
        metadata: {
          email,
          role,
          createdAt: user.createdAt
        }
      })
      res.json({ success: true, message: 'User created successfully' })
    } catch (error) {
      console.error('Add user error:', error)
      res.status(500).json({ error: 'User creation failed' })
    }
  })

  // Delete user endpoint (Toggle active status - aktifleştir/deaktifleştir)
  app.delete('/api/auth/users/:email', requireAuth, (req, res) => {
    const { email } = req.params
    
    try {
      // Kullanıcı var mı kontrol et
      const existingUser = jsondb.getUser(email)
      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' })
      }
      
      // Kendi hesabını silmeyi engelle
      if (req.user && req.user.email === email) {
        return res.status(400).json({ error: 'Cannot delete your own account' })
      }
      
      // Toggle active status
      const newActiveStatus = !existingUser.active
      const updatedUser = {
        ...existingUser,
        active: newActiveStatus,
        [newActiveStatus ? 'activatedAt' : 'deactivatedAt']: new Date().toISOString(),
        [newActiveStatus ? 'activatedBy' : 'deactivatedBy']: req.user.email
      }
      
      jsondb.upsertUser(updatedUser)

      const actionType = newActiveStatus ? 'activate' : 'deactivate'
      const actionTitle = newActiveStatus ? 'aktifleştirildi' : 'devre dışı bırakıldı'
      const actionDesc = newActiveStatus ? 'aktif edildi' : 'pasif edildi'

      auditSessionActivity(req, {
        type: 'user-management',
        action: actionType,
        scope: 'users',
        title: `Kullanıcı ${actionTitle} (${email})`,
        description: `${email} hesabı ${actionDesc}`,
        metadata: {
          email,
          [newActiveStatus ? 'activatedAt' : 'deactivatedAt']: updatedUser[newActiveStatus ? 'activatedAt' : 'deactivatedAt'],
          [newActiveStatus ? 'activatedBy' : 'deactivatedBy']: req.user?.email || null,
          previousRole: existingUser.role || null,
          newStatus: newActiveStatus ? 'active' : 'inactive'
        }
      })
      
      const message = newActiveStatus ? 'User activated successfully' : 'User deactivated successfully'
      res.json({ success: true, message, active: newActiveStatus })
    } catch (error) {
      console.error('Toggle user status error:', error)
      res.status(500).json({ error: 'User status change failed' })
    }
  })

  // Permanent delete user endpoint (Hard delete - kullanıcıyı kalıcı olarak sil)
  app.delete('/api/auth/users/:email/permanent', requireAuth, (req, res) => {
    const { email } = req.params
    
    try {
      // Kullanıcı var mı kontrol et
      const existingUser = jsondb.getUser(email)
      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' })
      }
      
      // Kendi hesabını silmeyi engelle
      if (req.user && req.user.email === email) {
        return res.status(400).json({ error: 'Cannot delete your own account' })
      }
      
      // Hard delete: kullanıcıyı tamamen sil
      jsondb.deleteUser(email)

      auditSessionActivity(req, {
        type: 'user-management',
        action: 'permanent-delete',
        scope: 'users',
        title: `Kullanıcı kalıcı olarak silindi (${email})`,
        description: `${email} hesabı kalıcı olarak kaldırıldı`,
        metadata: {
          email,
          deletedAt: new Date().toISOString(),
          deletedBy: req.user?.email || null,
          previousRole: existingUser.role || null,
          warning: 'PERMANENT_DELETE'
        }
      })
      res.json({ success: true, message: 'User permanently deleted' })
    } catch (error) {
      console.error('Permanent delete user error:', error)
      res.status(500).json({ error: 'User permanent deletion failed' })
    }
  })

  // Update user endpoint
  app.put('/api/auth/users/:email', requireAuth, (req, res) => {
    const { email } = req.params
    const { password, role } = req.body
    
    try {
      // Kullanıcı var mı kontrol et
      const existingUser = jsondb.getUser(email)
      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' })
      }
      
      // Güncellenecek alanları hazırla
      const updates = { ...existingUser }
      
      if (password && password.length >= 6) {
        // Şifreyi hash'le ve plain-text de sakla
        const { salt, hash } = hashPassword(password)
        updates.pw_salt = salt
        updates.pw_hash = hash
        updates.plainPassword = password // Development için plain-text de sakla
        // Eski plain password'u temizle
        delete updates.password
      }
      
      if (role) {
        updates.role = role
      }
      
      updates.updatedAt = new Date().toISOString()
      
      jsondb.upsertUser(updates)

      const changes = []
      if (password && password.length >= 6) {
        changes.push('Şifre güncellendi')
      }
      if (role && role !== existingUser.role) {
        changes.push(`Rol değişti: ${existingUser.role || 'unknown'} → ${role}`)
      }

      auditSessionActivity(req, {
        type: 'user-management',
        action: 'update',
        scope: 'users',
        title: `Kullanıcı bilgileri güncellendi (${email})`,
        description: changes.length ? changes.join(', ') : 'Kullanıcı bilgileri güncellendi',
        metadata: {
          email,
          role: updates.role,
          updatedAt: updates.updatedAt,
          changes
        }
      })
      res.json({ success: true, message: 'User updated successfully' })
    } catch (error) {
      console.error('Update user error:', error)
      res.status(500).json({ error: 'User update failed' })
    }
  })
}
