# 🔧 BURKOL QUOTE PORTAL - TEKNİK KURULUM VE YÖNETİM KLAVUZU

## 📋 İçindekiler
1. [Sistem Gereksinimleri](#sistem-gereksinimleri)
2. [Kurulum Adımları](#kurulum-adımları)
3. [Veritabanı Yapısı](#veritabanı-yapısı)
4. [API Endpoint'leri](#api-endpointleri)
5. [Fiyat Hesaplama Motoru](#fiyat-hesaplama-motoru)
6. [Form Builder Mimarisi](#form-builder-mimarisi)
7. [Güvenlik Ayarları](#güvenlik-ayarları)
8. [Performans Optimizasyonu](#performans-optimizasyonu)
9. [Deployment](#deployment)
10. [Monitoring ve Logging](#monitoring-ve-logging)

---

## 💻 Sistem Gereksinimleri

### Minimum Gereksinimler
```bash
Node.js: v14.x veya üzeri (önerilen v18.x)
NPM: v6.x veya üzeri
RAM: 512MB
Disk: 1GB boş alan
Port: 3001 (veya özelleştirilebilir)
```

### Tarayıcı Desteği
```
Chrome: v80+
Firefox: v75+
Safari: v13+
Edge: v80+
```

---

## 🚀 Kurulum Adımları

### 1. Projeyi İndirme ve Kurulum
```bash
# Repository'yi klonlayın
git clone <repository-url>
cd burkol-quote-portal

# Bağımlılıkları yükleyin
npm install

# Uploads klasörünü oluşturun
mkdir -p uploads

# Gerekli log klasörlerini oluşturun
mkdir -p logs
```

### 2. Environment Değişkenleri
```bash
# .env dosyası oluşturun (opsiyonel)
NODE_ENV=development
PORT=3001
BURKOL_SECRET=your-secret-key-here
```

### 3. Başlatma
```bash
# Development modunda
npm start

# PM2 ile production modunda
npm run pm2:start

# Manuel olarak
node server.js
```

### 4. İlk Kurulum Kontrolleri
```bash
# Port kontrolü
lsof -i :3001

# Log kontrolü
tail -f logs/out-0.log

# Endpoint test
curl http://localhost:3001/api/test
```

---

## 🗄️ Veritabanı Yapısı

### JSON Database Schema
```javascript
{
  "quotes": [
    {
      "id": "BK202509XXXXX",
      "createdAt": "2025-09-18T10:30:00.000Z",
      "name": "Müşteri Adı",
      "email": "musteri@email.com",
      "phone": "+90 xxx xxx xxxx",
      "company": "Firma Adı",
      "proj": "Proje Adı",
      "material": "Çelik",
      "process": ["Kesme", "Kaynak"],
      "qty": 50,
      "dimsL": 100,
      "dimsW": 50,
      "thickness": 5,
      "desc": "Proje açıklaması",
      "price": 1250.00,
      "calculatedPrice": 1250.00,
      "status": "new",
      "uploadedFiles": [
        {
          "name": "technical-drawing.pdf",
          "path": "uploads/BK202509XXXXX/technical-drawing.pdf",
          "size": 1024000
        }
      ]
    }
  ],
  "settings": {
    "priceSettings": {
      "parameters": [
        {
          "id": "base_cost",
          "name": "Temel Maliyet",
          "type": "fixed",
          "value": 100
        }
      ],
      "formula": "base_cost + (material_cost * area * quantity)"
    },
    "formConfig": {
      "fields": [
        {
          "id": "material",
          "type": "select",
          "label": "Malzeme",
          "required": true,
          "options": ["Çelik", "Alüminyum"]
        }
      ]
    }
  },
  "users": [
    {
      "email": "admin@burkol.com",
      "pw_salt": "base64-salt",
      "pw_hash": "base64-hash",
      "role": "admin"
    }
  ],
  "sessions": [
    {
      "token": "session-token",
      "email": "admin@burkol.com",
      "expires": "2025-10-18T10:30:00.000Z"
    }
  ]
}
```

### Dosya Yapısı
```
quote-portal/
├── db.json                 # Ana veritabanı
├── uploads/               # Yüklenen dosyalar
│   └── BK202509XXXXX/    # Teklif ID bazlı klasörler
├── logs/                  # Sistem logları
│   ├── out-0.log         # Standart output
│   └── err-0.log         # Hata logları
```

---

## 🔌 API Endpoint'leri

### Authentication Endpoints
```http
POST   /api/auth/login           # Kullanıcı girişi
POST   /api/auth/logout          # Kullanıcı çıkışı
POST   /api/auth/register        # Yeni kullanıcı (ilk kurulum)
GET    /api/auth/me              # Mevcut kullanıcı bilgisi
GET    /api/auth/users           # Kullanıcı listesi (admin)
POST   /api/auth/users           # Kullanıcı ekleme (admin)
DELETE /api/auth/users/:email    # Kullanıcı silme (admin)
```

### Quote Management Endpoints
```http
GET    /api/quotes               # Tüm teklifler (admin)
POST   /api/quotes               # Yeni teklif oluştur
PATCH  /api/quotes/:id/status    # Teklif durumu güncelle (admin)
DELETE /api/quotes/:id           # Teklif sil (admin)
POST   /api/quotes/:id/apply-price # Fiyat güncelle (admin)
```

### Settings Endpoints
```http
GET    /api/price-settings       # Fiyat ayarları al (admin)
POST   /api/price-settings       # Fiyat ayarları kaydet (admin)
GET    /api/form-config          # Form yapılandırması al (admin)
POST   /api/form-config          # Form yapılandırması kaydet (admin)
```

### Export Endpoints
```http
GET    /api/export/txt           # TXT formatında export (admin)
```

### Utility Endpoints
```http
GET    /api/test                 # Sistem durumu test
GET    /uploads/:path            # Dosya indirme
```

---

## ⚡ Fiyat Hesaplama Motoru

### Parameter Türleri

#### 1. Fixed Parameters (Sabit Değerler)
```javascript
{
  "id": "base_cost",
  "name": "Temel Maliyet",
  "type": "fixed",
  "value": 100
}
```

#### 2. Form-Based Parameters (Form Bazlı)
```javascript
{
  "id": "quantity",
  "name": "Miktar",
  "type": "form",
  "formField": "qty"
}
```

#### 3. Lookup Table Parameters
```javascript
{
  "id": "material_cost",
  "name": "Malzeme Maliyeti",
  "type": "form",
  "formField": "material",
  "lookupTable": [
    { "option": "Çelik", "value": 10 },
    { "option": "Alüminyum", "value": 15 }
  ]
}
```

### Kullanılabilir Fonksiyonlar

#### Matematik Fonksiyonları
```javascript
SQRT(x)          // Karekök
ROUND(x)         // Yuvarlama
MAX(a,b,c...)    // Maksimum değer
MIN(a,b,c...)    // Minimum değer
ABS(x)           // Mutlak değer
POWER(x,y)       // Üs alma
```

#### Yuvarlama Fonksiyonları
```javascript
CEILING(x)       // Yukarı yuvarlama
FLOOR(x)         // Aşağı yuvarlama
ROUNDUP(x,d)     // Belirtilen basamağa yukarı
ROUNDDOWN(x,d)   // Belirtilen basamağa aşağı
```

#### İstatistik Fonksiyonları
```javascript
AVERAGE(a,b,c...)  // Ortalama
SUM(a,b,c...)      // Toplam
COUNT(a,b,c...)    // Sayım
```

#### Mantık Fonksiyonları
```javascript
IF(condition, true_value, false_value)
AND(a,b,c...)      // Ve işlemi
OR(a,b,c...)       // Veya işlemi
NOT(x)             // Değil işlemi
```

#### İş Mantığı Fonksiyonları
```javascript
MARGIN(cost, markup)           // Kar marjı hesaplama
DISCOUNT(price, percent)       // İndirim hesaplama
VAT(amount, rate)             // KDV hesaplama
MARKUP(cost, margin_percent)   // Markup hesaplama
```

### Formül Örnekleri

#### Basit Fiyat Hesaplama
```javascript
= base_cost + (material_cost * quantity)
```

#### Karmaşık İş Mantığı
```javascript
= IF(
    quantity > 100,
    (base_cost + material_cost * area * quantity + process_cost) * 0.9,
    base_cost + material_cost * area * quantity + process_cost
  ) * profit_margin
```

#### Çok Katmanlı Hesaplama
```javascript
= SUM(
    base_cost,
    SUMPRODUCT(material_cost, area, quantity),
    process_cost * quantity,
    IF(area > 1000, area * 0.1, 0)
  ) * VAT(1, 18)
```

---

## 🎨 Form Builder Mimarisi

### Field Types (Alan Türleri)
```javascript
{
  "text": "Metin girişi",
  "email": "Email girişi",
  "tel": "Telefon girişi", 
  "number": "Sayı girişi",
  "select": "Dropdown seçim",
  "checkbox": "Çoklu seçim",
  "radio": "Tekli seçim",
  "textarea": "Uzun metin",
  "file": "Dosya yükleme"
}
```

### Validation Rules (Doğrulama Kuralları)
```javascript
{
  "required": true,           // Zorunlu alan
  "minLength": 2,            // Minimum karakter
  "maxLength": 100,          // Maksimum karakter
  "pattern": "^[0-9]+$",     // Regex pattern
  "min": 1,                  // Minimum sayı değeri
  "max": 1000               // Maksimum sayı değeri
}
```

### Dynamic Field Configuration
```javascript
{
  "id": "material",
  "type": "select",
  "label": "Malzeme Türü",
  "required": true,
  "options": [
    { "value": "steel", "label": "Çelik" },
    { "value": "aluminum", "label": "Alüminyum" }
  ],
  "validation": {
    "required": true
  },
  "conditional": {
    "showIf": "product_type",
    "equals": "metal"
  }
}
```

---

## 🔒 Güvenlik Ayarları

### Authentication & Authorization
```javascript
// JWT benzeri token sistemi
const token = crypto.randomBytes(32).toString('base64url')

// Scrypt ile güvenli şifre hashleme
const { salt, hash } = hashPassword(password)

// Session expiry (30 gün)
const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
```

### CORS Configuration
```javascript
const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? ['https://burkol.com', 'https://admin.burkol.com']
  : ['http://localhost:3000', 'http://localhost:3001']
```

### Security Headers
```javascript
res.header('X-Content-Type-Options', 'nosniff')
res.header('X-Frame-Options', 'DENY')
res.header('X-XSS-Protection', '1; mode=block')
res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
```

### Input Sanitization
```javascript
function sanitizeInput(input) {
  if (typeof input === 'string') {
    return input.trim().replace(/<script[^>]*>.*?<\/script>/gi, '')
  }
  return input
}
```

### File Upload Security
```javascript
const ACCEPT_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'dxf', 'dwg', 'step']
const MAX_FILE_MB = 1.5
const MAX_FILES = 2
```

---

## ⚡ Performans Optimizasyonu

### Frontend Optimizasyonları
```javascript
// React optimizasyonları
const memoizedData = useMemo(() => 
  expensiveCalculation(data), [data]
)

// Lazy loading
const AdminComponent = React.lazy(() => 
  import('./components/admin/Admin.js')
)

// Virtual scrolling (büyük listeler için)
const VirtualizedList = ({ items, renderItem }) => {
  // Implementation
}
```

### Backend Optimizasyonları
```javascript
// Gzip compression
app.use(compression())

// Request size limiting
app.use(express.json({ limit: '5mb' }))

// Static file caching
app.use(express.static(ROOT, {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}))
```

### Database Optimizasyonları
```javascript
// Indexing simulation
const createIndex = (data, key) => {
  const index = new Map()
  data.forEach((item, idx) => {
    index.set(item[key], idx)
  })
  return index
}

// Pagination
const paginate = (data, page, limit) => {
  const start = (page - 1) * limit
  return data.slice(start, start + limit)
}
```

---

## 🚀 Deployment

### Production Deployment with PM2
```bash
# PM2 ile başlatma
pm2 start ecosystem.config.js

# Cluster mode
pm2 start ecosystem.config.js --env production

# Auto-restart on file changes
pm2 start ecosystem.config.js --watch

# Log monitoring
pm2 logs burkol

# Memory monitoring
pm2 monit
```

### Docker Deployment
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
EXPOSE 3001

CMD ["node", "server.js"]
```

### Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name burkol.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Environment Variables (Production)
```bash
NODE_ENV=production
PORT=3001
BURKOL_SECRET=strong-production-secret
PM2_SERVE_PATH=/var/www/burkol
PM2_SERVE_PORT=3001
```

---

## 📊 Monitoring ve Logging

### Log Levels
```javascript
// Morgan HTTP logging
app.use(morgan('combined', {
  stream: fs.createWriteStream('./logs/access.log', { flags: 'a' })
}))

// Winston structured logging
const winston = require('winston')
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
})
```

### Error Tracking
```javascript
// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err)
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  })
  res.status(500).json({ error: 'Internal server error' })
})
```

### Health Check Endpoint
```javascript
app.get('/health', (req, res) => {
  const healthStatus = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: require('./package.json').version
  }
  res.json(healthStatus)
})
```

### Performance Monitoring
```javascript
// Response time middleware
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(`${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`)
  })
  next()
})
```

---

## 🐛 Debug ve Troubleshooting

### Common Issues

#### 1. Port Already in Use
```bash
# Port kullanımını kontrol et
lsof -i :3001
kill -9 <PID>

