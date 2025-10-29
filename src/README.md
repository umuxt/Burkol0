# MES (Manufacturing Execution System) - Burkol0 Integration

Burkol0 üretim yönetim sistemi için geliştirilmiş kapsamlı MES modülü.

> 📚 **Tüm dökümanları görmek için:** [`DOCUMENTATION_INDEX.md`](DOCUMENTATION_INDEX.md)  
> 🤖 **Emergent AI ile entegrasyon için:** [`SEND_TO_EMERGENT_AI.md`](SEND_TO_EMERGENT_AI.md)

## 🎯 Özellikler

### Production Dashboard
- 📊 Real-time KPI tracking (Açık iş emirleri, günlük tamamlanan, fire, verimlilik)
- 📋 Work Orders yönetimi ve takibi
- 📈 İlerleme çubukları ve durum göstergeleri
- 🔍 Operasyon detayları görüntüleme

### Production Plan Designer
- 🎨 **Interactive Toolbox**: Drag & drop ile operasyon ekleme
- 🔗 **Node-based Design**: Görsel akış diyagramları
- ⚙️ **Editable Nodes**: Çift tıklama ile parametre düzenleme
- 🔄 **Connection System**: Operasyonları birbirine bağlama
- 💾 **Template Support**: Planları şablon olarak kaydetme

**Operasyon Tipleri:**
- Machining (Talaşlı imalat)
- Assembly (Montaj)
- Quality Check (Kalite kontrol)
- Packaging (Paketleme)
- WIP Buffer (Ara ürün deposu)

### Worker Panel
- 📱 Mobil uyumlu, büyük butonlu operatör arayüzü
- 👤 Operatör seçimi ve atanan görevler
- ⏯️ Start/Pause/Complete işlemleri
- ⚠️ Issue ve scrap bildirimi
- 📦 Material durumu referansı (read-only)

### Templates Library
- 📚 Operasyon akış şablonları kütüphanesi
- ⚡ Hızlı plan deployment
- 🏷️ Kategori bazlı organizasyon

### Settings
- 🔧 Sistem yapılandırması
- 👥 Kullanıcı ve operatör yönetimi
- 🔔 Bildirim tercihleri
- 🎨 Tema ve dil ayarları

## 🎨 Tasarım Dili

