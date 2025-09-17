# BURKOL TEST PLAN - Detaylı Test Senaryoları

## TEST ORTAMI
- **Platform:** Local Development
- **Browser:** Chrome/Safari 
- **URL User:** http://localhost:3001/index.html
- **URL Admin:** http://localhost:3001/panel-gizli.html

## USER TESTLERİ (5 ANA AKSİYON)

### TEST 1: FORM DOLDURMA (25 Element)
**Ana Hedef:** Dinamik form alanlarının doğru çalışması

**Test Elementleri:**
1. Sayfa yükleme kontrolü
2. Form başlığı görünürlüğü  
3. Zorunlu alan işaretleri (*)
4. İsim alanı doldurma
5. Email alanı doldurma
6. Telefon alanı doldurma
7. Şirket alanı doldurma
8. Proje adı alanı doldurma
9. Malzeme dropdown seçimi
10. İşlem türü dropdown seçimi
11. Miktar sayı alanı
12. Notlar textarea alanı
13. Ülke seçimi dropdown
14. Custom field ekleme
15. Custom field değer girişi
16. Dropdown custom field
17. Checkbox custom field
18. Radio button custom field
19. Email validasyon kontrolü
20. Sayı validasyon kontrolü
21. Zorunlu alan validasyonu
22. Form temizleme
23. Placeholder metinleri
24. Alan focus durumları
25. Form scroll davranışı

**Her element 3 kez test edilecek**

### TEST 2: DOSYA YÜKLEME (25 Element)
**Ana Hedef:** Dosya upload sisteminin güvenilirliği

**Test Elementleri:**
1. Dosya seçme butonu görünürlüğü
2. Dosya seçme popup açılması
3. PNG dosya seçimi
4. JPG dosya seçimi
5. PDF dosya seçimi
6. Çoklu dosya seçimi
7. Dosya boyutu kontrolü
8. Maksimum dosya sayısı kontrolü
9. Desteklenmeyen format reddi
10. Dosya preview görüntüleme
11. Dosya listesi gösterimi
12. Dosya silme butonu
13. Dosya adı gösterimi
14. Dosya boyutu gösterimi
15. Dosya türü ikonu
16. Drag & drop desteği
17. Progress bar gösterimi
18. Upload hata mesajları
19. Upload başarı mesajları
20. Dosya thumbnail gösterimi
21. Dosya sıralama
22. Dosya filtreleme
23. Büyük dosya uyarısı
24. Dosya format uyarısı
25. Upload iptal etme

### TEST 3: TEKLİF GÖNDERİMİ (25 Element)
**Ana Hedef:** Form submission sürecinin eksiksizliği

**Test Elementleri:**
1. Gönder butonu görünürlüğü
2. Form validasyon kontrolü
3. Eksik alan uyarıları
4. Loading spinner gösterimi
5. Form disable durumu
6. API çağrısı yapılması
7. Başarı mesajı gösterimi
8. Hata mesajı gösterimi
9. Form reset işlemi
10. Dosyaların dahil edilmesi
11. JSON data format kontrolü
12. Timestamp eklenmesi
13. Unique ID oluşturulması
14. Status initial değeri
15. Custom fields dahil edilmesi
16. Email format kontrolü
17. Telefon format kontrolü
18. Sayı alanları kontrolü
19. Zorunlu alan kontrolü
20. Character limit kontrolü
21. XSS koruması
22. Timeout handling
23. Retry mekanizması
24. Offline fallback
25. Success redirect

### TEST 4: DİL DEĞİŞTİRME (25 Element)
**Ana Hedef:** Çoklu dil desteğinin eksiksizliği

**Test Elementleri:**
1. Dil seçici görünürlüğü
2. Türkçe seçimi
3. İngilizce seçimi
4. Form etiketleri çevirisi
5. Buton metinleri çevirisi
6. Hata mesajları çevirisi
7. Başarı mesajları çevirisi
8. Placeholder metinleri çevirisi
9. Validation mesajları çevirisi
10. Dropdown optionları çevirisi
11. Sayfa başlığı çevirisi
12. Navigation çevirisi
13. Loading mesajları çevirisi
14. Status değerleri çevirisi
15. Malzeme isimleri çevirisi
16. İşlem türleri çevirisi
17. Ülke isimleri çevirisi
18. Dosya mesajları çevirisi
19. Format uyarıları çevirisi
20. Boyut uyarıları çevirisi
21. localStorage dil kaydı
22. Sayfa yenileme sonrası dil
23. URL parameter desteği
24. Varsayılan dil ayarı
25. Dil değişim animasyonu

### TEST 5: PWA ÖZELLİKLERİ (25 Element)
**Ana Hedef:** Progressive Web App işlevselliği

**Test Elementleri:**
1. Service Worker kayıt
2. Manifest.json yükleme
3. App icon gösterimi
4. Install prompt
5. Standalone mode
6. Offline çalışma
7. Cache stratejisi
8. Background sync
9. Push notification desteği
10. App shell loading
11. Critical CSS inline
12. Lazy loading
13. Resource preloading
14. Image optimization
15. Bundle splitting
16. Performance metrics
17. LCP optimization
18. FID optimization
19. CLS optimization
20. Mobile responsive
21. Touch gestures
22. Viewport meta
23. Theme color
24. Status bar style
25. App shortcuts

## ADMIN TESTLERİ (13 ANA AKSİYON)

### TEST 6: GİRİŞ/ÇIKIŞ (25 Element)
**Ana Hedef:** Kimlik doğrulama güvenliği

### TEST 7: TEKLİF LİSTESİ (25 Element)
**Ana Hedef:** Veri görüntüleme ve yönetim

### TEST 8: TEKLİF DETAYLARI (25 Element)  
**Ana Hedef:** Detay görüntüleme işlevselliği

### TEST 9: DURUM YÖNETİMİ (25 Element)
**Ana Hedef:** Status güncelleme sistemleri

### TEST 10: TEKLİF SİLME (25 Element)
**Ana Hedef:** Güvenli silme işlemleri

### TEST 11: FILTRELEME (25 Element)
**Ana Hedef:** Gelişmiş filtreleme sistemi

### TEST 12: ARAMA (25 Element)
**Ana Hedef:** Arama ve sorgu işlevleri

### TEST 13: İSTATİSTİKLER (25 Element)
**Ana Hedef:** Veri analizi ve görselleştirme

### TEST 14: FİYAT YÖNETİMİ (25 Element)
**Ana Hedef:** Otomatik fiyatlandırma sistemi

### TEST 15: FORM BUILDER (25 Element)
**Ana Hedef:** Dinamik form oluşturma

### TEST 16: SİSTEM AYARLARI (25 Element)
**Ana Hedef:** Konfigürasyon yönetimi

### TEST 17: DOSYA YÖNETİMİ (25 Element)
**Ana Hedef:** Admin dosya işlemleri

### TEST 18: KULLANICI YÖNETİMİ (25 Element)
**Ana Hedef:** Multi-user admin sistemi

## HATA TAKIP PROTOKOLÜ
1. **Hata Bulunduğunda:**
   - Test durdurulur
   - Hata detayları not edilir
   - Sorun giderilir
   - Test baştan yapılır

2. **Test Kayıt Formatı:**
   - Test ID
   - Element adı
   - Beklenen sonuç
   - Gerçek sonuç
   - Pass/Fail durumu
   - Hata detayları (varsa)

3. **Final Testler:**
   - Tüm bulunan sorunları kapsayan test
   - Edge case senaryoları
   - Performance stress test