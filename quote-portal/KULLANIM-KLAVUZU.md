# 📋 BURKOL QUOTE PORTAL - KULLANIM KLAVUZU

## 🎯 İçindekiler
1. [Sisteme Giriş](#sisteme-giriş)
2. [İlk Kurulum ve Yapılandırma](#ilk-kurulum-ve-yapılandırma)
3. [Form Builder - Teklif Formu Oluşturma](#form-builder---teklif-formu-oluşturma)
4. [Fiyatlandırma Sistemi Kurulumu](#fiyatlandırma-sistemi-kurulumu)
5. [Kullanıcı Yönetimi](#kullanıcı-yönetimi)
6. [Teklif Yönetimi](#teklif-yönetimi)
7. [Filtreleme ve Arama](#filtreleme-ve-arama)
8. [Raporlama ve Export](#raporlama-ve-export)
9. [Sistem Bakımı](#sistem-bakımı)
10. [Sorun Giderme](#sorun-giderme)

---

## 🔐 Sisteme Giriş

### Admin Paneline Erişim
1. **URL:** `http://localhost:3001/admin.html`
2. **Varsayılan Kullanıcı:**
   - **Email:** `umutyalcin8@gmail.com`
   - **Şifre:** `burkol123`

### İlk Giriş
```
1. Tarayıcınızda admin URL'sini açın
2. Email ve şifre bilgilerini girin
3. "Giriş Yap" butonuna tıklayın
4. Dashboard ekranına yönlendirileceksiniz
```

---

## 🛠️ İlk Kurulum ve Yapılandırma

### ⚠️ ÖNEMLİ: Kurulum Sırası
Sistem ilk kurulumunda **mutlaka** şu sırayı takip edin:

```
1. Form Builder (Teklif formu yapısı)
2. Fiyatlandırma Sistemi (Parametreler ve formül)
3. Kullanıcı Ayarları
4. Test Teklifi Oluşturma
```

---

## 📝 Form Builder - Teklif Formu Oluşturma

### Adım 1: Form Builder'a Erişim
1. Admin panelinde **"⚙️ Ayarlar"** butonuna tıklayın
2. **"Form Yapılandırması"** sekmesini seçin

### Adım 2: Temel Form Alanları
Sistem varsayılan olarak şu alanları içerir:
- ✅ İsim (zorunlu)
- ✅ Email (zorunlu)
- ✅ Telefon (zorunlu)
- ✅ Proje Adı (zorunlu)

### Adım 3: Özel Alanlar Ekleme

#### A) Malzeme Seçimi Alanı
```
Alan Türü: Select (Dropdown)
Alan Adı: material
Etiket: Malzeme Türü
Seçenekler:
- Çelik
- Alüminyum
- Paslanmaz Çelik
- Bronz
- Pirinç
```

#### B) İşlem Türü Alanı
```
Alan Türü: Multi-Select (Checkbox)
Alan Adı: process
Etiket: İşlem Türleri
Seçenekler:
- Kesme
- Büküm
- Kaynak
- Delme
- Frezeleme
- Tornalama
```

#### C) Boyut Alanları
```
1. Alan Adı: dimsL | Etiket: Uzunluk (mm) | Tür: Number
2. Alan Adı: dimsW | Etiket: Genişlik (mm) | Tür: Number
3. Alan Adı: thickness | Etiket: Kalınlık (mm) | Tür: Number
```

#### D) Miktar Alanı
```
Alan Adı: qty
Etiket: Adet
Tür: Number
Minimum: 1
```

### Adım 4: Form Kaydetme
1. Tüm alanları ekledikten sonra **"Önizleme"** ile kontrol edin
2. **"Kaydet"** butonuna tıklayın
3. ✅ "Form yapılandırması kaydedildi!" mesajını bekleyin

---

## 💰 Fiyatlandırma Sistemi Kurulumu

### Adım 1: Fiyat Ayarlarına Erişim
1. Ayarlar modalında **"Fiyat Ayarları"** sekmesini seçin

### Adım 2: Temel Parametreler Oluşturma

#### A) Sabit Parametreler
```
1. Parametre Adı: base_cost
   Tür: Sabit Değer
   Değer: 100
   Açıklama: Temel maliyet

2. Parametre Adı: labor_cost_per_hour
   Tür: Sabit Değer
   Değer: 150
   Açıklama: Saat başı işçilik

3. Parametre Adı: profit_margin
   Tür: Sabit Değer
   Değer: 1.25
   Açıklama: Kar marjı (%25)
```

#### B) Form Bazlı Parametreler

**Miktar Parametresi:**
```
Parametre Adı: quantity
Tür: Form Alanı
Form Alanı: qty (Adet)
```

**Malzeme Parametresi (Lookup Table ile):**
```
Parametre Adı: material_cost
Tür: Form Alanı
Form Alanı: material
Lookup Tablosu:
- Çelik → 10
- Alüminyum → 15
- Paslanmaz Çelik → 25
- Bronz → 30
- Pirinç → 20
```

**İşlem Parametresi (Multiple Selection):**
```
Parametre Adı: process_cost
Tür: Form Alanı
Form Alanı: process
Lookup Tablosu:
- Kesme → 50
- Büküm → 75
- Kaynak → 100
- Delme → 25
- Frezeleme → 125
- Tornalama → 150
```

**Alan Parametresi:**
```
Parametre Adı: area
Tür: Form Alanı
Form Alanı: dimensions (Otomatik hesaplanan alan)
```

### Adım 3: Fiyat Formülü Oluşturma

#### Temel Formül Örneği:
```
= base_cost + (material_cost * area * quantity) + (process_cost * quantity) + (labor_cost_per_hour * CEILING(area * quantity / 100)) * profit_margin
```

#### Gelişmiş Formül Örneği:
```
= IF(
    quantity > 100,
    (base_cost + material_cost * area * quantity + process_cost * quantity) * 0.9 * profit_margin,
    (base_cost + material_cost * area * quantity + process_cost * quantity) * profit_margin
  )
```

#### Kullanılabilir Fonksiyonlar:
```
Matematik: SQRT, ROUND, MAX, MIN, ABS, POWER
Yuvarlama: CEILING, FLOOR, ROUNDUP, ROUNDDOWN
İstatistik: AVERAGE, SUM, COUNT
Mantık: IF, AND, OR, NOT
Sabitler: PI, E
```

### Adım 4: Formül Doğrulama
1. Formülü yazdıktan sonra otomatik doğrulama çalışır
2. ✅ Yeşil işaret: Formül geçerli
3. ❌ Kırmızı işaret: Syntax hatası var
4. **"Kaydet"** butonuna tıklayın

---

## 👥 Kullanıcı Yönetimi

### Yeni Kullanıcı Ekleme
1. Ayarlar → **"Kullanıcılar"** sekmesi
2. **"+ Kullanıcı Ekle"** butonuna tıklayın
3. Bilgileri doldurun:
   ```
   Email: yeni@burkol.com
   Şifre: güvenli123
   Rol: admin
   ```
4. **"Ekle"** butonuna tıklayın

### Kullanıcı Silme
1. Kullanıcı listesinde silinecek kullanıcıyı bulun
2. **"🗑️ Sil"** butonuna tıklayın
3. Onay dialogunda **"Evet"** seçin

---

## 📋 Teklif Yönetimi

### Teklif Görüntüleme
1. Ana dashboard'da tüm teklifler listelenir
2. Her teklif için şu bilgiler gösterilir:
   ```
   - Teklif ID (otomatik: BK202509XXXXX)
   - Müşteri adı
   - Proje adı
   - Tarih
   - Durum
   - Fiyat
   ```

### Teklif Detaylarını Görme
1. Listede teklif satırına tıklayın
2. Detay modalı açılır:
   - Müşteri bilgileri
   - Proje detayları
   - Seçilen malzeme ve işlemler
   - Eklenen dosyalar
   - Hesaplanan fiyat

### Teklif Durum Değiştirme
1. Listede durum sütunundaki dropdown'ı açın
2. Yeni durumu seçin:
   ```
   - 🆕 Yeni
   - ⏳ Beklemede
   - ✅ Onaylandı
   - ❌ Reddedildi
   - 🏁 Tamamlandı
   ```

### Teklif Silme
1. **Tek silme:** Satır sonundaki 🗑️ butonuna tıklayın
2. **Çoklu silme:** Checkbox ile seçin, "Seçilenleri Sil" butonunu kullanın

---

## 🔍 Filtreleme ve Arama

### Hızlı Arama
1. **Global Arama:** Üst kısımdaki arama kutusuna yazın
2. **Alan Bazlı Arama:** "Alan bazlı arama" kutusunu kullanın

### Gelişmiş Filtreleme
1. **"🔍 Filtreler"** butonuna tıklayın
2. Filtre kategorileri:

#### Durum Filtresi
```
☐ Yeni
☐ Beklemede 
☐ Onaylandı
☐ Reddedildi
☐ Tamamlandı
```

#### Malzeme Filtresi
```
☐ Çelik
☐ Alüminyum
☐ Paslanmaz Çelik
☐ Bronz
☐ Pirinç
```

#### Tarih Aralığı
```
Başlangıç: [YYYY-MM-DD]
Bitiş: [YYYY-MM-DD]
```

#### Miktar Aralığı
```
Minimum: [sayı]
Maksimum: [sayı]
```

### Filtreleri Temizleme
- **"Temizle"** butonu: Tüm filtreleri sıfırlar
- **Filtre Tag'i × işareti:** Tek filtreyi kaldırır

---

## 📊 İstatistikler ve Analitik

### İstatistik Görüntüleme
1. Dashboard üst kısmında istatistikler gösterilir
2. **Metrik değiştirme:**
   - "Adet" → Teklif sayısı bazında
   - "Toplam Değer (₺)" → Para bazında

### Grafik Görüntüleme
- Bar chart ile durum dağılımı
- Gerçek zamanlı güncelleme
- Filtrelere göre dinamik değişim

---

## 📤 Raporlama ve Export

### TXT Export
1. **Tümü için:** "Export TXT" butonuna tıklayın
2. **Seçililer için:** Checkbox ile seçin, "Seçilenleri Export Et"
3. Dosya otomatik indirilir: `burkol-quotes.txt`

### Export İçeriği
```
BURKOL QUOTE EXPORT
==================

Quote ID: BK202509XXXXX
Date: 2025-09-18
Customer: Müşteri Adı
Company: Firma Adı
Email: musteri@email.com
Phone: +90 xxx xxx xxxx
Project: Proje Adı
Status: Onaylandı
Price: ₺1,250.00
Material: Çelik
Process: Kesme, Kaynak
Quantity: 50
Dimensions: 100x50mm
Description: Proje açıklaması
```

---

## 📊 Sayfalama ve Görünüm

### Sayfa Ayarları
1. **Sayfa başına kayıt:** 5/10/25/50 seçeneği
2. **Sayfa geçişi:** "← Önceki" / "Sonraki →" butonları
3. **Durum bilgisi:** "Sayfa 1 / 5 (42 kayıt)"

### Tablo Sıralama
- Sütun başlıklarına tıklayarak sıralama
- Artan/azalan sıralama desteği

---

## 🔧 Sistem Bakımı

### Veri Yedekleme
1. Browser Developer Tools → Application → Local Storage
2. `bk_quotes_v1` key'ini export edin
3. JSON formatında yedekleyin

### Sistem Temizliği
1. **Cache temizleme:** Tarayıcı cache'ini temizleyin
2. **Session yenileme:** Logout → Login yapın
3. **Local storage:** Gerekirse sıfırlayın

### Log İnceleme
```bash
# Server logları
cd quote-portal/logs
cat out-0.log  # Normal loglar
cat err-0.log  # Hata logları
```

---

## 🚨 Sorun Giderme

### Yaygın Problemler

#### 1. "Fiyat hesaplanamıyor"
```
Çözüm:
1. Fiyat parametrelerinin tanımlı olduğunu kontrol edin
2. Formülde syntax hatası olup olmadığına bakın
3. Form alanlarının parametre adlarıyla eşleştiğini doğrulayın
```

#### 2. "Form alanları görünmüyor"
```
Çözüm:
1. Form Builder'da alanların kaydedildiğini kontrol edin
2. Sayfa yenileme (F5) yapın
3. Cache temizleyip tekrar deneyin
```

#### 3. "Login yapamıyorum"
```
Çözüm:
1. Email/şifre doğruluğunu kontrol edin
2. Network bağlantısını kontrol edin
3. Browser console'da hata mesajlarına bakın
```

#### 4. "Export çalışmıyor"
```
Çözüm:
1. Popup blocker'ı devre dışı bırakın
2. Dosya indirme izinlerini kontrol edin
3. Tarayıcı güvenlik ayarlarını gözden geçirin
```

### Debug Modunda Çalıştırma
```bash
# Development modunda çalıştırma
NODE_ENV=development node server.js

# Debug logları için
DEBUG=* node server.js
```

### Browser Console Hataları
```javascript
// Yaygın hatalar ve anlamları:
- 401 Unauthorized: Token süresi dolmuş
- 500 Internal Server Error: Sunucu hatası
- Network Error: Bağlantı problemi
```

---

## 📞 Destek ve İletişim

### Teknik Destek
- **Email:** support@burkol.com
- **GitHub Issues:** Repository'de issue açın
- **Dokümantasyon:** README.md dosyasını inceleyin

### Sistem Bilgileri
```
Uygulama: Burkol Quote Portal
Versiyon: 0.1.0
Node.js: v18+
Database: JSON-based file system
Frontend: React 18 (CDN)
Backend: Express.js
```

---

## 🎉 Başarılı Kurulum Kontrol Listesi

- [ ] Sistem başarıyla çalışıyor (port 3001)
- [ ] Admin paneline giriş yapabiliyorum
- [ ] Form Builder ile form oluşturdum
- [ ] Fiyat parametrelerini tanımladım
- [ ] Fiyat formülü çalışıyor
- [ ] Test teklifi oluşturdum
- [ ] Filtreleme çalışıyor
- [ ] Export fonksiyonu çalışıyor
- [ ] Kullanıcı yönetimi aktif

**🎯 Tüm adımlar tamamlandıktan sonra sistem kullanıma hazırdır!**

---

*Bu kılavuz Burkol Quote Portal v0.1.0 için hazırlanmıştır.*
*Son güncelleme: 18 Eylül 2025*