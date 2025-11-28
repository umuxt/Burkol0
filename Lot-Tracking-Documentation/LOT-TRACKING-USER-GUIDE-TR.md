# 📦 LOT TRACKING - KULLANICI KILAVUZU

**Versiyon:** Faz 1+2 (v1.0)  
**Tarih:** 20 Kasım 2025  
**Durum:** ✅ Kullanıma Hazır

---

## 📊 GENEL BAKIŞ

Lot/Parti takip sistemi, hammadde ve yarı mamullerin hangi partiden geldiğini, hangi partinin üretimde kullanıldığını ve son ürünün hangi hammadde partilerinden üretildiğini takip etmenizi sağlar.

**Temel Özellikler:**
- 📦 Sipariş tesliminde lot/parti bilgisi girişi
- 🔍 Malzeme bazında lot stok görüntüleme
- 🏭 Üretimde FIFO (ilk giren ilk çıkar) lot tüketimi
- 📋 Tam izlenebilirlik (lot → sipariş → iş emri → ürün)

---

## 🎯 LOT TAKİBİ NEDİR?

### Lot (Parti) Nedir?

**Lot/Parti:** Aynı zamanda, aynı tedarikçiden, aynı koşullarda alınan veya üretilen malzeme grubudur.

**Örnekler:**
- 500 kg çelik sac (1 Kasım 2025 tarihinde alındı) → LOT-M-00-001-20251101-001
- 200 kg çelik sac (15 Kasım 2025 tarihinde alındı) → LOT-M-00-001-20251115-001
- Aynı malzeme, farklı tarihler → farklı lotlar

**Neden Lot Takibi?**
- ✅ Kalite sorunları: Hangi parti hatalıysa sadece o partiye müdahale
- ✅ Geri çağırma: Hangi son ürünler hangi hatalı partiden üretildi?
- ✅ FIFO stok yönetimi: En eski parti önce tüketilir
- ✅ Son kullanma tarihi takibi: Hangi parti ne zaman bitiyor?
- ✅ ISO 9001 uyumluluk: Tam izlenebilirlik

---

## 🚀 ÖZELLİK 1: SİPARİŞ TESLİMİNDE LOT BİLGİSİ GİRİŞİ

### Ne Zaman Kullanılır?

Tedarikçiden malzeme aldığınızda, sipariş teslimatı sırasında lot bilgisi girersiniz.

---

### Adım Adım Kullanım

#### 1. Malzemeler Sayfasına Gidin

**Menü:** Malzemeler → Malzemeler

---

#### 2. Siparişi Seçin ve Teslim Et

- Teslimat bekleyen siparişleri bulun
- "Teslim Et" butonuna tıklayın
- Teslim edilecek miktarı girin

---

#### 3. Lot Bilgilerini Girin (Opsiyonel)

**Yeni Alanlar:**

**a) Tedarikçi Lot Kodu** (opsiyonel)
- Tedarikçinin fatura/irsaliyesindeki parti/lot kodu
- Örnek: `BATCH-2025-789`, `LOT-SUP-001`
- **Not:** Boş bırakılabilir

**b) Üretim Tarihi** (opsiyonel)
- Malzemenin tedarikçi tarafından üretildiği tarih
- **Kural:** Bugünden ileri bir tarih olamaz
- **Örnek:** 15.11.2025

**c) Son Kullanma Tarihi** (opsiyonel)
- Malzemenin kullanım süresi biten tarih
- **Kural:** Bugünden sonra bir tarih olmalı
- **Kural:** Üretim tarihinden sonra olmalı
- **Örnek:** 15.11.2026 (1 yıl)

---

#### 4. Teslimatı Kaydedin

- "Teslim Et" butonuna tıklayın
- Sistem otomatik olarak lot numarası oluşturur

**Başarı Mesajı:**
```
✅ Teslimat kaydedildi - Lot Numarası: LOT-M-00-001-20251120-001
```

---

### Lot Numarası Formatı

