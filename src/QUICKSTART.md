# MES System - Quick Start Guide

Hızlıca başlamak için 5 dakikalık kılavuz.

## 🎯 Sistem Özeti

**MES (Manufacturing Execution System)** - Burkol0 üretim yönetim platformunun bir parçası.

### Ana Modüller
1. **Production Dashboard** - KPI'lar ve iş emri takibi
2. **Plan Designer** - Drag & drop görsel operasyon planlama
3. **Worker Panel** - Mobil uyumlu operatör arayüzü  
4. **Templates Library** - Operasyon şablonları
5. **Settings** - Sistem ayarları

## 🚀 Hızlı Başlangıç

### 1. Demo Modunda Çalıştırma (Mock Data ile)

```bash
# Dependencies yükle
npm install

# Development server başlat
npm run dev

# Tarayıcıda aç: http://localhost:5173
```

✅ **Şu anda çalışır durumda!** Mock data ile tüm özellikler test edilebilir.

### 2. Modülleri Keşfet

#### Production Dashboard
1. Üst tab navigation'dan "Dashboard" seç
2. KPI kartlarını incele (Açık emirler, tamamlananlar, fire, verimlilik)
3. Work Orders tablosunda bir satıra tıkla
4. Alt panelde operasyon detaylarını gör

#### Plan Designer - Interactive!
1. Üst tab navigation'dan "Plan Designer" seç
2. "Select Order" dropdown'dan bir sipariş seç
3. **Toolbox'tan operasyon sürükle:**
   - Machining (mavi)
   - Assembly (mor)
   - Quality Check (yeşil)
   - Packaging (turuncu)
   - WIP Buffer (sarı)
4. Canvas'a sürükle-bırak
5. **Node'ları bağla:**
   - "Connect Nodes" butonuna tıkla
   - Kaynak node'a tıkla
   - Hedef node'a tıkla
6. **Node düzenle:**
   - Bir node'a çift tıkla
   - Süre, işçi sayısı, istasyon düzenle
7. **Planı kaydet:**
   - "Save Plan" - Plani kaydet
   - "Save Template" - Şablon olarak kaydet
   - "Publish Plan" - İş emri oluştur

#### Worker Panel
1. Üst tab navigation'dan "Worker Panel" seç
2. Operatör seçimi yap
3. "Assigned Operations" listesinden bir operasyon aç
4. **Start** - Operasyonu başlat
5. **Pause** - Ara ver
6. **Complete Package** - Paketi tamamla
7. **Report Issue/Scrap** - Sorun bildir

#### Templates Library
1. Kayıtlı şablonları görüntüle
2. Şablon detaylarını incele
3. "Use Template" ile Plan Designer'da kullan

## 🎓 Interactive Guide

Sağ alttaki **?** butonuna tıklayarak 17 adımlı interaktif rehberi başlat.

## 📚 Dokümantasyon

- **README.md** - Genel bilgi ve özellikler
- **INTEGRATION.md** - Burkol0 entegrasyon detayları
- **DEPLOYMENT.md** - Production deployment checklist
- **config.example.ts** - Konfigürasyon şablonu

## 🔧 Production Kullanımı İçin

### Adım 1: Config Dosyası Oluştur
```bash
cp config.example.ts config.ts
```

### Adım 2: API URL'lerini Güncelle
```typescript
// config.ts
export const MESConfig = {
  api: {
    baseUrl: 'https://burkol0.com/api', // Burkol0 API URL
  },
  useMockData: false, // Mock data'yı kapat
};
```

### Adım 3: Mock Data'yı API Call'lara Dönüştür

**Örnek: production-dashboard.tsx**
```typescript
// ÖNCE (Mock data):
const [workOrders, setWorkOrders] = useState(mockWorkOrders);

// SONRA (API call):
useEffect(() => {
  fetch(`${MESConfig.api.baseUrl}/production/work-orders`)
    .then(res => res.json())
    .then(data => setWorkOrders(data));
}, []);
```

### Adım 4: Authentication Ekle

```typescript
// API request'lerde auth token ekle
headers: {
  'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
}
```

## 🎨 Burkol0 Entegrasyonu

### Ana Sistemden Kullanılan Modüller:
- ✅ **Materials** - Malzeme yönetimi (ana sistemde)
- ✅ **Orders** - Sipariş yönetimi (ana sistemde)
- ✅ **Inventory** - Stok yönetimi (ana sistemde)

### MES'e Özel Modüller:
- ✅ Production Dashboard
- ✅ Plan Designer
- ✅ Worker Panel
- ✅ Templates

## 🔍 Kullanıcı Rolleri

### Planner/Engineer
- Dashboard: ✅ Tam erişim
- Plan Designer: ✅ Tam erişim
- Worker Panel: 👁️ Görüntüleme
- Templates: ✅ Tam erişim
- Settings: ✅ Tam erişim

### Worker/Operator
- Dashboard: 👁️ Görüntüleme
- Plan Designer: ❌ Erişim yok
- Worker Panel: ✅ Tam erişim
- Templates: ❌ Erişim yok
- Settings: ❌ Erişim yok

## 📱 Responsive Design

- ✅ Desktop (1920x1080+)
- ✅ Tablet (768-1024px)
- ✅ Mobile (320-767px)
- ✅ Worker Panel özellikle mobil optimize

## 🎯 Plan Designer - Hızlı Klavuz

### Operasyon Tipleri:
| Tip | Renk | Icon | Varsayılan Süre |
|-----|------|------|----------------|
| Machining | Mavi 🔵 | 🔧 | 240 min |
| Assembly | Mor 🟣 | 📦 | 180 min |
| Quality Check | Yeşil 🟢 | ✅ | 30 min |
| Packaging | Turuncu 🟠 | 📦 | 60 min |
| WIP Buffer | Sarı 🟡 | 📋 | 0 min |

### Kısayollar:
- **Çift tıklama**: Node düzenle
- **Connect mode**: İki node'u bağla
- **Hover**: Edit/Delete butonları
- **Drag**: Node'u taşı

## 🆘 Sorun Giderme

### "Canvas boş görünüyor"
→ Toolbox'tan operasyon sürükleyin

### "Node bağlanamıyor"
→ "Connect Nodes" butonuna tıklayın, sonra sırayla node'lara tıklayın

### "Plan kaydedilmiyor"
→ En az bir operasyon ekleyin ve sipariş seçin

### "Material durumu güncellenmiyor"
→ Bu read-only referans, ana Burkol0 sisteminden gelir

## 📞 Destek

Detaylı bilgi için:
- **Entegrasyon**: INTEGRATION.md
- **Deployment**: DEPLOYMENT.md
- **Full Docs**: README.md

---

**İyi çalışmalar!** 🚀
