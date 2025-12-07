# PROMPT-QT: Quote Tablosu ve Form Entegrasyonu Refactoring

> **Tarih:** 6 Aralık 2025  
> **Durum:** Planlandı  
> **Öncelik:** Yüksek  
> **Bağımlılıklar:** PROMPT-F3 (Form Field Display Options) - Tamamlanmalı

---

## 📋 Özet

Quote tablosunun dinamik form alanlarıyla entegrasyonu, proje adı alanının eklenmesi ve tablo görünümünün modernizasyonu.

### Ana Hedefler
1. **Proje Adı (projectName)** - Quotes tablosuna yeni kolon eklenmesi
2. **Dinamik Tablo Kolonları** - Form alanlarından `showInTable: true` olanların tabloda gösterilmesi
3. **Dinamik Filtre Sistemi** - Form alanlarından `showInFilter: true` olanların filtrelerde kullanılması
4. **Freeze Kolonlar** - Sabit kolonların scroll sırasında yerinde kalması
5. **Event-Based Güncelleme** - Form display değişikliklerinin anlık yansıması

---

## 🎯 Gereksinimler Özeti (Q&A Çıktıları)

### Q1-Q5: Proje Adı (projectName)
- **Konum:** `quotes` tablosuna doğrudan (form_data değil)
- **Zorunluluk:** Evet, zorunlu alan
- **İlişki:** Quote'a bağlı (müşteriye değil)
- **UI Konumu:** AddQuoteModal Step 1 (Customer Step) - müşteri seçiminin altında
- **Mevcut Kayıtlar:** ~~`'oldStructure'` değeri ile işaretlenecek~~ → **Test verileri silinecek** (2025-12-07 kararı)

### Q6-Q8: Tablo Kolonları
- **Kaldırılacak:** Müşteri (yetkili kişi), Telefon, E-posta → Detay panelinde gösterilecek
- **Sabit Sol (Freeze):** Tarih | Şirket | Proje
- **Dinamik (Scroll):** Form alanları (`showInTable: true` olanlar)
- **Sabit Sağ (Freeze):** Fiyat | Termine Kalan | Durum

### Q9-Q11: canEdit = false Senaryosu
- **Koşul:** Üretim başlamış tekliflerde form düzenleme kapalı
- **Dinamik Alanlar:** "Detaylara bakınız" + Lucide `FileText` ikonu gösterilecek
- **colspan:** Tüm dinamik kolonlar tek hücrede birleştirilecek
- **Tıklama:** Detay panelini açar

### Q12-Q14: Form Manager Entegrasyonu
- **showInTable/showInFilter Değişikliği:** Form versiyonunu DEĞİŞTİRMEZ
- **Sadece Versiyon Artıran:** Alan ekleme, silme, tip değişikliği, seçenek değişikliği
- **Senkronizasyon:** Event dispatch ile (`formDisplaySettingsChanged` custom event)

### Q15-Q17: Teknik Kararlar
- **Güncelleme Yöntemi:** Event dispatch (her tab değişiminde API çağırmak yerine)
- **Migration:** Onaylandı (028_quote_table_display.sql)
- **Kolon Sırası:** Tarih | Şirket | Proje | [Dinamik ←→] | Fiyat | Termine | Durum

---

## 🗂️ Prompt Zinciri

| Prompt | Başlık | Durum | Bağımlılık |
|--------|--------|-------|------------|
| QT-1 | Database Migration | ✅ Tamamlandı | - |
| QT-2 | Backend API Güncellemesi | ✅ Tamamlandı | QT-1 |
| QT-3 | Frontend - Proje Adı Entegrasyonu | ✅ Tamamlandı | QT-2 |
| **PRE-QT4-1** | **Field ID Tutarlılığı (proj → projectName)** | ✅ Tamamlandı | QT-3 |
| **PRE-QT4-2** | **Gereksiz Kolonların Kaldırılması** | ✅ Tamamlandı | PRE-QT4-1 |
| **PRE-QT4-3** | **Kolon Metadata (width, freeze)** | ✅ Tamamlandı | PRE-QT4-2 |
| QT-4 | Frontend - Dinamik Tablo Kolonları | ✅ Tamamlandı | PRE-QT4-3 |
| QT-5 | Frontend - Freeze Kolonlar & Scroll + FFOC Handling | ✅ Tamamlandı | QT-4 |
| QT-6 | Frontend - Dinamik Filtre Sistemi | ⏳ Bekliyor | QT-5 |
| QT-7 | Event Dispatch Sistemi | ✅ Tamamlandı | QT-4 |
| QT-8 | Test & Doğrulama | ⏳ Bekliyor | QT-1 → QT-7 |

---

## 📊 Mevcut Sistem Analizi

### Mevcut Dosya Yapısı
```
domains/crm/
├── components/
│   ├── quotes/
│   │   ├── QuotesManager.js      # Ana tablo yönetimi (1829 satır, React.createElement)
│   │   ├── QuotesTabs.jsx        # Tab yönetimi (quotes, customers, forms, pricing)
│   │   ├── AddQuoteModal.jsx     # 3-step wizard (427 satır)
│   │   ├── QuoteCustomerStep.jsx # Step 1: Müşteri seçimi
│   │   ├── QuoteFormStep.jsx     # Step 2: Form doldurma
│   │   ├── QuoteReviewStep.jsx   # Step 3: Özet ve fiyat
│   │   ├── QuoteDetailsPanel.jsx # Sağ panel detay görüntüleme
│   │   └── FormUpdateModal.jsx   # Form güncelleme modalı
│   └── forms/
│       └── FormManager.jsx       # Form template yönetimi
├── services/
│   ├── quotes-service.js         # Quotes API işlemleri
│   └── forms-service.js          # Form templates API işlemleri
├── utils/
│   ├── table-utils.js            # getTableColumns(), getFieldValue()
│   └── filter-utils.js           # getFilterOptions(), createFilteredList()
└── styles/
    └── quotes.css                # Tablo stilleri
```

### Mevcut Database Yapısı (quotes schema)
```sql
-- quotes.quotes tablosu (mevcut)
- id, customerName, customerCompany, customerEmail, customerPhone
- formTemplateId, formVersion
- status, finalPrice, calculatedPrice
- deliveryDate, createdAt, updatedAt
- formData (JSONB), customerId
-- EKSİK: projectName

-- quotes.form_fields tablosu (mevcut)
- id, templateId, fieldCode, fieldName, fieldType
- sortOrder, isRequired, placeholder, options
- createdAt, updatedAt
-- EKSİK: showInTable, showInFilter, tableOrder, filterOrder
```

### Mevcut Tablo Kolonları (QuotesManager.js)
```javascript
// getTableColumns(formConfig) mevcut çıktısı:
[
  { id: 'date', label: 'Tarih', type: 'date' },
  { id: 'name', label: 'Müşteri', type: 'text' },      // KALDIRILACAK
  { id: 'company', label: 'Şirket', type: 'text' },
  { id: 'proj', label: 'Proje', type: 'text' },
  { id: 'phone', label: 'Telefon', type: 'phone' },    // KALDIRILACAK
  { id: 'email', label: 'E-posta', type: 'email' },    // KALDIRILACAK
  // ... form alanları (sabit)
  { id: 'price', label: 'Tahmini Fiyat', type: 'currency' },
  { id: 'delivery_date', label: 'Teslimat Tarihi', type: 'text' },
  { id: 'status', label: 'Durum', type: 'text' }
]
```

### Mevcut Sorunlar
1. **formConfig yüklemesi:** Sadece mount'ta yükleniyor (`useEffect([], [])`)
2. **Tab değişiminde güncelleme yok:** FormManager'da yapılan değişiklikler QuotesManager'a yansımıyor
3. **Dinamik kolon desteği yok:** Tüm kolonlar hardcoded
4. **projectName alanı yok:** Ne DB'de ne UI'da

