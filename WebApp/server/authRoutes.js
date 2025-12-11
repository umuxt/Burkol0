// Authentication API Routes
import crypto from 'crypto'
import {
  createUser, verifyUser, createSession, deleteSession, getSession, requireAuth, hashPassword,
  upsertUser, getAllSessions, updateSession, deleteSessionById, listUsersRaw, listUsersFromDatabase, listSessionsFromDatabase, getUserByEmail, deleteUserPermanently
} from './auth.js'
import auditSessionActivity from './auditTrail.js'
import { logSession, logError } from './utils/logger.js'

export function setupAuthRoutes(app) {
  // Login endpoint
  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    const result = await verifyUser(email, password)

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
    const token = await createSession(email)
    const session = await getSession(token)

    // Tablo formatında login logu
    logSession('login', { email, sessionId: session?.sessionId })

    // Audit: log login event to audit_logs (best-effort, sessiz)
    try {
      if (session?.sessionId) {
        req.user = session
        await auditSessionActivity(req, {
          type: 'session',
          action: 'login',
          scope: 'auth',
          title: 'Admin panel giriş yapıldı',
          description: `${email} oturumu başlatıldı`
        })
      }
    } catch { }

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
  app.post('/api/auth/logout', async (req, res) => {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (token) {
      const session = await getSession(token)
      if (session) {
        const logoutTime = new Date().toISOString()
        const sessionDuration = new Date() - new Date(session.loginTime)

        // Session'a logout bilgisi ekle
        const logoutActivity = {
          id: `act-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: logoutTime,
          type: 'session',
          action: 'logout',
          scope: 'auth',
          title: 'Admin panel çıkış yapıldı',
          description: `${session.email} oturumu sonlandırıldı`,
          metadata: {
            email: session.email,
            sessionDuration: sessionDuration
          },
          performedBy: {
            email: session.email,
            userName: session.userName,
            sessionId: session.sessionId
          }
        }

        // Session'ı güncelle - PostgreSQL'e kaydet (sessiz)
        try {
          await updateSession({
            sessionId: session.sessionId,
            logoutTime: logoutTime,
            isActive: false,
            lastActivityAt: logoutTime,
            activityLog: [logoutActivity]
          })
        } catch (updateError) {
          logError('Logout', `Failed to update session: ${updateError?.message}`)
        }

        // Audit: persist logout activity (sessiz)
        try {
          req.user = { ...session, logoutTime, isActive: false }
          await auditSessionActivity(req, logoutActivity)
        } catch (auditError) {
          // Sessiz - ana log yeterli
        }

        // Session'ı memory'den sil
        deleteSession(token)

        // Tablo formatında logout logu
        logSession('logout', {
          email: session.email,
          sessionId: session.sessionId,
          duration: sessionDuration
        })
      }
    }

    res.json({ success: true })
  })

  // Test endpoint for debugging
  app.get('/api/test', (req, res) => {
    res.json({ message: 'Server updated successfully', timestamp: new Date().toISOString() })
  })

  // Me endpoint - get current user info
  app.get('/api/auth/me', async (req, res) => {
    // In development mode, bypass authentication for easier testing
    if (process.env.NODE_ENV === 'development') {
      return res.json({
        email: 'dev@beeplan.com', role: 'admin',
        name: 'Dev User'
      })
    }

    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const session = await getSession(token)
    if (!session) {
      // For development - allow access without valid session if token starts with 'dev-'
      if (token.startsWith('dev-')) {
        return res.json({
          email: 'dev@beeplan.com',
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
  // Note: Does NOT require an existing session/token. This endpoint is used
  // to verify admin credentials directly from the Users tab access modal.
  app.post('/api/auth/verify-admin', async (req, res) => {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    try {
      // Kullanıcı doğrulaması (yeni session oluşturmadan) - verifyUser fonksiyonunu kullan
      const result = await verifyUser(email, password)

      if (!result || result.error) {
        console.log('❌ Invalid credentials or error:', result)
        return res.status(401).json({ error: 'Invalid credentials' })
      }

      // Admin kontrolü
      if (result.role !== 'admin') {
        console.log('❌ Access denied - not admin role:', result.role)
        return res.status(403).json({ error: 'Admin access required' })
      }

      // Mevcut session'a admin panel erişim logu ekle (yeni session oluşturmadan)
      const currentSession = req.user // requireAuth kullanılmadığında mevcut olmayabilir
      if (currentSession && currentSession.sessionId) {
        await auditSessionActivity(req, {
          type: 'admin-panel',
          action: 'access',
          scope: 'users',
          title: 'Admin panel kullanıcı yönetimi paneline erişim',
          description: 'Users management panel access verified',
          metadata: {
            targetPanel: 'users-management',
            verifiedWith: email,
            accessTime: new Date().toISOString()
          }
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
      upsertUser(user)
      res.json({ message: 'User created successfully' })
    } catch (error) {
      res.status(500).json({ error: 'Failed to create user' })
    }
  })

  // Admin: List all sessions
  app.get('/api/admin/sessions', async (req, res) => {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

    console.log('🔍 Sessions endpoint debug:', {
      hasAuthHeader: !!authHeader,
      authHeader: authHeader ? authHeader.slice(0, 20) + '...' : 'NONE',
      token: token ? token.slice(0, 10) + '...' : 'NONE'
    })

    if (!token) {
      if ((process.env.NODE_ENV || 'development') !== 'production') {
        console.warn('⚠️ Sessions: No token provided in dev; continuing for local debugging')
      } else {
        console.log('❌ Sessions: No token provided')
        return res.status(401).json({ error: 'No token provided' })
      }
    }

    const session = await getSession(token)
    console.log('🔍 Sessions: getSession result:', {
      hasSession: !!session,
      isDevToken: token.startsWith('dev-'),
      sessionEmail: session?.email
    })

    if (!session && !token.startsWith('dev-')) {
      // Prod ortamında memory tabanlı session bulunamadığında 401 yerine
      // sadece uyarı logla ve devam et. Bu endpoint yalnızca listeleme amaçlıdır.
      // Not: Güvenlik açısından yine de token zorunlu.
      console.warn('⚠️ Sessions: Token var ancak memory session bulunamadı; PostgreSQL sessionları listeleniyor.')
    }

    try {
      // PostgreSQL'den session verilerini çek
      const dbSessions = await listSessionsFromDatabase()
      // Memory'deki mevcut session'ları da ekle
      const memorySessions = getAllSessions()

      // İki listeyi birleştir
      const allSessions = [...dbSessions, ...memorySessions]

      res.json({ sessions: allSessions })
    } catch (error) {
      console.error('❌ Error loading sessions:', error)
      // Fallback to memory sessions
      const memorySessions = getAllSessions()
      res.json({ sessions: memorySessions })
    }
  })

  // Admin: Delete session by ID
  app.delete('/api/admin/sessions/:sessionId', async (req, res) => {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const session = await getSession(token)
    if (!session && !token.startsWith('dev-')) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    const { sessionId } = req.params
    const deleted = deleteSessionById(sessionId)

    if (deleted) {
      res.json({ message: 'Session deleted successfully' })
    } else {
      res.status(404).json({ error: 'Session not found' })
    }
  })

  // List users endpoint
  app.get('/api/auth/users', requireAuth, async (req, res) => {
    try {
      const users = await listUsersFromDatabase()
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
  app.post('/api/auth/users', requireAuth, async (req, res) => {
    const { email, password, role = 'admin' } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }

    try {
      // Kullanıcı zaten var mı kontrol et
      console.log('[authRoutes] Creating user:', email)
      const existingUser = await getUserByEmail(email)
      console.log('[authRoutes] Existing user check:', !!existingUser)
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' })
      }

      // Yeni kullanıcı oluştur (hem hash hem plain-text)
      const { salt, hash } = hashPassword(password)
      const user = {
        email,
        name: req.body.name || email.split('@')[0],
        pwSalt: salt,
        pwHash: hash,
        plainPassword: password, // Development için plain-text de sakla
        role,
        active: true, // Yeni kullanıcılar varsayılan olarak aktif
        createdAt: new Date().toISOString()
      }

      console.log('[authRoutes] Calling upsertUser...')
      await upsertUser(user)
      console.log('[authRoutes] User created successfully')

      // Audit log - fire and forget, don't block response
      try {
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
        }).catch(err => console.warn('[authRoutes] Audit log failed:', err?.message))
      } catch (auditErr) {
        console.warn('[authRoutes] Audit log error:', auditErr?.message)
      }

      res.json({ success: true, message: 'User created successfully' })
    } catch (error) {
      console.error('Add user error:', error)
      res.status(500).json({ error: 'User creation failed', details: error?.message || String(error) })
    }
  })

  // Delete user endpoint (Toggle active status - aktifleştir/deaktifleştir)
  app.delete('/api/auth/users/:email', requireAuth, async (req, res) => {
    const { email } = req.params

    try {
      // Kullanıcı var mı kontrol et
      const existingUser = await getUserByEmail(email)
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

      await upsertUser(updatedUser)

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
  app.delete('/api/auth/users/:email/permanent', requireAuth, async (req, res) => {
    const { email } = req.params

    try {
      // Kullanıcı var mı kontrol et
      const existingUser = await getUserByEmail(email)
      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' })
      }

      // Kendi hesabını silmeyi engelle
      if (req.user && req.user.email === email) {
        return res.status(400).json({ error: 'Cannot delete your own account' })
      }

      // Hard delete: kullanıcıyı tamamen sil
      await deleteUserPermanently(email)

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
  app.put('/api/auth/users/:email', requireAuth, async (req, res) => {
    const { email } = req.params
    const { password, role } = req.body

    try {
      // Kullanıcı var mı kontrol et
      const existingUser = await getUserByEmail(email)
      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' })
      }

      // Güncellenecek alanları hazırla
      const updates = { ...existingUser }

      if (password && password.length >= 6) {
        // Şifreyi hash'le ve plain-text de sakla
        const { salt, hash } = hashPassword(password)
        updates.pwSalt = salt
        updates.pwHash = hash
        updates.plainPassword = password // Development için plain-text de sakla
        // Eski plain password'u temizle
        delete updates.password
      }

      if (role) {
        updates.role = role
      }

      updates.updatedAt = new Date().toISOString()

      await upsertUser(updates)

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
