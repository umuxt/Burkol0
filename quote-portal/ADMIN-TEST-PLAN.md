# 🧪 BURKOL ADMIN SİSTEM ENTEGRASYON TEST PLANI

## 🎯 Test Kapsamı
Admin panelinin tüm fonksiyonlarını gerçek kullanım senaryosu ile test etmek ve hataları tespit edip düzeltmek.

## ⚠️ Test Öncesi Hazırlık
1. Server temizleme ve başlatma
2. Console log monitoring
3. Test veritabanı hazırlama

## 📋 TEST SEKANSİ

### TEST 1: ✅ SİSTEM BAŞLATMA VE ERİŞİM
**Amaç:** Temel sistem erişimini test etmek
**Adımlar:**
1. Server başlatma kontrolü
2. Admin panel erişimi
3. Login sistemi testi
4. Dashboard yükleme kontrolü

### TEST 2: ✅ FORM BUILDER - TEMEL FORM YAPISI
**Amaç:** Form Builder'ın doğru çalıştığını test etmek
**Adımlar:**
1. Ayarlar modalı açma
2. Form Yapılandırması sekmesi
3. Yeni alan ekleme (material - dropdown)
4. Seçenek listesi oluşturma
5. Form kaydetme
6. Kayıt doğrulama

### TEST 3: ✅ FORM BUILDER - GELİŞMİŞ ALANLAR
**Amaç:** Karmaşık form alanlarının çalışmasını test etmek
**Adımlar:**
1. Process (multi-select) alanı ekleme
2. Quantity (number) alanı ekleme
3. Dimension alanları (dimsL, dimsW) ekleme
4. Validation kuralları test etme
5. Form önizleme kontrolü

### TEST 4: ✅ FİYAT PARAMETRELERİ OLUŞTURMA
**Amaç:** Fiyat parametrelerinin doğru tanımlanmasını test etmek
**Adımlar:**
1. Fiyat Ayarları sekmesine geçme
2. Sabit parametreler ekleme (base_cost, labor_cost)
3. Form bazlı parametreler ekleme (quantity, material)
4. Lookup table oluşturma (material → cost mapping)
5. Parametre kaydetme

### TEST 5: ✅ FİYAT FORMÜLÜ OLUŞTURMA
**Amaç:** Fiyat hesaplama formülünün çalışmasını test etmek
**Adımlar:**
1. Basit formül yazma
2. Formül validation kontrolü
3. Karmaşık formül (IF, AND, OR) testi
4. Matematik fonksiyonları (SQRT, ROUND) testi
5. Formül kaydetme ve doğrulama

### TEST 6: ✅ KULLANICI YÖNETİMİ
**Amaç:** User management sistemini test etmek
**Adımlar:**
1. Kullanıcılar sekmesi açma
2. Yeni kullanıcı ekleme
3. Kullanıcı listesi kontrolü
4. Kullanıcı silme
5. Auth endpoint'lerini test etme

### TEST 7: ✅ TEKLİF OLUŞTURMA (SİMÜLASYON)
**Amaç:** Form ayarlarının teklif formuna yansımasını test etmek
**Adımlar:**
1. Mock teklif verisi oluşturma
2. Form alanları mapping kontrolü
3. Dropdown seçeneklerinin doğru geldiğini test etme
4. Fiyat hesaplama testi
5. Teklif kaydetme

### TEST 8: ✅ TEKLİF YÖNETİMİ
**Amaç:** Admin teklif yönetim fonksiyonlarını test etmek
**Adımlar:**
1. Teklif listesi görüntüleme
2. Teklif detayları modalı
3. Durum değiştirme (new → pending → approved)
4. Fiyat güncelleme sistemi
5. Teklif silme

### TEST 9: ✅ FİLTRELEME VE ARAMA
**Amaç:** Filtreleme sisteminin çalışmasını test etmek
**Adımlar:**
1. Global arama testi
2. Durum filtresi
3. Malzeme filtresi
4. Tarih aralığı filtresi
5. Filtre kombinasyonları
6. Filtre temizleme

### TEST 10: ✅ EXPORT VE RAPORLAMA
**Amaç:** Export sisteminin çalışmasını test etmek
**Adımlar:**
1. TXT export testi
2. Seçili kayıtları export
3. İstatistik görüntüleme
4. Grafik rendering
5. Metrik değiştirme

## 🔍 HATA TAKIP SİSTEMİ

### Console Log Monitoring
```bash
# Terminal 1: Server logs
tail -f logs/out-0.log

# Terminal 2: Error logs  
tail -f logs/err-0.log

# Terminal 3: Real-time server output
node server.js
```

### Browser Developer Tools
```javascript
// Console'da hata takibi
console.error = function(original) {
  return function(...args) {
    // Log all errors
    original.apply(console, args);
  }
}(console.error);
```

## 🚨 HATA CATEGORİLERİ

### 1. Frontend Hataları
- React component render hataları
- State management sorunları
- API call failures
- Form validation hataları

### 2. Backend Hataları
- Route handler hataları
- Database operation failures
- Authentication sorunları
- File operation hataları

### 3. Integration Hataları
- Frontend-Backend bağlantı sorunları
- Data format uyumsuzlukları
- Endpoint mapping hataları
- Session management sorunları

## 🔧 DÜZELTME PROTOKOLÜ

### Hata Tespit Edildiğinde:
1. **Hata Lokalizasyonu:** Console logları ile hatanın yerini tespit et
2. **Root Cause Analysis:** Hatanın kök nedenini analiz et
3. **Entegre Çözüm:** Diğer sistemleri etkileyecek şekilde kapsamlı düzeltme
4. **Validation:** Düzeltmenin doğru çalıştığını test et
5. **Regression Test:** İlgili testleri tekrar çalıştır

## 📊 TEST RAPORU ŞEMASİ

```javascript
{
  "testId": "TEST_01",
  "testName": "Sistem Başlatma",
  "status": "PASS|FAIL|PENDING",
  "errors": [
    {
      "type": "FRONTEND|BACKEND|INTEGRATION",
      "message": "Hata mesajı",
      "stack": "Stack trace",
      "fix": "Uygulanan düzeltme"
    }
  ],
  "duration": "Test süresi",
  "timestamp": "Test tarihi"
}
```