**Otomatik Oluşturulan Format:**
```
LOT-{MalzemeKodu}-{YYYYMMDD}-{Sıra}

Örnekler:
LOT-M-00-001-20251120-001  (İlk lot, 20 Kasım 2025)
LOT-M-00-001-20251120-002  (İkinci lot, aynı gün)
LOT-M-00-001-20251121-001  (Yeni gün, sıra sıfırlanır)
```

**Açıklama:**
- `LOT` - Sabit prefix
- `M-00-001` - Malzeme kodu
- `20251120` - Teslimat tarihi (YYYYMMDD)
- `001` - Gün içinde sıra numarası

---

### Ekran Görüntüsü

```
┌─────────────────────────────────────────────┐
│ Sipariş Teslimatı                           │
├─────────────────────────────────────────────┤
│ Malzeme: M-00-001 - Çelik Sac              │
│ Sipariş Miktarı: 500 kg                     │
│                                              │
│ Teslim Edilecek Miktar:                     │
│ [500] kg                                     │
│                                              │
│ ───────────────────────────────────────────│
│ 📦 Lot/Parti Bilgileri (Opsiyonel)         │
│ ───────────────────────────────────────────│
│                                              │
│ Tedarikçi Lot Kodu:                         │
│ [BATCH-2025-789_____________]               │
│                                              │
│ Üretim Tarihi:                              │
│ [15.11.2025__] 📅                           │
│                                              │
│ Son Kullanma Tarihi:                        │
│ [15.11.2026__] 📅                           │
│                                              │
│ ℹ️ Lot numarası otomatik oluşturulacaktır  │
│                                              │
│ [İptal]              [Teslim Et]            │
└─────────────────────────────────────────────┘
```

---

### Önemli Notlar

**✅ İyi Pratikler:**
- Tedarikçi lot kodunu mutlaka girin (izlenebilirlik için)
- Son kullanma tarihi varsa mutlaka girin (gıda, ilaç, kimyasal malzemeler)
- Üretim tarihini girin (kalite kontrolü için)

**⚠️ Dikkat Edilecekler:**
- Lot bilgileri opsiyoneldir, zorunlu değildir
- Lot numarası sistim tarafından otomatik oluşturulur (manuel değiştirilemez)
- Aynı malzemeden aynı gün birden fazla teslimat yaparsanız sıra numarası artar

**❌ Yaygın Hatalar:**
- ❌ Üretim tarihi ileri bir tarih (hata: "Üretim tarihi bugünden ileri olamaz")
- ❌ Son kullanma tarihi üretim tarihinden önce (hata: "Son kullanma tarihi üretim tarihinden sonra olmalı")

---

## 🔍 ÖZELLİK 2: LOT BAZINDA STOK GÖRÜNTÜLEME

### Ne Zaman Kullanılır?

Bir malzemenin hangi lotlardan ne kadar stok olduğunu görmek istediğinizde.

---

### Adım Adım Kullanım

#### 1. Malzeme Detay Modalını Açın

**Malzemeler sayfasında:**
- Malzeme listesinde malzeme satırına tıklayın
- VEYA malzeme kodunu arayıp detaylarını açın

---

#### 2. "Lot Envanteri" Sekmesini Bulun

**Malzeme Detay Modal'da sekmeler:**
- Genel Bilgiler
- Tedarikçiler
- **📦 Lot Envanteri** ← Bu sekmeyi tıklayın
- Üretim Geçmişi
- Tedarik Geçmişi

---

#### 3. Lot Bilgilerini Yükleyin

**İlk açılışta:**
- "🔄 Lot Bilgilerini Yükle" butonuna tıklayın
- Sistem lot envanterini getirir
- Tablo gösterilir

**Neden "Yükle" butonu?**
- Performans: Lot bilgileri sadece gerektiğinde yüklenir (lazy loading)
- Aynı mantık üretim geçmişi ve tedarik geçmişi sekmelerinde de kullanılıyor

---

#### 4. Lot Tablosunu İnceleyin

**Tablo Kolonları:**

