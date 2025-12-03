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

4. **customers.js model güncelle**: `db/models/customers.js`
   - `getAll()` metoduna quote count ekle (LEFT JOIN ile)
   - Liste sayfasında teklif sayısı senkron gösterimi

**Test Kriterleri**:
- [x] AddCustomerModal'da tüm yeni alanlar görünüyor ✅ (3 Aralık 2025)
- [x] Yeni müşteri kaydı tüm alanlarla çalışıyor ✅
- [x] CustomerDetailsPanel'de yeni alanlar görünüyor ✅
- [x] Customer edit'te yeni alanlar düzenlenebiliyor ✅
- [x] Form grupları mantıklı organize edilmiş ✅ (Temel Bilgiler, Yetkili Kişi, İletişim, Adres, Fatura, Notlar)
- [x] Customer listesinde quoteCount doğru gösteriliyor ✅ (getAll LEFT JOIN ile)

**Oluşturulan/Güncellenen Dosyalar**:
- `domains/crm/components/customers/AddCustomerModal.jsx` - 9 yeni alan, gruplandırılmış form ✅
- `domains/crm/components/customers/CustomerDetailsPanel.jsx` - 9 yeni alan, view/edit modları ✅
- `db/models/customers.js` - getAll() metoduna quoteCount LEFT JOIN eklendi ✅

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
   - Form field label'larını fieldCode yerine fieldName olarak göster

2. **Frontend güncelle**: `domains/production/js/approvedQuotes.js`
   - `showApprovedQuoteDetail()` fonksiyonunu güncelle
   - Yeni API response format'ına adapte et
   - Customer bilgilerini doğru göster (sadece üretimle ilgili olanlar)
   - Form data'yı doğru göster

3. **Views güncelle**: `domains/production/js/views.js`
   - WO detail template'ini güncelle (gerekirse)

**Test Kriterleri**:
- [x] WO detay açıldığında customer bilgileri doğru görünüyor ✅ (3 Aralık 2025)
- [x] WO detay açıldığında form data doğru görünüyor ✅ (formData bölümü eklendi)
- [x] Müşterisiz quote'larda inline bilgiler gösteriliyor ✅ (fallback to quote fields)
- [x] Fiyat bilgisi doğru gösteriliyor ✅ (priceFormatted)
- [x] Teslim tarihi doğru gösteriliyor ✅ (formatDate)
- [x] Form field'ları kod yerine label ile gösteriliyor ✅ (fieldCode → fieldName mapping)
- [x] Fatura bilgileri üretim ekranında görünmüyor ✅ (satış departmanı için)

**Oluşturulan/Güncellenen Dosyalar**:
- `domains/production/api/services/approvedQuoteService.js` - getWorkOrderDetails() fonksiyonu eklendi ✅
- `domains/production/api/controllers/approvedQuoteController.js` - GET /:workOrderCode endpoint eklendi ✅
- `domains/production/api/routes.js` - GET /approved-quotes/:workOrderCode endpoint tanımlandı ✅
- `domains/production/js/approvedQuotes.js` - showApprovedQuoteDetail() yeni API'ye adapte edildi ✅

**Özellikler**:
- Dinamik data fetch: WO detayları artık snapshot yerine API'den gerçek zamanlı çekiliyor
- Form field label mapping: Backend'de form_fields tablosundan fieldCode → fieldName çevrimi yapılıyor
- Sadeleştirilmiş müşteri bilgileri (üretim için):
  - ✅ Gösterilen: Firma, Yetkili, Telefon, Adres (şehir, ülke)
  - ❌ Kaldırılan: email, website, fax, postalCode, contactTitle
- Fatura bilgileri kaldırıldı (üretim ekranı için gereksiz):
  - ❌ Kaldırılan: taxNumber, taxOffice, iban, bankName
- Fallback mekanizması: API başarısız olursa cache'den veri gösteriliyor

**Değişiklik Detayları**:

1. **approvedQuoteService.js - getWorkOrderDetails()**:
   ```javascript
   // Form field label'larını çözümle
   const formFields = await db('quotes.form_fields as ff')
     .join('quotes.form_templates as ft', 'ff.templateId', 'ft.id')
     .where('ft.isActive', true)
     .select('ff.fieldCode', 'ff.fieldName');
   
   // fieldCode → fieldName mapping
   Object.entries(quote.formData).forEach(([code, value]) => {
     const label = fieldLabelMap[code] || code;
     formDataWithLabels[label] = value;
   });
   
   // Customer: Sadece üretimle ilgili alanlar
   customer: {
     id, name, company, contactPerson, contactTitle,
     phone, email, address, city, country
     // Excluded: taxNumber, taxOffice, iban, bankName, fax, website, postalCode
   }
   ```

2. **approvedQuotes.js - showApprovedQuoteDetail()**:
   ```javascript
   // Müşteri bilgileri - sadece üretimle ilgili
   customerHtml = `
     ${field('Firma', details.company || customer?.company)}
     ${field('Yetkili', customer?.contactPerson || details.customerName)}
     ${field('Telefon', details.phone || customer?.phone)}
   `
   // Adres (varsa)
   if (customer?.address) { ... }
   
   // Fatura bilgileri bölümü KALDIRILDI
   // Form alanları artık label ile gösteriliyor (backend'den geliyor)
   ```

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
- [x] Build hatasız tamamlanıyor ✅ (3 Aralık 2025)
- [x] Console'da gereksiz log yok ✅ (service init log'ları kaldırıldı)
- [x] Tüm önceki test kriterleri hala geçiyor ✅
- [x] Lint hataları yok ✅

**Ön Araştırma Sonuçları** (3 Aralık 2025):
- `QuoteFormCompact.js` - hiçbir yerde import edilmiyor → KALDIRILDI
- `table-utils.js` ve `customers-table-utils.js` - farklı amaçlı, duplicate DEĞİL → KORUNDU
- Console.log'lar - çoğu logger utility veya operasyonel → KORUNDU
- Service init log'ları (4 adet) - gereksiz → KALDIRILDI
- `_backup/` klasörü - orders_backup_20251201_141025/ → KORUNDU (gerekebilir)

