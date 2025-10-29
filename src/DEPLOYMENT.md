# MES System - Deployment Checklist

Burkol0 entegrasyonu için deployment adımları ve checklist.

## 📋 Pre-Deployment Checklist

### 1. Backend Hazırlığı

#### API Endpoints
- [ ] Work Orders CRUD endpoints hazır
  - `GET /api/production/work-orders`
  - `GET /api/production/work-orders/:id`
  - `POST /api/production/work-orders`
  - `PATCH /api/production/work-orders/:id`
  - `DELETE /api/production/work-orders/:id`

- [ ] Operations endpoints hazır
  - `GET /api/production/operations/:workOrderId`
  - `POST /api/production/operations`
  - `PATCH /api/production/operations/:id`
  - `POST /api/production/operations/:id/complete`

- [ ] Templates endpoints hazır
  - `GET /api/production/templates`
  - `POST /api/production/templates`
  - `DELETE /api/production/templates/:id`

- [ ] Materials integration (Ana Burkol0 sisteminden)
  - `GET /api/materials/availability/:orderId`

- [ ] Issues & Scrap endpoints hazır
  - `POST /api/production/issues`
  - `POST /api/production/scrap`

- [ ] Settings endpoint hazır
  - `GET /api/production/settings`
  - `PATCH /api/production/settings`

#### Authentication & Authorization
- [ ] JWT token validation implementasyonu
- [ ] Session management
- [ ] Role-based access control (Planner vs Worker)
- [ ] CORS yapılandırması

#### Database Schema
- [ ] work_orders tablosu
- [ ] operations tablosu
- [ ] operation_templates tablosu
- [ ] production_issues tablosu
- [ ] scrap_records tablosu
- [ ] production_settings tablosu

### 2. Frontend Konfigürasyonu

#### Environment Variables
```bash
# .env.production dosyası oluştur
REACT_APP_API_URL=https://burkol0.com/api
REACT_APP_WS_URL=wss://burkol0.com/production/ws
NODE_ENV=production
```

#### Config Dosyası
- [ ] `config.example.ts` → `config.ts` kopyala
- [ ] API base URL'lerini güncelle
- [ ] `useMockData: false` yap
- [ ] WebSocket konfigürasyonunu ayarla (opsiyonel)
- [ ] Company bilgilerini güncelle

#### Mock Data'yı Kaldır
- [ ] production-dashboard.tsx: `mockWorkOrders` → API call
- [ ] production-plan-designer.tsx: `mockOrders` → API call
- [ ] worker-panel.tsx: `mockPackages` → API call
- [ ] templates-library.tsx: `mockTemplates` → API call

### 3. Burkol0 Ana Sistem Entegrasyonu

#### Navigation
- [ ] Ana Burkol0 navbar'da "Üretim Paneli" (🏭) linki zaten mevcut
- [ ] Link hedefi: `/production.html`
- [ ] Active state: production.html sayfasında nav-btn-active class'ı ekle

#### Routing
- [x] production.html sayfası hazır (proje içinde mevcut)
- [x] MES App.tsx import edilmiş (main.tsx üzerinden)
- [x] Burkol0 navbar production.html'de entegre
- [ ] Build output'u production.html'e bağla

#### Authentication Flow
```typescript
// Burkol0'dan MES'e auth token aktarımı
const authToken = burkol0.getAuthToken();
mesApp.setAuthToken(authToken);

// User role aktarımı
const userRole = burkol0.getUserRole();
mesApp.setUserRole(userRole); // 'planner' or 'worker'
```

#### Shared State (Opsiyonel)
- [ ] Redux/Context state sharing
- [ ] Material updates → MES material reference
- [ ] Order updates → MES work orders

### 4. API Integration Implementation

#### Örnek API Service
```typescript
// src/services/api.ts
import axios from 'axios';
import MESConfig from '../config';

const api = axios.create({
  baseURL: MESConfig.api.baseUrl,
  timeout: MESConfig.api.timeout,
});

// Request interceptor - auth token ekleme
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Redirect to login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const workOrdersAPI = {
  getAll: () => api.get(MESConfig.api.endpoints.workOrders),
  getById: (id: string) => api.get(MESConfig.api.endpoints.workOrderById(id)),
  create: (data: any) => api.post(MESConfig.api.endpoints.workOrders, data),
  update: (id: string, data: any) => api.patch(MESConfig.api.endpoints.workOrderById(id), data),
  delete: (id: string) => api.delete(MESConfig.api.endpoints.workOrderById(id)),
};

// Diğer API endpoints için benzer yapı
```

