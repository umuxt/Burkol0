# 🏭 Burkol Quote Portal

**Profesyonel Metal İşleme Teklif Yönetim Sistemi**

Modern React tabanlı frontend ve Express.js backend ile geliştirilmiş, metal işleme sektörüne özel kapsamlı teklif yönetim platformu.

## 🌟 Özellikler

### 🎯 **Müşteri Teklif Sistemi**
- Dinamik form yapısı (admin tarafından özelleştirilebilir)
- Çoklu dosya yükleme desteği (PDF, DWG, STEP, vb.)
- Otomatik fiyat hesaplama sistemi
- Gerçek zamanlı form validasyonu
- Mobil uyumlu responsive tasarım

### 👨‍💼 **Admin Yönetim Paneli**
- **Teklif Yönetimi:** Görüntüleme, durum güncelleme, silme
- **Form Builder:** Drag-and-drop ile özel form oluşturma
- **Fiyat Hesaplama Motoru:** Karmaşık matematik formülleri
- **Kullanıcı Yönetimi:** Multi-user admin desteği
- **Gelişmiş Filtreleme:** Durum, tarih, malzeme bazlı filtreleme
- **İstatistik ve Analitik:** Grafik ve raporlama
- **Export Sistemi:** TXT, CSV formatında veri aktarma

### 🔧 **Teknik Özellikler**
- **Frontend:** React 18 (CDN), ES6 Modules
- **Backend:** Express.js, JSON-based database
- **Authentication:** Secure token-based auth
- **File Upload:** Güvenli dosya yükleme sistemi
- **PWA Ready:** Progressive Web App desteği
- **Multi-language:** Türkçe/İngilizce dil desteği

## 🚀 Hızlı Başlangıç

### Gereksinimler
```bash
Node.js 18+ 
NPM 6+
```

### Kurulum
```bash
# Repository'yi klonlayın
git clone <repository-url>
cd burkol-quote-portal

# Bağımlılıkları yükleyin
npm install

# Sunucuyu başlatın
npm start

# Tarayıcınızda açın
# Frontend: http://localhost:3001
# Admin:    http://localhost:3001/admin.html
```

### İlk Giriş Bilgileri
```
Email: umutyalcin8@gmail.com
Şifre: burkol123
```

## 📖 Dokümantasyon

### 📋 Kullanım Kılavuzları
- **[KULLANIM-KLAVUZU.md](./KULLANIM-KLAVUZU.md)** - Detaylı kullanım talimatları
- **[TEKNIK-KLAVUZ.md](./TEKNIK-KLAVUZ.md)** - Teknik dokümantasyon ve API referansı

### 🔗 API Endpoint'leri

#### Authentication
```http
POST   /api/auth/login           # Kullanıcı girişi
POST   /api/auth/logout          # Kullanıcı çıkışı
GET    /api/auth/me              # Mevcut kullanıcı
POST   /api/auth/users           # Kullanıcı ekleme
DELETE /api/auth/users/:email    # Kullanıcı silme
```

#### Quote Management
```http
GET    /api/quotes               # Tüm teklifler
POST   /api/quotes               # Yeni teklif
PATCH  /api/quotes/:id/status    # Durum güncelleme
DELETE /api/quotes/:id           # Teklif silme
```

#### Settings & Configuration
```http
GET/POST /api/price-settings     # Fiyat ayarları
GET/POST /api/form-config        # Form yapılandırması
GET      /api/export/txt         # TXT export
```

## 🏗️ Proje Yapısı

```
burkol-quote-portal/
├── 📄 index.html              # Ana teklif formu
├── 📄 admin.html              # Admin panel
├── 📄 app.js                  # Ana uygulama
├── 📄 server.js               # Express backend
├── 📁 components/             # React bileşenleri
│   ├── 📁 admin/             # Admin panel bileşenleri
│   ├── 📁 forms/             # Form bileşenleri
│   ├── 📁 modals/            # Modal bileşenleri
│   └── 📁 settings/          # Ayar bileşenleri
├── 📁 server/                 # Backend modülleri
│   ├── 📄 apiRoutes.js       # API rotaları
│   ├── 📄 authRoutes.js      # Kimlik doğrulama
│   ├── 📄 auth.js            # Auth modülü
│   └── 📄 priceCalculator.js # Fiyat hesaplama
├── 📁 lib/                    # Utility modülleri
├── 📁 styles/                 # CSS dosyaları
├── 📁 uploads/                # Yüklenen dosyalar
└── 📁 logs/                   # Sistem logları
```