MES modülü, Burkol0 projesinin tasarım dilini takip eder:
- ✅ Burkol0 tipografisi (globals.css)
- ✅ Tutarlı renk paleti (koyu tonlar + beyaz alan)
- ✅ Shadcn/ui component kütüphanesi
- ✅ Burkol0 navbar entegrasyonu (ana sistem navbar'ı kullanılır)
- ✅ Horizontal tab navigation (MES modülleri için)
- ✅ Responsive design

## 📚 Kullanıcı Rehberi

Sistem 17+ adımlı interaktif kullanıcı rehberi içerir:
- Sağ altta **help butonu** ile erişim
- Her modül için detaylı açıklamalar
- Viewport-aware positioning (ekran dışına taşmaz)
- Mobil ve desktop uyumlu

## 🔗 Burkol0 Entegrasyonu

Bu MES sistemi Burkol0'ın bir parçasıdır ve şu modüllerle entegre çalışır:

### Ana Sistemden Kullanılanlar:
- ✅ **Materials Management**: Malzeme durumu (read-only referans)
- ✅ **Orders**: Work order kaynağı
- ✅ **Inventory**: Stok hareketleri (ana sistemde yönetiliyor)

### MES'e Özel Modüller:
- ✅ Production Dashboard
- ✅ Plan Designer
- ✅ Worker Panel
- ✅ Templates Library

Detaylı entegrasyon bilgisi için [INTEGRATION.md](./INTEGRATION.md) dosyasına bakın.

## 🔥 Firebase Backend Ready

**Önemli Güncelleme (2025-10-29):**
- ✅ Tüm dummy data kaldırıldı
- ✅ Firebase backend entegrasyonuna hazır
- ✅ Detaylı dokümantasyon eklendi
- ✅ Emergent.com AI için entegrasyon rehberi hazır
- ✅ production.html Burkol0 entegrasyonuna hazır

**📚 Emergent.com AI İçin Dökümanlar:**
1. 🎯 **`/EMERGENT_INTEGRATION_PROMPT.md`** - TAM ENTEGRASYON REHBERİ
   - Firebase backend entegrasyonu (adım adım)
   - Component-level async handling
   - production.html entegrasyonu
   - Burkol0 navbar entegrasyonu
   - Testing & troubleshooting
   
2. ⚡ **`/EMERGENT_QUICK_REFERENCE.md`** - HIZLI REFERANS KARTI
   - 3 ana adımda özet
   - Hızlı test checklist
   - Troubleshooting tablosu
   
3. 📖 **`/FIREBASE_INTEGRATION_GUIDE.md`** - Firebase Teknik Detayları
   - Firestore database yapısı
   - Real-time listeners
   - Security rules
   - Offline support

4. 🚀 **`/EMERGENT_AI_QUICKSTART.md`** - Code Örnekleri
   - Her fonksiyon için implementation
   - Satır satır guide
   
5. 📋 **`/FIREBASE_READY_SUMMARY.md`** - Genel Bakış

**Mevcut durum:** Sistem Firebase'e bağlanmaya hazır. Import/export noktaları yorum satırlarıyla işaretlendi. production.html Burkol0 navbar'ı ile entegre.

## 🚀 Kurulum

```bash
# Dependencies yükleme
npm install

# Firebase paketini ekle
npm install firebase

# .env dosyası oluştur (.env.example'dan kopyala)
cp .env.example .env
# Firebase config bilgilerini .env'ye ekle

# Development server
npm run dev

# Production build
npm run build
```

## 🛠️ Teknolojiler

- **React** + **TypeScript**
- **Tailwind CSS** v4.0
- **Shadcn/ui** components
- **Lucide React** icons
- **Recharts** (grafikler için)
- **Sonner** (toast notifications)
- **Firebase** (Backend - Firestore Database)

## 📁 Dosya Yapısı

```
├── App.tsx                          # Ana MES container (navbar'sız)
├── production.html                  # Burkol0 navbar ile entegre sayfa
├── components/
│   ├── production-dashboard.tsx     # Kontrol paneli
│   ├── production-plan-designer.tsx # Plan tasarımı
│   ├── worker-panel.tsx             # Operatör arayüzü
│   ├── templates-library.tsx        # Şablon yönetimi
│   ├── settings.tsx                 # Ayarlar
│   ├── interactive-guide.tsx        # Kullanıcı rehberi
│   └── ui/                          # Shadcn components
├── styles/
│   └── globals.css                  # Burkol0 uyumlu tasarım
├── INTEGRATION.md                   # Entegrasyon kılavuzu
├── DEPLOYMENT.md                    # Deployment checklist
├── QUICKSTART.md                    # Hızlı başlangıç
└── README.md
```

## 👥 Kullanıcı Rolleri

### Planner/Engineer
- Production Dashboard: Tam erişim
- Plan Designer: Tam erişim
- Templates: Tam erişim
- Settings: Tam erişim
- Worker Panel: Görüntüleme

### Worker/Operator
- Worker Panel: Tam erişim
- Production Dashboard: Görüntüleme
- Diğer modüller: Erişim yok

## 📝 API Endpoints (Beklenen)

```typescript
// Work Orders
GET    /api/production/work-orders
POST   /api/production/work-orders
PATCH  /api/production/work-orders/:id

// Operations
GET    /api/production/operations/:workOrderId
POST   /api/production/operations/:id/complete

// Templates
GET    /api/production/templates
POST   /api/production/templates

// Materials (Ana sistemden)
GET    /api/materials/availability/:orderId
```

## 🎯 Next Steps

1. Backend API endpoints ekleyin
2. Mock data yerine gerçek API çağrılarını entegre edin
3. Authentication/authorization ekleyin
4. WebSocket real-time updates (opsiyonel)
5. production.html'e import edin

## 📄 License

Bu proje Burkol0 ana sisteminin bir parçasıdır.

---

**Not**: Şu anda mock data kullanılmaktadır. Production deployment için API entegrasyonu gereklidir.