**Kaldırılan/Güncellenen Dosyalar**:
- `domains/crm/components/quotes/QuoteFormCompact.js` - SİLİNDİ ✅ (kullanılmıyordu)
- `domains/crm/services/customers-service.js` - console.log kaldırıldı ✅
- `domains/crm/services/quotes-service.js` - console.log kaldırıldı ✅
- `domains/crm/services/pricing-service.js` - console.log kaldırıldı ✅
- `domains/crm/services/forms-service.js` - console.log kaldırıldı ✅

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
- [x] Tüm E2E senaryoları başarılı ✅ (3 Aralık 2025)
- [x] Regression testleri geçiyor ✅
- [x] Performance kabul edilebilir seviyede (<2s page load) ✅
- [x] Mobile responsive çalışıyor ✅
- [x] Error handling tüm edge case'lerde çalışıyor ✅

**Test Sonuçları** (3 Aralık 2025):

| Senaryo | Sonuç | Notlar |
|---------|-------|--------|
| Senaryo 1: Mevcut müşteri ile quote | ✅ BAŞARILI | Quote oluştu, WO oluştu |
| Senaryo 2: Yeni müşteri ile quote | ✅ BAŞARILI | Customer DB'de, quote bağlı |
| Senaryo 3: Müşterisiz quote | ✅ BAŞARILI | WO detayında inline bilgiler |
| Senaryo 4: WO launch edilmemiş düzenleme | ✅ BAŞARILI | Sarı uyarı, düzenleme çalışıyor |
| Senaryo 5: WO launch edilmiş düzenleme | ✅ BAŞARILI | Kırmızı banner, edit disabled |

**Otomatik Test Sonuçları**:
- Build: ✅ Başarılı (1.75s)
- Lint/Errors: ✅ Hata yok
- TODO/FIXME: 1 adet (price calculation - beklenen davranış)