## 🎨 Form Builder Özellikleri

### Desteklenen Alan Türleri
- ✅ Text Input (Metin girişi)
- ✅ Email Input (Email doğrulamalı)
- ✅ Number Input (Sayısal giriş)
- ✅ Select Dropdown (Seçim listesi)
- ✅ Multi-Select Checkbox (Çoklu seçim)
- ✅ Radio Buttons (Tekli seçim)
- ✅ File Upload (Dosya yükleme)
- ✅ Textarea (Uzun metin)

### Validation Rules
- Required (Zorunlu alan)
- Min/Max Length (Karakter sınırı)
- Pattern Matching (Regex doğrulama)
- Custom Validation (Özel kurallar)

## 💰 Fiyat Hesaplama Sistemi

### Gelişmiş Matematik Motoru
```javascript
// Örnek formül
= IF(
    quantity > 100,
    (base_cost + material_cost * area * quantity) * 0.9,
    base_cost + material_cost * area * quantity
  ) * profit_margin
```

### Desteklenen Fonksiyonlar
- **Matematik:** SQRT, ROUND, MAX, MIN, ABS, POWER
- **Yuvarlama:** CEILING, FLOOR, ROUNDUP, ROUNDDOWN  
- **İstatistik:** AVERAGE, SUM, COUNT
- **Mantık:** IF, AND, OR, NOT
- **İş Mantığı:** MARGIN, DISCOUNT, VAT, MARKUP

## 🔒 Güvenlik

### Kimlik Doğrulama
- Secure token-based authentication
- Scrypt password hashing
- Session management (30 gün)
- CORS protection

### Input Security
- XSS protection
- Input sanitization
- File upload validation
- Size limiting (1.5MB per file)

### Security Headers
```javascript
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000
```

## 🚀 Production Deployment

### PM2 ile Başlatma
```bash
# Production modunda başlat
npm run pm2:start

# Log monitoring
pm2 logs burkol

# Restart
npm run pm2:restart
```

### Docker Support
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
```

## 📊 Monitoring

### Logs
```bash
# Uygulama logları
tail -f logs/out-0.log

# Hata logları  
tail -f logs/err-0.log

# Access logları
tail -f logs/access.log
```

### Health Check
```bash
curl http://localhost:3001/health
```

## 🔧 Development

### Scripts
```bash
npm start              # Sunucuyu başlat
npm test               # Testleri çalıştır
npm run build          # Production build
npm run pm2:start      # PM2 ile başlat
npm run pm2:restart    # PM2 restart
npm run pm2:logs       # PM2 logları
```

### Environment Variables
```bash
NODE_ENV=development
PORT=3001
BURKOL_SECRET=your-secret-here
```

## 🎯 Roadmap

### v0.2.0 (Planlanan)
- [ ] PostgreSQL database entegrasyonu
- [ ] PDF report generator
- [ ] Email notification sistemi
- [ ] Advanced analytics dashboard
- [ ] Multi-tenant support

### v0.3.0 (Gelecek)
- [ ] Mobile app (React Native)
- [ ] Real-time collaboration
- [ ] Advanced workflow management
- [ ] Integration APIs (CRM, ERP)

## 🤝 Katkıda Bulunma

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📞 Destek

### İletişim
- **Email:** support@burkol.com
- **GitHub Issues:** [Repository Issues](https://github.com/your-repo/issues)
- **Dokümantasyon:** [Wiki](https://github.com/your-repo/wiki)

### Sistem Bilgileri
```
Application: Burkol Quote Portal
Version: 0.1.0
Node.js: v18+
Database: JSON-based file system  
Frontend: React 18 (CDN)
Backend: Express.js
```

## 📄 Lisans

Bu proje [MIT Lisansı](LICENSE) altında lisanslanmıştır.

---

**🏭 Burkol Metal İşleme - Profesyonel Teklif Yönetim Sistemi**

*Modern teknoloji ile metal işleme sektörüne özel çözümler*
