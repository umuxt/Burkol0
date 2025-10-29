# ⚡ Emergent AI - Quick Reference Card

Bu döküman, Emergent.com AI için hızlı başvuru kartıdır. Detaylı açıklamalar için `/EMERGENT_INTEGRATION_PROMPT.md` dosyasına bakın.

---

## 🎯 TÜM GÖREV - 3 ANA ADIM

### 1️⃣ Firebase Backend Entegrasyonu (15 dakika)
→ MESContext.tsx dosyasını güncelle

### 2️⃣ Component Async Updates (10 dakika)
→ 6 component'te async/await ekle

### 3️⃣ Build & Deploy (5 dakika)
→ production.html build et ve deploy et

---

## 📝 ADIM 1: Firebase Backend

### 1.1 Paket Yükle
```bash
npm install firebase
```

### 1.2 .env Oluştur
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 1.3 MESContext.tsx Güncellemeleri

**Dosya:** `/contexts/MESContext.tsx`

| Adım | Satır | Yapılacak İşlem |
|------|-------|-----------------|
| 1 | 1 | `useEffect` import ekle |
| 2 | 48-78 | Firebase imports yorum satırlarını kaldır (`/*` ve `*/`) |
| 3 | ~218 | Master Data useEffect ekle |
| 4 | ~238 | Operations useEffect ekle |
| 5 | ~257 | Workers useEffect ekle |
| 6 | ~276 | Stations useEffect ekle |
| 7 | ~295 | Work Orders useEffect ekle |
| 8 | 343-662 | 12 fonksiyonu async yap |
| 9 | 159-192 | Interface'te `Promise<void>` ekle |

### 1.4 Firebase Collections Oluştur

Firebase Console'da:
- `settings/master-data` (document)
- `operations` (collection)
- `workers` (collection)
- `stations` (collection)
- `work-orders` (collection)

### 1.5 Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;  // Test mode
    }
  }
}
```

---

## 📝 ADIM 2: Component Updates

Her component'te async/await ekle:

### 2.1 Workers Management
**Dosya:** `/components/workers-management.tsx`

```typescript
const [isLoading, setIsLoading] = useState(false);

const handleSaveWorker = async () => {
  try {
    setIsLoading(true);
    await setWorkers([...workers, newWorker]);
    toast.success('Worker saved');
  } catch (error) {
    toast.error('Failed to save worker');
  } finally {
    setIsLoading(false);
  }
};
```

### 2.2 Aynı Pattern'i Uygula

| Component | Fonksiyonlar |
|-----------|-------------|
| workers-management.tsx | handleSaveWorker, handleDeleteWorker |
| operations-management.tsx | handleSaveOperation, handleDeleteOperation |
| stations-management.tsx | handleSaveStation, handleDeleteStation |
| production-plan-designer.tsx | handleSavePlan |
| worker-panel-simple.tsx | handleStartOperation, handleCompleteOperation, handleCompletePackage |
| production-dashboard-clean.tsx | Değişiklik yok (sadece okuma) |

---

## 📝 ADIM 3: Build & Deploy

### 3.1 Build Çalıştır
```bash
npm run build
```

Output: `/dist` klasörü

### 3.2 Test Et
```bash
cd dist
npx serve
```

Tarayıcı: `http://localhost:3000/production.html`

### 3.3 Deploy
```bash
# Burkol0 web server'a kopyala
cp -r dist/* /var/www/burkol0/production/
```

---

## ✅ Hızlı Test Checklist

### Development Test
```bash
npm run dev
# http://localhost:5173/production.html
```

- [ ] Sayfa yükleniyor
- [ ] Console'da hata yok
- [ ] Firebase bağlandı
- [ ] Tab navigation çalışıyor

### Firebase Test

Firebase Console'u aç:
- [ ] Collections var
- [ ] Master data document var

MES UI'dan:
- [ ] Worker ekle → Firebase'de görünüyor
- [ ] Worker sil → Firebase'den siliniyor
- [ ] Real-time update çalışıyor

### Production Build Test
```bash
npm run build
cd dist
npx serve
# http://localhost:3000/production.html
```

- [ ] Build hatasız
- [ ] production.html render oluyor
- [ ] Tüm fonksiyonlar çalışıyor

---

## 🚨 Hızlı Troubleshooting

| Hata | Çözüm |
|------|-------|
| "db is not defined" | Firebase imports'ları aktif et (satır 48-78) |
| "useEffect is not defined" | Import'a `useEffect` ekle (satır 1) |
| "Firestore: Missing permissions" | Security rules'u kontrol et |
| Real-time updates çalışmıyor | useEffect listeners'ı ekledin mi? |
| Build hata veriyor | `npm install` tekrar çalıştır |

---

## 📚 Detaylı Dökümanlar

| Dosya | İçerik |
|-------|--------|
| `/EMERGENT_INTEGRATION_PROMPT.md` | Tam entegrasyon guide'ı (bu döküman) |
| `/FIREBASE_INTEGRATION_GUIDE.md` | Firebase teknik detayları |
| `/EMERGENT_AI_QUICKSTART.md` | Step-by-step code örnekleri |
| `/contexts/MESContext.tsx` | Inline yorum satırları (her satırda açıklama) |
| `/DEPLOYMENT.md` | Production deployment checklist |

---

## 🎯 Özet - Tek Bakışta

```
┌─────────────────────────────────────────────┐
│  EMERGENT AI ENTEGRASYON - 30 DAKİKA       │
├─────────────────────────────────────────────┤
│                                             │
│  1. npm install firebase                   │
│  2. .env oluştur                           │
│  3. MESContext.tsx güncelle:               │
│     - Firebase imports aktif et            │
│     - useEffect import et                  │
│     - 5 listener ekle                      │
│     - 12 fonksiyon async yap               │
│  4. Components'e async/await ekle          │
│  5. npm run build                          │
│  6. Firebase Collections oluştur           │
│  7. Test et                                │
│  8. Deploy et                              │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 📞 Yardım

Takıldığın bir yer olursa:

1. `/EMERGENT_INTEGRATION_PROMPT.md` → Detaylı açıklamalar
2. `/contexts/MESContext.tsx` → Her satırda yorum var
3. `/EMERGENT_AI_QUICKSTART.md` → Code örnekleri

---

**Başarılar! 🚀**
