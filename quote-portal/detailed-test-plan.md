# BURKOL PROJESİ - SİSTEMATİK TEST PLANI

## TEST ORGANIZASYONU
- **USER Testleri:** 16 madde
- **ADMIN Testleri:** 48 madde  
- **Toplam:** 64 test maddesi
- **Her madde minimum 2 kez test edilecek**
- **Test mantığı:** Test → Kontrol → Hata varsa düzelt → Test tekrarı → Hata yoksa sonraki test

---

## USER TEST GRUBU (16 Madde)

### USER TEST 1: Form İşlevselliği (10 madde)
1. Dinamik form alanlarını görüntüleme
2. Zorunlu/opsiyonel alanları doldurma  
3. Özel alan türlerini (text, email, number, select, checkbox vb.) kullanma
4. Form validasyonu (email format, sayı kontrolü, min/max değerler)
5. Ürün dosyaları/görselleri yükleme
6. Dosya formatı kontrolü (png, jpg, pdf vb.)
7. Dosya boyutu kontrolü (max MB)
8. Çoklu dosya seçimi
9. Form verilerini doğrulama
10. Teklif gönderme işlemi

### USER TEST 2: Sistem Özellikleri (6 madde)
1. Başarı/hata bildirimi alma
2. Türkçe/İngilizce dil seçimi
3. Arayüz metinlerinin çevirisi
4. Progressive Web App olarak çalışma
5. Service Worker ile offline destek
6. Mobil cihazlarda uygulama gibi davranma

---

## ADMIN TEST GRUBU (48 Madde)

### ADMIN TEST 1: Kimlik Doğrulama (4 madde)
1. Email/şifre ile giriş yapma
2. "Beni hatırla" seçeneği
3. Token tabanlı oturum yönetimi
4. Güvenli çıkış yapma

### ADMIN TEST 2: Teklif Görüntüleme (6 madde)
1. Tüm teklifleri tablo halinde görme
2. Sayfalama ve sıralama
3. Toplam kayıt sayısını görme
4. Teklife ait tüm bilgileri görme
5. Dosyaları/görselleri inceleme
6. Müşteri bilgilerini görme

### ADMIN TEST 3: Durum Yönetimi (6 madde)
1. Teklif durumunu değiştirme (yeni, işlemde, tamamlandı, iptal)
2. Toplu durum güncelleme
3. Durum geçmişini takip etme
4. Tekil teklif silme
5. Onay mekanizması ile güvenli silme
6. Duruma göre filtreleme

### ADMIN TEST 4: Filtreleme ve Arama (8 madde)
1. Malzeme türüne göre filtreleme
2. İşlem türüne göre filtreleme
3. Tarih aralığına göre filtreleme
4. Miktar aralığına göre filtreleme
5. Ülkeye göre filtreleme
6. Global metin arama
7. Alan bazlı arama
8. Çoklu filtre kombinasyonu

### ADMIN TEST 5: İstatistikler (8 madde)
1. Teklif sayısı istatistikleri
2. Toplam değer hesaplamaları
3. Durum bazlı dağılım grafikleri
4. Filtrelenmiş sonuçlar için ayrı istatistikler
5. Bar chart grafikleri
6. Metrik seçimi (adet/değer)
7. Gerçek zamanlı veri güncelleme
8. Teklif listesini Excel/CSV formatında indirme

### ADMIN TEST 6: Fiyat Yönetimi (8 madde)
1. Otomatik fiyat hesaplama
2. Malzeme/işlem bazlı fiyatlandırma
3. Fiyat değişikliği önerileri
4. Manuel fiyat güncelleme
5. Fiyat parametrelerini yapılandırma
6. Malzeme birim fiyatları
7. İşlem katsayıları
8. Kar marjı ayarları

### ADMIN TEST 7: Form Builder ve Sistem Ayarları (8 madde)
1. Form alanları ekleme/düzenleme
2. Alan türlerini belirleme
3. Zorunlu/opsiyonel alan ayarları
4. Validasyon kuralları tanımlama
5. Oluşturulan formun önizlemesi
6. Kullanıcı perspektifinden görünüm
7. Değişiklikleri test etme
8. Sistem parametrelerini yapılandırma

## TEST EXECUTION PLAN

### Faz 1: USER TESTLERİ
**Test sırası:** USER TEST 1 → USER TEST 2 → USER TEST 1 (tekrar)

### Faz 2: ADMIN TESTLERİ  
**Test sırası:** ADMIN TEST 1 → ADMIN TEST 2 → ADMIN TEST 3 → ADMIN TEST 4 → ADMIN TEST 5 → ADMIN TEST 6 → ADMIN TEST 7 → Tüm testleri tekrar

### HATA PROTOKOLÜ
1. **Hata bulunduğunda:**
   - Testi durdur
   - Hatayı kaydet ve tanımla
   - Sorunu çöz
   - Testi baştan yap
   - PASS olursa sonraki teste geç

2. **Test kayıt formatı:**
   - Test ID ve madde adı
   - Beklenen sonuç
   - Gerçek sonuç  
   - PASS/FAIL durumu
   - Hata detayları (varsa)
   - Çözüm açıklaması (varsa)

### TEST COVERAGE MATRIX
Her maddenin en az 2 kez test edilmesi garantisi:

**USER Maddeleri (16):**
- İlk tur: 16 madde test edilir
- İkinci tur: 16 madde tekrar test edilir
- **Toplam coverage: 32 test execution**

**ADMIN Maddeleri (48):**
- İlk tur: 48 madde test edilir  
- İkinci tur: 48 madde tekrar test edilir
- **Toplam coverage: 96 test execution**

**GENEL TOPLAM: 128 test execution**