---

## 📐 Tablo Yapısı (Hedef)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ [FREEZE - SOL]          │ [DİNAMİK - SCROLL]           │ [FREEZE - SAĞ]                │
├─────────────────────────┼──────────────────────────────┼───────────────────────────────┤
│ Tarih | Şirket | Proje  │ ← Alan1 | Alan2 | Alan3 → │ Fiyat | Termine | Durum       │
│ 140px   150px    150px  │    120px   120px   120px   │ 120px   110px     100px       │
└─────────────────────────┴──────────────────────────────┴───────────────────────────────┘
```

### Kolon Detayları

| # | Kolon | Kaynak | Freeze | Genişlik | Açıklama |
|---|-------|--------|--------|----------|----------|
| 1 | Tarih | `createdAt` | ✅ Sol | 140px | Oluşturma tarihi |
| 2 | Şirket | `customerCompany` | ✅ Sol | 150px | Müşteri şirketi |
| 3 | Proje | `projectName` | ✅ Sol | 150px | **YENİ** - Proje adı |
| 4+ | Dinamik | `formFields[showInTable=true]` | ❌ | 120px | Scroll edilebilir alan |
| -3 | Tahmini Fiyat | `finalPrice` | ✅ Sağ | 120px | Hesaplanan fiyat |
| -2 | Termine Kalan | `deliveryDate` (calc) | ✅ Sağ | 110px | Gün sayısı |
| -1 | Durum | `status` | ✅ Sağ | 100px | Dropdown |

### Kaldırılan Kolonlar
- ~~Müşteri (customerName)~~ → Detay panelinde gösterilecek
- ~~Telefon (customerPhone)~~ → Detay panelinde gösterilecek
- ~~E-posta (customerEmail)~~ → Detay panelinde gösterilecek

---

## 🔧 PROMPT-QT1: Database Migration

### Hedef
`form_fields` ve `quotes` tablolarına yeni kolonların eklenmesi.

### Migration SQL

```sql
-- Migration: 028_quote_table_display.sql
-- Tarih: 2025-12-06
-- Açıklama: Quote tablosu dinamik kolon desteği

-- 1. form_fields tablosuna display kolonları ekle
ALTER TABLE quotes.form_fields 
  ADD COLUMN IF NOT EXISTS "showInTable" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "showInFilter" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "tableOrder" INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "filterOrder" INTEGER DEFAULT 0;

-- 2. quotes tablosuna projectName kolonu ekle
ALTER TABLE quotes.quotes 
  ADD COLUMN IF NOT EXISTS "projectName" VARCHAR(255) DEFAULT 'oldStructure';