### 5. Real-time Updates (Opsiyonel)

#### WebSocket Setup
```typescript
// src/services/websocket.ts
import MESConfig from '../config';

class WebSocketService {
  private ws: WebSocket | null = null;
  
  connect() {
    if (!MESConfig.websocket.enabled) return;
    
    this.ws = new WebSocket(MESConfig.websocket.url);
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };
    
    this.ws.onclose = () => {
      // Auto-reconnect logic
      setTimeout(() => this.connect(), MESConfig.websocket.reconnect.delay);
    };
  }
  
  handleMessage(data: any) {
    switch (data.type) {
      case 'WORK_ORDER_UPDATE':
        // Update dashboard
        break;
      case 'MATERIAL_UPDATE':
        // Update material reference
        break;
      case 'ISSUE_REPORTED':
        // Show notification
        break;
    }
  }
}

export default new WebSocketService();
```

### 6. Testing

#### Unit Tests
- [ ] Component tests
- [ ] API service tests
- [ ] Utility function tests

#### Integration Tests
- [ ] API integration tests
- [ ] Auth flow tests
- [ ] Role-based access tests

#### E2E Tests
- [ ] Planner workflow test
- [ ] Worker workflow test
- [ ] Template creation & deployment test

#### Manual Testing Checklist
- [ ] Dashboard KPI'lar doğru görünüyor
- [ ] Work orders tablosu çalışıyor
- [ ] Plan Designer drag & drop çalışıyor
- [ ] Node editing çalışıyor
- [ ] Connection system çalışıyor
- [ ] Worker Panel operasyon takibi çalışıyor
- [ ] Issue/Scrap reporting çalışıyor
- [ ] Template save/load çalışıyor
- [ ] Settings kaydediliyor
- [ ] Interactive guide çalışıyor
- [ ] Responsive design (mobil/tablet/desktop)

### 7. Performance Optimization

- [ ] Code splitting (React.lazy)
- [ ] Image optimization
- [ ] Bundle size optimization
- [ ] API response caching
- [ ] Debouncing/Throttling (search, filters)
- [ ] Virtual scrolling (large tables)

### 8. Security

- [ ] XSS protection
- [ ] CSRF token validation
- [ ] Input sanitization
- [ ] SQL injection prevention (backend)
- [ ] Rate limiting (backend)
- [ ] Secure WebSocket connections (wss://)

### 9. Monitoring & Logging

- [ ] Error tracking setup (Sentry, etc.)
- [ ] Analytics integration (Google Analytics, etc.)
- [ ] API request logging
- [ ] Performance monitoring
- [ ] User activity tracking

### 10. Documentation

- [ ] API documentation (Swagger/OpenAPI)
- [ ] User manual (Turkish)
- [ ] Admin guide
- [ ] Troubleshooting guide
- [ ] Changelog

## 🚀 Deployment Steps

### Step 1: Build
```bash
# Install dependencies
npm install

# Build production bundle
npm run build

# Output: /build veya /dist directory
```

### Step 2: Backend Deployment
```bash
# Backend API'yi deploy et
# Database migrations'ı çalıştır
# Environment variables'ı set et
```

### Step 3: Frontend Deployment
```bash
# Build output'u Burkol0 web server'a kopyala
# production.html'i oluştur ve MES bundle'ı import et
# Nginx/Apache routing yapılandırması
```

### Step 4: Integration
```bash
# Burkol0 ana sistemine navigation link ekle
# Auth token sharing'i test et
# Role-based routing'i test et
```

### Step 5: Smoke Tests
- [ ] Production URL'e erişim
- [ ] Login flow
- [ ] Dashboard yükleniyor
- [ ] API calls çalışıyor
- [ ] WebSocket bağlantısı (varsa)

### Step 6: User Acceptance Testing
- [ ] Planner kullanıcısı ile tam workflow test
- [ ] Worker kullanıcısı ile tam workflow test
- [ ] Edge cases test et

### Step 7: Go Live
- [ ] Production ortamına release
- [ ] Monitoring başlat
- [ ] Kullanıcılara duyuru

## 🔧 Post-Deployment

### Monitoring
- API response times
- Error rates
- User activity metrics
- System resource usage

### Maintenance
- Regular dependency updates
- Security patches
- Performance optimization
- Bug fixes

### Support
- User feedback collection
- Issue tracking system
- Knowledge base oluşturma

## 📞 Support Contacts

- **Technical Lead**: [email]
- **Backend Team**: [email]
- **Frontend Team**: [email]
- **DevOps**: [email]

---

**Last Updated**: October 28, 2025
