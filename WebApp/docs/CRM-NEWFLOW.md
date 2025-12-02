# CRM New Flow - Quote System Refactor

> **Tarih**: 2 Aralık 2025  
> **Branch**: crm  
> **Amaç**: Quote sisteminin yeniden yapılandırılması, müşteri entegrasyonu ve iş emri akışının optimize edilmesi

---

## 🚀 HIZLI BAŞVURU

| Prompt | Konu | Dosyalar |
|--------|------|----------|
| PROMPT-1 | DB Güncellemeleri | `customers.js`, `workOrders.js`, `quotes.js`, SQL migration |
| PROMPT-2 | Backend API | `quoteController.js`, `customerController.js`, `quoteService.js` |
| PROMPT-3 | AddQuoteModal & Steps | `AddQuoteModal.jsx`, `QuoteCustomerStep.jsx`, `CustomerSearchInput.jsx` |
| PROMPT-4 | QuoteFormStep | `QuoteFormStep.jsx`, `quote-validation.js` |
| PROMPT-5 | QuoteReviewStep | `QuoteReviewStep.jsx`, `quotes-service.js`, `QuotesManager.js` |
| PROMPT-6 | Edit Lock | `QuoteDetailsPanel.jsx`, `QuoteEditLockBanner.jsx` |
| PROMPT-7 | Customer Modals | `AddCustomerModal.jsx`, `CustomerDetailsPanel.jsx` |
| PROMPT-8 | WO Detayları | `approvedQuotes.js`, `approvedQuoteService.js` |
| PROMPT-9 | Cleanup | Eski kodların temizliği |
| PROMPT-10 | E2E Test | Tüm akışın testi |

### Yeni Customer Alanları (9 adet)
`website`, `fax`, `iban`, `bankName`, `contactPerson`, `contactTitle`, `country`, `city`, `postalCode`

### Quote Oluşturma 3 Tip Müşteri
1. **Existing**: Autocomplete ile seç, readonly
2. **New**: Bilgileri gir, DB'ye kaydet, quote'a bağla
3. **Without**: Bilgileri gir, sadece quote'ta sakla (customerId=null)

### Edit Lock Kuralları
- WO yok → Düzenleme serbest
- WO var, launch yok → Düzenleme + uyarı
- WO var, launch edilmiş → Düzenleme engelli

---

## 📋 İÇİNDEKİLER