| Kolon | Açıklama | Örnek |
|-------|----------|-------|
| **Lot Numarası** | Otomatik oluşturulan lot kodu | LOT-M-00-001-001 |
| **Lot Tarihi** | Teslimat/Üretim tarihi | 01.11.2025 |
| **Tedarikçi Lot Kodu** | Tedarikçinin lot kodu | BATCH-001 |
| **Üretim Tarihi** | Malzemenin üretim tarihi | 25.10.2025 |
| **Son Kullanma** | Son kullanma tarihi | 25.10.2026 |
| **Bakiye** | Lot'tan kalan miktar | 150.5 kg |
| **Durum** | Lot durumu (renkli badge) | Aktif / Yakında Bitecek / Bitmiş |
| **FIFO Sıra** | Tüketim sırası | #1, #2, #3 |

---

#### 5. Lot Durumlarını Anlayın

**🟢 Aktif (Yeşil)**
- Normal lot, kullanılabilir
- Son kullanma tarihi >30 gün sonra VEYA yok

**🟡 Yakında Bitecek (Sarı)**
- Son kullanma tarihi <30 gün içinde
- Öncelikli tüketilmeli

**🔴 Süresi Bitmiş (Kırmızı)**
- Son kullanma tarihi geçmiş
- Kullanılmamalı (karantinaya alınmalı)

---

#### 6. FIFO Sıralamasını Anlayın

**FIFO (First In, First Out) = İlk Giren İlk Çıkar**

Üretimde hangi lot önce tüketilecek?
- **#1** → En eski lot, önce tüketilecek
- **#2** → İkinci sırada tüketilecek
- **#3** → Üçüncü sırada tüketilecek

**Sıralama Kuralı:**
- Lot Tarihi (eskiden yeniye)
- Eğer aynı gün → Oluşturma zamanı (önce gelene öncelik)

---

### Ekran Görüntüsü

```
┌──────────────────────────────────────────────────────────────────────┐
│ Malzeme Detayları: M-00-001 - Çelik Sac                             │
├──────────────────────────────────────────────────────────────────────┤
│ [Genel] [Tedarikçiler] [📦 Lot Envanteri] [Üretim] [Tedarik]       │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ 📦 Lot Envanteri                                                     │
│                                                                       │
│ Toplam Lot: 3  |  Toplam Bakiye: 450.5 kg                           │
│                                                                       │
│ ┌────────────────────────────────────────────────────────────────┐  │
│ │ Lot No.        │Tarih    │Ted.Lot │Üretim  │SKT     │Bakiye  │  │
│ ├────────────────────────────────────────────────────────────────┤  │
│ │ LOT-M-001-001  │01.11.25 │BATCH-01│25.10.25│25.10.26│150.5 kg│  │
│ │ Durum: 🟢 Aktif                              FIFO: #1          │  │
│ ├────────────────────────────────────────────────────────────────┤  │
│ │ LOT-M-001-002  │15.11.25 │BATCH-02│10.11.25│15.12.25│200.0 kg│  │
│ │ Durum: 🟡 Yakında Bitecek                   FIFO: #2          │  │
│ ├────────────────────────────────────────────────────────────────┤  │
│ │ LOT-M-001-003  │20.11.25 │-       │-       │-       │100.0 kg│  │
│ │ Durum: 🟢 Aktif                              FIFO: #3          │  │
│ └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│                                              [Kapat]                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

### Kullanım Senaryoları

**Senaryo 1: Hangi lot önce tüketilecek?**
- Lot Envanteri sekmesini açın
- FIFO Sıra kolonuna bakın
- #1 olan lot önce tüketilecek

**Senaryo 2: Yakında bitecek lotlar var mı?**
- Lot Envanteri sekmesini açın
- 🟡 Sarı badge'li lotları bulun
- Son Kullanma kolonunu kontrol edin

**Senaryo 3: Toplam stokta kaç lot var?**
- "Toplam Lot: X" bilgisine bakın
- Her lotun bakiyesini görebilirsiniz

---

## 🏭 ÖZELLİK 3: ÜRETİMDE LOT TÜKETİMİ ÖNİZLEMESİ

### Ne Zaman Kullanılır?

İşçi portalında bir görevi başlatmadan önce, hangi lotların tüketileceğini görmek istediğinizde.

---

### Adım Adım Kullanım

#### 1. İşçi Portalına Gidin

**Menü:** İşçi Portalı

---

#### 2. Görevinizi Seçin

- Bekleyen görevler listesinden görevinizi bulun
- Görev detaylarını görüntüleyin

---

#### 3. Lot Tüketimi Önizlemesini İnceleyin

**Görev başlatmadan önce göreceğiniz bilgiler:**

```
┌─────────────────────────────────────────────┐
│ 🔵 Lot Tüketimi Önizlemesi                 │
├─────────────────────────────────────────────┤
│ Çelik Sac (M-00-001) - 100 kg gerekli      │
│                                              │
│ Tüketilecek Lotlar (FIFO):                 │
│ 📦 LOT-M-00-001-001 (01.11.2025) → 50 kg   │
│    SKT: 01.11.2026                          │
│                                              │
│ 📦 LOT-M-00-001-002 (15.11.2025) → 50 kg   │
│    SKT: -                                    │
├─────────────────────────────────────────────┤
│ Alüminyum Profil (M-00-002) - 80 kg gerekli│
│                                              │
│ Tüketilecek Lotlar (FIFO):                 │
│ 📦 LOT-M-00-002-001 (18.11.2025) → 80 kg   │
└─────────────────────────────────────────────┘

