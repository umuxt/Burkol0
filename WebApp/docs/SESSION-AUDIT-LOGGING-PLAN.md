# Session & Audit Logging Sistemi - İmplementasyon Planı

> **Tarih**: 3 Aralık 2025  
> **Durum**: PLANLANMIŞ - Henüz uygulanmadı  
> **Öncelik**: Orta-Yüksek  

---

## 1. MEVCUT DURUM ANALİZİ

### Auth Tutarsızlığı
| Panel | Auth Yöntemi | Server Restart Davranışı |
|-------|--------------|--------------------------|
| CRM (quote-dashboard) | `API.me()` kontrolü | ❌ Logout oluyor |
| Production | `AuthGuard.js` (token varlığı) | ✅ Login kalıyor |
| Materials | `AuthGuard.js` (token varlığı) | ✅ Login kalıyor |
| Settings | `AuthGuard.js` (token varlığı) | ✅ Login kalıyor |

### Sorunun Kaynağı
CRM'de `main.jsx` içinde:
```javascript
useEffect(() => {
  async function checkLogin() {
    const token = localStorage.getItem('bp_admin_token');
    if (token) {
      await API.me();  // ← Server restart sonrası fail olursa token siliniyor
      setLoggedIn(true);
    }
  }
  checkLogin();
}, []);
```

---

## 2. KARAR: HANGİ YÖNTEM?

### Seçenek A: AuthGuard (Token Varlığı)
```javascript
// Sadece localStorage'da token var mı kontrol
const token = localStorage.getItem('bp_admin_token');
if (!token) redirectToLogin();
```
- ✅ Hızlı, server'a istek yok
- ✅ Offline çalışır
- ✅ Server restart etkilemez
- ❌ Expire/invalid token algılanmaz
- ❌ Güvenlik zayıf

### Seçenek B: API.me() Kontrolü
```javascript
// Server'dan token validasyonu
const token = localStorage.getItem('bp_admin_token');
if (token) {
  const isValid = await API.me();
  if (!isValid) logout();
}
```
- ✅ Güvenli, server validate ediyor
- ✅ Invalid token hemen algılanır
- ❌ Yavaş, her sayfa açılışında istek
- ❌ Server restart = logout
- ❌ Offline çalışmaz

### Seçenek C: Hibrit Yaklaşım (ÖNERİLEN) ⭐
```javascript
// 1. Sayfa açılışı: Token varlığı (hızlı)
const token = localStorage.getItem('bp_admin_token');
if (!token) redirectToLogin();

// 2. İlk API çağrısı: Lazy validation
// API wrapper'da 401 dönerse otomatik logout

// 3. Background: Session heartbeat (opsiyonel)
// Her 5 dakikada session validity kontrolü
```
- ✅ Hızlı sayfa açılışı
- ✅ Server restart etkilemez
- ✅ Invalid token ilk API'de yakalanır
- ✅ Güvenlik + UX dengesi
- ⚠️ İlk API çağrısına kadar invalid token algılanmaz

---

## 3. SESSION TRACKING MİMARİSİ

### Database Tabloları

```sql
-- Phase 1: Sessions Tablosu
CREATE TABLE admin.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  userId INTEGER REFERENCES admin.users(id),
  token TEXT NOT NULL,
  ip VARCHAR(45),
  userAgent TEXT,
  deviceInfo JSONB,        -- {browser, os, device}
  createdAt TIMESTAMP DEFAULT NOW(),
  lastActivityAt TIMESTAMP DEFAULT NOW(),
  expiresAt TIMESTAMP,
  isActive BOOLEAN DEFAULT true,
  logoutAt TIMESTAMP,
  logoutReason VARCHAR(50)  -- manual, expired, forced, new_login
);

CREATE INDEX idx_sessions_user ON admin.sessions(userId);
CREATE INDEX idx_sessions_token ON admin.sessions(token);
CREATE INDEX idx_sessions_active ON admin.sessions(isActive) WHERE isActive = true;
```

```sql
-- Phase 2: Audit Logs Tablosu
CREATE TABLE admin.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  sessionId UUID REFERENCES admin.sessions(id),
  userId INTEGER,
  action VARCHAR(50) NOT NULL,       -- CREATE, UPDATE, DELETE, VIEW, APPROVE, LOGIN, LOGOUT
  resource VARCHAR(50) NOT NULL,     -- quote, customer, work_order, settings, auth
  resourceId VARCHAR(100),
  oldValue JSONB,
  newValue JSONB,
  metadata JSONB,                    -- extra context
  ip VARCHAR(45),
  createdAt TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON admin.audit_logs(userId);
CREATE INDEX idx_audit_resource ON admin.audit_logs(resource, resourceId);
CREATE INDEX idx_audit_action ON admin.audit_logs(action);
CREATE INDEX idx_audit_date ON admin.audit_logs(createdAt DESC);
```

### Action Types
```
AUTH:       login, logout, token_refresh, password_change, session_expired
QUOTE:      create, update, approve, reject, delete, view
CUSTOMER:   create, update, delete, view
WO:         create, launch, complete, cancel, pause, resume
SETTINGS:   update_pricing, update_form, update_config
SYSTEM:     error, warning, permission_denied
```