# Alternatif port kullan
PORT=3002 node server.js
```

#### 2. File Upload Issues
```bash
# Upload klasörü izinleri
chmod 755 uploads/
chown -R $USER:$USER uploads/

# Disk alanı kontrolü
df -h
```

#### 3. Memory Leaks
```bash
# Node.js memory monitoring
node --inspect server.js

# PM2 memory restart
pm2 start ecosystem.config.js --max-memory-restart 500M
```

#### 4. Database Corruption
```bash
# JSON backup
cp db.json db.json.backup.$(date +%Y%m%d_%H%M%S)

# Validation
node -e "console.log(JSON.parse(require('fs').readFileSync('db.json')))"
```

### Debug Commands
```bash
# Verbose logging
DEBUG=* node server.js

# Network diagnostics
curl -v http://localhost:3001/api/test

# File system monitoring
ls -la uploads/
tail -f logs/*.log

# Process monitoring
ps aux | grep node
netstat -tulpn | grep 3001
```

---

## 📚 Development Guidelines

### Code Style
```javascript
// ES6+ modules kullanın
import express from 'express'

// Async/await tercih edin
async function loadData() {
  try {
    const result = await API.getData()
    return result
  } catch (error) {
    console.error('Error:', error)
  }
}

// Error boundaries
const ErrorBoundary = ({ children }) => {
  // Implementation
}
```

### Testing
```bash
# Unit testing
npm test

# Integration testing
npm run test:integration

# E2E testing with Playwright
npm run test:e2e
```

### Git Workflow
```bash
# Feature branch
git checkout -b feature/new-feature
git commit -m "feat: add new feature"
git push origin feature/new-feature

# Code review via PR
# Merge to main after approval
```

---

*Bu teknik kılavuz Burkol Quote Portal v0.1.0 için hazırlanmıştır.*
*Son güncelleme: 18 Eylül 2025*