[Görevi Başlat]
```

---

#### 4. FIFO Tüketim Mantığını Anlayın

**FIFO (First In, First Out) = İlk Giren İlk Çıkar**

Sistem otomatik olarak EN ESKİ lot'tan tüketir:
1. Lot Tarihi en eski olan lot seçilir
2. O lottan gerektiği kadar tüketilir
3. Eğer yetmezse, bir sonraki en eski lot seçilir

**Örnek:**
```
Gereksinim: 100 kg Çelik Sac

Mevcut Lotlar:
- LOT-001: 150 kg (01.11.2025) ← EN ESKİ
- LOT-002: 200 kg (15.11.2025)
- LOT-003: 100 kg (20.11.2025)

Tüketim:
✅ LOT-001'den 100 kg tüketilir (en eski lot)
❌ LOT-002 ve LOT-003 dokunulmaz

Kalan Stok:
- LOT-001: 50 kg
- LOT-002: 200 kg (değişmedi)
- LOT-003: 100 kg (değişmedi)
```

---

#### 5. Yetersiz Stok Uyarısını Anlayın

**Eğer stok yetersizse:**

```
┌─────────────────────────────────────────────┐
│ ⚠️ Yetersiz Stok Uyarısı                   │
├─────────────────────────────────────────────┤
│ Alüminyum Profil (M-00-002)                 │
│ Gerekli: 100 kg                             │
│ Mevcut: 80 kg                               │
│ Eksik: 20 kg                                │
│                                              │
│ Tüketilecek Lotlar:                         │
│ 📦 LOT-M-00-002-001 (18.11.2025) → 80 kg   │
│                                              │
│ ⚠️ Görev başlatılabilir ancak kısmi        │
│    rezervasyon yapılacaktır.                │
└─────────────────────────────────────────────┘
```

**Ne Yapmalı?**
- Eksik malzemeyi sipariş edin
- VEYA görevi kısmi stokla başlatın (uyarı ile)

---

#### 6. Görevi Başlatın

- "Görevi Başlat" butonuna tıklayın
- Sistem lotlardan otomatik olarak tüketim yapar (FIFO)
- Görev "İşlemde" durumuna geçer

---

### Ekran Görüntüsü

```
┌──────────────────────────────────────────────────────────────┐
│ İşçi Portalı - Ali Yılmaz                                    │
├──────────────────────────────────────────────────────────────┤
│ Aktif Görev: Kesme (WO-001-001)                             │
│ Durum: Hazır                                                 │
│                                                               │
│ ───────────────────────────────────────────────────────────│
│ 🔵 Lot Tüketimi Önizlemesi                                  │
│ ───────────────────────────────────────────────────────────│
│                                                               │
│ Malzeme: Çelik Sac (M-00-001)                               │
│ Gerekli Miktar: 100 kg                                       │
│                                                               │
│ Tüketilecek Lotlar (FIFO sıralamasıyla):                    │
│                                                               │
│ #1 📦 LOT-M-00-001-20251101-001                             │
│    Tarih: 01.11.2025                                         │
│    Tüketilecek: 50 kg                                        │
│    SKT: 01.11.2026 (🟢 Aktif)                               │
│                                                               │
│ #2 📦 LOT-M-00-001-20251115-001                             │
│    Tarih: 15.11.2025                                         │
│    Tüketilecek: 50 kg                                        │
│    SKT: - (🟢 Aktif)                                         │
│                                                               │
│ Toplam Tüketim: 100 kg ✅                                   │
│                                                               │
│ ───────────────────────────────────────────────────────────│
│                                                               │
│                              [Görevi Başlat]                 │
└──────────────────────────────────────────────────────────────┘
```

---

### Kullanım Senaryoları

**Senaryo 1: Normal tüketim (yeterli stok)**
- Önizlemeyi kontrol edin
- Hangi lotlardan tüketileceğini görün
- "Görevi Başlat" tıklayın
- Sistem FIFO mantığıyla lotlardan tüketir

**Senaryo 2: Çoklu lot tüketimi**
- Tek lot yetmediğinde sistem birden fazla lottan tüketir
- Önizlemede tüm lotlar listelenir
- En eski lot önce tüketilir (#1, #2, #3...)

**Senaryo 3: Yetersiz stok uyarısı**
- Önizlemede ⚠️ uyarı görürsünüz
- Eksik miktarı görürsünüz
- Görevi yine de başlatabilirsiniz (kısmi rezervasyon)
- Eksik malzeme sipariş edilmelidir

---

## 📊 İZLENEBİLİRLİK (TRACEABILITY)

### Tam İzlenebilirlik Nedir?

**İzlenebilirlik:** Bir son ürünün hangi hammadde lotlarından üretildiğini VEYA bir hammadde lotunun hangi son ürünlerde kullanıldığını takip etmek.

---

### İzlenebilirlik Zinciri

```
1. TEDARİKÇİDEN ALIŞ
   ↓
   Sipariş Teslimatı → LOT-M-00-001-20251101-001 oluşturuldu
   (500 kg Çelik Sac, Tedarikçi Lot: BATCH-789)