---

## 4. BACKEND IMPLEMENTATION

### Audit Logger Middleware
```javascript
// server/middleware/auditLogger.js
export function auditMiddleware(action, resource) {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    const startTime = Date.now();
    
    res.json = async (data) => {
      if (res.statusCode < 400) {
        await AuditLog.create({
          sessionId: req.session?.id,
          userId: req.user?.id,
          action,
          resource,
          resourceId: req.params.id || data?.id,
          oldValue: req.originalData,
          newValue: data,
          metadata: {
            duration: Date.now() - startTime,
            method: req.method,
            path: req.path
          },
          ip: req.ip
        });
      }
      return originalJson(data);
    };
    
    next();
  };
}
```

### Session Service
```javascript
// server/services/sessionService.js
export const SessionService = {
  async create(userId, token, req) {
    return db('admin.sessions').insert({
      userId,
      token,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      deviceInfo: parseUserAgent(req.headers['user-agent']),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
    }).returning('*');
  },
  
  async updateActivity(sessionId) {
    return db('admin.sessions')
      .where('id', sessionId)
      .update({ lastActivityAt: db.fn.now() });
  },
  
  async invalidate(sessionId, reason = 'manual') {
    return db('admin.sessions')
      .where('id', sessionId)
      .update({ 
        isActive: false, 
        logoutAt: db.fn.now(),
        logoutReason: reason 
      });
  }
};
```

---

## 5. FRONTEND IMPLEMENTATION

### Session Manager
```javascript
// shared/utils/sessionManager.js
export const SessionManager = {
  sessionId: null,
  lastActivity: Date.now(),
  
  async init() {
    const response = await API.initSession();
    this.sessionId = response.sessionId;
    this.startActivityTracking();
  },
  
  startActivityTracking() {
    // Heartbeat every 5 minutes
    setInterval(() => this.heartbeat(), 5 * 60 * 1000);
    
    // Track user activity
    ['click', 'keypress', 'scroll'].forEach(event => {
      document.addEventListener(event, () => {
        this.lastActivity = Date.now();
      }, { passive: true });
    });
  },
  
  async heartbeat() {
    if (Date.now() - this.lastActivity < 5 * 60 * 1000) {
      await API.sessionHeartbeat(this.sessionId);
    }
  }
};
```

### API 401 Handler
```javascript
// shared/lib/api.js - güncelleme
async function handleResponse(response) {
  if (response.status === 401) {
    // Token invalid - logout
    localStorage.removeItem('bp_admin_token');
    window.location.href = './login.html';
    throw new Error('Session expired');
  }
  return response;
}
```

---

## 6. IMPLEMENTATION PHASES

| Phase | Kapsam | Tahmini Süre | Öncelik |
|-------|--------|--------------|---------|
| **0** | Auth tutarlılığı düzeltmesi (CRM) | 30 dk | 🔴 Acil |
| **1** | Sessions tablosu + login/logout tracking | 2 saat | 🔴 Yüksek |
| **2** | Audit logs tablosu + temel CRUD logging | 3 saat | 🔴 Yüksek |
| **3** | API 401 handler + otomatik logout | 1 saat | 🟡 Orta |
| **4** | Activity heartbeat + session timeout | 2 saat | 🟡 Orta |
| **5** | Audit dashboard UI | 4 saat | 🟢 Düşük |

---

## 7. AUDIT DASHBOARD (Gelecek)

```
┌─────────────────────────────────────────────────────────────────┐
│  📊 Audit Dashboard                                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Active Sessions: 3    Today's Actions: 127    Errors: 2       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Recent Activity                                          │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ 14:32  admin    CREATE  quote      TKF-20251203-0005   │   │
│  │ 14:28  admin    APPROVE quote      TKF-20251203-0004   │   │
│  │ 14:25  admin    UPDATE  customer   #123                 │   │
│  │ 14:20  admin    LOGIN   session    Chrome/MacOS         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Session Details                                          │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ User: admin@beeplan.com                                 │   │
│  │ Started: 14:20 (2 hours ago)                            │   │
│  │ Last Activity: 14:32                                    │   │
│  │ Device: Chrome 119 / MacOS                              │   │
│  │ IP: 192.168.1.100                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. NOTLAR

- Bu plan CRM NewFlow refactor'ından sonra uygulanacak
- Phase 0 (Auth tutarlılığı) öncelikli olarak yapılabilir
- JWT secret değişikliğine karşı graceful logout gerekli
- GDPR/KVKK uyumluluğu için audit log retention policy belirlenmeli

---

## İLGİLİ DOSYALAR

Mevcut auth dosyaları:
- `/WebApp/shared/components/AuthGuard.js`
- `/WebApp/shared/utils/auth.js`
- `/WebApp/shared/lib/api.js`
- `/WebApp/src/main.jsx` (CRM auth kontrolü)
- `/WebApp/server/auth.js`
- `/WebApp/server/authRoutes.js`