1. [Genel Bakış](#1-genel-bakış)
2. [Mevcut Yapı Analizi](#2-mevcut-yapı-analizi)
3. [Hedef Yapı](#3-hedef-yapı)
4. [Veritabanı Değişiklikleri](#4-veritabanı-değişiklikleri)
5. [Frontend Değişiklikleri](#5-frontend-değişiklikleri)
6. [Backend Değişiklikleri](#6-backend-değişiklikleri)
7. [Work Order Entegrasyonu](#7-work-order-entegrasyonu)
8. [Test Kriterleri](#8-test-kriterleri)
9. [Kaldırılacak/Düzenlenecek Yapılar](#9-kaldırılacakdüzenlenecek-yapılar)

---

## 1. GENEL BAKIŞ

### 1.1 Akış Özeti

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              QUOTE OLUŞTURMA AKIŞI                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌─────────────┐    ┌──────────────────┐    ┌───────────┐  │
│  │ Add New  │───▶│  STEP 1:    │───▶│     STEP 2:      │───▶│  STEP 3:  │  │
│  │  Quote   │    │  Customer   │    │    Form Data     │    │  Review   │  │
│  │ (Button) │    │  Selection  │    │  (Dynamic Form)  │    │ & Submit  │  │
│  └──────────┘    └─────────────┘    └──────────────────┘    └───────────┘  │
│                         │                                          │        │
│                         ▼                                          ▼        │
│              ┌─────────────────────┐                    ┌──────────────────┐│
│              │ ○ Existing Customer │                    │   Quote Created  ││
│              │ ○ New Customer      │                    │   (status: new)  ││
│              │ ○ Without Customer  │                    └──────────────────┘│
│              └─────────────────────┘                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              QUOTE APPROVAL AKIŞI                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌─────────────┐    ┌──────────────────┐    ┌───────────┐  │
│  │  Quote   │───▶│   Review    │───▶│     Approve      │───▶│ Work Order│  │
│  │ (status: │    │   & Edit    │    │     Quote        │    │  Created  │  │
│  │   new)   │    │             │    │                  │    │ (WO-XXX)  │  │
│  └──────────┘    └─────────────┘    └──────────────────┘    └───────────┘  │
│                                                                             │
│  ⚠️ Onaylanmış Quote Düzenleme:                                             │
│     - WO launch edilmemişse → Düzenleme yapılabilir (uyarı gösterilir)      │
│     - WO launch edilmişse → Düzenleme engellenir                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Temel Kararlar

| Karar | Açıklama |
|-------|----------|
| **Form Template** | Tek aktif form template kullanılır (`isActive=true`) |
| **Customer Selection** | 3 seçenek: Existing, New, Without Customer |
| **Default Fields** | Customer fields form'un en başında, Step 1 olarak |
| **WO Data** | Sadece `quoteId` ve `customerId` gider, detaylar fetch edilir |
| **Edit Lock** | WO launch edildiyse quote düzenlenemez |

---

## 2. MEVCUT YAPI ANALİZİ

### 2.1 Veritabanı Tabloları

#### quotes.customers (Mevcut)
```sql
id, name, email, phone, company,
taxOffice, taxNumber, address, notes,
isActive, createdAt, updatedAt
```

#### quotes.quotes (Mevcut)
```sql
id, customerName, customerEmail, customerPhone, customerCompany, customerAddress,
deliveryDate, formTemplateId, priceFormulaId, formTemplateVersion, priceFormulaVersion,
status, notes, calculatedPrice, finalPrice, manualPrice, priceStatus,
workOrderCode, isCustomer, customerId,
createdBy, createdAt, updatedAt, approvedAt, approvedBy
```

#### mes.work_orders (Mevcut)
```sql
id, code, quoteId, status, productionState,
productionStateUpdatedAt, productionStateUpdatedBy, productionStateHistory,
data (JSON - çok fazla veri), createdAt, updatedAt
```

### 2.2 Sorunlar

1. **Customer tablosu eksik alanlar**: website, fax, iban gibi sektör standart alanları yok
2. **WO'ya giden data fazla**: `data` JSON'ında gereksiz bilgiler var
3. **Quote edit kontrolü yok**: WO launch edilse bile quote düzenlenebiliyor
4. **Form step yapısı yok**: Customer selection ve form data tek ekranda

---

## 3. HEDEF YAPI

### 3.1 Quote Oluşturma Modal - Step Yapısı

```
┌─────────────────────────────────────────────────────────────────┐
│  Yeni Teklif Oluştur                                     [X]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐                       │
│  │ Step 1  │──▶│ Step 2  │──▶│ Step 3  │                       │
│  │Customer │   │Form Data│   │ Review  │                       │
│  └─────────┘   └─────────┘   └─────────┘                       │
│                                                                 │
│  ═══════════════════════════════════════════════════════════   │
│                                                                 │
│  STEP 1: MÜŞTERİ SEÇİMİ                                        │
│  ─────────────────────────────────────────────────────────     │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ○ Mevcut Müşteri Seç                                     │  │
│  │   [Müşteri Ara...                              🔍]       │  │
│  │                                                          │  │
│  │ ○ Yeni Müşteri Ekle                                      │  │
│  │   → Müşteri bilgilerini doldur ve kaydet                 │  │
│  │                                                          │  │
│  │ ○ Müşterisiz Devam Et                                    │  │
│  │   → Sadece teklif için geçici bilgiler gir               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 👤 MÜŞTERİ BİLGİLERİ                                     │  │
│  │ ─────────────────────────────────────────────────────    │  │
│  │ Ad Soyad*:     [________________________]                │  │
│  │ Şirket:        [________________________]                │  │
│  │ E-posta:       [________________________]                │  │
│  │ Telefon:       [________________________]                │  │
│  │ Adres:         [________________________]                │  │
│  │ Vergi Dairesi: [________________________]                │  │
│  │ Vergi No:      [________________________]                │  │
│  │ Website:       [________________________]                │  │
│  │ Fax:           [________________________]                │  │
│  │ IBAN:          [________________________]                │  │
│  │                                                          │  │
│  │ 📅 TESLİM TARİHİ                                         │  │
│  │ Teslim Tarihi: [____/____/________] 📅                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│                                        [İptal]  [Sonraki ▶]    │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Customer Selection Davranışları

| Seçim | Davranış |
|-------|----------|
| **Existing Customer** | Autocomplete ile müşteri seçilir, bilgiler otomatik doldurulur (readonly) |
| **New Customer** | Boş form gösterilir, submit'te önce customer DB'ye kaydedilir |
| **Without Customer** | Boş form gösterilir, bilgiler sadece quote içinde saklanır |

### 3.3 Quote Detail Panel - Edit Lock

```
┌─────────────────────────────────────────────────────────────────┐
│  TKF-20251202-0001                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ⚠️ UYARI: Bu teklif için iş emri (WO-001) oluşturulmuş.       │
│     Üretim başlatılmadığı için düzenleme yapabilirsiniz.        │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  🚫 UYARI: Bu teklif için üretim başlatılmış (WO-001).         │
│     Düzenleme yapılamaz.                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. VERİTABANI DEĞİŞİKLİKLERİ

### 4.1 quotes.customers - Yeni Alanlar

```sql
-- Eklenecek sütunlar
ALTER TABLE quotes.customers
ADD COLUMN IF NOT EXISTS website VARCHAR(255),
ADD COLUMN IF NOT EXISTS fax VARCHAR(50),
ADD COLUMN IF NOT EXISTS iban VARCHAR(50),
ADD COLUMN IF NOT EXISTS bankName VARCHAR(255),
ADD COLUMN IF NOT EXISTS contactPerson VARCHAR(255),
ADD COLUMN IF NOT EXISTS contactTitle VARCHAR(100),
ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'Türkiye',
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS postalCode VARCHAR(20);
```

### 4.2 mes.work_orders - Data Simplification

**Mevcut data JSON:**
```json
{
  "customer": "...",
  "company": "...",
  "email": "...",
  "phone": "...",
  "deliveryDate": "...",
  "price": "...",
  "formData": { ... },
  "quoteSnapshot": { ... }  // ← Tüm quote verisi kopyalanıyor
}
```

**Yeni data JSON:**
```json
{
  "quoteId": "TKF-20251202-0001",
  "customerId": 123  // null olabilir (müşterisiz quote)
}
```

### 4.3 Migration Dosyası

> **NOT**: Mevcut sistemde `db/migrations/` klasörü yok. Migration dosyası oluşturmak için önce klasörü oluşturmalısınız veya manuel SQL komutu çalıştırmalısınız.

**Seçenek 1: Manuel SQL (psql ile)**
```sql
-- Migration: 024_crm_newflow_updates.sql

-- 1. Customers tablosuna yeni alanlar
ALTER TABLE quotes.customers
ADD COLUMN IF NOT EXISTS website VARCHAR(255),
ADD COLUMN IF NOT EXISTS fax VARCHAR(50),
ADD COLUMN IF NOT EXISTS iban VARCHAR(50),
ADD COLUMN IF NOT EXISTS "bankName" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "contactPerson" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "contactTitle" VARCHAR(100),
ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'Türkiye',
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS "postalCode" VARCHAR(20);

-- 2. Index'ler
CREATE INDEX IF NOT EXISTS idx_customers_city ON quotes.customers(city);
CREATE INDEX IF NOT EXISTS idx_customers_country ON quotes.customers(country);

-- 3. Work orders için productionLaunched flag (edit lock için)
ALTER TABLE mes.work_orders
ADD COLUMN IF NOT EXISTS "productionLaunched" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "productionLaunchedAt" TIMESTAMP;
```

**Seçenek 2: Knex Migration Dosyası**
Eğer knex migration kullanmak isterseniz, önce `db/migrations/` klasörünü oluşturun ve aşağıdaki dosyayı ekleyin:

```javascript
// db/migrations/024_crm_newflow_updates.js
exports.up = async function(knex) {
  // 1. Customers tablosuna yeni alanlar
  await knex.schema.alterTable('quotes.customers', (table) => {
    table.string('website', 255);
    table.string('fax', 50);
    table.string('iban', 50);
    table.string('bankName', 255);
    table.string('contactPerson', 255);
    table.string('contactTitle', 100);
    table.string('country', 100).defaultTo('Türkiye');
    table.string('city', 100);
    table.string('postalCode', 20);
  });

  // 2. Index'ler
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_customers_city ON quotes.customers(city)');
  await knex.schema.raw('CREATE INDEX IF NOT EXISTS idx_customers_country ON quotes.customers(country)');

  // 3. Work orders için productionLaunched flag
  await knex.schema.alterTable('mes.work_orders', (table) => {
    table.boolean('productionLaunched').defaultTo(false);
    table.timestamp('productionLaunchedAt');
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('quotes.customers', (table) => {
    table.dropColumn('website');
    table.dropColumn('fax');
    table.dropColumn('iban');
    table.dropColumn('bankName');
    table.dropColumn('contactPerson');
    table.dropColumn('contactTitle');
    table.dropColumn('country');
    table.dropColumn('city');
    table.dropColumn('postalCode');
  });

  await knex.schema.alterTable('mes.work_orders', (table) => {
    table.dropColumn('productionLaunched');
    table.dropColumn('productionLaunchedAt');
  });
};
```

---

## 5. FRONTEND DEĞİŞİKLİKLERİ

### 5.1 Yeni/Güncellenecek Dosyalar

```
domains/crm/
├── components/
│   ├── quotes/
│   │   ├── AddQuoteModal.jsx          ← GÜNCELLE (Step-based modal)
│   │   ├── QuoteCustomerStep.jsx      ← YENİ (Step 1)
│   │   ├── QuoteFormStep.jsx          ← YENİ (Step 2)
│   │   ├── QuoteReviewStep.jsx        ← YENİ (Step 3)
│   │   ├── QuoteEditLockBanner.jsx    ← YENİ (WO lock uyarısı)
│   │   ├── CustomerSearchInput.jsx    ← YENİ (Autocomplete)
│   │   ├── QuotesManager.js           ← GÜNCELLE
│   │   ├── QuoteDetailsPanel.jsx      ← GÜNCELLE
│   │   ├── QuoteFormCompact.js        ← KALDIR (artık kullanılmıyor)
│   │   └── QuotesTabs.jsx             ← MEVCUT (değişiklik gerekmez)
│   └── customers/
│       ├── AddCustomerModal.jsx       ← GÜNCELLE (yeni alanlar)
│       ├── CustomerDetailsPanel.jsx   ← GÜNCELLE (yeni alanlar)
│       └── CustomersManager.jsx       ← MEVCUT (değişiklik gerekmez)
├── api/
│   ├── controllers/
│   │   ├── quoteController.js         ← GÜNCELLE (edit-status endpoint)
│   │   └── customerController.js      ← GÜNCELLE (yeni alanlar)
│   └── services/
│       ├── quoteService.js            ← GÜNCELLE (createQuoteWithCustomer)
│       └── customerService.js         ← GÜNCELLE (yeni alanlar)
├── services/
│   └── quotes-service.js              ← GÜNCELLE (frontend service)
├── styles/
│   └── quotes.css                     ← GÜNCELLE (step styles)
└── utils/
    └── quote-validation.js            ← YENİ
```

### 5.2 Component Hiyerarşisi

```
QuotesManager
├── AddQuoteModal (isOpen, onClose, onSave)
│   ├── StepIndicator (currentStep, steps)
│   ├── QuoteCustomerStep (step === 1)
│   │   ├── CustomerTypeSelector (existing/new/without)
│   │   ├── CustomerSearchInput (type === 'existing')
│   │   ├── CustomerForm (type === 'new' || 'without')
│   │   └── DeliveryDatePicker
│   ├── QuoteFormStep (step === 2)
│   │   └── DynamicFormRenderer (active template fields)
│   └── QuoteReviewStep (step === 3)
│       ├── CustomerSummary
│       ├── FormDataSummary
│       └── PriceSummary
├── QuotesTable
└── QuoteDetailsPanel
    ├── QuoteEditLockBanner (hasWorkOrder)
    ├── CustomerSection
    ├── FormDataSection
    └── ActionsSection
```

### 5.3 CSS Sınıfları

```css
/* Step Modal */
.quote-modal-step { }
.quote-step-indicator { }
.quote-step-item { }
.quote-step-item.active { }
.quote-step-item.completed { }
.quote-step-content { }
.quote-step-actions { }

/* Customer Selection */
.customer-type-selector { }
.customer-type-option { }
.customer-type-option.selected { }
.customer-search-input { }
.customer-search-dropdown { }
.customer-search-item { }

/* Customer Form */
.customer-form-grid { }
.customer-form-section { }
.customer-form-field { }
.customer-form-field.readonly { }

/* Edit Lock Banner */
.quote-edit-lock-banner { }
.quote-edit-lock-banner.warning { }
.quote-edit-lock-banner.error { }

/* Review Step */
.quote-review-section { }
.quote-review-item { }
.quote-review-label { }
.quote-review-value { }
```

---

## 6. BACKEND DEĞİŞİKLİKLERİ

### 6.0 Mevcut API Yapısı

```
domains/crm/api/
├── controllers/
│   ├── customerController.js    ← /api/customers endpoints
│   ├── formController.js        ← /api/forms endpoints
│   ├── priceController.js       ← /api/pricing endpoints
│   └── quoteController.js       ← /api/quotes endpoints
├── services/
│   ├── customerService.js
│   ├── formService.js
│   ├── priceService.js
│   └── quoteService.js
├── routes.js                    ← CRM routes setup
└── sql/                         ← SQL dosyaları
```

**Mevcut Endpoints:**
- `GET /api/customers` - Tüm müşteriler
- `GET /api/customers/search?q=...` - Autocomplete (VAR)
- `POST /api/customers` - Yeni müşteri
- `PATCH /api/customers/:id` - Müşteri güncelle
- `GET /api/quotes` - Tüm teklifler
- `POST /api/quotes` - Yeni teklif
- `PATCH /api/quotes/:id` - Teklif güncelle
- `PATCH /api/quotes/:id/status` - Durum değiştir

### 6.1 API Endpoints

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| `POST` | `/api/quotes` | Quote oluştur (yeni akış) |
| `PUT` | `/api/quotes/:id` | Quote güncelle (lock kontrolü) |
| `GET` | `/api/quotes/:id/edit-status` | Edit lock durumunu kontrol et |
| `GET` | `/api/customers/search` | Customer autocomplete |
| `POST` | `/api/customers` | Yeni customer ekle |

### 6.2 Quote Create Endpoint - Yeni Payload

```javascript
// POST /api/quotes
{
  // Customer Info
  customerType: 'existing' | 'new' | 'without',
  customerId: 123,           // type=existing ise
  customerData: {            // type=new veya without ise
    name: "...",
    email: "...",
    phone: "...",
    company: "...",
    // ... diğer alanlar
  },
  
  // Delivery
  deliveryDate: "2025-12-15",
  
  // Form Data
  formData: {
    // Dynamic form fields
  },
  
  // Notes
  notes: "..."
}
```

### 6.3 Edit Lock Kontrolü

```javascript
// GET /api/quotes/:id/edit-status
{
  canEdit: true | false,
  reason: null | 'wo_launched' | 'wo_completed',
  workOrderCode: 'WO-001',
  productionState: 'pending' | 'in_progress' | 'completed'
}
```

### 6.4 WorkOrder Create - Simplified

```javascript
// workOrders.js - createFromQuote
static async createFromQuote(quoteId) {
  const quote = await Quotes.getById(quoteId);
  
  const workOrder = {
    id: code,
    code: code,
    quoteId: quoteId,
    status: 'approved',
    productionState: 'pending',
    productionLaunched: false,
    // Simplified data - sadece referanslar
    data: JSON.stringify({
      quoteId: quoteId,
      customerId: quote.customerId || null
    }),
    createdAt: db.fn.now(),
    updatedAt: db.fn.now()
  };
  
  // ...
}
```

---

## 7. WORK ORDER ENTEGRASYONU

### 7.1 WO Detaylarında Quote Verisi Fetch

```javascript
// approvedQuoteService.js
export const getWorkOrderDetails = async (workOrderCode) => {
  const wo = await WorkOrders.getByCode(workOrderCode);
  
  if (!wo) return null;
  
  // Quote verilerini fetch et
  const quote = await Quotes.getById(wo.quoteId);
  
  // Customer verilerini fetch et
  let customer = null;
  if (quote?.customerId) {
    customer = await Customers.getById(quote.customerId);
  }
  
  return {
    workOrder: wo,
    quote: quote,
    customer: customer,
    // Eski yapıdaki gibi flatten edilmiş data değil,
    // ilişkisel yapı korunuyor
  };
};
```

### 7.2 Production Launch Hook

```javascript
// WO launch edildiğinde
static async launchProduction(workOrderCode) {
  await db('mes.work_orders')
    .where('code', workOrderCode)
    .update({
      productionLaunched: true,
      productionLaunchedAt: db.fn.now(),
      productionState: 'Üretiliyor'
    });
}
```

---

## 8. TEST KRİTERLERİ

### 8.1 Quote Oluşturma Testleri

| Test | Beklenen Sonuç |
|------|----------------|
| Existing customer seçerek quote oluştur | Quote.customerId set, customer bilgileri readonly |
| New customer ile quote oluştur | Customer DB'ye kaydedilir, Quote.customerId set |
| Without customer ile quote oluştur | Quote.customerId = null, bilgiler sadece quote'ta |
| Form data validation | Zorunlu alanlar boşsa sonraki step'e geçilmez |

### 8.2 Edit Lock Testleri

| Test | Beklenen Sonuç |
|------|----------------|
| Quote approved, WO var ama launch yok | Düzenleme yapılabilir, uyarı gösterilir |
| Quote approved, WO launch edilmiş | Düzenleme engellenir |
| Quote status = new | Düzenleme serbest |

### 8.3 WO Entegrasyon Testleri

| Test | Beklenen Sonuç |
|------|----------------|
| WO detaylarında customer görüntüleme | Customer bilgileri doğru fetch edilir |
| WO detaylarında form data görüntüleme | Quote'tan form data doğru gösterilir |
| Müşterisiz quote'un WO detayları | Quote'taki inline bilgiler gösterilir |

---

## 9. KALDIRILACAK/DÜZENLENECEKYAPILAR

### 9.1 Kaldırılacaklar

| Dosya/Kod | Sebep |
|-----------|-------|
| `QuoteFormCompact.js` (eski versiyon) | Yeni step-based modal ile değiştirilecek |
| `workOrders.data` JSON'undaki eski alanlar | Sadece quoteId ve customerId kalacak |
| Duplicate table-utils dosyaları | Tek kaynak olacak |

### 9.2 Düzenlenecekler

| Dosya | Değişiklik |
|-------|------------|
| `db/models/customers.js` | Yeni alanlar eklenmeli |
| `db/models/workOrders.js` | `productionLaunched` flag eklenmeli, data simplified |
| `db/models/quotes.js` | Edit lock kontrolü eklenmeli |
| `QuotesManager.js` | Yeni AddQuoteModal entegrasyonu |
| `QuoteDetailsPanel.jsx` | Edit lock banner eklenmeli |
| `approvedQuotes.js` | Quote/Customer fetch logic güncellenmeli |

---

## APPENDIX: IMPLEMENTATION PROMPTS

> Aşağıdaki prompt'lar sırayla uygulanacaktır. Her prompt tamamlandığında test kriterleri kontrol edilecek.

---

### PROMPT-1: Veritabanı Güncellemeleri

**Amaç**: Customer tablosuna yeni alanlar eklemek ve WorkOrder yapısını güncellemek

**Ön Araştırma** (İlk yapılacak adımlar):
1. `read_file` ile mevcut customers modelini oku: `/WebApp/db/models/customers.js`
2. `read_file` ile mevcut workOrders modelini oku: `/WebApp/db/models/workOrders.js`
3. `read_file` ile mevcut quotes modelini oku: `/WebApp/db/models/quotes.js`
4. Terminal'de mevcut tablo yapısını kontrol et: `psql -c "\d quotes.customers"`
5. Terminal'de work_orders tablosunu kontrol et: `psql -c "\d mes.work_orders"`
6. **NOT**: `db/migrations/` klasörü mevcut değil - manuel SQL veya yeni klasör oluştur

**Yapılacaklar**:

1. **Migration dosyası oluştur**: `024_crm_newflow_updates.sql`
   - `quotes.customers` tablosuna yeni alanlar:
     - `website` VARCHAR(255)
     - `fax` VARCHAR(50)
     - `iban` VARCHAR(50)
     - `bankName` VARCHAR(255)
     - `contactPerson` VARCHAR(255)
     - `contactTitle` VARCHAR(100)
     - `country` VARCHAR(100) DEFAULT 'Türkiye'
     - `city` VARCHAR(100)
     - `postalCode` VARCHAR(20)
   - `mes.work_orders` tablosuna:
     - `productionLaunched` BOOLEAN DEFAULT false
     - `productionLaunchedAt` TIMESTAMP

2. **Model güncelle**: `db/models/customers.js`
   - `create()` metoduna yeni alanları ekle
   - `update()` metoduna yeni alanları ekle
   - `allowedFields` listesini güncelle

3. **Model güncelle**: `db/models/workOrders.js`
   - `createFromQuote()` metodunu simplified data ile güncelle:
     - **ÖNCEKİ**: `data: JSON.stringify({ customer, company, email, phone, deliveryDate, price, formData, quoteSnapshot })`
     - **SONRAKI**: `data: JSON.stringify({ quoteId, customerId })`
   - `launchProduction()` metodunu ekle (productionLaunched flag'ini true yapar)
   - `isProductionLaunched(quoteId)` helper metodu ekle
   - `getWithQuoteAndCustomer(code)` metodu ekle (WO + Quote + Customer join)

4. **Model güncelle**: `db/models/quotes.js`
   - `canEdit(id)` static metodu ekle:
     ```javascript
     static async canEdit(id) {
       const quote = await this.getById(id);
       if (!quote) return { canEdit: false, reason: 'not_found' };
       
       // WO yoksa düzenlenebilir
       if (!quote.workOrderCode) return { canEdit: true };
       
       // WO var, launch durumunu kontrol et
       const wo = await WorkOrders.getByCode(quote.workOrderCode);
       if (wo?.productionLaunched) {
         return { canEdit: false, reason: 'wo_launched', workOrderCode: wo.code };
       }
       
       return { canEdit: true, warning: 'wo_exists', workOrderCode: wo.code };
     }
     ```
   - `getEditStatus(id)` static metodu ekle (canEdit ile aynı, API için)

**Test Kriterleri**:
- [x] Migration dosyası syntax hatası olmadan çalışıyor ✅ (2 Aralık 2025)
- [x] `quotes.customers` tablosunda yeni alanlar görünüyor (psql ile kontrol) ✅ (9 yeni alan: website, fax, iban, bankName, contactPerson, contactTitle, country, city, postalCode)
- [x] `mes.work_orders` tablosunda `productionLaunched` kolonu var ✅ (productionLaunched, productionLaunchedAt)
- [x] `Customers.create()` yeni alanları kabul ediyor ✅
- [x] `WorkOrders.createFromQuote()` simplified data ile çalışıyor ✅ (sadece quoteId, customerId)
- [x] `Quotes.canEdit()` doğru sonuç döndürüyor ✅ (getEditStatus() ile birlikte)

---

### PROMPT-2: Backend API Güncellemeleri

**Amaç**: Quote oluşturma ve düzenleme API'larını yeni akışa uygun hale getirmek

**Ön Araştırma** (İlk yapılacak adımlar):
1. `list_dir` ile API controller yapısını incele: `/WebApp/domains/crm/`
2. `grep_search` ile mevcut quote endpoint'lerini bul: `POST.*quotes|PUT.*quotes`
3. `read_file` ile customer controller'ı oku (varsa): `customerController.js` veya `customers.js`
4. `read_file` ile quote controller/routes'u oku
5. `grep_search` ile mevcut customer search implementasyonunu bul
6. `read_file` ile quotes-service.js'i oku: `/WebApp/domains/crm/services/quotes-service.js`
7. API'nin Express route tanımlarını kontrol et: `/WebApp/server/` veya `/WebApp/domains/crm/api/`

**Yapılacaklar**:

1. **Customer routes güncelle**: `domains/crm/api/controllers/customerController.js`
   - Yeni alanları handle et
   - Search endpoint'i optimize et

2. **Quote routes güncelle**: `domains/crm/api/controllers/quoteController.js`
   - `POST /api/quotes` endpoint'ini yeni payload formatına güncelle:
     - `customerType` parametresini handle et
     - `customerType === 'new'` ise önce customer oluştur
     - `customerType === 'existing'` ise customerId'yi kullan
     - `customerType === 'without'` ise customerId = null
   - `PUT /api/quotes/:id` endpoint'ine edit lock kontrolü ekle
   - `GET /api/quotes/:id/edit-status` endpoint'i ekle

3. **Quote service güncelle**: `domains/crm/api/services/quoteService.js`
   - `createQuoteWithCustomer()` fonksiyonu ekle
   - `getQuoteEditStatus()` fonksiyonu ekle

4. **Work Order routes güncelle**: 
   - WO detay endpoint'ini quote/customer fetch edecek şekilde güncelle

**Test Kriterleri**:
- [x] `POST /api/customers` yeni alanları kabul ediyor ✅ (2 Aralık 2025 - customerController.js güncellendi)
- [x] `GET /api/customers/search?q=...` çalışıyor ✅ (mevcut endpoint korundu)
- [x] `POST /api/quotes` customerType=new ile customer oluşturup quote oluşturuyor ✅ (quoteController.js güncellendi)
- [x] `POST /api/quotes` customerType=existing ile mevcut customer'ı bağlıyor ✅
- [x] `POST /api/quotes` customerType=without ile customerId=null quote oluşturuyor ✅
- [x] `GET /api/quotes/:id/edit-status` doğru lock durumu döndürüyor ✅ (yeni endpoint eklendi)
- [x] `PUT /api/quotes/:id` launch edilmiş WO varsa hata döndürüyor ✅ (PATCH endpoint'ine canEdit kontrolü eklendi)

---

### PROMPT-3: Frontend - AddQuoteModal ve Step Yapısı

**Amaç**: Yeni step-based quote oluşturma modal'ını implement etmek ve QuotesManager'a entegre etmek

**Ön Araştırma** (İlk yapılacak adımlar):
1. `read_file` ile mevcut AddQuoteModal'ı oku: `/WebApp/domains/crm/components/quotes/AddQuoteModal.jsx`
2. `read_file` ile QuotesManager'ı oku (modal nasıl çağrılıyor): `/WebApp/domains/crm/components/quotes/QuotesManager.js`
3. `grep_search` ile mevcut modal stilleri bul: `modal-overlay|detail-modal`
4. `list_dir` ile styles klasörünü kontrol et: `/WebApp/domains/crm/styles/`
5. `read_file` ile mevcut CSS dosyasını oku
6. `grep_search` ile customer search implementasyonu ara: `CustomerSearch|customer.*search|autocomplete`
7. `read_file` ile shared components'ı incele: `/WebApp/shared/components/`
8. `read_file` ile API helper'ı oku: `/WebApp/shared/lib/api.js`

**Yapılacaklar**:

1. **Yeni component oluştur**: `domains/crm/components/quotes/AddQuoteModal.jsx`
   - Step state yönetimi (currentStep, steps array)
   - Step navigation (next, back, submit)
   - Form data aggregation across steps
   - Modal open/close handling

2. **Yeni component oluştur**: `domains/crm/components/quotes/QuoteCustomerStep.jsx`
   - Customer type selector (existing/new/without)
   - CustomerSearchInput (autocomplete) - existing seçilince
   - Customer form fields - new veya without seçilince
   - Delivery date picker
   - Field validation

3. **Yeni component oluştur**: `domains/crm/components/quotes/CustomerSearchInput.jsx`
   - Debounced search input
   - Dropdown results
   - Selection handler
   - Loading state

4. **CSS güncelle**: `domains/crm/styles/quotes.css` veya yeni dosya
   - `.quote-modal-step` styles
   - `.quote-step-indicator` styles
   - `.customer-type-selector` styles
   - `.customer-search-*` styles
   - `.customer-form-*` styles

5. **QuotesManager.js güncelle**: Eski inline modal'ı kaldır, yeni AddQuoteModal'ı entegre et
   - `AddQuoteModal` import et
   - Eski `AddRecordModal` inline fonksiyonunu kaldır
   - `showAddModal` state'i ile yeni modal'ı render et
   - `handleAddRecord` yerine `onSaved` callback kullan

**Test Kriterleri**:
- [x] Modal açılıyor ve 3 step indicator görünüyor ✅ (AddQuoteModal.jsx - renderStepIndicator)
- [x] Step 1'de customer type seçenekleri görünüyor ✅ (QuoteCustomerStep.jsx - customer-type-selector)
- [x] "Mevcut Müşteri" seçince autocomplete input görünüyor ✅ (CustomerSearchInput.jsx)
- [x] Autocomplete arama yapıldığında sonuçlar dropdown'da görünüyor ✅ (debounced search, dropdown)
- [x] Müşteri seçilince form alanları otomatik dolduruluyor (readonly) ✅ (populateFromCustomer, readOnly={isExisting})
- [x] "Yeni Müşteri" seçince boş form görünüyor (editable) ✅ (customerType='new', editable fields)
- [x] "Müşterisiz" seçince boş form görünüyor (editable) ✅ (customerType='without', editable fields)
- [x] Teslim tarihi seçilebiliyor ✅ (deliveryDate field in QuoteCustomerStep)
- [x] "Sonraki" butonu validation geçerse Step 2'ye geçiyor ✅ (validateStep1, handleNext)
- [x] QuotesManager'da "Yeni Teklif" butonuna basınca yeni AddQuoteModal açılıyor ✅ (showAddModal state)
- [x] Eski inline "Yeni Kayıt Ekle" modal'ı kaldırıldı ✅ (AddRecordModal function removed)
- [x] Build hatasız tamamlanıyor ✅ (vite build successful)

**Oluşturulan/Güncellenen Dosyalar**:
- `domains/crm/components/quotes/CustomerSearchInput.jsx` - Debounced autocomplete bileşeni ✅
- `domains/crm/components/quotes/QuoteCustomerStep.jsx` - Step 1 müşteri seçimi bileşeni ✅
- `domains/crm/components/quotes/AddQuoteModal.jsx` - 3 step'li ana modal bileşeni ✅
- `domains/crm/styles/quotes.css` - Step modal ve customer form CSS stilleri ✅
- `domains/crm/components/quotes/QuotesManager.js` - Eski AddRecordModal kaldırıldı, yeni modal entegre ✅

---

### PROMPT-4: Frontend - QuoteFormStep ve DynamicFormRenderer Entegrasyonu

**Amaç**: Step 2 için dinamik form rendering ve validation

**Ön Araştırma** (İlk yapılacak adımlar):
1. `grep_search` ile mevcut DynamicFormRenderer'ı ara: `DynamicFormRenderer|FormRenderer|renderField`
2. `read_file` ile aktif form template yapısını anla: `/WebApp/db/models/formTemplates.js`
3. `read_file` ile forms-service'i oku: `/WebApp/domains/crm/services/forms-service.js`
4. `grep_search` ile form validation örnekleri bul: `validateForm|validation|required`
5. `read_file` ile mevcut AddQuoteModal'daki form rendering'i incele
6. `grep_search` ile price calculation trigger'ı bul: `calculatePrice|priceCalculator`
7. `read_file` ile price calculator'ı oku: `/WebApp/server/priceCalculator.js`

**Yapılacaklar**:

1. **Yeni component oluştur**: `domains/crm/components/quotes/QuoteFormStep.jsx`
   - Active form template fetch
   - DynamicFormRenderer entegrasyonu
   - Form data state yönetimi
   - Real-time validation
   - Price calculation trigger

2. **Mevcut component güncelle**: DynamicFormRenderer (varsa)
   - Step context desteği
   - External form state binding
   - Validation feedback

3. **Yeni utility oluştur**: `domains/crm/utils/quote-validation.js`
   - `validateCustomerStep()` - Step 1 validation
   - `validateFormStep()` - Step 2 validation
   - `validateQuoteData()` - Full quote validation
   - Field-level validation helpers

**Test Kriterleri**:
- [x] Step 2'de aktif form template'in alanları görünüyor ✅
- [x] Form alanları doğru tipte render ediliyor (text, select, number, etc.) ✅
- [x] Zorunlu alanlar işaretli görünüyor ✅
- [x] Boş zorunlu alan varsa validation error görünüyor ✅
- [x] Form verisi state'e doğru kaydediliyor ✅
- [x] "Sonraki" butonu validation geçerse Step 3'e geçiyor ✅
- [x] "Geri" butonu Step 1'e dönüyor (veriler korunuyor) ✅

**Oluşturulan/Güncellenen Dosyalar**:
- `domains/crm/utils/quote-validation.js` - Centralized validation utilities ✅
- `domains/crm/components/quotes/QuoteFormStep.jsx` - Step 2 form component ✅
- `domains/crm/components/quotes/AddQuoteModal.jsx` - QuoteFormStep entegrasyonu ✅

**Not**: DynamicFormRenderer yerine QuoteFormStep içinde inline renderField kullanıldı - step yapısına özel optimizasyon için bilinçli tercih.

---

### PROMPT-5: Frontend - QuoteReviewStep ve Submit İşlemi

**Amaç**: Step 3 review ekranı ve quote submit işlemi

**Ön Araştırma** (İlk yapılacak adımlar):
1. `read_file` ile quotes-service'in mevcut create metodunu oku
2. `grep_search` ile API.addQuote veya quotesApi.create implementasyonunu bul
3. `read_file` ile API helper'daki quote endpoints'i incele: `/WebApp/shared/lib/api.js`
4. `read_file` ile QuotesManager'daki handleAddRecord fonksiyonunu incele
5. `grep_search` ile showToast ve error handling patterns'i bul
6. `read_file` ile backend quote create endpoint'i oku

**Yapılacaklar**:

1. **Yeni component oluştur**: `domains/crm/components/quotes/QuoteReviewStep.jsx`
   - Customer bilgileri özeti
   - Form data özeti (filled fields)
   - Hesaplanan fiyat gösterimi
   - Notes input
   - Edit links (back to specific step)

2. **Service güncelle**: `domains/crm/services/quotes-service.js`
   - `createQuote()` metodunu yeni payload formatına güncelle
   - Customer type handling
   - Error handling

3. **QuotesManager güncelle**: `domains/crm/components/quotes/QuotesManager.js`
   - Eski AddRecordModal yerine yeni AddQuoteModal kullan
   - onSave handler güncelle
   - Refresh logic

**Test Kriterleri**:
- [x] Step 3'te customer bilgileri doğru gösteriliyor ✅
- [x] Step 3'te form data özeti doğru gösteriliyor ✅
- [x] Fiyat gösteriliyor (hesaplanmışsa) ✅
- [x] Notes alanı çalışıyor ✅
- [x] "Teklif Oluştur" butonu API call yapıyor ✅
- [x] Başarılı kayıt sonrası modal kapanıyor ✅
- [x] Liste refresh ediliyor ve yeni quote görünüyor ✅
- [x] Hata durumunda error message gösteriliyor ✅

**Oluşturulan/Güncellenen Dosyalar**:
- `domains/crm/components/quotes/QuoteReviewStep.jsx` - Step 3 review component ✅
- `domains/crm/components/quotes/AddQuoteModal.jsx` - QuoteReviewStep entegrasyonu ✅
- `domains/crm/styles/quotes.css` - Review step CSS stilleri ✅

---

### PROMPT-6: Frontend - QuoteDetailsPanel Edit Lock ve Güncellemeler

**Amaç**: Quote detail panelinde edit lock mekanizması ve yeni customer alanları

**Ön Araştırma** (İlk yapılacak adımlar):
1. `read_file` ile mevcut QuoteDetailsPanel'i oku: `/WebApp/domains/crm/components/quotes/QuoteDetailsPanel.jsx`
2. `grep_search` ile mevcut edit/save implementasyonunu bul: `handleSave|onSave|handleEdit`
3. `grep_search` ile workOrder ilişkisini kontrol et: `workOrderCode|workOrder`
4. `read_file` ile backend edit-status endpoint'ini doğrula (PROMPT-2'de oluşturulmuş olmalı)
5. `grep_search` ile mevcut banner/alert component örnekleri bul
6. `read_file` ile mevcut CSS stilleri oku

**Yapılacaklar**:

1. **Yeni component oluştur**: `domains/crm/components/quotes/QuoteEditLockBanner.jsx`
   - Warning banner (WO var ama launch yok)
   - Error banner (WO launch edilmiş)
   - Conditional rendering

2. **QuoteDetailsPanel güncelle**: 
   - Edit status API call ekle
   - QuoteEditLockBanner entegrasyonu
   - Edit butonlarını lock durumuna göre disable et
   - Customer section'ı yeni alanlarla güncelle
   - Customer link (customerId varsa detay sayfasına link)

3. **CSS güncelle**:
   - `.quote-edit-lock-banner` styles
   - `.quote-edit-lock-banner.warning` styles
   - `.quote-edit-lock-banner.error` styles

**Test Kriterleri**:
- [x] Quote seçilince edit status kontrol ediliyor ✅
- [x] WO var ama launch yok → sarı uyarı banner görünüyor ✅
- [x] WO launch edilmiş → kırmızı error banner görünüyor, edit disabled ✅
- [x] WO yok → banner görünmüyor, edit enabled ✅
- [ ] Customer section'da yeni alanlar görünüyor (PROMPT-7'de)
- [ ] customerId varsa customer'a link çalışıyor (PROMPT-7'de)

**Oluşturulan/Güncellenen Dosyalar**:
- `domains/crm/components/quotes/QuoteEditLockBanner.jsx` - Edit lock banner component ✅
- `domains/crm/components/quotes/QuoteDetailsPanel.jsx` - Edit status check, banner entegrasyonu ✅
- `domains/crm/services/quotes-service.js` - getEditStatus metodu eklendi ✅
- `domains/crm/styles/quotes.css` - Banner CSS stilleri ✅

---

### PROMPT-7: Backend/Frontend - Customer Modal Güncellemeleri

**Amaç**: AddCustomerModal ve CustomerDetailsPanel'i yeni alanlarla güncellemek

**Ön Araştırma** (İlk yapılacak adımlar):
1. `list_dir` ile customers component klasörünü incele: `/WebApp/domains/crm/components/customers/`
2. `read_file` ile mevcut AddCustomerModal'ı oku (varsa)
3. `read_file` ile mevcut CustomerDetailsPanel'i oku (varsa)
4. `grep_search` ile CustomersManager implementasyonunu bul
5. `read_file` ile customers modelini doğrula (yeni alanlar PROMPT-1'de eklendi mi)
6. `grep_search` ile mevcut customer form yapısını incele

**Yapılacaklar**:

1. **AddCustomerModal güncelle**: `domains/crm/components/customers/AddCustomerModal.jsx`
   - Yeni alanları form'a ekle:
     - website, fax, iban, bankName
     - contactPerson, contactTitle
     - country (dropdown), city, postalCode
   - Form layout'u grupla (Temel Bilgiler, İletişim, Finans, Adres)
   - Validation güncelle

2. **CustomerDetailsPanel güncelle**: `domains/crm/components/customers/CustomerDetailsPanel.jsx`
   - Yeni alanları görüntüle
   - Section grouping
   - Edit mode'da yeni alanları düzenlenebilir yap

3. **customers-table-utils güncelle**: 
   - Yeni alanları table columns'a ekle (opsiyonel, hangileri görünecek karar verilecek)

**Test Kriterleri**:
- [ ] AddCustomerModal'da tüm yeni alanlar görünüyor
- [ ] Yeni müşteri kaydı tüm alanlarla çalışıyor
- [ ] CustomerDetailsPanel'de yeni alanlar görünüyor
- [ ] Customer edit'te yeni alanlar düzenlenebiliyor
- [ ] Form grupları mantıklı organize edilmiş

---

### PROMPT-8: Work Order Detay Sayfası Güncellemeleri

**Amaç**: WO detaylarında quote ve customer verilerini dinamik fetch etmek

**Ön Araştırma** (İlk yapılacak adımlar):
1. `list_dir` ile production domain yapısını incele: `/WebApp/domains/production/`
2. `grep_search` ile approvedQuotes implementasyonunu bul: `approvedQuotes|ApprovedQuote`
3. `read_file` ile approvedQuotes.js'i oku: `/WebApp/domains/production/js/approvedQuotes.js`
4. `grep_search` ile WO detail endpoint'ini bul: `work-orders|workorders|getWorkOrder`
5. `read_file` ile mevcut WO detail template'ini incele
6. `read_file` ile backend WO service'i oku
7. `grep_search` ile mevcut data fetch pattern'ini bul: `showApprovedQuoteDetail|WorkOrderDetail`

**Yapılacaklar**:

1. **Backend güncelle**: `domains/production/api/services/approvedQuoteService.js`
   - `getWorkOrderDetails()` fonksiyonunu güncelle
   - Quote ve Customer'ı join ile veya separate fetch ile getir
   - Simplified WO data'dan full data reconstruct

2. **Frontend güncelle**: `domains/production/js/approvedQuotes.js`
   - `showApprovedQuoteDetail()` fonksiyonunu güncelle
   - Yeni API response format'ına adapte et
   - Customer bilgilerini doğru göster
   - Form data'yı doğru göster

3. **Views güncelle**: `domains/production/js/views.js`
   - WO detail template'ini güncelle (gerekirse)

**Test Kriterleri**:
- [ ] WO detay açıldığında customer bilgileri doğru görünüyor
- [ ] WO detay açıldığında form data doğru görünüyor
- [ ] Müşterisiz quote'larda inline bilgiler gösteriliyor
- [ ] Fiyat bilgisi doğru gösteriliyor
- [ ] Teslim tarihi doğru gösteriliyor

---

### PROMPT-9: Cleanup ve Kod Temizliği

**Amaç**: Artık kullanılmayan kodları kaldırmak ve düzenlemek

**Ön Araştırma** (İlk yapılacak adımlar):
1. `grep_search` ile QuoteFormCompact kullanımlarını bul: `QuoteFormCompact`
2. `grep_search` ile deprecate edilecek fonksiyonları bul
3. `grep_search` ile console.log statement'larını bul: `console.log`
4. `file_search` ile duplicate dosyaları bul: `*table-utils*`
5. `grep_search` ile kullanılmayan import'ları tespit et
6. `get_errors` ile mevcut lint hatalarını kontrol et
7. `list_dir` ile backup veya eski dosyaları tespit et

**Yapılacaklar**:

1. **Kaldırılacak/Deprecate edilecek dosyalar**:
   - Eski QuoteFormCompact varsa kaldır veya deprecate işaretle
   - Duplicate table-utils dosyalarını birleştir
   - Kullanılmayan CSS class'larını temizle

2. **Kod düzenlemeleri**:
   - Console.log'ları temizle (debug amaçlı olanlar)
   - Error handling standardize et
   - TypeScript type tanımları ekle (varsa)

3. **Documentation**:
   - Inline code comments güncelle
   - API documentation güncelle

**Test Kriterleri**:
- [ ] Build hatasız tamamlanıyor
- [ ] Console'da gereksiz log yok
- [ ] Tüm önceki test kriterleri hala geçiyor
- [ ] Lint hataları yok

---

### PROMPT-10: Final Test ve Doğrulama

**Amaç**: Tüm akışın end-to-end testi

**Ön Araştırma** (İlk yapılacak adımlar):
1. Önceki tüm prompt'ların test kriterlerini gözden geçir
2. `grep_search` ile tüm TODO ve FIXME comment'larını bul
3. `get_errors` ile tüm hataları kontrol et
4. Server'ı başlat ve manual test için hazırla
5. Database'i kontrol et: migration'lar uygulandı mı, tablolar doğru mu
6. Network tab ile API response'larını kontrol et

**Yapılacaklar**:

1. **E2E Test Senaryoları**:
   - Senaryo 1: Mevcut müşteri ile quote oluştur → approve → WO oluştu mu kontrol
   - Senaryo 2: Yeni müşteri ile quote oluştur → customer DB'de mi kontrol → approve
   - Senaryo 3: Müşterisiz quote oluştur → approve → WO detayında bilgiler doğru mu
   - Senaryo 4: WO launch edilmemiş quote'u düzenle → başarılı
   - Senaryo 5: WO launch edilmiş quote'u düzenlemeye çalış → engellendi mi

2. **Regression Test**:
   - Mevcut quote'lar hala görünüyor mu
   - Mevcut WO'lar hala çalışıyor mu
   - Customer listesi çalışıyor mu

3. **Performance Check**:
   - Quote listesi yüklenme süresi
   - Customer search response süresi
   - WO detail yüklenme süresi

**Test Kriterleri**:
- [ ] Tüm E2E senaryoları başarılı
- [ ] Regression testleri geçiyor
- [ ] Performance kabul edilebilir seviyede (<2s page load)
- [ ] Mobile responsive çalışıyor
- [ ] Error handling tüm edge case'lerde çalışıyor

---

## NOTLAR

### Commit Stratejisi
- Her prompt tamamlandığında commit atılacak
- Commit message formatı: `feat(crm): [PROMPT-X] description`
- Test failures varsa prompt tekrar edilecek
- Prompt sırası kritik, bağımlılıklar var (DB → Backend → Frontend)

### Önemli Dosya Yolları
```
/WebApp/db/models/
├── customers.js        → Customer CRUD operations
├── quotes.js           → Quote CRUD, price calculation, WO creation
├── workOrders.js       → MES work order management
├── formTemplates.js    → Form template versioning
└── priceFormulas.js    → Price formula calculation

/WebApp/domains/crm/
├── api/controllers/    → REST API endpoints
├── api/services/       → Business logic
├── components/quotes/  → React components
├── components/customers/
├── services/           → Frontend API services
└── styles/             → CSS files

/WebApp/shared/lib/api.js → Frontend API helper
```

### Mevcut Durum Özeti
- **Customer tablosu**: 9 temel alan var, 9 yeni alan eklenecek
- **Quote tablosu**: customerId, isCustomer alanları var (kullanılıyor)
- **WorkOrders tablosu**: data JSON'unda tüm quote snapshot var (simplified edilecek)
- **Migration sistemi**: `db/migrations/` klasörü yok, manuel SQL veya oluşturulmalı
- **API yapısı**: REST API `/api/customers`, `/api/quotes` endpoint'leri mevcut
- **Customer Search**: `/api/customers/search?q=...` endpoint'i VAR ve çalışıyor