2. STOKTA BEKLETME
   ↓
   Lot Envanterinde görüntüleme (FIFO sıra: #1)

3. ÜRETİMDE KULLANIM
   ↓
   İş Emri WO-001 başlatıldı
   Görev WO-001-001 (Kesme) → LOT-M-00-001-001'den 50 kg tüketildi
   Görev WO-001-002 (Büküm) → LOT-M-00-001-001'den 30 kg tüketildi

4. SON ÜRÜN
   ↓
   Ürün: PROD-001
   Kullanılan Lotlar:
   - LOT-M-00-001-001 (80 kg)
   - LOT-M-00-002-003 (20 kg)
```

---

### Geri İzlenebilirlik (Backwards Traceability)

**Soru:** Bu son ürün hangi hammadde lotlarından üretildi?

**Cevap:**
```
Ürün: PROD-001
├─ LOT-M-00-001-001 (Çelik Sac, 80 kg)
│  └─ Tedarikçi Lot: BATCH-789
│  └─ Üretim Tarihi: 25.10.2025
│  └─ Son Kullanma: 25.10.2026
│
└─ LOT-M-00-002-003 (Alüminyum, 20 kg)
   └─ Tedarikçi Lot: BATCH-456
   └─ Üretim Tarihi: 01.11.2025
   └─ Son Kullanma: -
```

---

### İleri İzlenebilirlik (Forwards Traceability)

**Soru:** Bu hammadde lotu hangi son ürünlerde kullanıldı?

**Cevap:**
```
LOT-M-00-001-001 (500 kg Çelik Sac)
├─ PROD-001 (80 kg kullanıldı)
├─ PROD-002 (100 kg kullanıldı)
├─ PROD-003 (150 kg kullanıldı)
└─ Kalan: 170 kg (stokta)
```

---

### Kalite Sorunu Senaryosu

**Problem:** Tedarikçiden gelen çelik sacta kalite sorunu tespit edildi!

**Çözüm:**
1. Hangi lot? → LOT-M-00-001-001 (Tedarikçi: BATCH-789)
2. Bu lottan ne kadar kullanıldı? → 80 kg (420 kg kaldı)
3. Hangi ürünlerde kullanıldı? → PROD-001, PROD-002, PROD-003
4. **Aksiyon:**
   - Stokta kalan 420 kg karantinaya al
   - PROD-001, PROD-002, PROD-003 ürünlerini geri çağır
   - Tedarikçiye bildir (BATCH-789 hatalı)

**Lot takibi olmasaydı:**
- ❌ Hangi lot hatalı belli değil → TÜM stok karantinaya
- ❌ Hangi ürünler etkilendi belli değil → TÜM ürünler geri çağırılır
- ❌ Tedarikçiye hangi parti bildirilecek belli değil

---

## ❓ SIKÇA SORULAN SORULAR (SSS)

### S1: Lot bilgisi girmek zorunlu mu?

**Cevap:** Hayır, opsiyoneldir. Ancak önerilir.
- Lot bilgisi girmezseniz sistem yine lot numarası oluşturur
- Ancak tedarikçi lot kodu, üretim tarihi, SKT bilgileri boş kalır
- İzlenebilirlik kısmen eksik olur

---

### S2: Lot numarası manuel girilebilir mi?

**Cevap:** Hayır, sistem otomatik oluşturur.
- Format: LOT-{MalzemeKodu}-{YYYYMMDD}-{Sıra}
- Manuel değiştirilemez (veri bütünlüğü için)

---

### S3: FIFO mantığı devre dışı bırakılabilir mi?

**Cevap:** Hayır, FIFO zorunludur.
- En eski lot her zaman önce tüketilir
- Manuel lot seçimi yapılamaz
- Bu ISO 9001 ve FEFO (First Expire First Out) prensiplerine uygundur

---

### S4: Süresi bitmiş lot kullanılabilir mi?

**Cevap:** Sistem engellemez ama uyarır.
- 🔴 "Süresi Bitmiş" badge gösterilir
- Lot Envanteri'nde kırmızı işaretlenir
- Üretimde kullanılmak istenirse uyarı verilir
- **Öneri:** Karantinaya alın, kullanmayın

---

### S5: Lot geçmişi nasıl görüntülenir?

**Cevap:** Malzeme Detay → Lot Envanteri sekmesi
- Tüm aktif lotları gösterir
- FIFO sırasını gösterir
- Son kullanma tarihlerini gösterir

---

### S6: Bir lot'un tüm hareketlerini nasıl görebilirim?

**Cevap:** Şu anda lot-bazlı hareket raporu yok.
- Gelecek versiyonda eklenecek (Faz 3)
- Şu an için: Stok Hareketleri raporunu filtreleyerek bulabilirsiniz

---

### S7: Üretimde birden fazla lottan tüketim yapılıyorsa ne olur?

**Cevap:** Sistem otomatik olarak yönetir.
- Önizlemede tüm tüketilecek lotlar gösterilir
- FIFO sırasıyla tüketilir
- Örnek: 100 kg gerekli, Lot 1'de 50 kg, Lot 2'de 50 kg → her ikisinden de tüketilir

---

### S8: Lot takibi performansı etkiler mi?

**Cevap:** Minimal etki, optimize edilmiştir.
- Kritik index'ler oluşturuldu (idx_fifo_lots)
- Lot sorguları <100ms
- Lazy loading kullanıldı (sadece gerektiğinde yüklenir)

---

## 🎓 EĞİTİM & DESTEK

### Eğitim Materyalleri

**Dokümantasyon:**
- ✅ Bu kullanıcı kılavuzu (LOT-TRACKING-USER-GUIDE-TR.md)
- ✅ API değişiklikleri (LOT-TRACKING-API-CHANGES.md)
- ✅ Teknik uygulama kılavuzu (LOT-TRACKING-IMPLEMENTATION-COMPLETED.md)
- ✅ Test raporu (LOT-TRACKING-STEP-14-TEST-REPORT.md)

**Video Eğitimler:** (Planlanıyor)
- Lot bilgisi girişi (Sipariş teslimatı)
- Lot envanteri görüntüleme
- Üretimde lot tüketimi

---

### Destek

**Teknik Sorunlar:**
- GitHub Issues: [BeePlan/mes-system/issues]
- E-posta: support@BeePlan.com

**Kullanım Soruları:**
- Kullanıcı forumu: [forum.BeePlan.com]
- Canlı destek: [chat.BeePlan.com]

---

## 🔄 SÜRÜM GEÇMİŞİ

### Versiyon 1.0 (Faz 1+2) - 20 Kasım 2025

**Yeni Özellikler:**
- ✅ Sipariş teslimatında lot bilgisi girişi
- ✅ Malzeme detayında lot envanteri sekmesi
- ✅ İşçi portalında lot tüketimi önizlemesi
- ✅ FIFO otomatik lot tüketimi
- ✅ Lot bazında izlenebilirlik
- ✅ Son kullanma tarihi takibi

**Bilinen Kısıtlamalar:**
- Lot-bazlı hareket raporu yok (Faz 3'te eklenecek)
- Lot durumu (aktif/bitmiş/karantina) manuel güncellenmiyor (Faz 3)
- Lot genealojisi (çok seviyeli BOM) yok (Faz 3)

---

### Gelecek Versiyonlar (Faz 3)

**Planlanan Özellikler:**
- 📊 Lot hareket raporu (bir lot'un tüm giriş/çıkış hareketleri)
- 🏷️ Lot etiket yazdırma (barkod/QR kod)
- 🔔 Son kullanma tarihi otomatik uyarıları
- 📈 Lot yaşlanma raporu (en eski lotlar)
- 🔗 Çok seviyeli lot genealojisi (ham madde → yarı mamul → son ürün)
- 🚫 Karantina lot yönetimi
- 📋 Tedarikçi lot kalite skorları

---

## ✅ ÖZET

**Lot Takibi ile:**
- ✅ Hangi parti hatalıysa sadece o partiye müdahale edersiniz
- ✅ Geri çağırma durumunda hangi ürünlerin etkilendiğini bilirsiniz
- ✅ FIFO stok yönetimi otomatik çalışır (en eski lot önce tüketilir)
- ✅ Son kullanma tarihi takibi yaparsınız (🟡 sarı uyarı, 🔴 kırmızı expired)
- ✅ ISO 9001 tam izlenebilirlik sağlarsınız
- ✅ Tedarikçi kalitesini lot bazında değerlendirebilirsiniz

**Kullanım Akışı:**
1. 📦 Sipariş teslim → Lot bilgisi gir (tedarikçi lot, SKT)
2. 🔍 Malzeme detay → Lot Envanteri → Lotları görüntüle (FIFO sıra)
3. 🏭 İşçi portalı → Lot önizleme → Görevi başlat (otomatik FIFO tüketim)
4. 📊 İzlenebilirlik → Lot → Sipariş → İş Emri → Ürün

**Başarınız için:**
- ✅ Tedarikçi lot kodunu her zaman girin
- ✅ Son kullanma tarihini girin (gıda, ilaç, kimyasal)
- ✅ Lot Envanteri'ni düzenli kontrol edin (🟡 sarı lotları önce kullanın)
- ✅ FIFO sırasına güvenin (sistem en iyisini bilir)

---

**🎉 İyi Kullanımlar!**

**Versiyon:** 1.0 (Faz 1+2)  
**Son Güncelleme:** 20 Kasım 2025  
**Destek:** support@BeePlan.com