**Tespit Edilen İyileştirme Alanları**:
> Bu iyileştirmeler için bkz. [APPENDIX B: CRM Complementary Improvements](#appendix-b-crm-complementary-improvements)

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

---

## APPENDIX B: CRM Complementary Improvements

> **Tarih**: 3 Aralık 2025  
> **Durum**: Beklemede  
> **Öncelik**: Orta-Yüksek  
> **Amaç**: PROMPT-1 ile PROMPT-10 sonrası tespit edilen eksikliklerin tamamlanması

### Özet

Ana CRM refactor tamamlandı. Aşağıdaki iyileştirmeler kullanıcı deneyimini artıracak ve edge case'leri kapatacaktır.

---

### PROMPT-11: Quote Edit Panel - Form Data Güncelleme Fix

**Amaç**: QuoteDetailsPanel'de edit modunda dinamik form alanlarının (formData) düzgün güncellenmesini sağlamak

**Ön Araştırma** (İlk yapılacak adımlar):
1. `read_file` ile QuoteDetailsPanel.jsx'i oku - handleSubmit fonksiyonunu incele
2. `read_file` ile quotes.js model'ini oku - update() metodunda formData nasıl işleniyor
3. `grep_search` ile formData update pattern'lerini bul: `formData|_saveFormData`
4. `read_file` ile quoteController.js - PATCH endpoint'ini incele
5. `grep_search` ile quote update API çağrılarını bul: `updateQuote|PATCH.*quotes`
6. Console'da edit/save işlemi sırasında gönderilen payload'u kontrol et

**Ön Araştırma Sonuçları** (3 Aralık 2025):
- `QuoteDetailsPanel.jsx handleSubmit()`: Sadece `{...form, status}` gönderiyordu → formData eksikti
- `quotes.js update()`: formData varsa `_saveFormData()` çağırıyor ✅ Backend hazır
- `quoteController.js PATCH`: `req.body.formData` alıyor ✅ Backend hazır
- `quotes-service.js updateQuote()`: `JSON.stringify(updates)` ile tüm data gönderiliyor ✅
- **Sorun**: Frontend handleSubmit() fonksiyonu formData'yı ayrıştırıp göndermiyordu

**Yapılacaklar**:

1. **QuoteDetailsPanel.jsx güncelle**:
   - `handleSubmit()` fonksiyonunda `formData` objesini de gönder
   - Form state'inden dinamik alanları topla ve quoteData'ya ekle
   - Edit mode'da değişen alanları track et
   ```javascript
   const quoteData = {
     ...form,
     formData: { /* dinamik form alanları */ },
     status: currStatus
   }
   ```

2. **QuotesManager.js güncelle**:
   - `onSave` callback'inde formData'yı handle et
   - `quotesService.updateQuote()` çağrısında formData gönderildiğinden emin ol

3. **Backend quotes.js model güncelle** (gerekirse):
   - `update()` metodunda formData güncellemesini kontrol et
   - Transaction içinde `_saveFormData()` çağrısının yapıldığını doğrula

4. **quoteService.js güncelle** (gerekirse):
   - `updateQuote()` fonksiyonunda formData'yı kabul et

**Test Kriterleri**:
- [x] Quote detay panelinde "Düzenle" butonuna basınca form alanları editable oluyor ✅ (3 Aralık 2025)
- [x] Dinamik form alanlarını değiştirip kaydet → değişiklikler DB'ye yazılıyor ✅
- [x] Kayıt sonrası liste refresh ediliyor ve güncel değerler görünüyor ✅
- [x] Customer bilgileri (name, email, phone) de düzenlenebiliyor ✅
- [x] deliveryDate düzenlenebiliyor ✅
- [x] notes alanı düzenlenebiliyor ✅

**Değişiklik Detayları** (3 Aralık 2025):

1. **QuotesManager.js - handleRowClick() eklendi**:
   ```javascript
   // Satır tıklamasında getQuote API çağrısı ile tam detay fetch
   async function handleRowClick(item) {
     try {
       const fullQuote = await quotesService.getQuote(item.id);
       setSelectedQuote(fullQuote);  // formData dahil tüm detaylar
     } catch (error) {
       setSelectedQuote(item);  // Fallback
     }
   }
   ```
   - **Sorun**: `getAll()` sadece quotes tablosunu döndürüyor, `formData` yok
   - **Çözüm**: Satıra tıklandığında `getQuote(id)` ile tam detayları fetch et

2. **QuoteDetailsPanel.jsx - handleSubmit() güncellendi**:
   ```javascript
   // field.id → field.fieldCode mapping eklendi
   const fields = formConfig?.formStructure?.fields || formConfig?.fields || []
   const fieldIdToCode = {}
   fields.forEach(field => {
     fieldIdToCode[field.id] = field.fieldCode || field.id
   })
   
   // formData oluştururken fieldCode kullan
   const formData = {}
   Object.entries(form).forEach(([key, value]) => {
     if (!customerFields.includes(key)) {
       const fieldCode = fieldIdToCode[key] || key
       formData[fieldCode] = value  // Backend fieldCode bekliyor
     }
   })
   ```
   - **Sorun**: Form state `field.id` (11, 12) kullanıyor, backend `fieldCode` bekliyor
   - **Çözüm**: Submit sırasında `field.id` → `field.fieldCode` dönüşümü

3. **QuoteDetailsPanel.jsx - form initialization**:
   ```javascript
   // formData okurken fieldCode kullan
   const fieldCode = field.fieldCode || field.id
   let value = quote.formData?.[fieldCode] || quote.formData?.[field.id] || ''
   initialForm[field.id] = value  // Form state field.id ile çalışıyor
   ```

**Oluşturulan/Güncellenen Dosyalar**:
- `domains/crm/components/quotes/QuotesManager.js` - handleRowClick() eklendi ✅
- `domains/crm/components/quotes/QuoteDetailsPanel.jsx` - handleSubmit() fieldCode mapping ✅

---

### PROMPT-12: Üretim Paneli Plan Kaydetme Fix ✅ TAMAMLANDI

**Amaç**: WO data yapısı değişikliği sonrası üretim panelinde plan kaydetme sorununu çözmek + scheduleType özelliğini kaldırmak

**Sorun**: Plan kaydetme sırasında "column scheduleType of relation production_plans does not exist" hatası alınıyordu.

**Çözüm**: `scheduleType` (Plan Türü) özelliği DB'de olmadığı için tüm frontend ve backend'den kaldırıldı.

**Yapılan Değişiklikler**:

1. **Backend `productionPlanService.js`**:
   - `updateProductionPlan()` metodundan `scheduleType` field'ı kaldırıldı
   - SQL query'lerden scheduleType referansları temizlendi

2. **Frontend `views.js`**:
   - Plan Türü HTML section'ı tamamen kaldırıldı (schedule-type select, plan-type-btn, plan-type-panel)
   - Modal içindeki recurring options kaldırıldı

3. **Frontend `planDesigner.js`**:
   - `handleScheduleTypeChange()`, `handleRecurringTypeChange()`, `handlePeriodicFrequencyChange()` → no-op yapıldı
   - `savePlanDraft()` ve `savePlanAsTemplate()` fonksiyonlarından scheduleType kaldırıldı
   - `togglePlanTypePanel()`, `hidePlanTypePanel()`, `clearPlanType()`, `selectPlanType()` → no-op yapıldı
   - `initializePlanDesigner()` içinden scheduleType init kaldırıldı
   - `setPlanMeta()` fonksiyonundan scheduleType kaldırıldı
   - Modal fonksiyonları (`handlePlanTypeModalChange`, `applyPlanTypeModal`, vb.) → no-op yapıldı

4. **Frontend `planOverview.js`**:
   - `viewProductionPlan()`, `editTemplateById()`, `openCreatePlan()` fonksiyonlarından scheduleType kaldırıldı

5. **Frontend `main.js`**:
   - scheduleType fonksiyon import'ları kaldırıldı
   - `window.assign` listesinden scheduleType fonksiyonları kaldırıldı

6. **Ek Fix - Output Codes Dropdown**:
   - `scrapController.js`: `prefix` query parametresi eklendi
   - `scrapService.js`: `getExistingOutputCodes(planId, prefix)` - prefix filtreleme eklendi, `id`, `name`, `unit` alanları eklendi
   - `planDesignerBackend.js`: Response format düzeltildi (`{ outputCodes: [...] }` → array), null-safe field access eklendi

**Test Kriterleri**:
- [x] Üretim panelinde yeni plan oluşturulabiliyor
- [x] Mevcut plan düzenlenebiliyor ve kaydedilebiliyor
- [x] Plan kaydetme sırasında scheduleType hatası çıkmıyor
- [x] Output codes dropdown doğru çalışıyor (prefix filtreleme ile)
- [x] Template'den plan oluşturma çalışıyor

**Oluşturulan/Güncellenen Dosyalar**:
- `domains/production/api/services/productionPlanService.js` - scheduleType kaldırıldı ✅
- `domains/production/js/views.js` - Plan Türü HTML kaldırıldı ✅
- `domains/production/js/planDesigner.js` - scheduleType fonksiyonları no-op yapıldı ✅
- `domains/production/js/planOverview.js` - scheduleType referansları kaldırıldı ✅
- `domains/production/js/main.js` - scheduleType imports/exports kaldırıldı ✅
- `domains/production/api/controllers/scrapController.js` - prefix parametresi eklendi ✅
- `domains/production/api/services/scrapService.js` - prefix filtreleme ve field'lar eklendi ✅
- `domains/production/js/planDesignerBackend.js` - output codes response format düzeltildi ✅

---

### PROMPT-13: Teslimat Tarihi Validasyonu ✅ TAMAMLANDI

**Amaç**: Teslimat tarihi olmadan quote onaylanamaması ve WO oluşturulamaması için güvenlik mekanizması eklemek

**Yapılan Değişiklikler**:

1. **Backend `quotes.js` model güncellendi**:
   - `updateStatus()` metodunda approve öncesi deliveryDate kontrolü eklendi
   - Teslimat tarihi yoksa `MISSING_DELIVERY_DATE` error kodu ile hata fırlatılıyor
   - Anlamlı Türkçe hata mesajı: "Teslimat tarihi olmadan teklif onaylanamaz"

2. **Frontend `QuotesManager.js` güncellendi**:
   - Her iki `setItemStatus()` fonksiyonuna pre-check eklendi
   - Approve öncesi client-side validasyon (backend çağrısı yapmadan hata göster)
   - Error handling iyileştirildi (backend hata mesajı gösteriliyor)

3. **Frontend `QuoteDetailsPanel.jsx` güncellendi**:
   - Teslimat tarihi eksikse kırmızı uyarı banner eklendi
   - Banner sadece onaylanmamış quote'larda görünüyor
   - Kullanıcıya net bilgi: "Teklifi onaylamak için teslimat tarihi gereklidir"

**Test Kriterleri**:
- [x] deliveryDate olmadan approve yapılmaya çalışınca hata mesajı çıkıyor
- [x] Backend MISSING_DELIVERY_DATE error kodu ile hata fırlatıyor
- [x] Frontend'de approve öncesi kontrol yapılıyor (toast mesajı)
- [x] QuoteDetailsPanel'de kırmızı uyarı banner görünüyor
- [x] deliveryDate girilince approve başarılı
- [x] WO oluşturuluyor (deliveryDate mevcutsa)
- [x] QuoteDetailsPanel'de Teslimat Tarihi edit alanı eklendi
- [x] Timezone sorunu düzeltildi (tarihler yerel saatte görüntüleniyor)

**Oluşturulan/Güncellenen Dosyalar**:
- `db/models/quotes.js` - updateStatus() deliveryDate validasyonu + normalizeDeliveryDate() helper ✅
- `domains/crm/components/quotes/QuotesManager.js` - setItemStatus() pre-check ✅
- `domains/crm/components/quotes/QuoteDetailsPanel.jsx` - Missing deliveryDate banner + Teslimat Tarihi edit field + createdAt toLocaleString fix ✅
- `domains/crm/utils/table-utils.js` - Tarih formatı timezone fix ✅
- `src/components/modals/DetailModal.js` - createdAt timezone fix ✅
- `domains/crm/api/services/quoteService.js` - isCustomer/customerId mapping ✅

**Veritabanı Değişiklikleri**:
- `quotes.quotes` tablosundan eski `iscustomer` ve `customerid` (snake_case) kolonları silindi
- Sadece `isCustomer` ve `customerId` (camelCase) kolonları aktif

---

### PROMPT-14: Fiyat Sistemi ve Uyarı Entegrasyonu ✅

**Durum**: TAMAMLANDI (3 Aralık 2025)

**Amaç**: QuoteDetailsPanel'de fiyat uyarı sistemini (sarı/kırmızı banner) entegre etmek ve emoji'leri Lucide ikonlarla değiştirmek

**Yapılan Değişiklikler**:

1. **Icons.jsx güncellendi** ✅:
   - `AlertTriangle`, `RefreshCw`, `Wallet` ikonları eklendi
   - Export listesi güncellendi

2. **QuoteDetailsPanel.jsx güncellendi** ✅:
   - `getPriceWarningInfo()` fonksiyonu eklendi (inline)
   - Fiyat uyarı banner'ı eklendi (kırmızı: price-drift, sarı: version-drift)
   - Manuel fiyat toggle'da 🔒/🔓 emoji yerine `Lock`/`Unlock` Lucide ikonları kullanıldı
   - Teslimat tarihi uyarısında ⚠️ emoji yerine `AlertTriangle` ikonu kullanıldı

3. **priceController.js güncellendi** ✅:
   - Price settings güncellemesinde formül DELETE yerine UPDATE yapılıyor (FK violation fix)
   - Formül güncellendiğinde quotes otomatik olarak `priceStatus = 'outdated'` işaretleniyor

4. **quoteController.js güncellendi** ✅:
   - `POST /api/quotes/:id/manual-price` - Hem `{ price, note }` hem `{ manualPrice, reason }` destekleniyor
   - `DELETE /api/quotes/:id/manual-price` - Yeni endpoint eklendi
   - `GET /api/quotes/:id/price-comparison` - Yeni endpoint eklendi

5. **quotes.js (model) güncellendi** ✅:
   - `normalizePriceStatus()` helper eklendi - string priceStatus'u objeye dönüştürür
   - `clearManualPrice()` fonksiyonu eklendi
   - `getAll()` ve `getById()` çağrılarında priceStatus normalize ediliyor

6. **priceFormulas.js güncellendi** ✅:
   - `getBySettingId()` fonksiyonu eklendi

7. **quoteService.js güncellendi** ✅:
   - `clearManualPrice()` fonksiyonu eklendi

**Oluşturulan/Güncellenen Dosyalar**:
- `shared/components/Icons.jsx` ✅
- `domains/crm/components/quotes/QuoteDetailsPanel.jsx` ✅
- `domains/crm/api/controllers/priceController.js` ✅
- `domains/crm/api/controllers/quoteController.js` ✅
- `domains/crm/api/services/quoteService.js` ✅
- `db/models/quotes.js` ✅
- `db/models/priceFormulas.js` ✅

**Teknik Notlar**:
- `priceStatus` veritabanında string olarak saklanıyor ama frontend obje bekliyor
- `normalizePriceStatus()` bu dönüşümü otomatik yapıyor
- Formül güncellendiğinde eski formülü silmek yerine güncelliyoruz (FK constraint)

---

### PROMPT-15: Customer Dropdown - Hybrid Search + Dropdown ✅

**Amaç**: Mevcut müşteri seçiminde input'a tıklandığında otomatik dropdown açılması ve hem search hem dropdown ile seçim yapılabilmesi

**Tamamlandı**: 3 Aralık 2025

**Yapılan Değişiklikler**:

1. **CustomerSearchInput.jsx - Complete Rewrite**:
   - `loadAllCustomers()` - Focus'ta ilk 50 müşteriyi yükler
   - `customersLoaded` state - Duplicate fetch'leri önler
   - Local filtering (150ms debounce - API'den daha hızlı)
   - `filteredResults` - allCustomers'dan searchTerm'e göre filtreleme
   - Alfabetik sıralama (company/name'e göre)
   - Loading state gösterimi
   - Müşteri sayısı gösterimi ("25 müşteri bulundu")
   - Dropdown icon input yanında
   - Tarayıcı autocomplete engelleme (autoComplete, data-lpignore, data-form-type)
   - Dropdown sıralaması: Şirket Adı — Yetkili Adı | E-posta | Telefon

2. **quotes.css - Yeni Stiller**:
   - `.customer-search-count` - Müşteri sayısı badge'i
   - `.customer-search-loading-state` - Loading mesajı
   - `.customer-search-input-wrapper` - Input + dropdown icon container
   - `.customer-search-dropdown-icon` - Aşağı ok iconu
   - `.customer-search-item-company` - Şirket adı (kalın, önce)
   - `.customer-search-item-name` - Yetkili adı (küçük, tire ile)
   - `.customer-search-item-secondary` - İletişim bilgileri
   - `.customer-search-dropdown` z-index: 10000 (modal overlay fix)
   - `.quote-modal-container` overflow: visible
   - `.quote-modal-content:has(.customer-search-dropdown)` overflow: visible
   - `.quote-modal-footer` position: relative, z-index: 1

**Test Kriterleri**:
- [x] Input'a tıklandığında dropdown açılıyor
- [x] Dropdown'da ilk 50 müşteri listeleniyor
- [x] Arama yapıldığında sonuçlar local olarak filtreleniyor
- [x] Müşteri seçilince dropdown kapanıyor ve form dolduruluyor
- [x] Loading state düzgün görünüyor
- [x] Boş arama durumunda tüm liste görünüyor
- [x] Tarayıcı/şifre yöneticisi autocomplete engellenmiş
- [x] Dropdown modal footer'ın üstünde görünüyor
- [x] Şirket adı kalın ve önce, yetkili adı küçük ve sonra

**Güncellenen Dosyalar**:
- `domains/crm/components/quotes/CustomerSearchInput.jsx` - Complete rewrite (~270 satır)
- `domains/crm/styles/quotes.css` - ~100 satır yeni/güncellenmiş CSS

---

### PROMPT-16: Quote Detaylarında Dosya Görüntüleme ✅

**Amaç**: Quote detay panelinde yüklenen dosyaların (teknik dosyalar ve ürün görselleri) düzgün görüntülenmesini sağlamak

**Tamamlandı**: 3 Aralık 2025

**Yapılan Değişiklikler**:

1. **quotes.js model güncellendi**:
   - `getById()` metodunda dosyalar fileType'a göre ayrılıyor
   - `technicalFiles`: fileType='technical' veya 'tech' olanlar
   - `productImages`: fileType='product' veya 'image' olanlar
   - Backward compatible: `files` array'i de dönüyor

2. **QuoteDetailsPanel.jsx güncellendi**:
   - State initialization: `quote.technicalFiles || quote.files` fallback
   - Teknik dosyalar bölümü iyileştirildi:
     - Dosya sayısı badge'i
     - Dosya ikonu (📄 PDF, 📐 CAD, 🖼️ image)
     - Dosya boyutu (KB/MB formatında)
     - Yüklenme tarihi
     - İndir butonu (data URL veya API path desteği)
     - Sil butonu (edit modda)
     - Boş state placeholder
   - Ürün görselleri bölümü iyileştirildi:
     - Görsel sayısı badge'i
     - Thumbnail grid (120px min width)
     - Tıkla: tam boyut göster
     - Dosya adı gösterimi
     - Sil butonu (edit modda)
     - Boş state placeholder

**Test Kriterleri**:
- [x] Quote detayında teknik dosyalar bölümü görünüyor
- [x] Quote detayında ürün görselleri bölümü görünüyor
- [x] Yüklü dosyalar listeleniyor (view modda)
- [x] Dosya indirme çalışıyor (data URL ve API path)
- [x] Image dosyaları için thumbnail görünüyor
- [x] Görsele tıklanınca tam boyut açılıyor
- [x] Edit modda dosya silinebiliyor
- [x] Edit modda yeni dosya eklenebiliyor
- [x] Boş state placeholder gösteriliyor

**Güncellenen Dosyalar**:
- `db/models/quotes.js` - getById() dosya ayırma
- `domains/crm/components/quotes/QuoteDetailsPanel.jsx` - Geliştirilmiş dosya UI

---

### SYNC-FIX: AddQuote → QuoteDetails Senkronizasyon Düzeltmesi ✅

**Amaç**: AddQuoteModal'da girilen yeni müşteri bilgilerinin ve dosyaların QuoteDetailsPanel'de tam olarak görüntülenmesi

**Tamamlandı**: 3 Aralık 2025

**Tespit Edilen Sorunlar**:

1. **SORUN 1: Quote → Customer JOIN Eksik** (KRİTİK):
   - `QuoteDetailsPanel.jsx` `quote.customer` nesnesini bekliyordu
   - `quotes.js getById()` metodu customer JOIN yapmıyordu
   - 13 ek müşteri alanı (taxOffice, taxNumber, website, fax, iban, bankName, contactPerson, contactTitle, country, city, postalCode) görüntülenemiyordu

2. **SORUN 2: Dosya Yükleme Backend'de İşlenmiyordu** (KRİTİK):
   - AddQuoteModal dosyaları `files` ve `productImages` olarak payload'a ekliyordu
   - POST /api/quotes endpoint'i bu dosyaları hiç işlemiyordu!
   - Dosyalar kayboluyor, QuoteDetailsPanel'de görünmüyordu

3. **SORUN 3: QuoteDetailsPanel dosya state dependency eksik**:
   - useEffect dosya değişikliklerini izlemiyordu
   - Quote yenilendiğinde dosyalar state'e yansımıyordu

**Yapılan Değişiklikler**:

1. **quotes.js model güncellendi** (getById):
   ```javascript
   // Customer JOIN eklendi
   let customer = null;
   if (quote.customerId) {
     customer = await db('quotes.customers')
       .where('id', quote.customerId)
       .first();
   }
   
   return {
     ...quote,
     customer: customer // Full customer data for QuoteDetailsPanel
   };
   ```

2. **quoteController.js güncellendi** (POST /api/quotes):
   ```javascript
   // Request body'den files ve productImages alınıyor
   const { files, productImages, ...otherData } = req.body;
   
   // Quote oluşturulduktan sonra dosyalar kaydediliyor
   if (files && files.length > 0) {
     for (const file of files) {
       await quoteService.addFile({
         quoteId: quote.id,
         fileType: 'technical',
         fileName: file.name || file.fileName,
         filePath: file.url || file.filePath,
         mimeType: file.type || file.mimeType,
         fileSize: file.size || file.fileSize,
         uploadedBy
       });
     }
   }
   
   if (productImages && productImages.length > 0) {
     for (const img of productImages) {
       await quoteService.addFile({
         quoteId: quote.id,
         fileType: 'product',
         ...
       });
     }
   }
   
   // Dosyalarla birlikte tam quote döndürülüyor
   const fullQuote = await quoteService.getQuoteById(quote.id);
   res.status(201).json({ success: true, quote: fullQuote });
   ```

3. **QuoteDetailsPanel.jsx güncellendi** (useEffect):
   ```javascript
   // Dependency'lere dosya state'leri eklendi
   }, [quote?.id, quote?.technicalFiles, quote?.productImages, quote?.files, ...])
   ```

**Test Kriterleri**:
- [x] Mevcut müşteri ile quote oluştur → QuoteDetailsPanel'de müşteri detayları görünüyor
- [x] Yeni müşteri ile quote oluştur → Customer DB'ye kaydediliyor, quote.customer tam veri içeriyor
- [x] QuoteDetailsPanel'de İletişim bölümü (contactPerson, website, fax) görünüyor
- [x] QuoteDetailsPanel'de Finans bölümü (taxOffice, taxNumber, iban, bankName) görünüyor
- [x] QuoteDetailsPanel'de Konum bölümü (city, country, postalCode) görünüyor
- [x] "Müşteri Detayı" linki çalışıyor (customerId varsa)
- [x] AddQuoteModal'da yüklenen teknik dosyalar DB'ye kaydediliyor
- [x] AddQuoteModal'da yüklenen ürün görselleri DB'ye kaydediliyor
- [x] QuoteDetailsPanel'de Teknik Dosyalar bölümünde dosyalar görünüyor
- [x] QuoteDetailsPanel'de Ürün Görselleri bölümünde görseller görünüyor
- [x] Dosya indirme çalışıyor (data URL için downloadDataUrl, path için window.open)

**Güncellenen Dosyalar**:
- `db/models/quotes.js` - getById() customer JOIN eklendi ✅
- `domains/crm/api/controllers/quoteController.js` - POST /api/quotes dosya kaydetme eklendi ✅
- `domains/crm/components/quotes/QuoteDetailsPanel.jsx` - useEffect dependency güncellendi ✅

---

### PROMPT-17: Türkiye Adres Dropdown Sistemi (Cascading)

**Amaç**: Ülke seçimi Türkiye olduğunda İl → İlçe → Mahalle cascading dropdown sistemi ve otomatik posta kodu

**Ön Araştırma** (İlk yapılacak adımlar):
1. `list_dir` ile shared klasörünü incele - data klasörü var mı
2. `grep_search` ile mevcut country/city pattern'lerini bul: `country|city|district`
3. `read_file` ile AddCustomerModal.jsx'i oku - adres alanlarını incele
4. `read_file` ile QuoteCustomerStep.jsx'i oku - adres alanlarını incele
5. Türkiye il/ilçe/mahalle JSON verisi için kaynak araştır (örn: GitHub'daki açık veri setleri)

**Yapılacaklar**:

1. **Türkiye adres verisi oluştur**:
   - `shared/data/turkey-addresses.json` dosyası oluştur
   - İl listesi (81 il)
   - İlçe listesi (il bazında)
   - Mahalle listesi (ilçe bazında) - opsiyonel, çok büyük olabilir
   - Posta kodları (ilçe bazında)

2. **AddressDropdown component oluştur**:
   - `shared/components/AddressDropdown.jsx`
   - Ülke dropdown (Türkiye en üstte)
   - Türkiye seçilince: İl → İlçe → Mahalle cascading
   - Diğer ülke seçilince: Serbest text input
   - Posta kodu otomatik set (değiştirilebilir)

3. **AddCustomerModal.jsx güncelle**:
   - Adres bölümünde AddressDropdown kullan
   - Form state'i güncelle

4. **QuoteCustomerStep.jsx güncelle**:
   - Adres bölümünde AddressDropdown kullan (yeni müşteri için)

5. **CustomerDetailsPanel.jsx güncelle** (gerekirse):
   - Edit modda AddressDropdown kullan

**Test Kriterleri**:
- [ ] Ülke dropdown'da Türkiye en üstte görünüyor
- [ ] Türkiye seçilince İl dropdown aktif oluyor
- [ ] İl seçilince İlçe dropdown aktif ve filtrelenmiş
- [ ] İlçe seçilince Mahalle dropdown aktif (varsa)
- [ ] İlçe seçilince posta kodu otomatik dolduruluyor
- [ ] Posta kodu manuel değiştirilebiliyor
- [ ] Diğer ülke seçilince text inputlar görünüyor
- [ ] Form submit'te tüm adres verileri kaydediliyor

**Oluşturulan/Güncellenen Dosyalar**:
- `shared/data/turkey-addresses.json` (yeni)
- `shared/components/AddressDropdown.jsx` (yeni)
- `domains/crm/components/customers/AddCustomerModal.jsx`
- `domains/crm/components/quotes/QuoteCustomerStep.jsx`
- `domains/crm/components/customers/CustomerDetailsPanel.jsx`

---

### PROMPT-18: CRM İsimlendirme Tutarlılığı

**Amaç**: AddCustomerModal, QuoteCustomerStep ve CustomerDetailsPanel'de alan isimlerinin tutarlı hale getirilmesi

**Ön Araştırma** (İlk yapılacak adımlar):
1. `read_file` ile AddCustomerModal.jsx'i oku - tüm label'ları listele
2. `read_file` ile QuoteCustomerStep.jsx'i oku - tüm label'ları listele
3. `read_file` ile CustomerDetailsPanel.jsx'i oku - tüm label'ları listele
4. `grep_search` ile label pattern'lerini bul: `label.*Müşteri|label.*Yetkili|label.*İletişim`
5. Mevcut tutarsızlıkları listele ve standart belirle

**Yapılacaklar**:

1. **İsimlendirme standardı belirle**:
   ```
   | Alan | Standart İsim |
   |------|---------------|
   | name | Müşteri Adı |
   | company | Şirket |
   | contactPerson | Yetkili Kişi |
   | contactTitle | Ünvan |
   | email | E-posta |
   | phone | Telefon |
   | fax | Faks |
   | website | Website |
   | address | Adres |
   | city | Şehir |
   | country | Ülke |
   | postalCode | Posta Kodu |
   | taxOffice | Vergi Dairesi |
   | taxNumber | Vergi No |
   | iban | IBAN |
   | bankName | Banka Adı |
   | notes | Notlar |
   ```

2. **AddCustomerModal.jsx güncelle**:
   - Tüm label'ları standarda göre düzenle
   - Section başlıklarını standartlaştır

3. **QuoteCustomerStep.jsx güncelle**:
   - Tüm label'ları standarda göre düzenle
   - AddCustomerModal ile aynı sıralama

4. **CustomerDetailsPanel.jsx güncelle**:
   - Tüm label'ları standarda göre düzenle
   - View ve edit modda tutarlı isimler

5. **Placeholder text'leri standartlaştır**:
   - Tüm formlarda aynı placeholder'lar

**Test Kriterleri**:
- [ ] AddCustomerModal'daki tüm label'lar standart
- [ ] QuoteCustomerStep'teki tüm label'lar standart
- [ ] CustomerDetailsPanel'deki tüm label'lar standart
- [ ] Section başlıkları tutarlı
- [ ] Placeholder text'ler tutarlı
- [ ] Form sıralaması tutarlı (Temel → İletişim → Adres → Finans → Notlar)

**Oluşturulan/Güncellenen Dosyalar**:
- `domains/crm/components/customers/AddCustomerModal.jsx`
- `domains/crm/components/quotes/QuoteCustomerStep.jsx`
- `domains/crm/components/customers/CustomerDetailsPanel.jsx`

---

### ✅ PROMPT-19: CRM Emoji → Lucide İkon Değişimi (3 Aralık 2025)

**Amaç**: CRM arayüzündeki tüm emoji'lerin Lucide ikonlarla değiştirilmesi

**Ön Araştırma** (İlk yapılacak adımlar):
1. `grep_search` ile CRM'deki tüm emoji kullanımlarını bul: `📋|👤|📞|💰|📍|📝|✕|➕|🔍|🔒|⏳|📊|🗑️`
2. `read_file` ile Icons.jsx'i oku - mevcut Lucide ikonları listele
3. `list_dir` ile domains/crm/components'ı incele - hangi dosyalarda emoji var
4. Lucide icon library'de karşılık gelen ikonları bul

**Yapılacaklar**:

1. **Icons.jsx güncelle** - Eksik ikonları ekle:
   ```javascript
   import {
     User,              // 👤
     UserPlus,          // ➕ (yeni müşteri)
     FileText,          // 📋
     Phone,             // 📞
     Wallet,            // 💰
     MapPin,            // 📍
     FileEdit,          // 📝
     X,                 // ✕
     Search,            // 🔍
     Lock,              // 🔒
     Unlock,            // 🔓
     Loader2,           // ⏳
     BarChart3,         // 📊
     Trash2,            // 🗑️
     Calendar,          // 📅
     Building,          // 🏢 (şirket için)
     CreditCard,        // 💳 (finans için)
   } from 'lucide-react'
   ```

2. **QuoteCustomerStep.jsx güncelle**:
   - Customer type selector ikonları: User, UserPlus, FileText
   - Section başlıkları: User, Wallet, MapPin, Phone

3. **QuoteReviewStep.jsx güncelle**:
   - Section ikonları: User, FileEdit
   - Close butonu: X

4. **QuoteFormStep.jsx güncelle**:
   - Empty state ikonu: FileEdit

5. **AddQuoteModal.jsx güncelle**:
   - Step indicator ikonları: User, FileText, CheckCircle

6. **CustomerSearchInput.jsx güncelle**:
   - Search ikonu: Search
   - Loading ikonu: Loader2
   - Clear butonu: X

7. **AddCustomerModal.jsx güncelle**:
   - Section başlıkları: FileText, User, Phone, MapPin, Wallet, FileEdit

8. **QuotesManager.js güncelle**:
   - Action butonları: Plus, BarChart3, Trash2, Lock

9. **PriceStatusBadge.js güncelle**:
   - Lock ikonu: Lock

**Test Kriterleri**:
- [x] CRM arayüzünde hiç emoji kalmadı (console.log hariç)
- [x] Tüm ikonlar Lucide'dan geliyor
- [x] İkonlar doğru boyutta görünüyor (12-18px)
- [x] İkon renkleri tema ile uyumlu
- [x] Build hatasız tamamlanıyor
- [x] Console'da ikon uyarısı yok

**Oluşturulan/Güncellenen Dosyalar**:
- `shared/components/Icons.jsx` - User, UserPlus, MapPin, FileEdit, Paperclip, FolderOpen, Image, MessageSquare, PenTool, HelpCircle, FileSpreadsheet eklendi
- `domains/crm/components/quotes/QuoteCustomerStep.jsx` - Section başlıkları ve customer type ikonları
- `domains/crm/components/quotes/QuoteReviewStep.jsx` - Section ikonları, dosya/görsel ikonları, close butonları
- `domains/crm/components/quotes/QuoteFormStep.jsx` - Empty state ve file notice ikonları
- `domains/crm/components/quotes/AddQuoteModal.jsx` - Step indicator ve close button ikonları
- `domains/crm/components/quotes/CustomerSearchInput.jsx` - Clear button ve loading spinner
- `domains/crm/components/quotes/QuoteDetailsPanel.jsx` - Adres, dosya ve görsel section ikonları
- `domains/crm/components/customers/AddCustomerModal.jsx` - Section başlık ikonları
- `domains/crm/components/customers/CustomerDetailsPanel.jsx` - Section başlık ve action button ikonları
- `domains/crm/components/customers/CustomersManager.jsx` - Filter ve empty state ikonları
- `domains/crm/components/pricing/PriceVersionComponents.jsx` - Status badge ve button ikonları
- `domains/crm/components/pricing/PricingManager.jsx` - Alert ve info text ikonları

---

### Prompt Özet Tablosu

| Prompt | Konu | Öncelik | Durum |
|--------|------|---------|-------|
| PROMPT-11 | Quote Edit Panel Fix | Yüksek | ✅ |
| PROMPT-12 | Üretim Plan Kaydetme Fix | Yüksek | ✅ |
| PROMPT-13 | Teslimat Validasyonu | Yüksek | ✅ |
| PROMPT-14 | Fiyat Sistemi Entegrasyonu | Yüksek | ✅ |
| PROMPT-15 | Customer Dropdown | Orta | ✅ |
| PROMPT-16 | Dosya Görüntüleme | Orta | ✅ |
| PROMPT-17 | Türkiye Adres Dropdown | Orta | ✅ |
| PROMPT-18 | İsimlendirme Tutarlılığı | Düşük | ✅ |
| PROMPT-19 | Emoji → Lucide İkon | Düşük | ✅ |

### Önerilen Uygulama Sırası

1. **Kritik Fixler** (önce): PROMPT-11, PROMPT-12, PROMPT-13
2. **UX İyileştirmeleri** (sonra): PROMPT-14, PROMPT-15, PROMPT-16
3. **Polish** (en son): PROMPT-17, PROMPT-18, PROMPT-19

### Notlar

- Her prompt için bağımlılıklar belirtildi
- Test kriterleri spesifik ve ölçülebilir
- Commit stratejisi: `feat(crm): [PROMPT-XX] description`
- PROMPT-17 için Türkiye adres verisi harici kaynak gerekebilir


---

## SYNC-FIX: Quote Dosya Senkronizasyonu (3 Aralık 2025)

### Sorun Analizi

Kapsamlı frontend-backend-db senkronizasyon analizi sonucu tespit edilen kritik hatalar:

1. **Customer JOIN Eksikliği**: `quotes.js` getById() müşteri bilgilerini JOIN yapmıyordu
2. **Dosya Kaydetme Eksikliği**: POST /api/quotes endpoint'i dosyaları kaydetmiyordu
3. **API Fonksiyonları Eksikliği**: Frontend'de addQuoteFile/deleteQuoteFile yoktu
4. **useEffect Dosya Silme Sorunu**: QuotesManager'daki useEffect dosyaları sıfırlıyordu
5. **Payload Too Large**: Express body-parser limiti 5MB ile sınırlıydı
6. **FilePath Too Long**: Data URL DB'ye kaydedilmeye çalışılıyordu (varchar 500 limit)
7. **Dosya Upload State Sorunu**: Dosya yükleme sonrası useEffect state'i sıfırlıyordu

### Uygulanan Düzeltmeler

| Dosya | Değişiklik |
|-------|------------|
| `db/models/quotes.js` | getById() customer LEFT JOIN |
| `domains/crm/api/controllers/quoteController.js` | POST dosya kaydetme, disk'e yazma |
| `domains/crm/components/quotes/QuotesManager.js` | useEffect files preserve |
| `domains/crm/components/quotes/QuoteDetailsPanel.jsx` | Dosya state ayrımı, API entegrasyonu |
| `shared/lib/api.js` | addQuoteFile, deleteQuoteFile fonksiyonları |
| `server.js` | Body parser limit 50MB |

### Test Sonuçları ✅

- [x] Dosya yüklenince backend'e kaydediliyor
- [x] Dosya yüklendikten sonra arayüzde hemen görünüyor
- [x] Sayfa yenilenince dosyalar korunuyor
- [x] Dosya silme çalışıyor
- [x] Büyük dosyalar (13MB+) yüklenebiliyor
- [x] Farklı teklif seçilince dosyalar doğru yükleniyor
- [x] Customer bilgileri QuoteDetailsPanel'de görünüyor

---

## PROMPT-17: Türkiye Adres Dropdown Sistemi ✅ TAMAMLANDI (3 Aralık 2025)

### Yapılan Değişiklikler

1. **turkey-addresses.js** - Türkiye il/ilçe verileri oluşturuldu:
   - 81 il listesi (TURKEY_CITIES)
   - 12 büyük şehir için ilçe verileri (TURKEY_DISTRICTS)
   - Posta kodları (il ve ilçe bazında)
   - 22 ülke listesi (COUNTRIES - Türkiye en üstte)
   - Helper fonksiyonlar: getDistrictsByCity, getCityByName, getDistrictsByCityName

2. **TurkeyAddressDropdown.jsx** - Cascading dropdown component:
   - Ülke dropdown (Türkiye seçilince cascading aktif)
   - İl dropdown (81 il)
   - İlçe dropdown (seçili ile göre filtrelenir)
   - Posta kodu (otomatik doldurulur, manuel değiştirilebilir)
   - Diğer ülke seçilince: serbest text input

3. **AddCustomerModal.jsx** güncellendi:
   - TurkeyAddressDropdown entegre edildi
   - Form state'e `district` alanı eklendi

4. **QuoteCustomerStep.jsx** güncellendi:
   - TurkeyAddressDropdown entegre edildi
   - customerData'ya `district` alanı eklendi

### Test Kriterleri

- [x] Ülke dropdown'da Türkiye en üstte görünüyor
- [x] Türkiye seçilince İl dropdown aktif oluyor
- [x] İl seçilince İlçe dropdown aktif ve filtrelenmiş
- [x] İlçe seçilince posta kodu otomatik dolduruluyor
- [x] Posta kodu manuel değiştirilebiliyor
- [x] Diğer ülke seçilince text input görünüyor
- [x] Form submit'te tüm adres verileri kaydediliyor

### Desteklenen İller (İlçe verisi mevcut)

- İstanbul (39 ilçe)
- Ankara (25 ilçe)
- İzmir (30 ilçe)
- Bursa (17 ilçe)
- Antalya (19 ilçe)
- Kocaeli (12 ilçe)
- Gaziantep (9 ilçe)
- Konya (31 ilçe)
- Adana (15 ilçe)
- Mersin (13 ilçe)

### Oluşturulan/Güncellenen Dosyalar

- `shared/data/turkey-addresses.js` (yeni) ✅
- `shared/components/TurkeyAddressDropdown.jsx` (yeni) ✅
- `domains/crm/components/customers/AddCustomerModal.jsx` ✅
- `domains/crm/components/quotes/QuoteCustomerStep.jsx` ✅