-- 3. Mevcut quotes için projectName güncelle (form_data'dan varsa al)
-- NOT: Bu migration sonrası manuel kontrol gerekebilir
UPDATE quotes.quotes q
SET "projectName" = COALESCE(
  (SELECT qfd."fieldValue" 
   FROM quotes.quote_form_data qfd 
   WHERE qfd."quoteId" = q.id 
   AND qfd."fieldCode" IN ('project', 'proj', 'projectName')
   LIMIT 1),
  'oldStructure'
)
WHERE q."projectName" IS NULL OR q."projectName" = 'oldStructure';

-- 4. İndeksler
CREATE INDEX IF NOT EXISTS idx_form_fields_show_in_table 
  ON quotes.form_fields("templateId", "showInTable") 
  WHERE "showInTable" = true;

CREATE INDEX IF NOT EXISTS idx_form_fields_show_in_filter 
  ON quotes.form_fields("templateId", "showInFilter") 
  WHERE "showInFilter" = true;

CREATE INDEX IF NOT EXISTS idx_quotes_project_name 
  ON quotes.quotes("projectName");
```

### Model Güncellemesi (formFields.js)

```javascript
// Eklenecek metodlar:

/**
 * Update field display settings (showInTable, showInFilter, tableOrder, filterOrder)
 * NOT: Bu işlem form versiyonunu DEĞİŞTİRMEZ
 */
static async updateDisplaySettings(fieldId, settings) {
  const allowedFields = ['showInTable', 'showInFilter', 'tableOrder', 'filterOrder'];
  const updates = {};
  
  for (const key of allowedFields) {
    if (settings[key] !== undefined) {
      updates[key] = settings[key];
    }
  }
  
  if (Object.keys(updates).length === 0) return null;
  
  updates.updatedAt = db.fn.now();
  
  const [updated] = await db('quotes.form_fields')
    .where({ id: fieldId })
    .update(updates)
    .returning('*');
  
  return updated;
}

/**
 * Get fields with showInTable=true for active template
 * @returns {Array} Fields sorted by tableOrder
 */
static async getTableDisplayFields(templateId) {
  return db('quotes.form_fields')
    .where({ templateId, showInTable: true })
    .orderBy('tableOrder', 'asc')
    .select('*');
}

/**
 * Get fields with showInFilter=true for active template
 * @returns {Array} Fields sorted by filterOrder
 */
static async getFilterDisplayFields(templateId) {
  return db('quotes.form_fields')
    .where({ templateId, showInFilter: true })
    .orderBy('filterOrder', 'asc')
    .select('*');
}
```

### Dosyalar
- `db/migrations/028_quote_table_display.sql` (YENİ)
- `db/models/formFields.js` (GÜNCELLEME)

### Doğrulama
```sql
-- Kolonların eklendiğini doğrula
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_schema = 'quotes' 
AND table_name = 'form_fields'
AND column_name IN ('showInTable', 'showInFilter', 'tableOrder', 'filterOrder');

-- projectName kolonunu doğrula
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_schema = 'quotes' 
AND table_name = 'quotes'
AND column_name = 'projectName';
```

### ✅ Test Sonuçları (2025-12-06)

**Test Ortamı:** Local PostgreSQL - beeplan_dev

#### 1. form_fields Kolon Testleri ✅
```
column_name  | data_type | is_nullable | column_default 
-------------+-----------+-------------+----------------
filterOrder  | integer   | YES         | 0
showInFilter | boolean   | YES         | false
showInTable  | boolean   | YES         | false
tableOrder   | integer   | YES         | 0
(4 rows)
```

#### 2. quotes.projectName Testi ✅
```
column_name | data_type         | is_nullable | max_length | column_default
------------+-------------------+-------------+------------+--------------------------------
projectName | character varying | YES         | 255        | 'oldStructure'::character varying
```

#### 3. formFields.js Model Testleri ✅
- `updateDisplaySettings`: ✅ VAR
- `getTableDisplayFields`: ✅ VAR
- `getFilterDisplayFields`: ✅ VAR
- `bulkUpdateDisplaySettings`: ✅ VAR
- `create()` showInTable param: ✅ VAR
- `create()` showInFilter param: ✅ VAR

#### 4. quotes.js Model Testleri ✅
- `create()` projectName: ✅ VAR
- `update()` projectName: ✅ VAR

#### 5. Index Testleri ✅
```
indexname                      
--------------------------------
idx_form_fields_show_in_filter
idx_form_fields_show_in_table
idx_quotes_project_name
```

**Sonuç:** Tüm QT-1 testleri başarıyla geçti. ✅

---

## 🔧 PROMPT-QT2: Backend API Güncellemesi

### Hedef
Form field display ayarlarını güncelleyen ve sorgulayan API endpoint'leri.

### Yeni Endpoint'ler

#### 1. PUT `/api/form-fields/:id/display`
Display ayarlarını günceller (versiyon değiştirmez).

```javascript
// Request
{
  "showInTable": true,
  "showInFilter": false,
  "tableOrder": 2,
  "filterOrder": 0
}

// Response
{
  "success": true,
  "field": { ...updatedField }
}
```

#### 2. GET `/api/form-templates/:id/display-fields`
Aktif template için display alanlarını döner.

```javascript
// Response
{
  "tableFields": [
    { "id": 1, "fieldCode": "materialType", "fieldName": "Malzeme Tipi", "tableOrder": 1 },
    { "id": 2, "fieldCode": "dimensions", "fieldName": "Boyutlar", "tableOrder": 2 }
  ],
  "filterFields": [
    { "id": 1, "fieldCode": "materialType", "fieldName": "Malzeme Tipi", "filterOrder": 1 }
  ]
}
```

### Quotes API Güncellemesi

#### POST `/api/quotes` - Güncelleme
`projectName` alanını kabul et ve kaydet.

```javascript
// Request body'ye eklenen alan
{
  // ... mevcut alanlar
  "projectName": "Proje ABC"
}
```

#### GET `/api/quotes` - Güncelleme
Response'a `projectName` ekle (model zaten döndürüyor, controller değişikliği gerekmez).

#### PATCH `/api/quotes/:id` - Güncelleme
`projectName` güncellemesini destekle.

### Dosyalar
- `domains/crm/api/controllers/formController.js` (GÜNCELLEME) - Display endpoint'leri
- `domains/crm/api/controllers/quoteController.js` (GÜNCELLEME) - projectName desteği
- `domains/crm/api/services/quoteService.js` (GÜNCELLEME) - projectName wiring
- `db/models/quotes.js` (QT-1'DE TAMAMLANDI ✅)
- `db/models/formFields.js` (QT-1'DE TAMAMLANDI ✅)

### ✅ Test Sonuçları (2025-12-06)

**Test Ortamı:** Local Server - http://localhost:3000

#### 1. PUT /api/form-fields/:id/display ✅
```bash
curl -X PUT http://localhost:3000/api/form-fields/213/display \
  -H "Content-Type: application/json" \
  -d '{"showInTable": true, "showInFilter": true, "tableOrder": 1, "filterOrder": 1}'

# Response:
{"success":true,"field":{"id":213,"showInTable":true,"showInFilter":true,"tableOrder":1,"filterOrder":1,...}}
```

#### 2. GET /api/form-templates/:id/display-fields ✅
```bash
curl http://localhost:3000/api/form-templates/47/display-fields

# Response:
{"tableFields":[{"id":213,"fieldCode":"FIELD_...","showInTable":true,...}],"filterFields":[...]}
```

#### 3. GET /api/quotes - projectName ✅
```bash
# Mevcut quotes projectName: 'oldStructure' döndürüyor
{"projectName": "oldStructure", ...}
```

#### 4. POST/PATCH /api/quotes - projectName ✅
- Controller: projectName parametresi kabul ediliyor
- Service: projectName quoteData'ya ekleniyor
- Model: projectName veritabanına kaydediliyor

**Sonuç:** Tüm QT-2 testleri başarıyla geçti. ✅

---

## 🔧 PROMPT-QT3: Frontend - Proje Adı Entegrasyonu

### Hedef
AddQuoteModal ve QuoteDetailsPanel'e proje adı alanının eklenmesi.

### ⚙️ Kararlar (2025-12-07)
| Konu | Karar |
|------|-------|
| `oldStructure` gösterimi | ❌ Gerek yok - eski test verileri silinecek |
| Icon seçimi | `FolderOpen` kullanılacak (📂 açık klasör - aktif proje hissi) |
| maxLength validasyonu | ❌ Frontend'de eklenmeyecek (DB: VARCHAR(255)) |
| Validation dosyası | `quote-validation.js` mevcut - güncelleme yapılacak |

### AddQuoteModal Değişiklikleri (QuoteCustomerStep.jsx)

**Mevcut Yapı:**
```
┌──────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────┐    │
│  │  ○ Mevcut Müşteri  ○ Yeni Müşteri  ○ Müşterisiz  │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ 🔍 Müşteri Ara...                           [v]  │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  (veya Yeni Müşteri seçiliyse:)                         │
│  ┌──────────────────────────────────────────────────┐    │
│  │ Şirket: [________________]                       │    │
│  │ Yetkili: [________________]                      │    │
│  │ E-posta: [________________]                      │    │
│  │ Telefon: [________________]                      │    │
│  │ Adres: [________________]                        │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

**Yeni Yapı (projectName + deliveryDate alt bölümü):**
```
┌──────────────────────────────────────────────────────────┐
│  ┌──────────────────────────────────────────────────┐    │
│  │  ○ Mevcut Müşteri  ○ Yeni Müşteri  ○ Müşterisiz  │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ 🔍 Müşteri Ara...                           [v]  │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ═══════════════════════════════════════════════════     │
│  Proje Bilgileri                                         │
│  ═══════════════════════════════════════════════════     │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ 📁 Proje Adı *                                   │    │
│  │ [____________________________________]           │    │
│  │ (Zorunlu alan - tabloda görünür)                 │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │ 📅 Tahmini Teslimat Tarihi                       │    │
│  │ [__ / __ / ____] 📆                              │    │
│  │ (Opsiyonel - termine hesabında kullanılır)       │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

### QuoteReviewStep.jsx - Özet Görünümü
```
┌──────────────────────────────────────────────────────────┐
│  📋 Teklif Özeti                                         │
│  ════════════════════════════════════════════════════    │
│                                                          │
│  👤 Müşteri Bilgileri                                    │
│  ├── Şirket: ABC Mühendislik                             │
│  ├── Yetkili: Ahmet Yılmaz                               │
│  └── E-posta: ahmet@abc.com                              │
│                                                          │
│  📁 Proje Bilgileri                       ← YENİ BÖLÜM   │
│  ├── Proje Adı: Fabrika Yapı İşleri                      │
│  └── Tahmini Teslimat: 15/01/2026                        │
│                                                          │
│  📝 Form Bilgileri                                       │
│  └── ...                                                 │
└──────────────────────────────────────────────────────────┘
```

### State Değişiklikleri

```javascript
// QuoteCustomerStep.jsx - customerStepData'ya eklenen alan
const [customerStepData, setCustomerStepData] = useState({
  customerType: 'existing',
  selectedCustomer: null,
  customerData: null,
  deliveryDate: '',
  projectName: ''  // YENİ
})
```

### Validasyon

```javascript
// quote-validation.js - validateCustomerStep güncelleme
export function validateCustomerStep(data) {
  const errors = {};
  
  // Proje adı zorunlu
  if (!data.projectName || !data.projectName.trim()) {
    errors.projectName = 'Proje adı zorunludur';
  }
  
  // ... mevcut validasyonlar
  
  return { isValid: Object.keys(errors).length === 0, errors };
}
```

### QuoteDetailsPanel.jsx Değişiklikleri

**Mevcut Header Bölümü:**
```
┌──────────────────────────────────────────────────────────┐
│  Teklif #1234                              [Düzenle] [X] │
│  ════════════════════════════════════════════════════    │
│  Şirket: ABC Mühendislik                                 │
│  Durum: [Dropdown]                                       │
```

**Yeni Header Bölümü:**
```
┌──────────────────────────────────────────────────────────┐
│  Teklif #1234                              [Düzenle] [X] │
│  ════════════════════════════════════════════════════    │
│  📁 Proje: Fabrika Yapı İşleri          ← YENİ (öne çık) │
│  🏢 Şirket: ABC Mühendislik                              │
│  👤 Yetkili: Ahmet Yılmaz               ← Tabloda yok,   │
│  📧 E-posta: ahmet@abc.com                  burada var   │
│  📞 Telefon: 0532 123 4567                               │
│  Durum: [Dropdown]                                       │
```

### Dosyalar
- `domains/crm/components/quotes/QuoteCustomerStep.jsx` (GÜNCELLEME)
- `domains/crm/components/quotes/AddQuoteModal.jsx` (GÜNCELLEME)
- `domains/crm/components/quotes/QuoteDetailsPanel.jsx` (GÜNCELLEME)
- `domains/crm/components/quotes/QuoteReviewStep.jsx` (GÜNCELLEME)
- `domains/crm/utils/quote-validation.js` (GÜNCELLEME)

### Uygulama Adımları
1. **QuoteCustomerStep.jsx:** `projectName` state extraction, onChange'lere ekleme, "Proje Bilgileri" section (FolderOpen icon)
2. **AddQuoteModal.jsx:** Initial state'e `projectName: ''`, handleSubmit payload'a ekleme
3. **QuoteReviewStep.jsx:** Destructure + "Proje Bilgileri" section gösterimi
4. **QuoteDetailsPanel.jsx:** Form initialization, handleSubmit, header display/edit
5. **quote-validation.js:** `validateCustomerStep` fonksiyonuna projectName zorunlu kontrolü

### ✅ Test Sonuçları (2025-12-07)

**Test Ortamı:** Local Build - Vite + Local Server - Node.js

#### 1. Build Testi ✅
```
✓ 1819 modules transformed
✓ built in 2.50s
```

#### 2. Backend API Testleri ✅
```bash
# POST /api/quotes - projectName kaydetme
curl -X POST http://localhost:3000/api/quotes -d '{"projectName": "QT-3 Test Projesi"}'
# Response: {"projectName": "QT-3 Test Projesi"} ✅

# GET /api/quotes - projectName döndürme
curl http://localhost:3000/api/quotes
# Response: projectName alanı mevcut ✅

# PATCH /api/quotes/:id - projectName güncelleme
curl -X PATCH http://localhost:3000/api/quotes/TKF-20251207-0001 -d '{"projectName": "Güncellenmiş"}'
# Response: {"success": true, "projectName": "QT-3 Güncellenmiş Proje"} ✅
```

#### 3. Database Kontrolü ✅
```sql
SELECT id, "customerCompany", "projectName" FROM quotes.quotes;
-- projectName doğru kaydedilmiş ✅
```

#### 4. Dosya Değişiklikleri ✅
- `QuoteCustomerStep.jsx`: projectName state, handleProjectNameChange, "Proje Bilgileri" section ✅
- `AddQuoteModal.jsx`: customerStepData initial state, handleSubmit payload ✅
- `QuoteReviewStep.jsx`: projectName destructure, Proje Bilgileri section ✅
- `QuoteDetailsPanel.jsx`: Temel Bilgiler bölümüne Proje Adı + Teslim Tarihi taşındı ✅
- `quote-validation.js`: validateCustomerStep projectName kontrolü ✅

#### 5. Eski Test Verileri Temizliği ✅
```sql
DELETE 2 -- quote_files
DELETE 10 -- quote_form_data
DELETE 5 -- quotes
```

#### 6. UI Düzeltmeleri ✅
- **Temel Bilgiler bölümü:** Teklif ID, Proje Adı, Teklif Tarihi, Teslim Tarihi, Durum
- **Müşteri Bilgileri bölümü:** Ad Soyad, Şirket, E-posta, Telefon (projectName ve deliveryDate kaldırıldı)
- **"Tarih" → "Teklif Tarihi"** olarak güncellendi

**Sonuç:** Tüm QT-3 implementasyonu tamamlandı. ✅

---

## 🔧 PRE-QT4: Hazırlık Promptları

> **Not:** QT-4 öncesinde mevcut kod ile plan arasındaki uyumsuzlukları gidermek için hazırlık promptları.

### 🚨 Tespit Edilen Uyumsuzluklar

| # | Sorun | Mevcut Kod | Plan | Aksiyon |
|---|-------|------------|------|---------|
| 1 | Field ID uyumsuzluğu | `proj` | `projectName` | PRE-QT4-1 |
| 2 | Kaldırılacak kolonlar hala var | `name`, `phone`, `email` | Kaldırılmalı | PRE-QT4-2 |
| 3 | Freeze/width metadata eksik | Yok | Eklenmeli | PRE-QT4-3 |
| 4 | `mapFieldType()` fonksiyonu | Yok | Eklenmeli | QT-4 |
| 5 | `isDynamic` flag | Yok | Eklenmeli | QT-4 |

---

### 🔧 PRE-QT4-1: Field ID Tutarlılığı (`proj` → `projectName`)

#### Hedef
`proj` field ID'sini `projectName` ile değiştirmek (QT-3'te eklenen DB kolonu ile uyum).

#### Değişiklikler

**table-utils.js - getTableColumns():**
```javascript
// ESKİ:
{ id: 'proj', label: 'Proje', type: 'text' }

// YENİ:
{ id: 'projectName', label: 'Proje', type: 'text' }
```

**table-utils.js - getFieldValue():**
```javascript
// ESKİ:
if (fieldId === 'proj') return quote.formData?.project || quote.formData?.proj || quote.project || ''

// YENİ:
if (fieldId === 'projectName') return quote.projectName || ''
```

**table-utils.js - fixedFields array:**
```javascript
// ESKİ:
const fixedFields = ['date', 'name', 'company', 'proj', 'phone', 'email', 'price', 'delivery_date', 'status']

// YENİ:
const fixedFields = ['date', 'name', 'company', 'projectName', 'phone', 'email', 'price', 'delivery_date', 'status']
```

#### Dosyalar
- `domains/crm/utils/table-utils.js` (GÜNCELLEME)

#### Durum: ✅ Tamamlandı (2025-12-10)

---

### 🔧 PRE-QT4-2: Gereksiz Kolonların Kaldırılması

#### Hedef
Tabloda artık gösterilmeyecek kolonların (`name`, `phone`, `email`) kaldırılması.

#### Değişiklikler

**table-utils.js - getTableColumns():**
```javascript
// ESKİ:
const fixedColumns = [
  { id: 'date', label: 'Tarih', type: 'date' },
  { id: 'name', label: 'Müşteri', type: 'text' },      // ❌ KALDIRILACAK
  { id: 'company', label: 'Şirket', type: 'text' },
  { id: 'projectName', label: 'Proje', type: 'text' },
  { id: 'phone', label: 'Telefon', type: 'phone' },    // ❌ KALDIRILACAK
  { id: 'email', label: 'E-posta', type: 'email' }     // ❌ KALDIRILACAK
]

// YENİ:
const fixedColumns = [
  { id: 'date', label: 'Tarih', type: 'date' },
  { id: 'company', label: 'Şirket', type: 'text' },
  { id: 'projectName', label: 'Proje', type: 'text' }
]
```

**table-utils.js - getFieldValue():**
```javascript
// ESKİ:
const fixedFields = ['date', 'name', 'company', 'projectName', 'phone', 'email', 'price', 'delivery_date', 'status']

// YENİ:
const fixedFields = ['date', 'company', 'projectName', 'price', 'delivery_date', 'status']
```

**NOT:** `name`, `phone`, `email` için getFieldValue mantığı korunabilir (detay panelinde kullanılıyor).

#### Dosyalar
- `domains/crm/utils/table-utils.js` (GÜNCELLEME)

#### Durum: ✅ Tamamlandı (2025-12-10)

---

### 🔧 PRE-QT4-3: Kolon Metadata Eklenmesi (width, freeze)

#### Hedef
QT-5 (Freeze Kolonlar) için gerekli metadata'nın kolonlara eklenmesi.

#### Değişiklikler

**table-utils.js - getTableColumns():**
```javascript
// ESKİ:
const fixedColumns = [
  { id: 'date', label: 'Tarih', type: 'date' },
  { id: 'company', label: 'Şirket', type: 'text' },
  { id: 'projectName', label: 'Proje', type: 'text' }
]

// YENİ:
const fixedLeftColumns = [
  { id: 'date', label: 'Tarih', type: 'date', width: 140, freeze: 'left' },
  { id: 'company', label: 'Şirket', type: 'text', width: 150, freeze: 'left' },
  { id: 'projectName', label: 'Proje', type: 'text', width: 150, freeze: 'left' }
]

// ESKİ:
const endColumns = [
  { id: 'price', label: 'Tahmini Fiyat', type: 'currency' },
  { id: 'delivery_date', label: 'Termine Kalan', type: 'text' },
  { id: 'status', label: 'Durum', type: 'text' }
]

// YENİ:
const fixedRightColumns = [
  { id: 'price', label: 'Tahmini Fiyat', type: 'currency', width: 120, freeze: 'right' },
  { id: 'delivery_date', label: 'Termine Kalan', type: 'text', width: 110, freeze: 'right' },
  { id: 'status', label: 'Durum', type: 'text', width: 100, freeze: 'right' }
]
```

#### Dosyalar
- `domains/crm/utils/table-utils.js` (GÜNCELLEME)

#### Durum: ✅ Tamamlandı (2025-12-10)

---

## 🔧 PROMPT-QT4: Frontend - Dinamik Tablo Kolonları

### Hedef
`getTableColumns()` fonksiyonunun aktif form'un display ayarlarına göre dinamik kolon üretmesi.

### Bağımlılık
- ✅ PRE-QT4-1: Field ID Tutarlılığı
- ✅ PRE-QT4-2: Gereksiz Kolonların Kaldırılması
- ✅ PRE-QT4-3: Kolon Metadata Eklenmesi

### Mevcut Yapı (table-utils.js) - PRE-QT4 SONRASI

```javascript
export function getTableColumns(formConfig) {
  // Sabit Sol Kolonlar (Freeze) - PRE-QT4-2, PRE-QT4-3 sonrası
  const fixedLeftColumns = [
    { id: 'date', label: 'Tarih', type: 'date', width: 140, freeze: 'left' },
    { id: 'company', label: 'Şirket', type: 'text', width: 150, freeze: 'left' },
    { id: 'projectName', label: 'Proje', type: 'text', width: 150, freeze: 'left' }  // PRE-QT4-1
  ]
  
  // Dinamik alanlar (mevcut - güncellenmemiş)
  const configFields = formConfig?.fields || formConfig?.formStructure?.fields || []
  const dynamicFields = configFields
    .filter(field => field.display?.showInTable)
    .sort((a, b) => (a.display?.tableOrder || 0) - (b.display?.tableOrder || 0))
  
  // Sabit Sağ Kolonlar (Freeze) - PRE-QT4-3
  const fixedRightColumns = [
    { id: 'price', label: 'Tahmini Fiyat', type: 'currency', width: 120, freeze: 'right' },
    { id: 'delivery_date', label: 'Termine Kalan', type: 'text', width: 110, freeze: 'right' },
    { id: 'status', label: 'Durum', type: 'text', width: 100, freeze: 'right' }
  ]
  
  return [...fixedLeftColumns, ...dynamicFields, ...fixedRightColumns]
}
```

### QT-4 Eklemeleri

#### 1. mapFieldType() Fonksiyonu (YENİ)
```javascript
/**
 * Form field tipini tablo kolon tipine çevir
 * @param {string} fieldType - Form field tipi
 * @returns {string} Tablo kolon tipi
 */
function mapFieldType(fieldType) {
  const typeMap = {
    'text': 'text',
    'textarea': 'text',
    'number': 'number',
    'select': 'text',
    'radio': 'text',
    'checkbox': 'boolean',
    'date': 'date',
    'email': 'email',
    'phone': 'phone',
    'currency': 'currency'
  };
  return typeMap[fieldType] || 'text';
}
```

#### 2. Dinamik Kolon Oluşturma (GÜNCELLEME)
```javascript
// ESKİ:
const dynamicFields = configFields
  .filter(field => field.display?.showInTable)
  .sort((a, b) => (a.display?.tableOrder || 0) - (b.display?.tableOrder || 0))

// YENİ:
const dynamicColumns = [];
const fields = formConfig?.fields || formConfig?.formStructure?.fields || [];

fields
  .filter(field => field.display?.showInTable === true || field.showInTable === true)
  .sort((a, b) => (a.display?.tableOrder || a.tableOrder || 0) - (b.display?.tableOrder || b.tableOrder || 0))
  .forEach(field => {
    dynamicColumns.push({
      id: field.fieldCode || field.id,
      label: field.fieldName || field.label,
      type: mapFieldType(field.fieldType || field.type),
      width: 120,
      freeze: null,
      isDynamic: true  // QT-5 için önemli flag
    });
  });
```

#### 3. getFieldValue() Güncellemesi

```javascript
export function getFieldValue(quote, fieldId) {
  // Sabit alanlar - PRE-QT4-1, PRE-QT4-2 sonrası
  const fixedFieldMap = {
    'date': () => quote.createdAt || quote.date || '',
    'company': () => quote.customerCompany || '',
    'projectName': () => quote.projectName || '',  // PRE-QT4-1: proj → projectName
    'price': () => quote.finalPrice || quote.calculatedPrice || 0,
    'delivery_date': () => quote.deliveryDate || '',
    'status': () => quote.status || 'new'
  };
  
  if (fixedFieldMap[fieldId]) {
    return fixedFieldMap[fieldId]();
  }
  
  // Dinamik alanlar - formData veya customFields'dan oku
  // PostgreSQL formatı: quote.formData = { FIELD_xxx: value, ... }
  // Legacy formatı: quote.customFields = { fieldId: value, ... }
  return quote.formData?.[fieldId] || quote.customFields?.[fieldId] || '';
}
```

### Dosyalar
- `domains/crm/utils/table-utils.js` (GÜNCELLEME)
- `domains/crm/components/forms/FormManager.jsx` (GÜNCELLEME)
- `domains/crm/components/forms/formBuilder/FormBuilderCompact.js` (GÜNCELLEME)
- `domains/crm/components/forms/formBuilder/FieldEditor.js` (GÜNCELLEME)
- `domains/crm/components/quotes/QuotesManager.js` (GÜNCELLEME)
- `domains/crm/services/forms-service.js` (GÜNCELLEME)
- `domains/crm/api/controllers/formController.js` (GÜNCELLEME)
- `db/models/formTemplates.js` (GÜNCELLEME)
- `db/models/quotes.js` (GÜNCELLEME)

### ✅ Test Sonuçları (2025-12-07)

**Test Ortamı:** Local Build + Local Server

#### 1. Build Testi ✅
```
✓ 1819 modules transformed
✓ built in 1.96s
```

#### 2. Dinamik Kolon Testi ✅
- `showInTable: true` olan alanlar tabloda görünüyor
- `showInTable: false` olan alanlar tabloda görünmüyor
- Kolonlar `tableOrder` sırasına göre sıralanıyor

#### 3. Display Ayarları Kaydı ✅
- Tabloda göster toggle → DB'ye anında kaydediliyor
- Filtrede göster toggle → DB'ye anında kaydediliyor
- Tablo sırası → Kaydet butonuyla DB'ye kaydediliyor
- Display değişiklikleri form versiyonunu DEĞİŞTİRMİYOR ✅

#### 4. Form Data Görüntüleme ✅
- Dinamik kolonlarda quote form verileri görüntüleniyor
- Dropdown alanları için option code yerine option label gösteriliyor
- `getAll()` API'si artık formData'yı da döndürüyor

#### 5. Dosya Değişiklikleri ✅
- `table-utils.js`: mapFieldType(), getTableColumns() dinamik kolonlar, getFieldValue() formConfig ile option label lookup
- `FormManager.jsx`: dbFieldToFrontend() dbId eklendi, handleDisplaySettingsChange callback, display-aware change detection
- `FormBuilderCompact.js`: onDisplaySettingsChange prop, handleDisplaySettingsChangeLocal wrapper
- `FieldEditor.js`: handleDisplayChange(), hasOnlyDisplayChanges(), display-only save akışı
- `forms-service.js`: updateFieldDisplay() fonksiyonu
- `formController.js`: formStructure.fields'a display kolonları eklendi
- `formTemplates.js`: getWithFields() sorgusuna display kolonları eklendi
- `quotes.js`: getAll() artık formData'yı tek sorguda yüklüyor

**Sonuç:** Tüm QT-4 testleri başarıyla geçti. ✅

---

## 🔧 PROMPT-QT5: Frontend - Freeze Kolonlar & Scroll + canEdit Kontrolü

### Hedef
Sol ve sağ sabit kolonlar, ortada yatay scroll edilebilir dinamik alan.  
**Önemli:** Form versiyonu uyumsuz olan (`canEdit: false`) tekliflerde dinamik alanlar yerine uyarı mesajı gösterimi.

### ⚙️ Kararlar (2025-12-07)
| Konu | Karar |
|------|-------|
| canEdit kontrolü | Mevcut `canEdit` field'ı kullanılacak |
| Freeze yaklaşımı | CSS `position: sticky` (Seçenek A) |
| Uyumsuz versiyon mesajı | "Versiyonlar senkron değil, Detaylara Bakınız!" |
| Versiyon bilgisi | `quote.formVersion` vs `activeTemplate.version` karşılaştırması |

### canEdit Senaryoları

| Durum | canEdit | Dinamik Alanlar |
|-------|---------|-----------------|
| Yeni teklif (status: new) | ✅ true | Normal görünüm - tüm değerler gösterilir |
| Onaylandı (status: approved) | ✅ true | Normal görünüm |
| Üretimde (status: production) | ❌ false | "Versiyonlar senkron değil, Detaylara Bakınız!" |
| Tamamlandı (status: completed) | ❌ false | "Versiyonlar senkron değil, Detaylara Bakınız!" |
| İptal (status: cancelled) | ❌ false | "Versiyonlar senkron değil, Detaylara Bakınız!" |

### "Versiyonlar senkron değil" UI Mockup

**Normal Satır (canEdit: true):**
```
┌────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬────────┐
│ Tarih  │ Şirket  │ Proje   │ Alan1   │ Alan2   │ Alan3   │ Fiyat   │Termine  │ Durum  │
├────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼────────┤
│05/12/25│ ABC Ltd │ ProjABC │ Değer1  │ Değer2  │ Değer3  │ ₺15,000 │ 12 gün  │[Yeni▼] │
└────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴────────┘
```

**Locked Satır (canEdit: false - Versiyon Uyumsuz):**
```
┌────────┬─────────┬─────────┬─────────────────────────────────────────┬─────────┬─────────┬─────────┐
│ Tarih  │ Şirket  │ Proje   │              [colspan=N]                │ Fiyat   │Termine  │ Durum   │
├────────┼─────────┼─────────┼─────────────────────────────────────────┼─────────┼─────────┼─────────┤
│05/12/25│ ABC Ltd │ ProjXYZ │ 📄 Versiyonlar senkron değil,          │ ₺25,000 │ -5 gün  │Üretimde │
│        │         │         │    Detaylara Bakınız!                   │         │         │         │
└────────┴─────────┴─────────┴─────────────────────────────────────────┴─────────┴─────────┴─────────┘
                              ↑
                              Gri arka plan (#f9fafb), italik, tıklanabilir
                              Lucide FileText ikonu (14px)
                              Tıklayınca QuoteDetailsPanel açılır
```

### CSS Yapısı (position: sticky)

```css
/* quotes.css - Freeze kolon stilleri */

/* Tablo Container */
.quotes-table-wrapper {
  position: relative;
  overflow-x: auto;
  max-width: 100%;
}

.quotes-table-scroll-container {
  display: flex;
  width: 100%;
}

/* Freeze Sol */
.quotes-table-freeze-left {
  position: sticky;
/* Freeze Sol - position: sticky */
.quotes-table th.freeze-left,
.quotes-table td.freeze-left {
  position: sticky;
  left: 0;
  z-index: 2;
  background: #fff;
}

/* İlk 3 kolon için left offset hesaplama */
.quotes-table th.freeze-left-0,
.quotes-table td.freeze-left-0 { left: 0; }

.quotes-table th.freeze-left-1,
.quotes-table td.freeze-left-1 { left: 140px; } /* date width */

.quotes-table th.freeze-left-2,
.quotes-table td.freeze-left-2 { left: 290px; } /* date + company width */

/* Freeze Sağ - position: sticky */
.quotes-table th.freeze-right,
.quotes-table td.freeze-right {
  position: sticky;
  right: 0;
  z-index: 2;
  background: #fff;
}

/* Son 3 kolon için right offset hesaplama */
.quotes-table th.freeze-right-0,
.quotes-table td.freeze-right-0 { right: 210px; } /* status + delivery width */

.quotes-table th.freeze-right-1,
.quotes-table td.freeze-right-1 { right: 100px; } /* status width */

.quotes-table th.freeze-right-2,
.quotes-table td.freeze-right-2 { right: 0; }

/* Freeze kolonları için gölge efekti */
.quotes-table td.freeze-left:last-of-type {
  box-shadow: 2px 0 4px rgba(0,0,0,0.05);
}

.quotes-table td.freeze-right:first-of-type {
  box-shadow: -2px 0 4px rgba(0,0,0,0.05);
}

/* canEdit=false durumunda dinamik alanlar */
.quotes-table-locked-cell {
  background: #f9fafb;
  color: #6b7280;
  font-style: italic;
  text-align: center;
  cursor: pointer;
}

.quotes-table-locked-cell:hover {
  background: #f3f4f6;
}
```

### Tablo Render Yapısı (QuotesManager.js)

```javascript
// Dinamik alanlar için canEdit kontrolü
function renderDynamicCells(quote, dynamicColumns, canEdit, handleRowClick) {
  if (!canEdit && dynamicColumns.length > 0) {
    // Versiyon uyumsuz - tek hücrede uyarı mesajı
    return [
      React.createElement('td', {
        key: 'locked-cell',
        className: 'quotes-table-locked-cell',
        colSpan: dynamicColumns.length,
        onClick: () => handleRowClick(quote)
      },
        React.createElement(FileText, { size: 14, style: { marginRight: 6, verticalAlign: 'middle' } }),
        'Versiyonlar senkron değil, Detaylara Bakınız!'
      )
    ];
  }
  
  // Normal görünüm - her dinamik kolon için ayrı hücre
  return dynamicColumns.map(col => 
    React.createElement('td', { key: col.id },
      formatFieldValue(getFieldValue(quote, col.id, formConfig), col, quote, context)
    )
  );
}
```

### Implementation Checklist

#### 1. CSS Güncellemesi (quotes.css)
- [x] `.freeze-left`, `.freeze-left-0/1/2` classları ekle
- [x] `.freeze-right`, `.freeze-right-0/1/2` classları ekle  
- [x] `.quotes-table-locked-cell` classı ekle
- [x] Gölge efektleri (box-shadow) ekle

#### 2. QuotesManager.js Güncellemesi
- [x] `import { FileText } from 'lucide'` ekle
- [x] `activeFormChanged` event listener ekle
- [x] Header render'da freeze class'ları ekle
- [x] formConfig reload on form change

#### 3. table-utils.js Güncellemesi
- [x] FFOC mismatch handling: Eşleşmeyen option kodları için boş string döndür
- [x] formConfig parametresi ile option label lookup

#### 4. FormManager.jsx Güncellemesi  
- [x] `activeFormChanged` event dispatch (2 yerde)

#### 5. formFields.js Model Güncellemesi
- [x] `showInTable = true` default değer

### Dosyalar
- `domains/crm/styles/quotes.css` (GÜNCELLEME) ✅
- `domains/crm/components/quotes/QuotesManager.js` (GÜNCELLEME) ✅
- `domains/crm/utils/table-utils.js` (GÜNCELLEME) ✅
- `domains/crm/components/forms/FormManager.jsx` (GÜNCELLEME) ✅
- `db/models/formFields.js` (GÜNCELLEME) ✅

### ✅ Test Sonuçları (2025-12-07)

**Test Ortamı:** Local Server + PostgreSQL

#### 1. Backend API Testleri ✅
```
✅ 14 farklı quote oluşturuldu
✅ SQL Injection: Bobby Tables kaydedildi, DB sağlam
✅ XSS: <script> tagları kaydedildi (frontend sanitize etmeli)
✅ Unicode/Emoji: 🎉🔥💥🚀 düzgün kaydedildi
✅ Türkçe Karakterler: İĞÜŞÇÖ ığüşçö düzgün kaydedildi
✅ projectName Güncelleme: Çalışıyor
✅ Status Workflow: new → approved çalışıyor
✅ Display Toggle: showInTable true/false toggle çalışıyor
✅ FFOC Mismatch: FFOC-99999 kaydedildi (tabloda boş görünecek)
```

#### 2. Event Sistemi Testleri ✅
```
✅ activeFormChanged event dispatch: FormManager'da 2 yerde tetikleniyor
✅ activeFormChanged event listener: QuotesManager'da dinleniyor
✅ formConfig reload: Event sonrası yeniden yükleniyor
```

#### 3. Display Fields API Testleri ✅
```
✅ PUT /api/form-fields/:id/display: showInTable toggle çalışıyor
✅ GET /api/form-templates/:id/display-fields: tableFields doğru dönüyor
✅ showInTable: false → tableFields: 2
✅ showInTable: true → tableFields: 3
```

#### 4. FFOC Mismatch Handling ✅
```
✅ Quote formData: FFOC-99999 (var olmayan kod)
✅ Aktif form options: FFOC-10172, FFOC-10173, FFOC-10174, FFOC-10175
✅ getFieldValue(): Eşleşmeyen FFOC için boş string döndürüyor
✅ Kullanıcı "Form Güncelle" ile yeni versiyona geçmeli
```

**Sonuç:** QT-5 implementasyonu tamamlandı. ✅

---

## 🔧 PROMPT-QT6: Frontend - Dinamik Filtre Sistemi

### Hedef
Form alanlarından `showInFilter: true` olanların FilterPopup'ta gösterilmesi.

### Filtre Tipleri

| Field Type | Filter UI | Açıklama |
|------------|-----------|----------|
| `select`, `radio` | Multi-select Dropdown | Seçeneklerden çoklu seçim |
| `number` | Min-Max Range Input | Sayı aralığı |
| `text`, `textarea` | Contains Search | Metin içerir araması |
| `date` | Date Range Picker | Tarih aralığı |
| `checkbox` | Toggle (Evet/Hayır/Tümü) | Boolean filtre |

### filter-utils.js Güncellemesi

```javascript
export function getFilterOptions(list, formConfig) {
  const options = {
    status: [...new Set(list.map(q => q.status))],
    // Dinamik filtre seçenekleri
    dynamicFilters: []
  };
  
  const fields = formConfig?.fields || formConfig?.formStructure?.fields || [];
  
  fields
    .filter(field => field.display?.showInFilter === true)
    .sort((a, b) => (a.display?.filterOrder || 0) - (b.display?.filterOrder || 0))
    .forEach(field => {
      const filterDef = {
        id: field.fieldCode || field.id,
        label: field.fieldName || field.label,
        type: field.fieldType || field.type,
        options: field.options || []
      };
      
      // select/radio için mevcut değerleri topla
      if (['select', 'radio'].includes(filterDef.type)) {
        const uniqueValues = new Set();
        list.forEach(quote => {
          const value = quote.formData?.[filterDef.id];
          if (value) uniqueValues.add(value);
        });
        filterDef.availableValues = [...uniqueValues];
      }
      
      options.dynamicFilters.push(filterDef);
    });
  
  return options;
}

export function createFilteredList(list, filters, globalSearch, formConfig) {
  let result = [...list];
  
  // Mevcut sabit filtreler
  if (filters.status?.length > 0) {
    result = result.filter(q => filters.status.includes(q.status));
  }
  
  // Dinamik filtreler
  if (filters.dynamicFilters) {
    Object.entries(filters.dynamicFilters).forEach(([fieldId, filterValue]) => {
      if (!filterValue || (Array.isArray(filterValue) && filterValue.length === 0)) return;
      
      result = result.filter(quote => {
        const value = quote.formData?.[fieldId];
        
        // Multi-select filtre
        if (Array.isArray(filterValue)) {
          return filterValue.includes(value);
        }
        
        // Range filtre
        if (filterValue.min !== undefined || filterValue.max !== undefined) {
          const numValue = parseFloat(value) || 0;
          if (filterValue.min !== undefined && numValue < filterValue.min) return false;
          if (filterValue.max !== undefined && numValue > filterValue.max) return false;
          return true;
        }
        
        // Contains filtre
        if (typeof filterValue === 'string') {
          return (value || '').toLowerCase().includes(filterValue.toLowerCase());
        }
        
        return true;
      });
    });
  }
  
  // Global arama
  if (globalSearch?.trim()) {
    const search = globalSearch.toLowerCase();
    result = result.filter(quote => {
      // Sabit alanlar
      if ((quote.customerCompany || '').toLowerCase().includes(search)) return true;
      if ((quote.projectName || '').toLowerCase().includes(search)) return true;
      
      // Dinamik alanlar
      const formData = quote.formData || {};
      return Object.values(formData).some(val => 
        (val || '').toString().toLowerCase().includes(search)
      );
    });
  }
  
  return result;
}
```

### Dosyalar
- `domains/crm/utils/filter-utils.js` (GÜNCELLEME)
- `src/components/modals/FilterPopup.js` (GÜNCELLEME)

---

## 🔧 PROMPT-QT7: Event Dispatch Sistemi

### Hedef
FormManager'da display ayarı değiştiğinde QuotesManager'ın anında güncellenmesi.

### Event Tanımı

```javascript
// Event adı: formDisplaySettingsChanged
// Payload: { templateId, fieldId, changes }

// FormManager.jsx - Display değişikliğinde
async function handleDisplayChange(fieldId, changes) {
  try {
    await formsApi.updateFieldDisplay(fieldId, changes);
    
    // Event dispatch - QuotesManager dinleyecek
    window.dispatchEvent(new CustomEvent('formDisplaySettingsChanged', {
      detail: {
        templateId: currentTemplateId,
        fieldId,
        changes
      }
    }));
    
    showToast('Görüntüleme ayarları güncellendi', 'success');
  } catch (error) {
    showToast('Güncelleme hatası: ' + error.message, 'error');
  }
}
```

### QuotesManager Listener

```javascript
// QuotesManager.js - useEffect içinde
useEffect(() => {
  function handleDisplayChange(event) {
    console.log('📊 Form display settings changed:', event.detail);
    loadFormConfig(); // formConfig'i yeniden yükle
  }
  
  window.addEventListener('formDisplaySettingsChanged', handleDisplayChange);
  
  return () => {
    window.removeEventListener('formDisplaySettingsChanged', handleDisplayChange);
  };
}, []);
```

### Dosyalar
- `domains/crm/components/forms/FormManager.jsx` (GÜNCELLEME)
- `domains/crm/components/quotes/QuotesManager.js` (GÜNCELLEME)

---

## 🔧 PROMPT-QT8: Test & Doğrulama

### Test Senaryoları

#### 1. Proje Adı Testleri
- [ ] Yeni teklif oluştururken proje adı zorunlu
- [ ] Proje adı tabloda doğru gösteriliyor
- [ ] Proje adı detay panelinde düzenlenebiliyor
- [ ] Mevcut tekliflerde "oldStructure" yazıyor

#### 2. Dinamik Kolon Testleri
- [ ] `showInTable: true` olan alanlar tabloda görünüyor
- [ ] `showInTable: false` olan alanlar tabloda görünmüyor
- [ ] Kolonlar `tableOrder` sırasına göre diziliyor
- [ ] Dinamik kolonlar yatay scroll ile görüntülenebiliyor

#### 3. Freeze Kolon Testleri
- [ ] Sol kolonlar (Tarih, Şirket, Proje) scroll sırasında sabit
- [ ] Sağ kolonlar (Fiyat, Termine, Durum) scroll sırasında sabit
- [ ] Gölgelendirme doğru görünüyor

#### 4. Filtre Testleri
- [ ] `showInFilter: true` alanlar FilterPopup'ta görünüyor
- [ ] Select/Radio için multi-select çalışıyor
- [ ] Number için min-max çalışıyor
- [ ] Text için contains araması çalışıyor

#### 5. Event Dispatch Testleri
- [ ] FormManager'da display değişikliği → QuotesManager güncelleniyor
- [ ] Sayfa yenilemeden kolonlar değişiyor
- [ ] Hata durumunda uygun mesaj gösteriliyor

#### 6. canEdit=false Senaryosu
- [ ] Üretim başlamış teklifte dinamik alanlar yerine "Detaylara bakınız"
- [ ] Lucide FileText ikonu gösteriliyor
- [ ] Tıklama ile detay paneli açılıyor

---

## 📁 Etkilenen Dosyalar Özeti

### Database / Backend
| Dosya | İşlem |
|-------|-------|
| `db/migrations/028_quote_table_display.sql` | YENİ |
| `db/models/formFields.js` | GÜNCELLEME |
| `db/models/quotes.js` | GÜNCELLEME |
| `server/routes/formRoutes.js` | GÜNCELLEME |
| `server/routes/quotesRoutes.js` | GÜNCELLEME |

### Frontend
| Dosya | İşlem |
|-------|-------|
| `domains/crm/components/quotes/QuotesManager.js` | GÜNCELLEME |
| `domains/crm/components/quotes/QuoteCustomerStep.jsx` | GÜNCELLEME |
| `domains/crm/components/quotes/AddQuoteModal.jsx` | GÜNCELLEME |
| `domains/crm/components/quotes/QuoteDetailsPanel.jsx` | GÜNCELLEME |
| `domains/crm/components/quotes/QuoteReviewStep.jsx` | GÜNCELLEME |
| `domains/crm/components/forms/FormManager.jsx` | GÜNCELLEME |
| `domains/crm/utils/table-utils.js` | GÜNCELLEME |
| `domains/crm/utils/filter-utils.js` | GÜNCELLEME |
| `domains/crm/utils/quote-validation.js` | GÜNCELLEME |
| `domains/crm/styles/quotes.css` | GÜNCELLEME |
| `src/components/modals/FilterPopup.js` | GÜNCELLEME |
| `domains/crm/services/forms-service.js` | GÜNCELLEME |

---

## 🚨 Dikkat Edilmesi Gerekenler

### 1. Versiyon Kontrolü (KRİTİK)
- **Display ayarları değiştiğinde form versiyonu DEĞİŞMEZ**
- Sadece alan ekleme/silme/tip değişikliği/seçenek değişikliği versiyonu artırır
- `showInTable`, `showInFilter`, `tableOrder`, `filterOrder` değişiklikleri versiyon artırmaz

### 2. Migration Sırası
- QT-1 migration'ı production'a deploy edilmeden QT-2+ başlamamalı
- Migration başarısız olursa rollback planı hazır olmalı

### 3. Geriye Uyumluluk
- ~~Mevcut teklifler `projectName: 'oldStructure'` ile işaretlenecek~~ → **Test verileri silinecek**
- ~~UI'da "oldStructure" gösterilmemeli, bunun yerine "-" veya boş bırakılmalı~~ → **Gerek kalmadı**
- Mevcut form_fields kayıtlarında `showInTable: false`, `showInFilter: false` default

### 4. Performans
- Dinamik kolon sayısı >10 olursa virtualization düşünülmeli
- formConfig her event'te yeniden yüklenecek - cache stratejisi gerekebilir

### 5. QuotesManager.js Özel Durumlar
- Bu dosya React.createElement kullanıyor (JSX değil)
- 1829 satır - dikkatli edit gerekli
- `loadFormConfig()` fonksiyonu mevcut, sadece event listener eklenecek

### 6. Naming Convention
- Database kolonları: camelCase (`showInTable`, `projectName`)
- API response: camelCase
- Tabloda snake_case kullanılmamalı

### 7. Tab Senkronizasyonu
- FormManager tab'ında display değişikliği yapılınca event dispatch
- QuotesManager bu event'i dinleyip formConfig'i yeniden yükleyecek
- Aynı sayfada oldukları için gerçek zamanlı güncelleme mümkün

---

## 🔄 Bağımlılık Diyagramı

```
                    ┌─────────────┐
                    │   QT-1      │
                    │  Migration  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   QT-2      │
                    │ Backend API │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
   │   QT-3      │  │ PRE-QT4-1   │  │   QT-7      │
   │ projectName │  │proj→projName│  │Event Dispatch│
   └─────────────┘  └──────┬──────┘  └─────────────┘
                           │
                    ┌──────▼──────┐
                    │ PRE-QT4-2   │
                    │ Kolon Kaldır│
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ PRE-QT4-3   │
                    │width/freeze │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   QT-4      │
                    │ Dinamik Col │
                    └──────┬──────┘
                           │
                    ┌──────┴──────┐
                    │             │
             ┌──────▼──────┐ ┌────▼────┐
             │   QT-5      │ │  QT-6   │
             │Freeze+Scroll│ │ Filters │
             └─────────────┘ └─────────┘
                    │             │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   QT-8      │
                    │   Test      │
                    └─────────────┘
```

---

## 📝 Önemli API Endpoint'leri (Referans)

### Mevcut Endpoint'ler
| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/api/quotes` | Tüm teklifler |
| POST | `/api/quotes` | Yeni teklif oluştur |
| PUT | `/api/quotes/:id` | Teklif güncelle |
| GET | `/api/form-templates/active` | Aktif form template |
| GET | `/api/form-templates/:id` | Belirli template |

### Eklenecek Endpoint'ler
| Method | Endpoint | Açıklama |
|--------|----------|----------|
| PUT | `/api/form-fields/:id/display` | Display ayarlarını güncelle |
| GET | `/api/form-templates/:id/display-fields` | Table/Filter alanlarını getir |

---

## 📅 Tahmini Süre

| Prompt | Tahmini Süre | Zorluk |
|--------|--------------|--------|
| QT-1 | 1 saat | 🟢 Kolay |
| QT-2 | 2 saat | 🟡 Orta |
| QT-3 | 2 saat | 🟡 Orta |
| **PRE-QT4-1** | 15 dk | 🟢 Kolay |
| **PRE-QT4-2** | 15 dk | 🟢 Kolay |
| **PRE-QT4-3** | 15 dk | 🟢 Kolay |
| QT-4 | 2 saat | 🟡 Orta |
| QT-5 | 2 saat | 🔴 Zor |
| QT-6 | 2 saat | 🟡 Orta |
| QT-7 | 1 saat | 🟢 Kolay |
| QT-8 | 2 saat | 🟡 Orta |
| **TOPLAM** | **~15 saat** | |

---

## 📚 İlgili Dokümantasyon

- [FormPrice-Refactoring.md](./FormPrice-Refactoring.md) - Form ve fiyatlandırma entegrasyonu
- [CRM-NEWFLOW.md](./CRM-NEWFLOW.md) - CRM akış dokümantasyonu
- [LOT-TRACKING-SYSTEM-ANALYSIS.md](../Lot-Tracking-Documentation/LOT-TRACKING-SYSTEM-ANALYSIS.md) - Lot takip sistemi

---

*Son Güncelleme: 7 Aralık 2025*
*Hazırlayan: Claude (Copilot)*
