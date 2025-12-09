# 📦 İrsaliye & Fatura Ayrışma Planı (v3.0)

> **Branch**: `invoice-export`  
> **Tarih**: 9 Aralık 2025  
> **Versiyon**: 3.0  
> **Önceki Versiyon**: `INVOICE-EXPORT-INTEGRATION.md` (v2.0 - tamamlandı)  
> **Amaç**: Bu dokümanı Gemini'ye göndererek doğrulama ve düzeltme almak

---

## 🎯 KRİTİK KARARLAR (ONAYLANDI)

| # | Karar | Detay | Onay Tarihi |
|---|-------|-------|-------------|
| 1 | **Stok Düşürme Zamanı** | Export edildiğinde (irsaliye oluşturulduğunda) | 9 Aralık 2025 |
| 2 | **Proforma Numaralama** | BeePlan otomatik: PF-YYYY-XXXX, kullanıcı override edebilir | 9 Aralık 2025 |
| 3 | **İrsaliye ↔ Fatura Ayrımı** | Ayrı süreçler, birbirine karıştırılmayacak | 9 Aralık 2025 |
| 4 | **7 Gün Kuralı** | İrsaliye kesilince 7 gün içinde fatura kesilmeli (uyarı sistemi) | 9 Aralık 2025 |
| 5 | **Dokümantasyon** | Mevcut INVOICE-EXPORT-INTEGRATION.md'ye Bölüm 9 olarak eklenecek | 9 Aralık 2025 |

---

## 📋 İÇİNDEKİLER

1. [Mevcut Durum Özeti](#1-mevcut-durum-özeti)
2. [Problem Tanımı](#2-problem-tanımı)
3. [Yeni Mimari: İrsaliye ↔ Fatura Ayrımı](#3-yeni-mimari-irsaliye--fatura-ayrımı)
4. [Veritabanı Değişiklikleri](#4-veritabanı-değişiklikleri)
5. [CRM Sistemi Etkileri](#5-crm-sistemi-etkileri)
6. [Teklif Paneli Değişiklikleri](#6-teklif-paneli-değişiklikleri)
7. [Sevkiyat Paneli Değişiklikleri](#7-sevkiyat-paneli-değişiklikleri)
8. [Türk e-Belge Standartları](#8-türk-e-belge-standartları)
9. [UI/UX Değişiklikleri](#9-uiux-değişiklikleri)
10. [Backend Değişiklikleri](#10-backend-değişiklikleri)
11. [Dosya Konumları](#11-dosya-konumları)
12. [Implementation Planı](#12-implementation-planı)
13. [Gemini İçin Sorular](#13-gemini-i̇çin-sorular)

---

## 1. MEVCUT DURUM ÖZETİ

### 1.1. Tamamlanan Çalışmalar (v2.0)

✅ **FAZ 1: Veritabanı** (Migration 036)
- `materials.vat_exemption_codes` - KDV muafiyet kodları (14 kayıt)
- `materials.withholding_rates` - Tevkifat oranları (7 kayıt)
- `materials.shipment_settings` - Sistem ayarları (8 kayıt)
- `materials.shipments` - 24 yeni kolon eklendi
- `materials.shipment_items` - 4 yeni kolon eklendi
- `quotes.customers` - erpAccountCode eklendi

✅ **FAZ 2: Backend API**
- Lookup endpoint'leri (vat-exemptions, withholding-rates, settings)
- Shipment CRUD (yeni alanlarla)
- Stok validasyonu (yetersizse BLOK)
- Import endpoint (dosya + stok düşürme)
- Export endpoint (csv/xml/pdf/json)

✅ **FAZ 3: Frontend**
- AddShipmentModal (3 adımlı wizard)
- CRM müşteri dropdown + inline ekleme
- 5 accordion (para birimi, iskonto, vergi, lot, ek bilgi)
- ShipmentsTable (yeni kolonlar + filtreler)
- ShipmentDetailsPanel (detay görüntüleme)
- ExportSuccessModal

✅ **FAZ 4: Export Generators**
- CSV (UTF-8 BOM, ayarlanabilir ayraç)
- XML (Logo Tiger formatı)
- PDF (pdfkit)
- JSON

### 1.2. Mevcut Yapının Problemi

❌ **AddShipmentModal Hibrit Oldu:**
- "Belge Tipi" seçimi var: İrsaliye / Fatura / İkisi Birden
- KDV, iskonto, para birimi, export ayarları aynı modal'da
- Bu karmaşıklık Türk e-İrsaliye/e-Fatura mantığına aykırı

❌ **Kavram Karışıklığı:**
- İrsaliye = Fiziksel mal hareketi (SADECE BUNU yapmalı Shipments paneli)
- Fatura = Mali belge (BUNU Quotes panelinden yapmalıyız)
- İkisini birleştirmek yasal süreçleri karmaşıklaştırıyor

---

## 2. PROBLEM TANIMI

### 2.1. Türk Mevzuatına Göre Süreç

```
                    7 GÜN KURALI
┌─────────────────┐              ┌─────────────────┐
│   SEVKİYAT      │  ←──────────→│   FATURA        │
│   (İrsaliye)    │              │                 │
└────────┬────────┘              └────────┬────────┘
         │                                │
         ▼                                ▼
   • Mal çıkışı                    • Mali belge
   • Şoför/Plaka                   • KDV hesabı
   • Fiziksel teslimat             • Ödeme takibi
   • Stok düşer                    • Logo/Zirve
```

### 2.2. BeePlan'daki Panel Ayrımı

| Panel | Kavram | Amaç |
|-------|--------|------|
| **Sevkiyatlar** (Materials) | Sevk İrsaliyesi | Fiziksel mal gönderimi |
| **Teklifler** (Quotes) | Proforma + Fatura | Mali süreç, fiyatlandırma |

### 2.3. Mevcut Yanlış Akış

```
AddShipmentModal → documentType: 'invoice' → Fatura kesme
                 → exportFormats: ['csv', 'xml'] → Logo'ya fatura export
```

### 2.4. Doğru Akış (Hedef)

```
SEVKİYAT (Shipments Panel):
├── AddShipmentModal → SADECE irsaliye bilgileri
│   ├── Müşteri seçimi
│   ├── Kalemler (stok kodu, miktar, lot/seri)
│   ├── Şoför bilgileri (isim, TCKN, plaka)
│   ├── Nakliyeci bilgileri (opsiyonel)
│   └── Fiyat göster/gizle checkbox (opsiyonel)
├── Export → Logo/Zirve'ye irsaliye export
└── Completed → Stok düşer

FATURA (Quotes Panel):
├── Quote detayında → [Proforma Oluştur] butonu
│   └── PF-2025-0001 numarası otomatik
├── Proforma onaylandıktan sonra → [Faturaya Dönüştür] butonu
│   └── Logo/Zirve'ye fatura export
├── Logo/Zirve'den fatura kesilince → [ETTN Import] butonu
│   └── Fatura numarası + ETTN kaydedilir
└── 7 gün kuralı: İrsaliye kesilmişse 7 gün içinde fatura kesilmeli uyarısı
```

---

## 3. YENİ MİMARİ: İRSALİYE ↔ FATURA AYRIMI

### 3.1. Sevk İrsaliyesi (Waybill) - Shipments Paneli

**Amaç:** Fiziksel mal hareketini belgelemek

**İçermeli:**
- ✅ Müşteri bilgileri (alıcı)
- ✅ Malzeme kalemleri (stok kodu, miktar, birim, lot, seri)
- ✅ Şoför bilgileri (isim, TCKN) - **YENİ, ZORUNLU**
- ✅ Araç bilgileri (plaka) - **YENİ, ZORUNLU**
- ✅ Nakliyeci bilgileri (VKN, ünvan) - Nakliyeci kullanılıyorsa
- ✅ Fiili sevk tarihi/saati - **YENİ, ZORUNLU**
- ✅ Fiyat göster/gizle seçeneği (opsiyonel)
- ✅ Sevkiyat notu

**İÇERMEMELİ (KALDIRILACAK):**
- ❌ documentType radio (waybill/invoice/both) - KALDIRILACAK
- ❌ Para Birimi & Kur accordion - KALDIRILACAK (sadece irsaliye için gereksiz)
- ❌ İskonto Ayarları accordion - KALDIRILACAK
- ❌ Vergi Detayları accordion - KALDIRILACAK
- ❌ Export Ayarları accordion - KALDIRILACAK (hedef program)
- ❌ exportFormats seçimi - KALDIRILACAK

### 3.2. Fatura - Quotes Paneli

**Amaç:** Mali süreç yönetimi

**Yeni Özellikler:**
- Proforma oluşturma (PF-YYYY-XXXX numaralama)
- Proforma → Fatura dönüşümü
- Logo/Zirve'ye fatura export
- ETTN import (GİB numarası)
- 7 gün uyarısı (irsaliye kesilmişse)

### 3.3. Status Akışları

#### 3.3.1. Sevkiyat (Shipment) Status Akışı

```
┌──────────┐     ┌──────────┐     ┌───────────┐     ┌───────────┐
│  pending │ ──▶ │ exported │ ──▶ │ completed │     │ cancelled │
└──────────┘     └────┬─────┘     └───────────┘     └───────────┘
                      │                                   ▲
                      │                                   │
                      └───────────────────────────────────┘
                                (iptal edilebilir)
```

| Status | Açıklama | Stok Durumu | İzin Verilen Aksiyonlar |
|--------|----------|-------------|-------------------------|
| `pending` | Oluşturuldu, export bekleniyor | Değişmez | Düzenle, Sil, Export, İptal |
| `exported` | Export edildi, onay bekleniyor | **DÜŞTÜ** | Import, Re-export, İptal |
| `completed` | Tamamlandı (ETTN alındı) | Düşük | Görüntüle |
| `cancelled` | İptal edildi | **GERİ EKLENDİ** (exported ise) | Görüntüle |

#### 3.3.2. Quote/Fatura Status Akışı

```
┌─────────┐     ┌──────────┐     ┌───────────────┐     ┌─────────────────┐
│   new   │ ──▶ │ approved │ ──▶ │ proformaSent  │ ──▶ │ invoiceExported │
└─────────┘     └──────────┘     └───────────────┘     └────────┬────────┘
                                                                │
                                                                ▼
                                                       ┌─────────────────┐
                                                       │ invoiceImported │
                                                       └─────────────────┘
```

| Status | Açıklama | proformaNumber | invoiceEttn |
|--------|----------|----------------|-------------|
| `new` | Yeni teklif | - | - |
| `approved` | Onaylandı | - | - |
| `proformaSent` | Proforma gönderildi | PF-2025-XXXX | - |
| `invoiceExported` | Fatura export edildi | ✓ | - |
| `invoiceImported` | ETTN alındı | ✓ | ✓ |

### 3.4. İlişki Diyagramı

```
┌─────────────────────────────────────────────────────────────────────┐
│                          QUOTES PANEL                               │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐           │
│  │   QUOTE     │ ──▶ │  PROFORMA   │ ──▶ │   FATURA    │           │
│  │ (Teklif)    │     │ PF-2025-001 │     │ + ETTN      │           │
│  └─────────────┘     └─────────────┘     └──────┬──────┘           │
│                                                  │                  │
└──────────────────────────────────────────────────┼──────────────────┘
                                                   │ 7 gün kuralı
                                                   │ uyarısı
┌──────────────────────────────────────────────────┼──────────────────┐
│                       MATERIALS PANEL             │                  │
│  ┌─────────────┐                                 ▼                  │
│  │  SHIPMENT   │ ◀─────── ilişki ────────────────┘                  │
│  │ (İrsaliye)  │                                                    │
│  │ SHP-2025-001│                                                    │
│  │ + Şoför     │                                                    │
│  │ + Plaka     │                                                    │
│  └─────────────┘                                                    │
│         │                                                           │
│         ▼                                                           │
│   STOK DÜŞER                                                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. VERİTABANI DEĞİŞİKLİKLERİ

### 4.0. Veri İlişkileri (ER Diyagramı)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              QUOTES SCHEMA                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────────┐         ┌──────────────────────────────────────────┐  │
│  │   quotes.customers   │         │            quotes.quotes                  │  │
│  ├─────────────────────┤    1:N  ├──────────────────────────────────────────┤  │
│  │ id (PK)             │◄────────│ customerId (FK)                          │  │
│  │ name                │         │ id (PK) - VARCHAR                        │  │
│  │ company             │         │ customerName, customerEmail...           │  │
│  │ taxOffice           │         │ formTemplateId (FK)                      │  │
│  │ taxNumber           │         │ status                                   │  │
│  │ address, city...    │         │ finalPrice, currency                     │  │
│  │ ─────────────────── │         │ ─────────────────────────────────────── │  │
│  │ erpAccountCode  ✅  │         │ proformaNumber         (YENİ - v3.0)    │  │
│  │ isEInvoiceTaxpayer🆕│         │ proformaCreatedAt      (YENİ - v3.0)    │  │
│  │ gibPkLabel       🆕 │         │ invoiceScenario        (YENİ - v3.0)    │  │
│  │ defaultInvoice   🆕 │         │ invoiceType            (YENİ - v3.0)    │  │
│  │   Scenario          │         │ invoiceNumber          (YENİ - v3.0)    │  │
│  └─────────────────────┘         │ invoiceEttn            (YENİ - v3.0)    │  │
│                                  │ invoiceExportedAt      (YENİ - v3.0)    │  │
│                                  │ invoiceImportedAt      (YENİ - v3.0)    │  │
│                                  │ (relatedShipmentId KALDIRILDI - v3.0.1) │  │
│                                  └────────────────┬─────────────────────────┘  │
│                                                   │                            │
│                                              1:N  │                            │
│                                                   ▼                            │
│                                  ┌──────────────────────────────────────────┐  │
│                                  │        quotes.quote_items (YENİ)         │  │
│                                  ├──────────────────────────────────────────┤  │
│                                  │ id (PK)                                  │  │
│                                  │ quoteId (FK) → quotes.quotes             │  │
│                                  │ lineNumber                               │  │
│                                  │ stockCode, productName                   │  │
│                                  │ quantity, unit                           │  │
│                                  │ unitPrice, taxRate, discountPercent      │  │
│                                  │ subtotal, taxAmount, totalAmount         │  │
│                                  │ vatExemptionId (FK)                      │  │
│                                  │ withholdingRateId (FK)                   │  │
│                                  └──────────────────────────────────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                         ▲
                                         │ relatedQuoteId (FK)
                                         │ (1 Teklif → N İrsaliye)
                                         │ (7 gün kuralı için)
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             MATERIALS SCHEMA                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                       materials.shipments                                 │  │
│  ├──────────────────────────────────────────────────────────────────────────┤  │
│  │ id (PK)                                                                   │  │
│  │ shipmentCode                                                              │  │
│  │ customerId (FK) → quotes.customers                                        │  │
│  │ customerSnapshot (JSONB)                                                  │  │
│  │ status (pending → exported → completed → cancelled)                       │  │
│  │ ─────────────────────────────────────────────────────────────────────    │  │
│  │ TRANSPORT BİLGİLERİ (Mevcut - artık aktif kullanılacak):                 │  │
│  │   driverName           ✅ (ZORUNLU)                                       │  │
│  │   driverTc             ✅ (ZORUNLU - 11 hane)                             │  │
│  │   plateNumber          ✅ (ZORUNLU)                                       │  │
│  │   carrierCompany       ❓ (Nakliyeci varsa)                               │  │
│  │   carrierTcVkn         ❓ (Nakliyeci varsa)                               │  │
│  │ ─────────────────────────────────────────────────────────────────────    │  │
│  │ YENİ ALANLAR (v3.0):                                                      │  │
│  │   dispatchDate     🆕 (DATE - Fiili sevk tarihi)                          │  │
│  │   dispatchTime     🆕 (TIME - Fiili sevk saati)                           │  │
│  │   hidePrice        🆕 (BOOLEAN - Fiyat gizle, default: true)              │  │
│  │   relatedQuoteId   🆕 (VARCHAR - İlişkili Teklif FK)  ← YENİ İLİŞKİ      │  │
│  │ ─────────────────────────────────────────────────────────────────────    │  │
│  │ KULLANILMAYACAK (v3.0 sonrası):                                          │  │
│  │   documentType         → Sadece 'waybill' olacak                         │  │
│  │   includePrice         → hidePrice ile değiştirildi                      │  │
│  │   discountType/Value   → Fatura tarafında                                │  │
│  │   exportTarget         → Sadeleştirilecek                                │  │
│  └────────────────────────────────────┬─────────────────────────────────────┘  │
│                                       │                                        │
│                                  1:N  │                                        │
│                                       ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │                     materials.shipment_items                              │  │
│  ├──────────────────────────────────────────────────────────────────────────┤  │
│  │ id (PK)                                                                   │  │
│  │ shipmentId (FK) → shipments                                               │  │
│  │ materialCode, materialName                                                │  │
│  │ quantity, unit                                                            │  │
│  │ lotNumber, serialNumber                                                   │  │
│  │ unitPrice, taxRate (opsiyonel - hidePrice = false ise)                   │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│  ┌────────────────────────┐  ┌─────────────────────────┐                       │
│  │ vat_exemption_codes    │  │   withholding_rates     │                       │
│  │ (14 kayıt - mevcut)    │  │   (7 kayıt - mevcut)    │                       │
│  └────────────────────────┘  └─────────────────────────┘                       │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘

> ⚠️ **KRİTİK İLİŞKİ DEĞİŞİKLİĞİ (v3.0.1):**
> - ESKİ: `quotes.quotes.relatedShipmentId` → 1 Quote = 1 Shipment ❌
> - YENİ: `materials.shipments.relatedQuoteId` → 1 Quote = N Shipments ✅
> - Parçalı sevkiyat desteği için ilişki tersine çevrildi!

### 4.1. Migration 037: `037_waybill_invoice_separation.sql`

#### 4.1.1. `materials.shipments` - Yeni Alanlar (Transport Bilgileri)

```sql
-- Mevcut: driverName, driverTc, plateNumber, carrierCompany, carrierTcVkn zaten var
-- AMA frontend'de kullanılmıyor! Şimdi kullanacağız.

-- Yeni alanlar:
ALTER TABLE materials.shipments
ADD COLUMN IF NOT EXISTS "dispatchDate" DATE,              -- Fiili sevk tarihi
ADD COLUMN IF NOT EXISTS "dispatchTime" TIME,              -- Fiili sevk saati  
ADD COLUMN IF NOT EXISTS "hidePrice" BOOLEAN DEFAULT true; -- Fiyat gizle/göster

-- ⚠️ KRİTİK: Quote-Shipment İlişkisi (1 Teklif → N İrsaliye)
-- Parçalı sevkiyat desteği için ilişki SHIPMENTS tarafında tutulur
ALTER TABLE materials.shipments
ADD COLUMN IF NOT EXISTS "relatedQuoteId" VARCHAR(50);     -- İlişkili teklif ID

-- Foreign key (Quote ilişkisi)
ALTER TABLE materials.shipments
ADD CONSTRAINT fk_shipments_quote
FOREIGN KEY ("relatedQuoteId") REFERENCES quotes.quotes(id)
ON DELETE SET NULL;

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_shipments_related_quote
ON materials.shipments("relatedQuoteId")
WHERE "relatedQuoteId" IS NOT NULL;

-- Kaldırılacak/kullanılmayacak alanlar (mevcut, ama artık sadece irsaliye için):
-- documentType → 'waybill' olarak sabitlenecek (frontend'den kaldırılacak)
-- includePrice → hidePrice tersine çevrilecek
-- discountType, discountValue, discountTotal → Fatura tarafına taşınacak
-- exportTarget, exportFormats → Sadeleştirilecek
```

#### 4.1.2. `quotes.quotes` - Yeni Alanlar (Fatura Bilgileri)

```sql
-- Proforma numarası için sequence (otomatik numara üretimi)
CREATE SEQUENCE IF NOT EXISTS quotes.proforma_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Yeni alanlar
ALTER TABLE quotes.quotes
ADD COLUMN IF NOT EXISTS "proformaNumber" VARCHAR(50),       -- PF-2025-0001
ADD COLUMN IF NOT EXISTS "proformaCreatedAt" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "invoiceScenario" VARCHAR(20),      -- TEMEL | TICARI
ADD COLUMN IF NOT EXISTS "invoiceType" VARCHAR(20),          -- SATIS | IADE | ISTISNA | OZELMATRAH
ADD COLUMN IF NOT EXISTS "invoiceNumber" VARCHAR(50),        -- Logo'dan gelen fatura no
ADD COLUMN IF NOT EXISTS "invoiceEttn" VARCHAR(50),          -- GİB ETTN (UUID)
ADD COLUMN IF NOT EXISTS "invoiceExportedAt" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "invoiceImportedAt" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "invoiceImportedFile" BYTEA,
ADD COLUMN IF NOT EXISTS "invoiceImportedFileName" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10) DEFAULT 'TRY',
ADD COLUMN IF NOT EXISTS "exchangeRate" NUMERIC(10,4) DEFAULT 1.0;

-- ⚠️ NOT: relatedShipmentId BURADA DEĞİL!
-- İlişki tersine çevrildi: 1 Teklif → N İrsaliye için
-- Bkz: Bölüm 4.1.1 - materials.shipments.relatedQuoteId

-- Proforma numara unique olmalı
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_proforma_number
ON quotes.quotes("proformaNumber")
WHERE "proformaNumber" IS NOT NULL;

-- Proforma numarası üretme fonksiyonu
CREATE OR REPLACE FUNCTION quotes.generate_proforma_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    year_str VARCHAR(4);
    seq_num INTEGER;
BEGIN
    year_str := TO_CHAR(CURRENT_DATE, 'YYYY');
    seq_num := NEXTVAL('quotes.proforma_number_seq');
    RETURN 'PF-' || year_str || '-' || LPAD(seq_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;
```

#### 4.1.3. `quotes.quote_items` - YENİ TABLO

```sql
CREATE TABLE IF NOT EXISTS quotes.quote_items (
    id SERIAL PRIMARY KEY,
    "quoteId" VARCHAR(50) NOT NULL,
    "lineNumber" INTEGER NOT NULL DEFAULT 1,
    
    -- Ürün bilgileri
    "stockCode" VARCHAR(100),          -- Stok kodu (opsiyonel - hizmet olabilir)
    "productName" VARCHAR(255) NOT NULL,
    "description" TEXT,
    
    -- Miktar
    quantity NUMERIC(15,4) NOT NULL DEFAULT 1,
    unit VARCHAR(20) DEFAULT 'adet',
    
    -- Fiyat
    "unitPrice" NUMERIC(15,4) NOT NULL,
    "taxRate" INTEGER DEFAULT 20,
    "discountPercent" NUMERIC(5,2) DEFAULT 0,
    
    -- Hesaplanan değerler (trigger ile)
    "subtotal" NUMERIC(15,2),           -- miktar * birim fiyat
    "discountAmount" NUMERIC(15,2),     -- subtotal * discount%
    "taxableAmount" NUMERIC(15,2),      -- subtotal - discount
    "taxAmount" NUMERIC(15,2),          -- taxableAmount * tax%
    "totalAmount" NUMERIC(15,2),        -- taxableAmount + taxAmount
    
    -- Muafiyet/Tevkifat
    "vatExemptionId" INTEGER,
    "withholdingRateId" INTEGER,
    "withholdingAmount" NUMERIC(15,2) DEFAULT 0,
    
    -- Metadata
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign keys
    CONSTRAINT fk_quote_items_quote FOREIGN KEY ("quoteId") REFERENCES quotes.quotes(id) ON DELETE CASCADE,
    CONSTRAINT fk_quote_items_vat FOREIGN KEY ("vatExemptionId") REFERENCES materials.vat_exemption_codes(id),
    CONSTRAINT fk_quote_items_withholding FOREIGN KEY ("withholdingRateId") REFERENCES materials.withholding_rates(id)
);

CREATE INDEX idx_quote_items_quote ON quotes.quote_items("quoteId");
```

#### 4.1.4. TRIGGER: `quote_items` Fiyat Hesaplama

```sql
-- Quote items için otomatik fiyat hesaplama trigger'ı
CREATE OR REPLACE FUNCTION quotes.calculate_quote_item_totals()
RETURNS TRIGGER AS $$
DECLARE
    withholding_rate DECIMAL(5,4);
    net_subtotal DECIMAL(15,2);
BEGIN
    -- 1. Ara toplam (miktar * birim fiyat)
    NEW."subtotal" := COALESCE(NEW."unitPrice", 0) * COALESCE(NEW.quantity, 0);
    
    -- 2. Satır iskontosu
    IF COALESCE(NEW."discountPercent", 0) > 0 THEN
        NEW."discountAmount" := NEW."subtotal" * (NEW."discountPercent" / 100.0);
    ELSE
        NEW."discountAmount" := 0;
    END IF;
    
    -- 3. Net ara toplam (iskonto sonrası) = taxableAmount
    NEW."taxableAmount" := NEW."subtotal" - COALESCE(NEW."discountAmount", 0);
    
    -- 4. KDV hesabı (muafiyet varsa 0)
    IF NEW."vatExemptionId" IS NOT NULL THEN
        NEW."taxAmount" := 0;
    ELSE
        NEW."taxAmount" := NEW."taxableAmount" * (COALESCE(NEW."taxRate", 20) / 100.0);
    END IF;
    
    -- 5. Tevkifat hesabı
    IF NEW."withholdingRateId" IS NOT NULL THEN
        SELECT rate INTO withholding_rate 
        FROM materials.withholding_rates 
        WHERE id = NEW."withholdingRateId";
        NEW."withholdingAmount" := NEW."taxAmount" * COALESCE(withholding_rate, 0);
    ELSE
        NEW."withholdingAmount" := 0;
    END IF;
    
    -- 6. Satır toplam (net + kdv - tevkifat)
    NEW."totalAmount" := NEW."taxableAmount" + NEW."taxAmount" - COALESCE(NEW."withholdingAmount", 0);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quote_items_calculate_totals
    BEFORE INSERT OR UPDATE ON quotes.quote_items
    FOR EACH ROW
    EXECUTE FUNCTION quotes.calculate_quote_item_totals();
```

#### 4.1.5. `quotes.customers` - Yeni Alanlar (e-Belge)

```sql
ALTER TABLE quotes.customers
ADD COLUMN IF NOT EXISTS "isEInvoiceTaxpayer" BOOLEAN DEFAULT false,  -- e-Fatura mükellefi mi?
ADD COLUMN IF NOT EXISTS "gibPkLabel" VARCHAR(100),                    -- GİB Posta Kutusu etiketi
ADD COLUMN IF NOT EXISTS "defaultInvoiceScenario" VARCHAR(20);         -- TEMEL | TICARI varsayılan

-- Index
CREATE INDEX IF NOT EXISTS idx_customers_einvoice
ON quotes.customers("isEInvoiceTaxpayer")
WHERE "isEInvoiceTaxpayer" = true;
```

### 4.2. Validasyon Kuralları

#### 4.2.1. Sevkiyat (İrsaliye) Validasyonları

| Alan | Kural | Hata Mesajı |
|------|-------|-------------|
| `driverName` | Zorunlu, min 2 karakter | "Şoför adı zorunludur" |
| `driverTc` | Zorunlu, tam 11 hane, sadece rakam | "Geçerli şoför TCKN giriniz (11 hane)" |
| `plateNumber` | Zorunlu, format kontrolü | "Geçerli araç plakası giriniz" |
| `dispatchDate` | Zorunlu, geçerli tarih | "Fiili sevk tarihi zorunludur" |
| `dispatchTime` | Zorunlu, HH:MM formatı | "Fiili sevk saati zorunludur" |
| `carrierTcVkn` | Nakliyeci varsa zorunlu | "Nakliyeci VKN zorunludur" |
| `carrierCompany` | Nakliyeci varsa zorunlu | "Nakliyeci ünvanı zorunludur" |
| `customerSnapshot` | Zorunlu | "Müşteri seçimi zorunludur" |
| `items` | Min 1 kalem | "En az bir kalem eklemelisiniz" |
| `items[].quantity` | > 0, stok yeterli | "Yetersiz stok" |

#### 4.2.2. Plaka Format Validasyonu

```javascript
// Türk plaka formatları:
// 34ABC123, 34ABC12, 34A1234, 34A123
const PLATE_REGEX = /^(0[1-9]|[1-7][0-9]|8[01])[A-Z]{1,3}\d{2,4}$/;

function validatePlate(plate) {
  const cleaned = plate.replace(/\s/g, '').toUpperCase();
  return PLATE_REGEX.test(cleaned);
}
```

#### 4.2.3. TCKN Validasyonu

```javascript
// TCKN: 11 hane, ilk hane 0 olamaz, algoritma kontrolü
function validateTCKN(tckn) {
  if (!/^\d{11}$/.test(tckn)) return false;
  if (tckn[0] === '0') return false;
  
  const digits = tckn.split('').map(Number);
  
  // 10. hane kontrolü
  const sum1 = (digits[0] + digits[2] + digits[4] + digits[6] + digits[8]) * 7;
  const sum2 = digits[1] + digits[3] + digits[5] + digits[7];
  const digit10 = (sum1 - sum2) % 10;
  if (digit10 !== digits[9]) return false;
  
  // 11. hane kontrolü
  const sumAll = digits.slice(0, 10).reduce((a, b) => a + b, 0);
  const digit11 = sumAll % 10;
  if (digit11 !== digits[10]) return false;
  
  return true;
}
```

#### 4.2.4. Proforma/Fatura Validasyonları

| Alan | Kural | Hata Mesajı |
|------|-------|-------------|
| `proformaNumber` | Unique, format: PF-YYYY-XXXX | "Bu proforma numarası zaten kullanılmış" |
| `invoiceScenario` | TEMEL veya TICARI | "Geçersiz fatura senaryosu" |
| `invoiceType` | SATIS, IADE, ISTISNA, OZELMATRAH | "Geçersiz fatura tipi" |
| `invoiceEttn` | UUID formatı | "Geçersiz ETTN formatı" |
| `items` | Min 1 kalem, fiyat > 0 | "Fatura için en az bir kalem gerekli" |

---

## 5. CRM SİSTEMİ ETKİLERİ

### 5.1. Müşteri Kartına Eklenecek Alanlar

**Mevcut Alanlar (quotes.customers):**
- name, email, phone, company
- taxOffice, taxNumber
- address, city, district, neighbourhood, postalCode, country
- website, fax, iban, bankName
- contactPerson, contactTitle
- notes, isActive
- erpAccountCode, erpSyncedAt

**Eklenecek Alanlar:**

| Alan | Tip | Açıklama |
|------|-----|----------|
| `isEInvoiceTaxpayer` | boolean | e-Fatura mükellefi mi? |
| `gibPkLabel` | varchar(100) | GİB Posta Kutusu etiketi |
| `defaultInvoiceScenario` | varchar(20) | Varsayılan fatura senaryosu (TEMEL/TICARI) |

### 5.2. Müşteri Formu UI Değişikliği

```
┌─ MÜŞTERİ BİLGİLERİ ─────────────────────────────────────────────────┐
│                                                                      │
│  Firma Ünvanı: [____________________]  VKN: [__________]            │
│  Vergi Dairesi: [__________________]                                │
│                                                                      │
│  ▸ e-Belge Bilgileri ────────────────────────────── [Akordeon]      │
│    ☐ e-Fatura Mükellefi                                             │
│    GİB PK Etiketi: [____________________] (e-fatura ise zorunlu)    │
│    Varsayılan Senaryo: [TEMEL ▼]                                    │
│                                                                      │
│  ▸ ERP Entegrasyonu ─────────────────────────────── [Akordeon]      │
│    Cari Kodu (Logo/Zirve): [____________________]                   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 5.3. GİB Mükellef Sorgusu (Gelecek - v3.1)

> **Not:** GİB'den e-fatura mükellef sorgusu yapılabilir.
> Bu özellik şimdilik kapsam dışı, ama alan hazır olacak.

---

## 6. TEKLİF PANELİ DEĞİŞİKLİKLERİ

### 6.1. Mevcut Quote Yapısı

Şu an quotes.quotes tablosu şunları içeriyor:
- Müşteri bilgileri (customerName, customerEmail, vb.)
- Form template bağlantısı (formTemplateId)
- Fiyat hesaplama (calculatedPrice, manualPrice, finalPrice)
- Status akışı (new → approved → production)

### 6.2. Yeni Yapı: Proforma & Fatura

```
QUOTE DETAY PANELİ
┌─────────────────────────────────────────────────────────────────────┐
│  Quote #Q-2025-0123                                    [Düzenle]    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Müşteri: ABC Ltd.                    Tarih: 05.12.2025            │
│  Tutar: ₺15.000,00                    Durum: Onaylandı             │
│                                                                     │
│  ┌─ KALEMLER ───────────────────────────────────────────────────┐  │
│  │ # | Ürün/Hizmet           | Miktar | Birim | Fiyat  | Toplam │  │
│  │ 1 | Ürün A                | 10     | adet  | 1.000  | 10.000 │  │
│  │ 2 | Montaj Hizmeti        | 1      | iş    | 5.000  | 5.000  │  │
│  │                                           TOPLAM: ₺15.000,00 │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌─ BELGE DURUMU ───────────────────────────────────────────────┐  │
│  │                                                               │  │
│  │  Proforma: -                    [Proforma Oluştur]           │  │
│  │  Fatura:   -                                                  │  │
│  │  İrsaliye: -                    [Sevkiyata Git]              │  │
│  │                                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.3. Proforma Oluşturma Akışı

```
1. [Proforma Oluştur] tıklanır
   ↓
2. Modal açılır:
   ┌─ PROFORMA OLUŞTUR ─────────────────────────────────────────────┐
   │                                                                 │
   │  Proforma No: [PF-2025-0045]  (otomatik, değiştirilebilir)     │
   │                                                                 │
   │  Fatura Senaryosu: ○ Temel Fatura  ● Ticari Fatura             │
   │  Fatura Tipi: [Satış Faturası ▼]                               │
   │                                                                 │
   │  Para Birimi: [TRY ▼]   Kur: [______]                          │
   │                                                                 │
   │                              [İptal]  [Oluştur]                │
   └─────────────────────────────────────────────────────────────────┘
   ↓
3. Proforma kaydedilir
   ↓
4. Panel güncellenir:
   │  Proforma: PF-2025-0045        [PDF İndir] [Faturaya Dönüştür] │
```

### 6.4. Faturaya Dönüştürme Akışı

```
1. [Faturaya Dönüştür] tıklanır
   ↓
2. Modal açılır:
   ┌─ FATURA EXPORT ────────────────────────────────────────────────┐
   │                                                                 │
   │  Hedef Program: [Logo Tiger ▼]                                 │
   │  Export Formatı: ☑ CSV  ☑ XML  ☐ PDF                          │
   │                                                                 │
   │  ⚠️ İlişkili Sevkiyat: SHP-2025-0042 (3 gün önce)             │
   │                                                                 │
   │                              [İptal]  [Export Et]              │
   └─────────────────────────────────────────────────────────────────┘
   ↓
3. Export dosyası indirilir
   ↓
4. Logo/Zirve'de fatura kesilir
   ↓
5. BeePlan'da [ETTN Import]:
   ┌─ FATURA IMPORT ────────────────────────────────────────────────┐
   │                                                                 │
   │  Fatura No: [A-2025-001234]                                    │
   │  ETTN: [xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx]                  │
   │                                                                 │
   │  Dosya: [Dosya Seç...]                                         │
   │                                                                 │
   │                              [İptal]  [Kaydet]                 │
   └─────────────────────────────────────────────────────────────────┘
```

### 6.5. 7 Gün Kuralı Uyarısı

```
┌─ UYARI ─────────────────────────────────────────────────────────────┐
│                                                                     │
│  ⚠️ Bu teklif ile ilişkili sevkiyat 5 gün önce yapıldı.            │
│                                                                     │
│  Sevkiyat: SHP-2025-0042 (04.12.2025)                              │
│  Kalan süre: 2 gün                                                  │
│                                                                     │
│  VUK'a göre irsaliyeden sonra 7 gün içinde fatura kesilmelidir.    │
│                                                                     │
│  [Tamam]                                                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. SEVKİYAT PANELİ DEĞİŞİKLİKLERİ

### 7.1. AddShipmentModal - Sadeleştirme

**KALDIRILACAKLAR:**

| Eleman | Neden |
|--------|-------|
| `documentType` radio (waybill/invoice/both) | Artık sadece irsaliye |
| "Fatura (Fiyatlı)" seçeneği | Fatura quotes'tan yapılacak |
| Para Birimi & Kur accordion | İrsaliyede gereksiz |
| İskonto Ayarları accordion | İrsaliyede gereksiz |
| Vergi Detayları accordion | İrsaliyede gereksiz |
| Export Ayarları accordion | Sadeleştirilecek |
| `exportFormats` checkbox'ları | Otomatik belirlenecek |

**EKLENECEKLER:**

| Eleman | Zorunlu | Açıklama |
|--------|---------|----------|
| Şoför Bilgileri accordion | ✅ | İsim, TCKN, Plaka |
| Nakliyeci Bilgileri accordion | ❌ | VKN, Ünvan (3. parti nakliyeci ise) |
| Fiili Sevk Tarihi | ✅ | Varsayılan: bugün |
| Fiili Sevk Saati | ✅ | Varsayılan: şimdi |
| Fiyat Göster/Gizle checkbox | ❌ | Varsayılan: gizle |

### 7.2. Yeni AddShipmentModal Yapısı

```
┌─ YENİ SEVKİYAT ───────────────────────────────────────────────────────┐
│                                                               [X]    │
├──────────────────────────────────────────────────────────────────────┤
│  [1] Bilgiler    [2] Kalemler    [3] Özet                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─ MÜŞTERİ ──────────────────────────────────────────────────────┐ │
│  │ [ABC Ltd. ▼]                            [+ Yeni Müşteri]       │ │
│  │ VKN: 1234567890  |  Kadıköy VD  |  İstanbul                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ İŞ EMRİ & TEKLİF ─────────────────────────────────────────────┐ │
│  │ İş Emri: [Seçin... ▼]    Teklif: [Seçin... ▼]                  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ SEVKİYAT NOTU ────────────────────────────────────────────────┐ │
│  │ [________________________________________________________]     │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ▸ 🚚 Şoför & Araç Bilgileri ──────────────────────── [Akordeon]   │
│    ┌──────────────────────────────────────────────────────────────┐ │
│    │ Şoför Adı:    [_____________________] *                      │ │
│    │ Şoför TCKN:   [___________] *                                │ │
│    │ Araç Plakası: [___________] *                                │ │
│    │                                                              │ │
│    │ Fiili Sevk Tarihi: [09.12.2025] *  Saati: [14:30] *         │ │
│    └──────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ▸ 📦 Nakliyeci Bilgileri (Opsiyonel) ─────────────── [Akordeon]   │
│    ┌──────────────────────────────────────────────────────────────┐ │
│    │ ☐ Nakliyeci kullanılıyor                                     │ │
│    │ Nakliyeci VKN:   [___________]                               │ │
│    │ Nakliyeci Ünvan: [_____________________]                     │ │
│    └──────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ▸ 💰 Fiyat Görünümü (Opsiyonel) ───────────────────── [Akordeon]   │
│    ┌──────────────────────────────────────────────────────────────┐ │
│    │ ☐ İrsaliyede fiyat göster                                    │ │
│    │   (İşaretlenirse birim fiyat kolonu açılır)                  │ │
│    └──────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ▸ ℹ️ Ek Bilgiler ─────────────────────────────────── [Akordeon]   │
│    ┌──────────────────────────────────────────────────────────────┐ │
│    │ Özel Kod: [___________]  Maliyet Merkezi: [___________]      │ │
│    └──────────────────────────────────────────────────────────────┘ │
│                                                                      │
│                                        [İptal]  [İleri →]           │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.3. Stok Düşme Zamanı

**Mevcut:** Import anında (completed status)
**Yeni:** Export anında (irsaliye oluşturulduğunda)

```
Sevkiyat Oluştur → Status: pending
        ↓
   [Export Et] 
        ↓
Export başarılı → Status: exported → STOK DÜŞER
        ↓
Logo'dan onay gelince → [Import]
        ↓
Status: completed (ETTN kaydedilir)
```

---

## 8. TÜRK e-BELGE STANDARTLARI

### 8.0. Gemini Danışmanlık Sonuçları (9 Aralık 2025)

> Aşağıdaki bilgiler Gemini AI'dan alınan cevaplara dayanmaktadır.

#### 8.0.1. e-İrsaliye Kritik Bilgiler

| Soru | Gemini Cevabı |
|------|---------------|
| **Şoför/Plaka/TCKN zorunlu mu?** | ✅ ZORUNLU - GİB e-İrsaliye için şoför TCKN, araç plakası gerekli |
| **Nakliyeci bilgileri?** | Nakliyeci (3. parti) kullanılıyorsa VKN/Ünvan zorunlu, kendi aracı ise boş bırakılabilir |
| **İrsaliyede fiyat?** | OPSİYONEL - "Gizle/Göster" checkbox önerisi |
| **Fiili Sevk Tarihi ≠ Düzenleme Tarihi** | İkisi de zorunlu, farklı olabilir |

#### 8.0.2. e-Fatura Kritik Bilgiler

| Soru | Gemini Cevabı |
|------|---------------|
| **7 gün kuralı** | TAKVİM GÜNÜ - İrsaliye tarihinden 7 takvim günü içinde fatura kesilmeli |
| **Proforma numaralama** | Standart yok, PF-YYYY-XXXX uygundur, firma serbestçe belirleyebilir |
| **ETTN formatı** | UUID formatı: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| **Fatura senaryoları** | TEMEL ve TICARI dışında: IHRACAT, KAMU, HKS, YOLCU_BERABER |

#### 8.0.3. Veri Formatı Standartları

| Özellik | Gemini Önerisi |
|---------|----------------|
| **Tarih formatı** | DD.MM.YYYY (Türk standardı) |
| **Ondalık ayracı** | Virgül (,) → 10,50 |
| **Binlik ayracı** | Nokta (.) → 1.000,50 |
| **CSV encoding** | UTF-8 BOM veya Windows-1254 (Excel uyumu için) |
| **CSV ayracı** | Noktalı virgül (;) - Türk Excel varsayılanı |

#### 8.0.4. Stok Yönetimi Onayı

| Karar | Gemini Görüşü |
|-------|---------------|
| **Stok düşürme zamanı** | İrsaliye kesildiğinde (export) → ONAYLANDI |
| **İptal durumu** | Export edilmiş ama tamamlanmamış iptal edilirse stok geri eklenmeli |

---

### 8.1. e-İrsaliye Zorunlu Alanlar

| Alan | DB Kolonu | Zorunlu | Açıklama |
|------|-----------|---------|----------|
| Alıcı VKN/TCKN | customerSnapshot.taxNumber | ✅ | 10/11 hane |
| Alıcı Ünvan | customerSnapshot.company | ✅ | |
| Alıcı Adres | customerSnapshot.address | ✅ | |
| Şoför Adı | driverName | ✅ | |
| Şoför TCKN | driverTc | ✅ | 11 hane |
| Araç Plakası | plateNumber | ✅ | Format: 34ABC123 |
| Fiili Sevk Tarihi | dispatchDate | ✅ | YYYY-MM-DD |
| Fiili Sevk Saati | dispatchTime | ✅ | HH:MM |
| Nakliyeci VKN | carrierTcVkn | ❓ | Nakliyeci varsa zorunlu |
| Nakliyeci Ünvan | carrierCompany | ❓ | Nakliyeci varsa zorunlu |

### 8.2. e-Fatura Senaryoları

| Senaryo | Kod | Açıklama |
|---------|-----|----------|
| Temel Fatura | TEMEL | Standart fatura, yanıt beklenmiyor |
| Ticari Fatura | TICARI | Alıcıdan kabul/red yanıtı bekleniyor |
| İhracat Faturası | IHRACAT | Yurtdışı satış (v3.1+) |
| Kamu Faturası | KAMU | Kamu kurumlarına (v3.1+) |

### 8.3. e-Fatura Tipleri

| Tip | Kod | Açıklama |
|-----|-----|----------|
| Satış Faturası | SATIS | Normal satış |
| İade Faturası | IADE | Mal iadesi |
| İstisna Faturası | ISTISNA | KDV istisnası |
| Özel Matrah | OZELMATRAH | Özel matrah uygulaması |

### 8.4. Excel/CSV Format Standartları

| Özellik | Değer | Açıklama |
|---------|-------|----------|
| Tarih Formatı | DD.MM.YYYY | Türk standardı |
| Ondalık Ayracı | , (virgül) | 10,50 TL |
| Binlik Ayracı | . (nokta) | 1.000,50 TL |
| Encoding | UTF-8 BOM veya Windows-1254 | Excel uyumu |
| CSV Ayracı | ; (noktalı virgül) | Varsayılan |

---

## 9. UI/UX DEĞİŞİKLİKLERİ

### 9.1. Değişecek Dosyalar

| Dosya | Değişiklik |
|-------|------------|
| `AddShipmentModal.jsx` | Radikal sadeleştirme + transport accordion |
| `ShipmentDetailsPanel.jsx` | Transport bilgileri gösterimi |
| `QuoteDetailsPanel.jsx` | Proforma/Fatura bölümü ekleme |
| `CustomerForm.jsx` | e-Belge alanları ekleme |
| `materials.css` | Yeni accordion stilleri |

### 9.2. Yeni Componentler

| Component | Konum | Amaç |
|-----------|-------|------|
| `TransportAccordion.jsx` | materials/components | Şoför/Araç/Nakliyeci |
| `ProformaModal.jsx` | quotes/components | Proforma oluşturma |
| `InvoiceExportModal.jsx` | quotes/components | Fatura export |
| `EttnImportModal.jsx` | quotes/components | ETTN import |
| `SevenDayWarning.jsx` | quotes/components | 7 gün uyarısı |

---

## 10. BACKEND DEĞİŞİKLİKLERİ

### 10.1. Yeni Servisler

#### 10.1.1. `quoteInvoiceService.js` (YENİ)

**Konum:** `/WebApp/domains/crm/api/services/quoteInvoiceService.js`

```javascript
// Proforma oluşturma
async function createProforma(quoteId, data) {
  // 1. Quote'u bul
  // 2. Proforma numarası oluştur (PF-YYYY-XXXX veya user override)
  // 3. quotes tablosunu güncelle
  // 4. Proforma PDF oluştur
  return { proformaNumber, createdAt }
}

// Fatura export
async function exportInvoice(quoteId, format, target) {
  // 1. Quote + items'ı al
  // 2. İlişkili sevkiyat varsa 7 gün kontrolü
  // 3. Export dosyası oluştur (CSV/XML/PDF)
  // 4. invoiceExportedAt güncelle
  return { file, filename }
}

// ETTN import
async function importEttn(quoteId, data) {
  // 1. Fatura numarası ve ETTN kaydet
  // 2. Dosya varsa kaydet
  // 3. invoiceImportedAt güncelle
  return { success: true }
}

// 7 gün kontrolü (Yeni ilişki: 1 Quote → N Shipments)
async function checkSevenDayRule(quoteId) {
  // ⚠️ İLİŞKİ TERSİNE ÇEVRİLDİ: Shipments tablosunda relatedQuoteId var
  // Bu quote'a bağlı tüm sevkiyatları bul
  const shipments = await db('materials.shipments')
    .where('relatedQuoteId', quoteId)
    .whereNotNull('waybillExportedAt')  // İrsaliye kesilmiş olanlar
    .orderBy('waybillExportedAt', 'asc');
  
  if (shipments.length === 0) {
    return { hasWarning: false, message: 'İlişkili sevkiyat yok' };
  }
  
  // En eski sevkiyatın tarihini al (7 gün en erken olandan başlar)
  const oldestShipment = shipments[0];
  const shipmentDate = new Date(oldestShipment.waybillExportedAt);
  const today = new Date();
  const daysPassed = Math.floor((today - shipmentDate) / (1000 * 60 * 60 * 24));
  const daysRemaining = 7 - daysPassed;
  
  return { 
    hasWarning: daysRemaining <= 2,  // Son 2 gün kala uyarı
    isOverdue: daysRemaining < 0,    // Süre dolmuş mu?
    shipmentDate: oldestShipment.waybillExportedAt,
    daysPassed,
    daysRemaining: Math.max(0, daysRemaining),
    totalShipments: shipments.length,
    message: daysRemaining < 0 
      ? `⚠️ 7 gün kuralı aşıldı! (${Math.abs(daysRemaining)} gün geçti)`
      : daysRemaining <= 2 
        ? `⏰ ${daysRemaining} gün kaldı!` 
        : `✓ ${daysRemaining} gün kaldı`
  }
}
```

#### 10.1.2. `quoteItemsService.js` (YENİ)

**Konum:** `/WebApp/domains/crm/api/services/quoteItemsService.js`

```javascript
// Quote kalemleri CRUD
async function getQuoteItems(quoteId) { }
async function addQuoteItem(quoteId, itemData) { }
async function updateQuoteItem(itemId, itemData) { }
async function deleteQuoteItem(itemId) { }
async function calculateQuoteTotals(quoteId) { }
```

### 10.2. Güncellenecek Servisler

#### 10.2.1. `shipmentService.js` Güncellemeleri

**Konum:** `/WebApp/domains/materials/api/services/shipmentService.js`

**Değişiklikler:**
```javascript
// createShipment - Yeni validasyonlar
async function createShipment(data) {
  // ✅ ZORUNLU: Şoför adı
  if (!data.driverName) throw new Error('Şoför adı zorunludur')
  
  // ✅ ZORUNLU: Şoför TCKN (11 hane)
  if (!data.driverTc || data.driverTc.length !== 11) 
    throw new Error('Geçerli şoför TCKN giriniz (11 hane)')
  
  // ✅ ZORUNLU: Plaka
  if (!data.plateNumber) throw new Error('Araç plakası zorunludur')
  
  // ✅ ZORUNLU: Fiili sevk tarihi
  if (!data.dispatchDate) data.dispatchDate = new Date()
  
  // ❌ KALDIRILACAK: documentType validasyonu (artık sadece waybill)
  // ❌ KALDIRILACAK: includePrice zorunluluğu
  // ❌ KALDIRILACAK: Para birimi validasyonu (irsaliyede gereksiz)
}

// exportShipment - Stok düşürme eklendi
async function exportShipment(shipmentId, format) {
  // 1. Sevkiyatı bul
  // 2. Export dosyası oluştur
  // 3. Status → 'exported'
  // 4. ✅ YENİ: STOK DÜŞÜR
  await deductStock(shipmentItems)
  // 5. lastExportedAt güncelle
}

// cancelShipment - Stok geri ekleme
async function cancelShipment(shipmentId) {
  const shipment = await getShipment(shipmentId)
  
  // Eğer export edilmişse stok geri ekle
  if (shipment.status === 'exported') {
    await restoreStock(shipment.items)
  }
  
  // Status → 'cancelled'
}
```

#### 10.2.2. `customersService.js` Güncellemeleri

**Konum:** `/WebApp/domains/crm/services/customers-service.js`

**Yeni Alanlar:**
```javascript
// createCustomer / updateCustomer'a eklenmeli
const newFields = {
  isEInvoiceTaxpayer: data.isEInvoiceTaxpayer || false,
  gibPkLabel: data.gibPkLabel || null,
  defaultInvoiceScenario: data.defaultInvoiceScenario || 'TEMEL'
}
```

### 10.3. Yeni Controller'lar

#### 10.3.1. `quoteInvoiceController.js` (YENİ)

**Konum:** `/WebApp/domains/crm/api/controllers/quoteInvoiceController.js`

**Endpoint'ler:**
```
POST   /api/quotes/:id/proforma        → createProforma
GET    /api/quotes/:id/proforma/pdf    → downloadProformaPdf
POST   /api/quotes/:id/invoice/export  → exportInvoice
POST   /api/quotes/:id/invoice/import  → importEttn
GET    /api/quotes/:id/seven-day-check → checkSevenDayRule
```

#### 10.3.2. `quoteItemsController.js` (YENİ)

**Konum:** `/WebApp/domains/crm/api/controllers/quoteItemsController.js`

**Endpoint'ler:**
```
GET    /api/quotes/:id/items           → getQuoteItems
POST   /api/quotes/:id/items           → addQuoteItem
PUT    /api/quotes/:id/items/:itemId   → updateQuoteItem
DELETE /api/quotes/:id/items/:itemId   → deleteQuoteItem
```

### 10.4. Route Güncellemeleri

#### 10.4.1. `quoteRoutes.js` Güncellemesi

```javascript
// Yeni route'lar eklenecek
router.post('/:id/proforma', quoteInvoiceController.createProforma)
router.get('/:id/proforma/pdf', quoteInvoiceController.downloadProformaPdf)
router.post('/:id/invoice/export', quoteInvoiceController.exportInvoice)
router.post('/:id/invoice/import', quoteInvoiceController.importEttn)
router.get('/:id/seven-day-check', quoteInvoiceController.checkSevenDayRule)

router.get('/:id/items', quoteItemsController.getQuoteItems)
router.post('/:id/items', quoteItemsController.addQuoteItem)
router.put('/:id/items/:itemId', quoteItemsController.updateQuoteItem)
router.delete('/:id/items/:itemId', quoteItemsController.deleteQuoteItem)
```

---

## 11. DOSYA KONUMLARI

### 11.1. Veritabanı

| Dosya | Konum | Açıklama |
|-------|-------|----------|
| Migration 036 | `/WebApp/db/migrations/036_invoice_export_clean.sql` | Mevcut (tamamlandı) |
| Migration 037 | `/WebApp/db/migrations/037_waybill_invoice_separation.sql` | YENİ (oluşturulacak) |

### 11.2. Backend - Materials Domain

| Dosya | Konum |
|-------|-------|
| shipmentController.js | `/WebApp/domains/materials/api/controllers/shipmentController.js` |
| shipmentService.js | `/WebApp/domains/materials/api/services/shipmentService.js` |
| exportService.js | `/WebApp/domains/materials/api/services/exportService.js` |
| materialsRoutes.js | `/WebApp/domains/materials/api/routes/materialsRoutes.js` |

### 11.3. Backend - CRM Domain

| Dosya | Konum |
|-------|-------|
| customers-service.js | `/WebApp/domains/crm/services/customers-service.js` |
| quoteController.js | `/WebApp/domains/crm/api/controllers/quoteController.js` |
| quoteInvoiceController.js | `/WebApp/domains/crm/api/controllers/quoteInvoiceController.js` | YENİ |
| quoteItemsController.js | `/WebApp/domains/crm/api/controllers/quoteItemsController.js` | YENİ |
| quoteInvoiceService.js | `/WebApp/domains/crm/api/services/quoteInvoiceService.js` | YENİ |
| quoteItemsService.js | `/WebApp/domains/crm/api/services/quoteItemsService.js` | YENİ |

### 11.4. Frontend - Materials Domain

| Dosya | Konum |
|-------|-------|
| AddShipmentModal.jsx | `/WebApp/domains/materials/components/shared/modals/AddShipmentModal.jsx` |
| ShipmentsTable.jsx | `/WebApp/domains/materials/components/ShipmentsTable.jsx` |
| ShipmentDetailsPanel.jsx | `/WebApp/domains/materials/components/ShipmentDetailsPanel.jsx` |
| shipments-service.js | `/WebApp/domains/materials/services/shipments-service.js` |
| materials.css | `/WebApp/domains/materials/styles/materials.css` |

### 11.5. Frontend - CRM Domain

| Dosya | Konum |
|-------|-------|
| QuotesTable.jsx | `/WebApp/domains/crm/components/QuotesTable.jsx` |
| QuoteDetailsPanel.jsx | `/WebApp/domains/crm/components/QuoteDetailsPanel.jsx` |
| CustomerForm.jsx | `/WebApp/domains/crm/components/CustomerForm.jsx` |
| customers-service.js | `/WebApp/domains/crm/services/customers-service.js` |
| quotes-service.js | `/WebApp/domains/crm/services/quotes-service.js` |

### 11.6. Dokümantasyon

| Dosya | Konum | Açıklama |
|-------|-------|----------|
| INVOICE-EXPORT-INTEGRATION.md | `/Users/umutyalcin/Documents/BeePlan/INVOICE-EXPORT-INTEGRATION.md` | v2.0 (tamamlandı) |
| INVOICE-EXPORT-REFACTOR-PLAN.md | `/Users/umutyalcin/Documents/BeePlan/INVOICE-EXPORT-REFACTOR-PLAN.md` | v3.0 (bu doküman) |

---

## 12. IMPLEMENTATION PLANI

### 10.1. FAZ 1: Veritabanı (Migration 037)

```
□ quotes.quote_items tablosu oluştur
□ quotes.quotes'a fatura alanları ekle
□ quotes.customers'a e-belge alanları ekle
□ materials.shipments'a dispatchDate/Time ekle
□ Trigger: quote_items fiyat hesaplama
```

### 10.2. FAZ 2: Backend API

```
□ GET/POST /api/quotes/:id/proforma - Proforma CRUD
□ POST /api/quotes/:id/invoice/export - Fatura export
□ POST /api/quotes/:id/invoice/import - ETTN import
□ GET /api/quotes/:id/items - Quote items
□ POST /api/quotes/:id/items - Quote item ekle
```

### 10.3. FAZ 3: Shipment Paneli Sadeleştirme

```
□ AddShipmentModal - documentType radio kaldır
□ AddShipmentModal - Para Birimi accordion kaldır
□ AddShipmentModal - İskonto accordion kaldır
□ AddShipmentModal - Vergi accordion kaldır
□ AddShipmentModal - Export accordion kaldır
□ AddShipmentModal - TransportAccordion ekle
□ AddShipmentModal - Şoför/Plaka validasyonu ekle
```

### 12.4. FAZ 4: Quotes Paneli Genişletme

```
□ QuoteDetailsPanel - Belge Durumu bölümü
□ ProformaModal - Proforma oluşturma
□ InvoiceExportModal - Fatura export
□ EttnImportModal - ETTN import
□ SevenDayWarning - 7 gün uyarısı
□ QuoteItemsTable - Kalem listesi
```

### 12.5. FAZ 5: CRM Güncellemeleri

```
□ CustomerForm - e-Belge accordion
□ customers-service.js - yeni alanlar
□ customerController.js - yeni alanlar
```

---

## 🔧 IMPLEMENTATION İPUÇLARI (Gemini Tüyoları)

> Bu bölüm Gemini'den gelen implementasyon önerileridir.

### İ.1. Quote Items vs Form Data Mapping

Quote items tablosunu doldururken dinamik form verileri için bir **mapping konfigürasyonu** gerekli:

```javascript
// config/quoteFieldMapping.js
const QUOTE_FIELD_MAPPING = {
  // Form alanı → Quote Item alanı
  'formFields.price': 'unitPrice',
  'formFields.quantity': 'quantity',
  'formFields.description': 'description',
  'formFields.productCode': 'stockCode',
  // Özel hesaplamalar
  'calculated.area': 'quantity',  // m² hesabı quantity olarak
  'calculated.totalPrice': 'subtotal'
};

// Birim eşleştirmesi
const UNIT_MAPPING = {
  'Kutu': 'ADET',
  'Paket': 'ADET',
  'mt': 'MT',
  'm²': 'M2',
  'Adet': 'ADET',
  'kg': 'KG'
};
```

**Neden Önemli:** Hardcode yazmak yerine config objesi olarak tutmak, ileride form yapısı değiştiğinde tek yerden güncelleme yapmanı sağlar.

### İ.2. KDV İstisnası Garantisi (Trigger Güncelleme)

Eğer `vatExemptionId` dolu ise, `taxRate` otomatik olarak 0 olmalı:

```sql
-- Mevcut trigger'a EKLENMELİ
CREATE OR REPLACE FUNCTION quotes.calculate_quote_item_totals()
RETURNS TRIGGER AS $$
BEGIN
    -- ⚠️ KDV İSTİSNASI KONTROLÜ
    IF NEW."vatExemptionId" IS NOT NULL THEN
        NEW."taxRate" := 0;  -- İstisna varsa KDV %0
    END IF;
    
    -- Mevcut hesaplamalar...
    NEW.subtotal := NEW.quantity * NEW."unitPrice";
    NEW."discountAmount" := NEW.subtotal * (COALESCE(NEW."discountPercent", 0) / 100);
    NEW."taxableAmount" := NEW.subtotal - NEW."discountAmount";
    NEW."taxAmount" := NEW."taxableAmount" * (NEW."taxRate" / 100);
    NEW."totalAmount" := NEW."taxableAmount" + NEW."taxAmount";
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Senaryo:** Kullanıcı yanlışlıkla istisna seçip KDV oranı %20 giremez. Sistem otomatik düzeltir.

### İ.3. Birim Çevrimi (Export Service)

Logo/Zirve'ye export ederken birim çevrimi gerekli:

```javascript
// services/quoteInvoiceService.js - export fonksiyonuna ekle
function mapUnitToErp(unit) {
  const mapping = {
    'Kutu': 'ADET',
    'Paket': 'ADET', 
    'mt': 'MT',
    'm²': 'M2',
    'm': 'MT',
    'Adet': 'ADET',
    'adet': 'ADET',
    'kg': 'KG',
    'gr': 'GR',
    'lt': 'LT'
  };
  return mapping[unit] || 'ADET';  // Bilinmeyen birim = ADET
}

// Kullanım
const erpUnit = mapUnitToErp(quoteItem.unit);  // 'Kutu' → 'ADET'
```

### İ.4. Validasyon Sırası (Nakliyeci vs Şoför)

```javascript
// TransportAccordion validasyonu
function validateTransport(data) {
  const errors = [];
  
  // Şoför VEYA Nakliyeci dolmalı
  const hasDriver = data.driverName && data.driverTc && data.plateNumber;
  const hasCarrier = data.carrierCompany && data.carrierTcVkn;
  
  if (!hasDriver && !hasCarrier) {
    errors.push('Şoför bilgileri veya Nakliyeci bilgileri zorunludur');
  }
  
  // İKİSİ BİRDEN olamaz (tercih etmeli)
  if (hasDriver && hasCarrier) {
    // Uyarı ver ama izin ver
    console.warn('Hem şoför hem nakliyeci bilgisi var, şoför öncelikli olacak');
  }
  
  // TCKN validasyonu
  if (data.driverTc && !/^\d{11}$/.test(data.driverTc)) {
    errors.push('Şoför TCKN 11 haneli olmalıdır');
  }
  
  // Plaka validasyonu (bitişik, büyük harf)
  if (data.plateNumber) {
    const cleanPlate = data.plateNumber.replace(/\s/g, '').toUpperCase();
    if (!/^[0-9]{2}[A-Z]{1,3}[0-9]{2,4}$/.test(cleanPlate)) {
      errors.push('Geçersiz plaka formatı (örn: 34ABC123)');
    }
    data.plateNumber = cleanPlate;  // Temizlenmiş halini kaydet
  }
  
  return errors;
}
```

### İ.5. Sevk Tarihi Validasyonu

```javascript
// Fiili sevk tarihi kuralı
function validateDispatchDate(issueDate, dispatchDate) {
  const issue = new Date(issueDate);
  const dispatch = new Date(dispatchDate);
  
  // Kural: issueDate ≤ dispatchDate
  if (issue > dispatch) {
    return {
      valid: false,
      error: 'Düzenleme tarihi, sevk tarihinden sonra olamaz'
    };
  }
  
  // Uyarı: Geçmişe dönük
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (dispatch < today) {
    return {
      valid: true,
      warning: '⚠️ Geçmişe dönük irsaliye kesiyorsunuz. Yol denetiminde sorun olabilir.'
    };
  }
  
  return { valid: true };
}
```

---

## 13. GEMİNİ SORULARI VE CEVAPLARI

> ✅ Gemini tarafından doğrulandı (9 Aralık 2025)

### 13.1. e-İrsaliye Soruları

1. **Şoför TCKN formatı:** 11 haneli sayısal mı? Tire/boşluk kabul ediyor mu?
   - ✅ **ONAYLANDI:** Kesinlikle 11 hane ve sadece rakam. Tire veya boşluk olmamalı.
   - 📝 **Not:** Yabancı uyruklu şoförler için Pasaport No alanı da gerekebilir ama MVP için TCKN yeterli.

2. **Plaka formatı:** `34ABC123` gibi standart format zorunlu mu? Alfanumerik kontrol gerekli mi?
   - ✅ **ONAYLANDI:** `34ABC123` gibi bitişik ve büyük harf en güvenli format.
   - ⚠️ GİB XML standardında boşluk hata vermez ama bazı entegratörler (Logo/Zirve) boşlukları sevmez. Bitişik kaydetmek en iyisi.

3. **Fiili Sevk Tarihi:** Geçmiş tarih kabul ediliyor mu? Kaç gün geriye gidilebilir?
   - ✅ **ONAYLANDI:** Kural: Düzenleme Tarihi (IssueDate) ≤ Fiili Sevk Tarihi (DespatchDate).
   - İrsaliyeyi bugün (09.12) yazıp, sevk tarihini yarın (10.12) girebilirsin.
   - ⚠️ Sevk tarihi geçmişte (08.12) ise, düzenleme tarihi de (08.12) veya öncesi olmalıdır.
   - ⚠️ Geçmişe dönük irsaliye kesmek risklidir (yol denetiminde yakalanma riski), ama sistem izin vermelidir.

4. **Nakliyeci bilgileri:** Kendi aracımızla sevkiyat yapıyorsak nakliyeci alanları boş kalabilir mi?
   - ✅ **ONAYLANDI:** Eğer driver (Kendi aracımız) doluysa, carrier (Nakliyeci) alanları boş olmalıdır.
   - Eğer carrier doluysa, driver bilgileri opsiyoneldir (çünkü nakliye firması taşır).

5. **Fiyat gösterme:** e-İrsaliyede fiyat göstermek yasal olarak opsiyonel mi?
   - ✅ **ONAYLANDI:** Evet, sevk irsaliyesinde fiyat bulunması opsiyoneldir.
   - Çoğu firma şoförlerin veya depo personelinin fiyatı görmesini istemediği için gizler.

### 13.2. e-Fatura Soruları

1. **Proforma numarası:** "PF-" prefix'i standart mı? Başka format önerir misiniz?
   - ✅ **ONAYLANDI:** Format tamamen serbesttir. `PF-YYYY-XXXX` gayet profesyonel ve standarttır.

2. **7 gün kuralı:** İrsaliye tarihinden itibaren tam 7 gün mü? İş günü mü takvim günü mü?
   - ✅ **ONAYLANDI:** **Takvim Günüdür.** İş günü değildir. Cumartesi/Pazar dahildir.
   - 📝 Örnek: 1 Aralık'ta sevk edilen malın faturası en geç 8 Aralık gün sonuna kadar kesilmelidir.

3. **ETTN formatı:** UUID formatında mı? Örnek format?
   - ✅ **ONAYLANDI:** UUID (Canonical 8-4-4-4-12) formatıdır.
   - 📝 Örnek: `F47AC10B-58CC-4372-A567-0E02B2C3D479`

4. **Senaryo seçimi:** TEMEL ve TICARI dışında başka senaryo var mı?
   - ✅ **ONAYLANDI:** MVP için TEMEL ve TICARI %99 yeterlidir.
   - İhracat yapacaklarsa IHRACAT gerekir ama sonra eklenebilir.

### 13.3. Veri Formatı Soruları

1. **Logo Tiger XML:** Paylaştığımız format doğru mu? Eksik alan var mı?
   - ✅ **ONAYLANDI:** Logo'nun XML yapısı (Object XML) kendine has ve katıdır.
   - Zirve ise genellikle Excel'den veri almayı daha çok sever.

2. **Zirve formatı:** Logo'dan farklı mı? Ayrı template gerekli mi?
   - ✅ **ONAYLANDI:** Zirve için XML yerine "Zirve Excel Formatı"na uygun CSV/XLS üretmek daha pratiktir.

3. **CSV encoding:** Windows-1254 mü UTF-8 BOM mu tercih edilmeli?
   - ✅ **ONAYLANDI:** Kesinlikle **Windows-1254 (Turkish ANSI)**.
   - ⚠️ Türkiye'deki masaüstü muhasebe programlarının (Delphi/C# tabanlı eski sürümler) çoğu UTF-8 BOM'u açarken Türkçe karakterleri (İ, ş, ğ) bozabilir. Windows-1254 en güvenli limandır.

### 13.4. Stok Yönetimi Soruları

1. **Stok düşme zamanı:** İrsaliye kesildiğinde (export) mi yoksa tamamlandığında (import) mı?
   - ✅ **ONAYLANDI:** İrsaliye "Exported" olduğunda (yani araç kapıdan çıktığında) düşmesi doğrudur.

2. **İptal durumu:** Export edilmiş ama import edilmemiş sevkiyat iptal edilirse stok geri eklenmeli mi?
   - ✅ **ONAYLANDI:** Evet, exported olan bir irsaliye cancelled yapılırsa stok kesinlikle geri artırılmalıdır.

---

## 📋 ÖZET CHECKLIST

### Veritabanı (Migration 037)
- [ ] quotes.quote_items tablosu
- [ ] quotes.quotes fatura alanları
- [ ] quotes.customers e-belge alanları
- [ ] materials.shipments transport alanları
- [ ] Trigger: quote_items hesaplama

### Backend API
- [ ] Proforma CRUD
- [ ] Invoice export/import
- [ ] Quote items CRUD
- [ ] 7 gün kontrolü

### Frontend - Shipments
- [ ] AddShipmentModal sadeleştirme
- [ ] TransportAccordion
- [ ] Validasyonlar

### Frontend - Quotes
- [ ] ProformaModal
- [ ] InvoiceExportModal
- [ ] EttnImportModal
- [ ] QuoteItemsTable
- [ ] SevenDayWarning

### Frontend - CRM
- [ ] CustomerForm e-belge accordion

---

**Oluşturulma Tarihi:** 9 Aralık 2025  
**Güncelleme:** v3.0.1 - Gemini onayı sonrası (9 Aralık 2025)  
**Durum:** ✅ ONAYLANDI - Implementasyona hazır  
**Önceki Doküman:** INVOICE-EXPORT-INTEGRATION.md (v2.0)

---

## 📊 HIZLI REFERANS

### Tablo Özeti

| Şema | Tablo | Değişiklik Tipi | Açıklama |
|------|-------|-----------------|----------|
| materials | shipments | GÜNCELLEME | dispatchDate, dispatchTime, hidePrice, **relatedQuoteId** eklendi |
| materials | shipment_items | MEVCUT | Değişiklik yok |
| materials | vat_exemption_codes | MEVCUT | 14 kayıt |
| materials | withholding_rates | MEVCUT | 7 kayıt |
| materials | shipment_settings | MEVCUT | 8 kayıt |
| quotes | quotes | GÜNCELLEME | proforma*, invoice* eklendi ~~(relatedShipmentId KALDIRILDI)~~ |
| quotes | quote_items | **YENİ** | Fatura kalem tablosu |
| quotes | customers | GÜNCELLEME | isEInvoiceTaxpayer, gibPkLabel, defaultInvoiceScenario |

### İlişki Özeti (v3.0.1 - Güncellendi)

```
quotes.customers (1) ──────┬────── (N) quotes.quotes
                           │              ▲
                           │              │ relatedQuoteId (FK)
                           │              │ (1 Teklif → N İrsaliye)
                           │              │
                           └───────────── materials.shipments
                                                │
                                                ▼
                                          (N) shipment_items
```

> ⚠️ **Parçalı Sevkiyat Desteği:** 1 Teklif için birden fazla irsaliye kesilebilir.

### Endpoint Özeti

| Metod | Endpoint | Açıklama |
|-------|----------|----------|
| POST | `/api/quotes/:id/proforma` | Proforma oluştur |
| GET | `/api/quotes/:id/proforma/pdf` | Proforma PDF indir |
| POST | `/api/quotes/:id/invoice/export` | Fatura export |
| POST | `/api/quotes/:id/invoice/import` | ETTN import |
| GET | `/api/quotes/:id/seven-day-check` | 7 gün kontrolü |
| GET | `/api/quotes/:id/items` | Quote kalemlerini getir |
| POST | `/api/quotes/:id/items` | Quote kalemi ekle |
| PUT | `/api/quotes/:id/items/:itemId` | Quote kalemi güncelle |
| DELETE | `/api/quotes/:id/items/:itemId` | Quote kalemi sil |

### Dosya Sayısı Özeti

| Kategori | Yeni | Güncelleme |
|----------|------|------------|
| Migration | 1 | - |
| Backend Service | 2 | 2 |
| Backend Controller | 2 | 1 |
| Frontend Component | 5 | 4 |
| CSS | - | 1 |
| **TOPLAM** | **10** | **8** |


---

# APPENDIX A: ZİNCİRLEME PROMPT REHBERİ

> **Amaç:** Bu rehber, implementasyonu adım adım yapacak prompt zinciri içerir.
> Her prompt bir öncekinin üzerine inşa eder. Sıralama kritiktir!

## 📋 GENEL BAKIŞ

**Toplam:** 24 Prompt  
**5 FAZ:** DB → Backend → Shipment → Quotes → CRM

```
FAZ 1 (5 prompt) ──▶ FAZ 2 (6 prompt) ──┬──▶ FAZ 3 (4 prompt)
                                        │
                                        └──▶ FAZ 4 (6 prompt)
                                        
FAZ 5 (3 prompt) ← FAZ 1 sonrası başlayabilir
```

---

## FAZ 1: VERİTABANI (8 PROMPT)

### P1.1: Migration Dosyası Oluştur

**Bağımlılık:** Yok (ilk prompt)

**Amaç:** Yeni migration dosyası oluştur, henüz tablo oluşturma.

**Prompt:**
```
invoice-export branch'indeyim. 

/WebApp/db/migrations/ altında yeni migration dosyası oluştur:
Dosya adı: 037_waybill_invoice_separation.js

knex.js formatında boş migration şablonu:

exports.up = async function(knex) {
  // Adımlar sonraki prompt'larda eklenecek
};

exports.down = async function(knex) {
  // Rollback adımları
};

Sadece dosyayı oluştur, içerik sonra eklenecek.
```

**Oluşturulacak Dosya:**
- `/WebApp/db/migrations/037_waybill_invoice_separation.js`

**Test:**
- [x] Dosya oluşturuldu
- [x] Syntax hatası yok

---

### P1.2: Shipments Tablosuna Yeni Alanlar

**Bağımlılık:** P1.1 tamamlanmış olmalı

**Amaç:** materials.shipments tablosuna transport ve quote ilişki alanlarını ekle.

**Prompt:**
```
P1.1'de oluşturduğum migration dosyasına devam et:
/WebApp/db/migrations/037_waybill_invoice_separation.js

exports.up fonksiyonuna şu ALTER TABLE komutlarını ekle:

materials.shipments tablosuna:
1. dispatchDate (DATE) - Fiili sevk tarihi
2. dispatchTime (TIME) - Fiili sevk saati  
3. hidePrice (BOOLEAN, default: true) - Fiyat gizle
4. relatedQuoteId (VARCHAR 50) - İlişkili teklif ID

Foreign key ekle:
- relatedQuoteId → quotes.quotes(id) ON DELETE SET NULL

Index ekle:
- idx_shipments_related_quote ON relatedQuoteId

exports.down fonksiyonuna rollback ekle:
- Bu alanları DROP COLUMN ile kaldır

Referans: INVOICE-EXPORT-REFACTOR-PLAN.md Bölüm 4.1.1
```

**Mevcut Dosya Referansları:**
- `/WebApp/db/models/shipments.js` - Mevcut shipment model yapısı
- Dokümandaki Bölüm 4.1.1 SQL şeması

**Test:**
- [x] `npm run migrate` hatasız çalışıyor
- [x] `\d materials.shipments` yeni alanları gösteriyor
- [x] Foreign key constraint mevcut
- [x] `npm run migrate:rollback` alanları kaldırıyor

---

### P1.3: Quotes Tablosuna Fatura Alanları

**Bağımlılık:** P1.2 tamamlanmış olmalı

**Amaç:** quotes.quotes tablosuna proforma ve fatura alanlarını ekle.

**Prompt:**
```
Migration dosyasına devam et:
/WebApp/db/migrations/037_waybill_invoice_separation.js

exports.up fonksiyonuna şu ALTER TABLE komutlarını EKLE (mevcut kodun altına):

quotes.quotes tablosuna:
1. proformaNumber (VARCHAR 50) - PF-2025-0001 formatı
2. proformaCreatedAt (TIMESTAMPTZ)
3. invoiceScenario (VARCHAR 20) - TEMEL | TICARI
4. invoiceType (VARCHAR 20) - SATIS | IADE | ISTISNA | OZELMATRAH
5. invoiceNumber (VARCHAR 50) - Logo'dan gelen fatura no
6. invoiceEttn (VARCHAR 50) - GİB ETTN (UUID formatı)
7. invoiceExportedAt (TIMESTAMPTZ)
8. invoiceImportedAt (TIMESTAMPTZ)
9. invoiceImportedFile (BYTEA) - Opsiyonel dosya
10. invoiceImportedFileName (VARCHAR 255)
11. currency (VARCHAR 10, default: 'TRY')
12. exchangeRate (NUMERIC 10,4, default: 1.0)

Unique index ekle:
- idx_quotes_proforma_number ON proformaNumber WHERE proformaNumber IS NOT NULL

exports.down fonksiyonuna bu alanların DROP COLUMN'larını ekle.

Referans: INVOICE-EXPORT-REFACTOR-PLAN.md Bölüm 4.1.2
```

**Mevcut Dosya Referansları:**
- `/WebApp/db/models/quotes.js` - Mevcut quotes model
- Dokümandaki Bölüm 4.1.2

**Test:**
- [x] Migration hatasız çalışıyor
- [x] `\d quotes.quotes` yeni alanları gösteriyor
- [x] Unique index mevcut
- [x] Rollback çalışıyor

---

### P1.4: Customers Tablosuna e-Belge Alanları

**Bağımlılık:** P1.3 tamamlanmış olmalı

**Amaç:** quotes.customers tablosuna e-fatura mükellefiyet bilgilerini ekle.

**Prompt:**
```
Migration dosyasına devam et:
/WebApp/db/migrations/037_waybill_invoice_separation.js

exports.up fonksiyonuna şu ALTER TABLE komutlarını EKLE:

quotes.customers tablosuna:
1. isEInvoiceTaxpayer (BOOLEAN, default: false) - e-Fatura mükellefi mi?
2. gibPkLabel (VARCHAR 100) - GİB Posta Kutusu etiketi
3. defaultInvoiceScenario (VARCHAR 20, default: 'TEMEL') - Varsayılan senaryo

exports.down fonksiyonuna bu alanların DROP COLUMN'larını ekle.

Referans: INVOICE-EXPORT-REFACTOR-PLAN.md Bölüm 5.1
```

**Mevcut Dosya Referansları:**
- `/WebApp/db/models/customers.js` (varsa) - Mevcut customer model
- CRM modülündeki customer yapıları
- Dokümandaki Bölüm 5.1

**Test:**
- [x] Migration hatasız çalışıyor
- [x] `\d quotes.customers` yeni alanları gösteriyor
- [x] Default değerler doğru
- [x] Rollback çalışıyor

---

### P1.5: Quote Items Tablosu Oluştur

**Bağımlılık:** P1.4 tamamlanmış olmalı

**Amaç:** Yeni quotes.quote_items tablosunu oluştur.

**Prompt:**
```
Migration dosyasına devam et:
/WebApp/db/migrations/037_waybill_invoice_separation.js

exports.up fonksiyonuna CREATE TABLE ekle:

quotes.quote_items tablosu:
- id (SERIAL PRIMARY KEY)
- quoteId (VARCHAR 50, NOT NULL, FK → quotes.quotes ON DELETE CASCADE)
- lineNumber (INTEGER, default: 1)
- stockCode (VARCHAR 100) - Opsiyonel, hizmet kalemi olabilir
- productName (VARCHAR 255, NOT NULL)
- description (TEXT)
- quantity (NUMERIC 15,4, NOT NULL, default: 1)
- unit (VARCHAR 20, default: 'adet')
- unitPrice (NUMERIC 15,4, NOT NULL)
- taxRate (INTEGER, default: 20)
- discountPercent (NUMERIC 5,2, default: 0)
- subtotal (NUMERIC 15,2) - Trigger hesaplayacak
- discountAmount (NUMERIC 15,2)
- taxableAmount (NUMERIC 15,2)
- taxAmount (NUMERIC 15,2)
- totalAmount (NUMERIC 15,2)
- vatExemptionId (INTEGER, FK → materials.vat_exemption_codes)
- withholdingRateId (INTEGER, FK → materials.withholding_rates)
- withholdingAmount (NUMERIC 15,2, default: 0)
- createdAt (TIMESTAMPTZ, default: CURRENT_TIMESTAMP)
- updatedAt (TIMESTAMPTZ, default: CURRENT_TIMESTAMP)

Index ekle:
- idx_quote_items_quote ON quoteId

exports.down fonksiyonuna DROP TABLE ekle.

Referans: INVOICE-EXPORT-REFACTOR-PLAN.md Bölüm 4.1.3
```

**Mevcut Dosya Referansları:**
- `/WebApp/db/models/shipmentItems.js` - Benzer yapı örneği
- Dokümandaki Bölüm 4.1.3

**Test:**
- [x] Migration hatasız çalışıyor
- [x] `\d quotes.quote_items` tablo yapısını gösteriyor
- [x] Foreign key'ler doğru çalışıyor
- [x] Rollback tabloyu siliyor

---

### P1.6: Proforma Numara Sequence ve Fonksiyon

**Bağımlılık:** P1.5 tamamlanmış olmalı

**Amaç:** Otomatik proforma numara üretimi için sequence ve fonksiyon oluştur.

**Prompt:**
```
Migration dosyasına devam et:
/WebApp/db/migrations/037_waybill_invoice_separation.js

exports.up fonksiyonuna şu SQL'leri ekle (knex.raw kullan):

1. Sequence oluştur:
CREATE SEQUENCE IF NOT EXISTS quotes.proforma_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

2. Fonksiyon oluştur:
CREATE OR REPLACE FUNCTION quotes.generate_proforma_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    year_str VARCHAR(4);
    seq_num INTEGER;
BEGIN
    year_str := TO_CHAR(CURRENT_DATE, 'YYYY');
    seq_num := NEXTVAL('quotes.proforma_number_seq');
    RETURN 'PF-' || year_str || '-' || LPAD(seq_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

exports.down fonksiyonuna:
- DROP FUNCTION quotes.generate_proforma_number();
- DROP SEQUENCE quotes.proforma_number_seq;

Referans: INVOICE-EXPORT-REFACTOR-PLAN.md Bölüm 4.1.2
```

**Test:**
- [x] `SELECT quotes.generate_proforma_number()` çalışıyor
- [x] İlk çağrı 'PF-2025-0001' döndürüyor
- [x] İkinci çağrı 'PF-2025-0002' döndürüyor

---

### P1.7: Quote Items Fiyat Hesaplama Trigger

**Bağımlılık:** P1.6 tamamlanmış olmalı

**Amaç:** quote_items tablosuna INSERT/UPDATE yapıldığında otomatik fiyat hesaplama.

**Prompt:**
```
Migration dosyasına devam et:
/WebApp/db/migrations/037_waybill_invoice_separation.js

exports.up fonksiyonuna trigger fonksiyonu ve trigger ekle (knex.raw):

1. Fonksiyon:
CREATE OR REPLACE FUNCTION quotes.calculate_quote_item_totals()
RETURNS TRIGGER AS $$
DECLARE
    withholding_rate DECIMAL(5,4);
BEGIN
    -- KDV istisnası varsa taxRate = 0
    IF NEW."vatExemptionId" IS NOT NULL THEN
        NEW."taxRate" := 0;
    END IF;
    
    -- 1. Ara toplam
    NEW."subtotal" := COALESCE(NEW."unitPrice", 0) * COALESCE(NEW.quantity, 0);
    
    -- 2. İskonto
    NEW."discountAmount" := NEW."subtotal" * (COALESCE(NEW."discountPercent", 0) / 100.0);
    
    -- 3. KDV matrahı
    NEW."taxableAmount" := NEW."subtotal" - COALESCE(NEW."discountAmount", 0);
    
    -- 4. KDV tutarı
    NEW."taxAmount" := NEW."taxableAmount" * (COALESCE(NEW."taxRate", 0) / 100.0);
    
    -- 5. Toplam
    NEW."totalAmount" := NEW."taxableAmount" + NEW."taxAmount";
    
    -- 6. Tevkifat (varsa)
    IF NEW."withholdingRateId" IS NOT NULL THEN
        SELECT rate INTO withholding_rate 
        FROM materials.withholding_rates 
        WHERE id = NEW."withholdingRateId";
        NEW."withholdingAmount" := NEW."taxAmount" * COALESCE(withholding_rate, 0);
    ELSE
        NEW."withholdingAmount" := 0;
    END IF;
    
    NEW."updatedAt" := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

2. Trigger:
CREATE TRIGGER trg_quote_item_calculate
    BEFORE INSERT OR UPDATE ON quotes.quote_items
    FOR EACH ROW
    EXECUTE FUNCTION quotes.calculate_quote_item_totals();

exports.down fonksiyonuna:
- DROP TRIGGER trg_quote_item_calculate ON quotes.quote_items;
- DROP FUNCTION quotes.calculate_quote_item_totals();

Referans: INVOICE-EXPORT-REFACTOR-PLAN.md Bölüm 4.1.4
```

**Test:**
- [x] INSERT INTO quotes.quote_items ... → hesaplamalar otomatik doldu
- [x] vatExemptionId verilince taxAmount = 0
- [x] withholdingRateId verilince withholdingAmount hesaplandı
- [x] UPDATE yapınca değerler yeniden hesaplandı

---

### P1.8: Migration Test ve Doğrulama

**Bağımlılık:** P1.7 tamamlanmış olmalı

**Amaç:** Tüm migration değişikliklerini test et ve doğrula.

**Prompt:**
```
Migration 037'yi test et.

1. Migration çalıştır:
   npm run migrate

2. Tablo kontrolü (psql veya pgAdmin):
   \d materials.shipments  -- dispatchDate, dispatchTime, hidePrice, relatedQuoteId görünmeli
   \d quotes.quotes        -- proformaNumber, invoiceScenario, invoiceEttn, vb. görünmeli
   \d quotes.customers     -- isEInvoiceTaxpayer, gibPkLabel, defaultInvoiceScenario görünmeli
   \d quotes.quote_items   -- Tüm alanlar görünmeli

3. Proforma fonksiyonu test:
   SELECT quotes.generate_proforma_number();  -- PF-2025-0001
   SELECT quotes.generate_proforma_number();  -- PF-2025-0002

4. Trigger test:
   INSERT INTO quotes.quote_items ("quoteId", "productName", quantity, "unitPrice", "taxRate")
   VALUES ('test-quote-1', 'Test Ürün', 10, 100.00, 20);
   
   SELECT * FROM quotes.quote_items WHERE "quoteId" = 'test-quote-1';
   -- subtotal=1000, taxAmount=200, totalAmount=1200 olmalı

5. Rollback test:
   npm run migrate:rollback
   -- Tüm değişiklikler geri alınmalı

6. Tekrar migrate:
   npm run migrate

Hata varsa düzelt ve tekrar test et.
```

**Test Kriterleri (FAZ 1 TAMAMLANDI):**
- [x] Migration up hatasız çalışıyor
- [x] Tüm yeni alanlar mevcut
- [x] Proforma fonksiyonu çalışıyor
- [x] Trigger hesaplamaları doğru
- [x] Migration down çalışıyor
- [x] Tekrar up çalışıyor

**⚠️ FAZ 1 TAMAMEN BİTMEDEN FAZ 2'YE GEÇMEYİN!**

---

## FAZ 2: BACKEND API (7 PROMPT)

> ⚠️ **ÖN KOŞUL:** FAZ 1 (P1.8) tamamen tamamlanmış olmalı!

---

### P2.1: QuoteItems Model Oluştur

**Bağımlılık:** FAZ 1 tamamlanmış olmalı (DB'de quote_items tablosu mevcut)

**Amaç:** Quote items için database model dosyası oluştur.

**Prompt:**
```
Yeni model dosyası oluştur:
/WebApp/db/models/quoteItems.js

Mevcut /WebApp/db/models/shipmentItems.js dosyasını referans al, benzer yapıda:

import db from '../connection.js';

const QuoteItems = {
  
  // Bir quote'un tüm kalemlerini getir
  async getByQuoteId(quoteId) {
    return await db('quotes.quote_items')
      .where('quoteId', quoteId)
      .orderBy('lineNumber', 'asc');
  },
  
  // Tek kalem getir
  async getById(id) {
    return await db('quotes.quote_items')
      .where('id', id)
      .first();
  },
  
  // Yeni kalem ekle (trigger hesaplamaları yapacak)
  async create(quoteId, itemData) {
    // lineNumber otomatik hesapla
    const [maxLine] = await db('quotes.quote_items')
      .where('quoteId', quoteId)
      .max('lineNumber as max');
    
    const [item] = await db('quotes.quote_items')
      .insert({
        quoteId,
        lineNumber: (maxLine?.max || 0) + 1,
        ...itemData,
        createdAt: new Date()
      })
      .returning('*');
    return item;
  },
  
  // Kalem güncelle
  async update(id, itemData) {
    const [item] = await db('quotes.quote_items')
      .where('id', id)
      .update({
        ...itemData,
        updatedAt: new Date()
      })
      .returning('*');
    return item;
  },
  
  // Kalem sil
  async delete(id) {
    return await db('quotes.quote_items')
      .where('id', id)
      .del();
  },
  
  // Quote toplamlarını hesapla
  async calculateQuoteTotals(quoteId) {
    const result = await db('quotes.quote_items')
      .where('quoteId', quoteId)
      .sum({
        subtotal: 'subtotal',
        discountTotal: 'discountAmount',
        taxTotal: 'taxAmount',
        grandTotal: 'totalAmount',
        withholdingTotal: 'withholdingAmount'
      })
      .first();
    return result;
  }
};

export default QuoteItems;
```

**Mevcut Dosya Referansları:**
- `/WebApp/db/models/shipmentItems.js` - Yapı örneği
- `/WebApp/db/connection.js` - DB bağlantısı

**Test:**
- [x] Dosya oluşturuldu
- [x] Import hatasız çalışıyor
- [x] Fonksiyonlar tanımlı

---

### P2.2: QuoteInvoice Service Oluştur

**Bağımlılık:** P2.1 tamamlanmış olmalı (QuoteItems model mevcut)

**Amaç:** Proforma ve fatura işlemlerini yönetecek service oluştur.

**Prompt:**
```
Yeni service dosyası oluştur:
/WebApp/domains/crm/api/services/quoteInvoiceService.js

Fonksiyonlar:

1. generateProforma(quoteId):
   - DB fonksiyonu çağır: SELECT quotes.generate_proforma_number()
   - Quote'u güncelle: proformaNumber, proformaCreatedAt, status='proformaSent'
   - Güncel quote'u döndür

2. exportInvoice(quoteId, options):
   - Quote, quote_items ve customer verilerini al
   - Customer'dan e-belge bilgilerini kontrol et (isEInvoiceTaxpayer, gibPkLabel)
   
   - options.format'a göre export hazırla:
     a) options.format === 'xml' ise:
        - Mevcut /WebApp/server/exportService.js'deki Logo Tiger XML mantığını kullan
        - XML header: <?xml version="1.0" encoding="UTF-8"?>
        - Invoice elementlerini oluştur (InvoiceHeader, CustomerInfo, InvoiceLines)
        - invoiceScenario ve invoiceType bilgilerini XML'e ekle
        - Dosya adı: `INV-{quoteId}-{timestamp}.xml`
     
     b) options.format === 'csv' ise:
        - Mevcut CSV export mantığını kullan
        - UTF-8 BOM ekle
        - Dosya adı: `INV-{quoteId}-{timestamp}.csv`
     
     c) options.format === 'pdf' ise:
        - /WebApp/server/pdfGenerator.js'i çağır (varsa)
        - Yoksa stub bırak, sonra implement edilecek
   
   - Quote'u güncelle: invoiceExportedAt, invoiceScenario, invoiceType, status='invoiceExported'
   - Return: { success: true, fileName, fileContent (buffer veya base64), mimeType }

3. importEttn(quoteId, data):
   - data: { invoiceNumber, invoiceEttn, file? }
   - ETTN formatı kontrolü (UUID: 8-4-4-4-12)
   - Quote'u güncelle: invoiceNumber, invoiceEttn, invoiceImportedAt, status='invoiceImported'
   - Dosya varsa kaydet (invoiceImportedFile, invoiceImportedFileName)

4. checkSevenDayRule(quoteId):
   - Bu quote'a bağlı shipment'ları bul: 
     SELECT * FROM materials.shipments WHERE "relatedQuoteId" = quoteId
   - En eski exported shipment'ın tarihinden bu yana kaç gün geçti?
   - Sonuç: { hasWarning, isOverdue, daysRemaining, shipments[] }

Referans: INVOICE-EXPORT-REFACTOR-PLAN.md Bölüm 10.1.1
```

**Mevcut Dosya Referansları:**
- `/WebApp/domains/crm/api/services/` - Mevcut service'ler
- `/WebApp/db/models/quotes.js` - Quote model
- P2.1'de oluşturduğumuz quoteItems.js

**Test:**
- [x] Dosya oluşturuldu
- [x] Import'lar hatasız
- [x] Tüm fonksiyonlar tanımlı

---

### P2.3: QuoteItems Service Oluştur

**Bağımlılık:** P2.1 tamamlanmış olmalı

**Amaç:** Quote items CRUD işlemleri için service katmanı.

**Prompt:**
```
Yeni service dosyası oluştur:
/WebApp/domains/crm/api/services/quoteItemsService.js

Bu service, QuoteItems model'ini kullanarak iş mantığı ekler:

import QuoteItems from '../../../../db/models/quoteItems.js';

export async function getQuoteItems(quoteId) {
  const items = await QuoteItems.getByQuoteId(quoteId);
  const totals = await QuoteItems.calculateQuoteTotals(quoteId);
  return { items, totals };
}

export async function addQuoteItem(quoteId, itemData, user) {
  // Validasyon
  if (!itemData.productName) throw new Error('Ürün adı zorunludur');
  if (!itemData.unitPrice || itemData.unitPrice <= 0) throw new Error('Geçerli birim fiyat giriniz');
  if (!itemData.quantity || itemData.quantity <= 0) throw new Error('Geçerli miktar giriniz');
  
  const item = await QuoteItems.create(quoteId, {
    ...itemData,
    createdBy: user?.email
  });
  return item;
}

export async function updateQuoteItem(itemId, itemData, user) {
  const item = await QuoteItems.update(itemId, {
    ...itemData,
    updatedBy: user?.email
  });
  return item;
}

export async function deleteQuoteItem(itemId) {
  return await QuoteItems.delete(itemId);
}
```

**Test:**
- [x] Dosya oluşturuldu
- [x] Validasyonlar tanımlı
- [x] Model import edilmiş

---

### P2.4: QuoteInvoice Controller Oluştur

**Bağımlılık:** P2.2, P2.3 tamamlanmış olmalı

**Amaç:** HTTP request handler'ları oluştur.

**Prompt:**
```
Yeni controller dosyası oluştur:
/WebApp/domains/crm/api/controllers/quoteInvoiceController.js

HTTP handler'ları:

import * as quoteInvoiceService from '../services/quoteInvoiceService.js';
import * as quoteItemsService from '../services/quoteItemsService.js';

// Proforma
export async function generateProforma(req, res) {
  try {
    const { id } = req.params;
    const result = await quoteInvoiceService.generateProforma(id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

// Fatura Export
export async function exportInvoice(req, res) {
  try {
    const { id } = req.params;
    const options = req.body; // { format, invoiceScenario, invoiceType }
    const result = await quoteInvoiceService.exportInvoice(id, options);
    // Dosya indirme veya JSON döndür
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

// ETTN Import
export async function importEttn(req, res) {
  try {
    const { id } = req.params;
    const data = req.body; // { invoiceNumber, invoiceEttn }
    const file = req.file; // multer ile
    const result = await quoteInvoiceService.importEttn(id, { ...data, file });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

// 7 Gün Kontrolü
export async function checkSevenDayRule(req, res) {
  try {
    const { id } = req.params;
    const result = await quoteInvoiceService.checkSevenDayRule(id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

// Quote Items CRUD
export async function getQuoteItems(req, res) { ... }
export async function addQuoteItem(req, res) { ... }
export async function updateQuoteItem(req, res) { ... }
export async function deleteQuoteItem(req, res) { ... }
```

**Mevcut Dosya Referansları:**
- `/WebApp/domains/crm/api/controllers/` - Mevcut controller'lar

**Test:**
- [x] Dosya oluşturuldu
- [x] Tüm handler'lar tanımlı
- [x] Service'ler import edilmiş

---

### P2.5: Routes Tanımlama

**Bağımlılık:** P2.4 tamamlanmış olmalı

**Amaç:** API route'larını tanımla ve server'a ekle.

**Prompt:**
```
Mevcut CRM routes dosyasına yeni endpoint'leri ekle veya yeni route dosyası oluştur.

Önce mevcut yapıyı incele:
- /WebApp/domains/crm/api/routes/ altındaki dosyalar
- /WebApp/server.js'deki route tanımlamaları

Yeni route'lar (quotes alt-route olarak):

import express from 'express';
import multer from 'multer';
import * as controller from '../controllers/quoteInvoiceController.js';
import { authenticate } from '../../../../server/auth.js';

const router = express.Router();

// Dosya yükleme için multer konfigürasyonu
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/xml' || file.originalname.endsWith('.xml')) {
      cb(null, true);
    } else {
      cb(new Error('Sadece XML dosyası yüklenebilir'), false);
    }
  }
});

// Proforma
router.post('/:id/proforma', authenticate, controller.generateProforma);
router.get('/:id/proforma/pdf', authenticate, controller.getProformaPdf);

// Fatura
router.post('/:id/invoice/export', authenticate, controller.exportInvoice);
// ⚠️ MULTER MIDDLEWARE: Dosya yüklemek için upload.single('file') gerekli!
router.post('/:id/invoice/import', authenticate, upload.single('file'), controller.importEttn);

// 7 Gün Kontrolü
router.get('/:id/seven-day-check', authenticate, controller.checkSevenDayRule);

// Quote Items
router.get('/:id/items', authenticate, controller.getQuoteItems);
router.post('/:id/items', authenticate, controller.addQuoteItem);
router.put('/:id/items/:itemId', authenticate, controller.updateQuoteItem);
router.delete('/:id/items/:itemId', authenticate, controller.deleteQuoteItem);

Server.js'de bu route'u /api/quotes altına ekle (mevcut quotes route ile birleştir).
```

**Mevcut Dosya Referansları:**
- `/WebApp/server.js` - Ana server dosyası
- `/WebApp/domains/crm/api/routes/` - CRM route'ları

**Test:**
- [x] Route'lar tanımlı
- [x] server.js'de import edildi
- [x] Auth middleware uygulandı
- [x] Multer middleware import edildi
- [x] `/invoice/import` endpoint'i upload.single('file') kullanıyor

---

### P2.6: Shipment Service Güncelleme

**Bağımlılık:** P2.5 tamamlanmış olmalı

**Amaç:** Mevcut shipment service'e yeni validasyonlar ve alanlar ekle.

**Prompt:**
```
Mevcut shipment service'i güncelle:
/WebApp/domains/materials/api/services/shipmentService.js

1. createShipment fonksiyonuna validasyonlar ekle:

// Transport validasyonları
if (!data.driverName) {
  throw new Error('Şoför adı zorunludur');
}
if (!data.driverTc || !/^\d{11}$/.test(data.driverTc)) {
  throw new Error('Geçerli şoför TCKN giriniz (11 hane)');
}
if (!data.plateNumber) {
  throw new Error('Araç plakası zorunludur');
}

// Plaka formatını temizle
data.plateNumber = data.plateNumber.replace(/\s/g, '''').toUpperCase();

2. createShipment'a yeni alanları ekle:
- dispatchDate
- dispatchTime
- hidePrice
- relatedQuoteId

3. Yeni fonksiyon ekle:

async function getShipmentsByQuoteId(quoteId) {
  return await db('materials.shipments')
    .where('relatedQuoteId', quoteId)
    .whereNotNull('waybillExportedAt')
    .orderBy('waybillExportedAt', 'asc');
}

Referans: INVOICE-EXPORT-REFACTOR-PLAN.md Bölüm 10.2.1
```

**Mevcut Dosya:**
- `/WebApp/domains/materials/api/services/shipmentService.js`

**Test:**
- [x] createShipment validasyonları çalışıyor
- [x] Yeni alanlar kaydediliyor
- [x] getShipmentsByQuoteId çalışıyor

---

### P2.7: Backend API Test

**Bağımlılık:** P2.6 tamamlanmış olmalı

**Amaç:** Tüm backend API endpoint'lerini test et.

**Prompt:**
```
Backend API'yi test et.

1. Server'ı başlat:
   npm start

2. Quote Items API test (curl veya Postman):
   
   # Kalem ekle
   curl -X POST http://localhost:3000/api/quotes/{quoteId}/items \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer {token}" \
     -d '{"productName": "Test Ürün", "quantity": 10, "unitPrice": 100, "taxRate": 20}'
   
   # Beklenen: subtotal=1000, taxAmount=200, totalAmount=1200 (trigger hesapladı)
   
   # Kalemleri listele
   curl http://localhost:3000/api/quotes/{quoteId}/items \
     -H "Authorization: Bearer {token}"

3. Proforma test:
   
   curl -X POST http://localhost:3000/api/quotes/{quoteId}/proforma \
     -H "Authorization: Bearer {token}"
   
   # Beklenen: { proformaNumber: "PF-2025-0001", ... }

4. 7 Gün kontrolü test:
   
   curl http://localhost:3000/api/quotes/{quoteId}/seven-day-check \
     -H "Authorization: Bearer {token}"
   
   # Beklenen: { hasWarning: false } veya { hasWarning: true, daysRemaining: X }

5. Shipment validasyon test:
   
   # driverTc olmadan → hata
   # driverTc 10 hane → hata  
   # driverTc 11 hane → başarılı

Hata varsa düzelt ve tekrar test et.
```

**Test Kriterleri (FAZ 2 TAMAMLANDI):**
- [x] Server başlıyor
- [x] Quote items CRUD çalışıyor
- [x] Trigger hesaplamaları doğru
- [x] Proforma numara üretiliyor
- [x] 7 gün kontrolü çalışıyor
- [x] Shipment validasyonları çalışıyor

**⚠️ FAZ 2 TAMAMEN BİTMEDEN FAZ 3/4'E GEÇMEYİN!**

---

## FAZ 3: SHIPMENT PANELİ SADELEŞTIRME (4 PROMPT)

> ⚠️ **ÖN KOŞUL:** FAZ 2 tamamen tamamlanmış olmalı!

---

### P3.1: AddShipmentModal Temizlik

**Bağımlılık:** FAZ 2 tamamlanmış olmalı

**Amaç:** Gereksiz accordion'ları kaldır, modal'ı sadeleştir.

**Prompt:**
```
AddShipmentModal.jsx dosyasını sadeleştir:
/WebApp/domains/materials/components/shared/modals/AddShipmentModal.jsx

KALDIRILACAK ACCORDION'LAR (sil veya comment out):

1. documentType radio butonları 
   - Artık sadece "waybill" (irsaliye) olacak, seçim yok
   
2. CurrencyAccordion (Para Birimi)
   - Fatura tarafına taşındı
   
3. DiscountAccordion (İskonto)
   - Fatura tarafına taşındı
   
4. TaxAccordion (Vergi/KDV)
   - Fatura tarafına taşındı
   
5. ExportAccordion 
   - Sadeleştirilecek (sonraki prompt'ta)

Bu accordion component'larının import'larını da temizle.

KALACAK ACCORDION'LAR:
- Müşteri Bilgileri
- Ürün/Malzeme Listesi (items)
- Notlar
- (Yeni eklenecek: TransportAccordion - sonraki prompt)

Referans: INVOICE-EXPORT-REFACTOR-PLAN.md Bölüm 7.1
```

**Mevcut Dosya:**
- `/WebApp/domains/materials/components/shared/modals/AddShipmentModal.jsx`

**Test:**
- [x] Modal açılıyor (hata yok)
- [x] Kaldırılan accordion'lar görünmüyor  
- [x] Mevcut işlevsellik bozulmadı
- [x] Konsol hatası yok

---

### P3.2: TransportAccordion Component Oluştur

**Bağımlılık:** P3.1 tamamlanmış olmalı

**Amaç:** Taşıma bilgileri için yeni component oluştur.

**Prompt:**
```
Yeni bir TransportAccordion.jsx component'ı oluştur:
/WebApp/domains/materials/components/shared/accordions/TransportAccordion.jsx

Bu component şu alanları içerecek (UBL-TR standartlarına uygun):

1. Taşıma Bilgileri Grubu:
   - Şoför Adı (driverName) - zorunlu
   - Şoför TC (driverTc) - zorunlu, 11 haneli validasyon
   - Plaka (plateNumber) - zorunlu, TR format validasyonu

2. Teslimat Bilgileri Grubu (opsiyonel):
   - Teslim Eden Kişi (deliveryPerson)
   - Teslim Alan Kişi (receiverPerson)
   - Teslimat Notu (deliveryNote)

3. Günlük Tarihi:
   - Günlük Tarihi (waybillDate) - varsayılan: bugün

State yönetimi:
- formData.transport.driverName
- formData.transport.driverTc
- formData.transport.plateNumber
- formData.transport.deliveryPerson (optional)
- formData.transport.receiverPerson (optional)
- formData.transport.deliveryNote (optional)
- formData.waybillDate

TC Validasyonu (inline):
const validateTc = (tc) => tc && tc.length === 11 && /^\d{11}$/.test(tc);

Plaka Validasyonu (inline):
const validatePlate = (plate) => /^(0[1-9]|[1-7][0-9]|8[01])[A-Z]{1,3}\d{2,4}$/.test(plate?.replace(/\s/g, ""));

Styling: Mevcut accordion component'larla aynı stil yapısı (Accordion from MUI/Chakra kullanımı)

Referans benzer component:
- /WebApp/domains/materials/components/shared/accordions/NotesAccordion.jsx
```

**Oluşturulacak Dosya:**
- `/WebApp/domains/materials/components/shared/accordions/TransportAccordion.jsx`

**Test:**
- [x] Component hatasız render oluyor
- [x] TC alanına 10 veya 12 hane yazılınca hata gösteriyor
- [x] Geçersiz plaka formatında uyarı veriyor
- [x] State güncelleniyor (console.log ile kontrol)

---

### P3.3: AddShipmentModal'a TransportAccordion Entegrasyonu

**Bağımlılık:** P3.2 tamamlanmış olmalı

**Amaç:** Yeni oluşturulan TransportAccordion'u modal'a ekle.

**Prompt:**
```
AddShipmentModal.jsx dosyasına TransportAccordion'u entegre et:
/WebApp/domains/materials/components/shared/modals/AddShipmentModal.jsx

1. Import ekle:
import TransportAccordion from "../accordions/TransportAccordion";

2. formData state'ine transport alanlarını ekle:
const [formData, setFormData] = useState({
  // mevcut alanlar...
  transport: {
    driverName: "",
    driverTc: "",
    plateNumber: "",
    deliveryPerson: "",
    receiverPerson: "",
    deliveryNote: ""
  },
  waybillDate: new Date().toISOString().split("T")[0],
  // ...
});

3. Modal içine TransportAccordion'u ekle (NotesAccordion'dan önce):
<TransportAccordion
  transport={formData.transport}
  waybillDate={formData.waybillDate}
  onChange={(field, value) => {
    if (field === "waybillDate") {
      setFormData(prev => ({ ...prev, waybillDate: value }));
    } else {
      setFormData(prev => ({
        ...prev,
        transport: { ...prev.transport, [field]: value }
      }));
    }
  }}
  errors={errors}
/>

4. Submit validasyonu güncelle:
const validateForm = () => {
  const newErrors = {};
  // mevcut validasyonlar...
  
  if (!formData.transport.driverName?.trim()) {
    newErrors["transport.driverName"] = "Şoför adı zorunlu";
  }
  if (!formData.transport.driverTc || formData.transport.driverTc.length !== 11) {
    newErrors["transport.driverTc"] = "Şoför TC 11 haneli olmalı";
  }
  if (!formData.transport.plateNumber?.trim()) {
    newErrors["transport.plateNumber"] = "Plaka zorunlu";
  }
  
  setErrors(newErrors);
  return Object.keys(newErrors).length === 0;
};

5. Quote Seçimi (relatedQuoteId - İlişki Kurma):

Modal'ın "Bilgiler" (Step 1) kısmına "Bağlı Teklif" dropdown ekle:

```jsx
// State'e ekle
const [availableQuotes, setAvailableQuotes] = useState([]);

// formData'ya ekle
relatedQuoteId: "",

// useEffect ile müşteri seçilince teklifleri getir
useEffect(() => {
  if (formData.customerId) {
    fetchQuotesByCustomer(formData.customerId);
  }
}, [formData.customerId]);

const fetchQuotesByCustomer = async (customerId) => {
  try {
    const response = await fetch(`/api/crm/quotes?customerId=${customerId}&status=approved`);
    const data = await response.json();
    setAvailableQuotes(data.quotes || []);
  } catch (error) {
    console.error('Teklifler yüklenemedi:', error);
  }
};

// UI'da dropdown ekle (Müşteri seçiminden sonra)
{formData.customerId && (
  <div className="form-control">
    <label className="label">
      <span className="label-text">Bağlı Teklif (Opsiyonel)</span>
    </label>
    <select
      className="select select-bordered"
      value={formData.relatedQuoteId}
      onChange={(e) => setFormData({...formData, relatedQuoteId: e.target.value})}
    >
      <option value="">Teklif seçin...</option>
      {availableQuotes.map(q => (
        <option key={q.id} value={q.id}>
          {q.id} - {q.customerName} - ₺{q.finalPrice?.toLocaleString('tr-TR')}
        </option>
      ))}
    </select>
    <label className="label">
      <span className="label-text-alt text-gray-500">
        7 gün kuralı için irsaliyeyi teklife bağlayın
      </span>
    </label>
  </div>
)}
```

6. Submit payload'ına relatedQuoteId'yi dahil et:
const submitData = {
  ...formData,
  relatedQuoteId: formData.relatedQuoteId || null,
  // diğer alanlar...
};

Referans: INVOICE-EXPORT-REFACTOR-PLAN.md Bölüm 7.3
```

**Düzenlenecek Dosya:**
- `/WebApp/domains/materials/components/shared/modals/AddShipmentModal.jsx`

**Test:**
- [x] TransportAccordion modal'da görünüyor
- [x] Alanlar dolduğunda state güncelleniyor
- [x] Boş submit'te validasyon hataları görünüyor
- [x] Doğru verilerle submit çalışıyor
- [x] Müşteri seçilince "Bağlı Teklif" dropdown görünüyor
- [x] Teklifler API'den yükleniyor
- [x] relatedQuoteId submit payload'ında gönderiliyor

---

### P3.4: Shipment Panel Entegrasyon Testi

**Bağımlılık:** P3.3 tamamlanmış olmalı

**Amaç:** Tüm Shipment Panel değişikliklerini test et.

**Status:** ✅ TAMAMLANDI

**Prompt:**
```
Shipment Panel'deki tüm değişiklikleri test et:

1. Manuel UI Testi:
   a) Shipments sayfasını aç
   b) "Yeni Sevkiyat" butonuna tıkla
   c) AddShipmentModal'ın açıldığını doğrula
   
2. Kaldırılan Accordion'ları Kontrol Et:
   - [x] documentType seçimi GÖRÜNMÜYOR
   - [x] CurrencyAccordion GÖRÜNMÜYOR
   - [x] DiscountAccordion GÖRÜNMÜYOR  
   - [x] TaxAccordion GÖRÜNMÜYOR
   - [x] ExportAccordion GÖRÜNMÜYOR (veya sadeleştirilmiş)
   
3. TransportAccordion'u Test Et:
   - [x] Accordion açılıyor
   - [x] Şoför Adı alanı var ve yazılabiliyor
   - [x] Şoför TC alanı var, sadece 11 rakam kabul ediyor
   - [x] Plaka alanı var
   - [x] Günlük Tarihi var, varsayılan bugün
   - [x] Transport JSONB olarak database'e kaydediliyor
   
4. Validasyon Testi:
   - [x] Boş form submit'te hata mesajları görünüyor
   - [x] 10 haneli TC'de hata
   - [x] 12 haneli TC'de hata
   - [x] 11 haneli doğru TC'de hata yok
   
5. Submit Flow Testi:
   - [x] Tüm zorunlu alanları doldur
   - [x] Submit'e tıkla
   - [x] Backend'e giden request'i kontrol et (Network tab)
   - [x] transport alanlarının payload'da olduğunu doğrula
   - [x] Database'de transport JSONB olarak saklanıyor
   
6. Konsol Kontrolü:
   - [x] React uyarısı yok
   - [x] Console.error yok
   - [x] Deprecation warning yok

7. Address Fields (Ek):
   - [x] Step 1'de müşteri adres bilgisi neighbourhood ile görünüyor
   - [x] PDF'te neighbourhood field doğru formatlanıyor
   - [x] Field spelling düzeltildi: neighborhood → neighbourhood (British, CRM ile uyumlu)

**Çözülen Sorunlar:**
- ✅ Transport data flow: Frontend → Backend → Database JSONB
- ✅ Field name mismatch: neighbourhood (British) vs neighborhood (American)
- ✅ PDF address format: Neighbourhood varsa göster, yoksa skip
```


**Test Edilecek Sayfa:**
- `/WebApp/pages/materials.html` veya Shipments paneli

**Başarı Kriteri:**
- [ ] Tüm 6 test grubu geçti
- [ ] UI kullanılabilir durumda
- [ ] Backend entegrasyonu çalışıyor

---


## FAZ 4: QUOTES FATURA ENTEGRASYONu (8 PROMPT)

> **GÜNCELLEME (2025-12-09):** 
> - Tab yaklaşımı yerine **Section + Modal** yaklaşımı benimsenmiştir.
> - **YENİ TABLO:** `quotes.quote_documents` - Tüm proforma, export ve import belgelerini saklar.
> - Belgeler yeniden oluşturulabilir (proforma/export), sadece import edilen GİB belgesi dosya olarak saklanır.

### 🗄️ Yeni Veritabanı Yapısı

```sql
-- YENİ TABLO: quotes.quote_documents
CREATE TABLE quotes.quote_documents (
    id                  SERIAL PRIMARY KEY,
    "quoteId"           VARCHAR(50) NOT NULL REFERENCES quotes.quotes(id) ON DELETE CASCADE,
    "documentType"      VARCHAR(20) NOT NULL,  -- 'proforma' | 'export' | 'import'
    "documentNumber"    VARCHAR(50),           -- PF-2025-0001 veya fatura no
    "ettn"              VARCHAR(50),           -- GİB ETTN (sadece import)
    "invoiceScenario"   VARCHAR(20),           -- TEMELFATURA | TICARIFATURA | IHRACAT
    "invoiceType"       VARCHAR(20),           -- SATIS | IADE
    "exportFormat"      VARCHAR(20),           -- xml | csv | pdf
    "exportTarget"      VARCHAR(50),           -- LOGO | ZIRVE | OTHER
    "fileData"          BYTEA,                 -- Sadece import için (GİB resmi belgesi)
    "fileName"          VARCHAR(255),
    "mimeType"          VARCHAR(100),
    "createdAt"         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "createdBy"         VARCHAR(100),
    "notes"             TEXT,
    CONSTRAINT valid_document_type CHECK ("documentType" IN ('proforma', 'export', 'import'))
);
```

### 📊 Belge Akışı

```
Quote: Q-2025-0123
│
├── [PROFORMA] documentType: 'proforma'
│   └── documentNumber: 'PF-2025-0045'
│       (PDF her seferinde fonksiyonla oluşturulur)
│
├── [EXPORT] documentType: 'export'  
│   └── invoiceScenario, invoiceType, exportFormat
│       (Dosya her seferinde fonksiyonla oluşturulur - Logo/Zirve için)
│
└── [IMPORT] documentType: 'import'
    └── documentNumber: 'A-2025-001234', ettn: 'xxx-xxx'
        fileData: <GİB onaylı XML> (SAKLANIR - resmi belge)
```

### ✅ Mevcut Altyapı (Faz 1-2-3'te Oluşturuldu - GÜNCELLENMELİ)

**API Endpoint'leri (Yeni tabloya göre güncellenecek):**
| Endpoint | Açıklama | Status |
|----------|----------|--------|
| `POST /api/quotes/:id/proforma` | Proforma oluştur | 🔄 Güncellenmeli |
| `POST /api/quotes/:id/invoice/export` | e-Fatura export | 🔄 Güncellenmeli |
| `POST /api/quotes/:id/invoice/import` | ETTN import | 🔄 Güncellenmeli |
| `GET /api/quotes/:id/documents` | Belge listesi | 🆕 Yeni eklenecek |
| `GET /api/quotes/:id/documents/:docId/download` | Belge indir | 🆕 Yeni eklenecek |
| `GET /api/quotes/:id/seven-day-check` | 7 gün kuralı kontrolü | ✅ Mevcut |
| `GET/POST/PUT/DELETE /api/quotes/:id/items` | Quote items CRUD | ✅ Mevcut |

**Dosya Lokasyonları:**
- Controller: `/WebApp/domains/crm/api/controllers/quoteInvoiceController.js`
- Service: `/WebApp/domains/crm/api/services/quoteInvoiceService.js`
- Model: `/WebApp/db/models/quoteDocuments.js` (YENİ)
- QuoteDetailsPanel: `/WebApp/domains/crm/components/quotes/QuoteDetailsPanel.jsx`

---

### P4.1: Database Migration - quote_documents Tablosu

**Bağımlılık:** FAZ 3 tamamlanmış olmalı

**Amaç:** Yeni `quotes.quote_documents` tablosunu oluştur ve mevcut verileri taşı.

**Migration Dosyası:** `db/migrations/037_quote_documents.js`

**Prompt:**
```
Yeni migration dosyası oluştur: db/migrations/037_quote_documents.js

1. Tablo oluştur:
CREATE TABLE quotes.quote_documents (
    id                  SERIAL PRIMARY KEY,
    "quoteId"           VARCHAR(50) NOT NULL REFERENCES quotes.quotes(id) ON DELETE CASCADE,
    "documentType"      VARCHAR(20) NOT NULL,
    "documentNumber"    VARCHAR(50),
    "ettn"              VARCHAR(50),
    "invoiceScenario"   VARCHAR(20),
    "invoiceType"       VARCHAR(20),
    "exportFormat"      VARCHAR(20),
    "exportTarget"      VARCHAR(50),
    "fileData"          BYTEA,
    "fileName"          VARCHAR(255),
    "mimeType"          VARCHAR(100),
    "createdAt"         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "createdBy"         VARCHAR(100),
    "notes"             TEXT,
    CONSTRAINT valid_document_type CHECK ("documentType" IN ('proforma', 'export', 'import'))
);

2. İndeksler:
CREATE INDEX idx_quote_documents_quote_id ON quotes.quote_documents("quoteId");
CREATE INDEX idx_quote_documents_type ON quotes.quote_documents("documentType");
CREATE UNIQUE INDEX idx_quote_documents_proforma ON quotes.quote_documents("documentNumber") 
    WHERE "documentType" = 'proforma';

3. Mevcut verileri taşı:
- quotes.quotes'dan proformaNumber olanları quote_documents'a ekle
- quotes.quotes'dan invoiceNumber olanları quote_documents'a ekle

4. Proforma numara sequence (eğer yoksa):
CREATE SEQUENCE IF NOT EXISTS quotes.proforma_number_seq;
CREATE OR REPLACE FUNCTION quotes.generate_proforma_number() RETURNS VARCHAR;
```

**Test:**
- [x] Migration başarıyla çalıştı
- [x] Tablo oluşturuldu (15 kolon)
- [x] Mevcut veriler taşındı (0 kayıt - henüz proforma/import yok)
- [x] İndeksler aktif (6 adet)
- [x] FK constraint (quoteId) çalışıyor
- [x] CHECK constraint (documentType) çalışıyor
- [x] generate_proforma_number() fonksiyonu çalışıyor

---

### P4.2: Backend Model - quoteDocuments.js

**Bağımlılık:** P4.1 tamamlanmış olmalı

**Amaç:** Yeni tablo için model dosyası oluştur.

**Dosya:** `db/models/quoteDocuments.js`

**Prompt:**
```
Yeni model dosyası oluştur: db/models/quoteDocuments.js

Fonksiyonlar:

1. createDocument(quoteId, documentType, data)
   - Yeni belge kaydı oluştur
   - Return: created document

2. getDocumentsByQuoteId(quoteId, documentType = null)
   - Quote'a ait tüm belgeleri getir
   - documentType filtresi opsiyonel
   - ORDER BY createdAt DESC

3. getDocumentById(id)
   - Tek belge detayı

4. getLatestDocument(quoteId, documentType)
   - En son belgeyi getir (proforma, export veya import)

5. updateDocument(id, data)
   - Belge güncelle

6. deleteDocument(id)
   - Belge sil

7. generateProformaNumber()
   - Sequence'tan yeni proforma no al
   - Format: PF-YYYY-XXXX

Referans: db/models/shipments.js yapısı
```

**Test:**
- [x] CRUD operasyonları çalışıyor (create, get, update, delete)
- [x] Proforma numarası doğru formatda (PF-YYYY-XXXX)
- [x] getDocumentsByQuoteId filtresi çalışıyor
- [x] getLatestDocument çalışıyor
- [x] getDocumentStats çalışıyor
- [x] Invalid documentType validasyonu çalışıyor

---

### P4.3: Backend Controller ve API Endpoints

**Bağımlılık:** P4.2 tamamlanmış olmalı

**Amaç:** Backend controller ve service katmanlarını yeni tablo yapısına göre güncelle.

**Dosyalar:**
- `domains/crm/api/controllers/quoteInvoiceController.js`
- `domains/crm/api/services/quoteInvoiceService.js` (veya `quoteDocumentService.js`)

**Prompt:**
```
Backend API'lerini yeni document yapısına göre güncelle:

1. Service (quoteInvoiceService.js):
   - generateProforma(quoteId): Yeni document yarat ('proforma')
   - exportInvoice(quoteId, options): Yeni document yarat ('export')
   - importInvoice(quoteId, data, file): Yeni document yarat ('import') + Dosya kaydet
   - getDocumentHistory(quoteId): Tüm belgeleri getir

2. Controller (quoteInvoiceController.js):
   - POST /api/quotes/:id/documents/proforma
   - GET /api/quotes/:id/documents  (History)
   - GET /api/quotes/:id/documents/:docId  (Detail)
   - POST /api/quotes/:id/documents/export
   - GET /api/quotes/:id/documents/:docId/download
   - POST /api/quotes/:id/documents/import

NOT: Mevcut endpoint'leri bozmadan, yeni document yapısını kullanacak şekilde refactor et.
```

**Test:**
- [x] Proforma oluşturma API çalışıyor (yeni tabloya kayıt + varsa mevcut döndürüyor)
- [x] Export API çalışıyor (document kaydı oluşturuluyor)
- [x] Import API çalışıyor (dosya kaydı başarılı)
- [x] Belge listesi dönüyor (documents + stats)
- [x] Belge detayı dönüyor (documents/:docId)
- [x] Dosya indirme çalışıyor (veya NO_FILE hatası)

---

### P4.4: QuoteDetailsPanel Fatura Section

**Bağımlılık:** P4.3 tamamlanmış olmalı

**Amaç:** Quote detay paneline "Fatura İşlemleri" section'ı ekle.

**Dosya:** `domains/crm/components/quotes/QuoteDetailsPanel.jsx`

**Prompt:**

```
QuoteDetailsPanel.jsx dosyasına yeni Fatura Section ekle:
/WebApp/domains/crm/components/quotes/QuoteDetailsPanel.jsx

NOT: Tab sistemi YOK - mevcut section yapısına uygun şekilde ekle.

1. Yeni state'ler ekle:
const [showInvoiceModal, setShowInvoiceModal] = useState(false)
const [invoiceLoading, setInvoiceLoading] = useState(false)

2. Mevcut section'ların altına yeni Fatura Section ekle:
{/* ===== FATURA İŞLEMLERİ SECTION ===== */}
<div className="section-card-mb">
  <h3 className="section-title">
    <FileText size={14} /> Fatura İşlemleri
  </h3>
  
  {/* Proforma Status */}
  <div className="detail-row">
    <span className="detail-label">Proforma:</span>
    <span className="detail-value">
      {quote.proformaNumber ? (
        <span className="status-badge status-success">
          {quote.proformaNumber}
        </span>
      ) : (
        <span className="status-badge status-pending">Oluşturulmadı</span>
      )}
    </span>
  </div>
  
  {/* Invoice Status */}
  <div className="detail-row">
    <span className="detail-label">e-Fatura:</span>
    <span className="detail-value">
      {quote.invoiceNumber ? (
        <div>
          <span className="status-badge status-success">
            {quote.invoiceNumber}
          </span>
          {quote.invoiceEttn && (
            <code className="ettn-code">{quote.invoiceEttn}</code>
          )}
        </div>
      ) : quote.invoiceExportedAt ? (
        <span className="status-badge status-warning">Export edildi</span>
      ) : (
        <span className="status-badge status-pending">Kesilmedi</span>
      )}
    </span>
  </div>
  
  {/* 7 Gün Uyarısı (varsa) */}
  {sevenDayWarning && sevenDayWarning.hasWarning && (
    <div className="warning-banner warning-seven-day">
      <AlertTriangle size={14} />
      <span>7 Gün Kuralı: {sevenDayWarning.daysRemaining} gün kaldı!</span>
    </div>
  )}
  
  {/* Action Buttons */}
  <div className="section-actions">
    <button 
      className="btn-action btn-primary-outline"
      onClick={() => setShowInvoiceModal(true)}
      disabled={invoiceLoading}
    >
      <FileText size={14} />
      {quote.proformaNumber ? 'Fatura İşlemleri' : 'Proforma Oluştur'}
    </button>
    
    {quote.invoiceImportedFile && (
      <button 
        className="btn-action btn-secondary-outline"
        onClick={handleDownloadInvoice}
      >
        <Download size={14} /> Faturayı İndir
      </button>
    )}
  </div>
</div>

3. AddInvoiceModal import'u ekle (P4.2'de oluşturulacak):
// import AddInvoiceModal from './modals/AddInvoiceModal'

4. Modal render'ı ekle (return içine):
{showInvoiceModal && (
  <AddInvoiceModal
    quote={quote}
    onClose={() => setShowInvoiceModal(false)}
    onSuccess={handleInvoiceSuccess}
  />
)}

5. Handler fonksiyonları ekle:
const handleInvoiceSuccess = async () => {
  setShowInvoiceModal(false)
  if (onRefreshQuote) {
    await onRefreshQuote()
  }
  showToast('Fatura işlemi tamamlandı!', 'success')
}

const handleDownloadInvoice = () => {
  if (quote.invoiceImportedFile) {
    // Download logic
  }
}

Referans: Mevcut AddShipmentModal yapısı
```

**Düzenlenecek Dosya:**
- `/WebApp/domains/crm/components/quotes/QuoteDetailsPanel.jsx`

**Test:**
- [x] Fatura İşlemleri section'ı görünüyor
- [x] Proforma ve Invoice status badge'leri doğru
- [x] "Proforma Oluştur" / "Fatura İşlemleri" butonu çalışıyor
- [x] Konsol hatası yok

---



---

---

### P4.5: AddInvoiceModal (Step 1-2: Proforma + Ayarlar)

**Bağımlılık:** P4.4 tamamlanmış olmalı

**Amaç:** AddInvoiceModal component'ını oluştur ve ilk 2 adımı implement et.

**Dosya:** `domains/crm/components/quotes/modals/AddInvoiceModal.jsx` (YENİ)

**Prompt:**
```
Yeni modal oluştur: AddInvoiceModal.jsx

Yapı:
- Wizard steps (1: Proforma, 2: Ayarlar, 3: Export, 4: Import)
- Mevcut yapı: AddShipmentModal benzeri

Step 1: Proforma
- Eğer proforma yoksa: 
  - Proforma No input (Default: generateProformaNumber())
  - "Proforma Oluştur" butonu -> POST /api/quotes/:id/documents/proforma
- Eğer proforma varsa:
  - Proforma detaylarını göster (No, Tarih)
  - "PDF İndir" butonu
  - "Sonraki Adım" butonu aktif

Step 2: Fatura Ayarları
- Form elemanları:
  - Fatura Senaryosu (TEMEL/TICARI/IHRACAT)
  - Fatura Tipi (SATIS/IADE)
  - Para Birimi (Readonly - quote'dan)
  - Kur (Readonly - quote'dan)
- "Sonraki Adım" butonu -> State'e kaydet ve Step 3'e geç

NOT: Veri akışı için logic'i kur. Step 1 DB'ye yazar, Step 2 sadece state'te tutar.
```

**Test:**
- [ ] Modal açılıyor
- [ ] Step 1: Proforma oluşturuluyor ve PDF indirilebiliyor
- [ ] Step 2: Form çalışıyor ve state'e kaydediyor

---

### P4.6: AddInvoiceModal (Step 3-4: Export + Import)

**Bağımlılık:** P4.5 tamamlanmış olmalı

**Amaç:** Modal'ın export ve import adımlarını implement et.

**Dosya:** `domains/crm/components/quotes/modals/AddInvoiceModal.jsx`

**Prompt:**
```
AddInvoiceModal.jsx dosyasına Step 3 ve 4'ü ekle:

Step 3: Export (Logo/Zirve)
- Form elemanları:
  - Hedef Program: [Logo Tiger | Zirve | Diğer]
  - Format: [Checkbox] XML, CSV, PDF
- "Export Et" butonu -> POST /api/quotes/:id/documents/export
  - Body: { invoiceScenario, invoiceType, format, target }
  - Response: Dosya (blob) -> İndir
- Başarılı export sonrası "Sonraki Adım" aktif

Step 4: Import (GİB Faturası)
- Form elemanları:
  - Fatura No (Input)
  - ETTN (Input, 36 char UUID)
  - Dosya Yükle (.xml, .zip)
- "Import Et" butonu -> POST /api/quotes/:id/documents/import
  - FormData: { invoiceNumber, ettn, file }
- Başarılı import sonrası modal kapanır ve onSuccess çağrılır

Validasyonlar:
- ETTN formatı kontrolü
- Dosya tipi kontrolü
```

**Test:**
- [ ] Step 3: Export çalışıyor, dosya iniyor
- [ ] Step 4: Import çalışıyor, DB'ye kaydediliyor
- [ ] Full wizard akışı sorunsuz

---

### P4.7: 7 Gün Kuralı ve CSS

**Bağımlılık:** P4.6 tamamlanmış olmalı

**Amaç:** 7 gün kuralı uyarısı ve görsel düzenlemeler.

**Dosyalar:**
- `domains/crm/components/quotes/SevenDayWarning.jsx` (YENİ)
- `assets/css/crm.css`

**Prompt:**
```
1. SevenDayWarning component'ı oluştur:
   - Props: quoteId
   - Logic: GET /api/quotes/:id/seven-day-check
   - Warning Levels:
     - Kalan > 5 gün: Yeşil (Info)
     - Kalan 3-5 gün: Sarı (Warning)
     - Kalan < 3 gün: Kırmızı (Danger)
     - Süre geçmiş: Koyu Kırmızı (Critical)

2. CSS Düzenlemeleri (crm.css):
   - Modal step wizard stilleri
   - Status badge stilleri (.status-proforma, .status-invoice)
   - Warning banner stilleri

3. Warning'i Modal ve DetailsPanel'e ekle.
```

**Test:**
- [ ] 7 gün kuralı API'den doğru çekiliyor
- [ ] Uyarı renkleri güne göre değişiyor
- [ ] Modal stilleri düzgün

---

### P4.8: Entegrasyon Testi

**Bağımlılık:** P4.7 tamamlanmış olmalı

**Amaç:** Tüm fatura entegrasyonunu uçtan uca test et.

**Prompt:**
```
Manuel Entegrasyon Testi Planı:

1. Veritabanı Kontrolü:
   - quote_documents tablosu var mı?
   - İlişkiler doğru mu?

2. Senaryo Testi:
   A. Quote Detay'a git
   B. "Fatura İşlemleri"ne tıkla
   C. Proforma oluştur (PF-2025-XXXX gelmeli)
   D. Ayarları seç (Ticari Fatura)
   E. Export yap (XML indi mi?)
   F. Import yap (Dummy XML yükle)
   G. Modal kapandı, panel güncellendi mi?

3. Edge Cases:
   - Proforma varken modal açınca Step 1 doğru geliyor mu?
   - 7 gün süresi geçmiş shipment için uyarı çıkıyor mu?
   - Import edilmiş faturaya tekrar işlem yapılamamalı (veya uyarı vermeli).

Test sonuçlarını raporla ve varsa bugfix yap.
```

**Test Edilecek Sayfa:**
- `/WebApp/pages/quote-dashboard.html` -> Quote Detail

**Başarı Kriteri:**
- [ ] Full akış hatasız tamamlandı
- [ ] DB'de kayıtlar doğru (documentType: proforma, export, import)


## FAZ 5: CRM ENTEGRASYONLARı (3 PROMPT)

### P5.1: Müşteri Formuna e-Belge Alanları Ekle

**Bağımlılık:** FAZ 4 tamamlanmış olmalı

**Amaç:** Müşteri oluşturma/düzenleme formuna e-Fatura mükellefiyeti alanlarını ekle.

**Prompt:**
```
Müşteri formunu güncelle:
/WebApp/domains/crm/components/CustomerForm.jsx (veya benzer isimle)

1. Yeni alanlar ekle (form içinde uygun yere):

```jsx
{/* e-Belge Bilgileri Bölümü */}
<div className="border rounded-lg p-4 mt-4">
  <h4 className="font-semibold mb-3">e-Belge Bilgileri</h4>
  
  {/* e-Fatura Mükellefi */}
  <div className="form-control">
    <label className="label cursor-pointer justify-start gap-3">
      <input 
        type="checkbox"
        className="checkbox checkbox-primary"
        checked={formData.isEInvoiceTaxpayer}
        onChange={(e) => setFormData({...formData, isEInvoiceTaxpayer: e.target.checked})}
      />
      <span className="label-text">e-Fatura Mükellefi</span>
    </label>
  </div>
  
  {/* e-İrsaliye Mükellefi */}
  <div className="form-control">
    <label className="label cursor-pointer justify-start gap-3">
      <input 
        type="checkbox"
        className="checkbox checkbox-primary"
        checked={formData.isEDespatchTaxpayer}
        onChange={(e) => setFormData({...formData, isEDespatchTaxpayer: e.target.checked})}
      />
      <span className="label-text">e-İrsaliye Mükellefi</span>
    </label>
  </div>
  
  {/* Posta Kutusu Etiketi */}
  {formData.isEInvoiceTaxpayer && (
    <div className="form-control mt-3">
      <label className="label">
        <span className="label-text">e-Fatura Posta Kutusu Etiketi</span>
      </label>
      <input 
        type="text"
        className="input input-bordered"
        placeholder="urn:mail:defaultpk@..."
        value={formData.gibPkLabel || ""}
        onChange={(e) => setFormData({...formData, gibPkLabel: e.target.value})}
      />
      <label className="label">
        <span className="label-text-alt text-gray-500">
          Entegratör'den alınan posta kutusu etiketi
        </span>
      </label>
    </div>
  )}
</div>
```

2. formData initial state'e alanları ekle:
```jsx
const [formData, setFormData] = useState({
  // ... mevcut alanlar
  isEInvoiceTaxpayer: false,
  isEDespatchTaxpayer: false,
  gibPkLabel: ""
});
```

3. Edit modunda bu alanları yükle (useEffect içinde veya fetchCustomer'da)

Referans: INVOICE-EXPORT-REFACTOR-PLAN.md Bölüm 4.1.3
```

**Düzenlenecek Dosya:**
- `/WebApp/domains/crm/components/CustomerForm.jsx` veya modal component

**Test:**
- [ ] e-Belge bölümü formda görünüyor
- [ ] Checkbox'lar tıklanabiliyor
- [ ] e-Fatura mükellefi seçilince posta kutusu alanı görünüyor
- [ ] Mevcut müşteri düzenlemesinde alanlar doluyorsa gösteriliyor

---

### P5.2: Quote Listesine Fatura Durumu Kolonu Ekle

**Bağımlılık:** P5.1 tamamlanmış olmalı

**Amaç:** Quote listesinde fatura durumunu görsel olarak göster.

**Prompt:**
```
Quote listesi tablosunu güncelle:
/WebApp/domains/crm/components/QuoteList.jsx veya QuoteTable.jsx

1. Yeni kolon tanımla (columns array'ine ekle):

```jsx
{
  id: "invoiceStatus",
  header: "Fatura Durumu",
  accessorKey: "invoiceStatus",
  cell: ({ row }) => <InvoiceStatusBadge status={row.original.invoiceStatus} />
}
```

2. InvoiceStatusBadge component'ı oluştur (aynı dosyada veya ayrı):

```jsx
const InvoiceStatusBadge = ({ status }) => {
  const statusConfig = {
    draft: { label: "Taslak", color: "bg-gray-100 text-gray-600" },
    proformaSent: { label: "Proforma", color: "bg-blue-100 text-blue-700" },
    invoiceExported: { label: "Fatura Kesildi", color: "bg-yellow-100 text-yellow-700" },
    invoiceImported: { label: "Tamamlandı", color: "bg-green-100 text-green-700" }
  };
  
  const config = statusConfig[status] || statusConfig.draft;
  
  return (
    <span className={\`px-2 py-1 rounded-full text-xs font-medium \${config.color}\`}>
      {config.label}
    </span>
  );
};
```

3. (Opsiyonel) Filter ekle:
```jsx
// Filter options
const invoiceStatusOptions = [
  { value: "", label: "Tümü" },
  { value: "draft", label: "Taslak" },
  { value: "proformaSent", label: "Proforma" },
  { value: "invoiceExported", label: "Fatura Kesildi" },
  { value: "invoiceImported", label: "Tamamlandı" }
];

// Filter select
<select 
  value={filters.invoiceStatus || ""}
  onChange={(e) => setFilters({...filters, invoiceStatus: e.target.value})}
>
  {invoiceStatusOptions.map(opt => (
    <option key={opt.value} value={opt.value}>{opt.label}</option>
  ))}
</select>
```

Referans: INVOICE-EXPORT-REFACTOR-PLAN.md Bölüm 8.7
```

**Düzenlenecek Dosya:**
- `/WebApp/domains/crm/components/QuoteList.jsx` veya QuoteTable.jsx

**Test:**
- [ ] Yeni kolon tabloda görünüyor
- [ ] Badge'lar doğru renklerle gösteriliyor
- [ ] Her durum için doğru etiket
- [ ] (Opsiyonel) Filter çalışıyor

---

### P5.3: Final Entegrasyon Testi ve Deployment

**Bağımlılık:** Tüm FAZ'lar tamamlanmış olmalı

**Amaç:** Tüm sistemin uçtan uca çalıştığını doğrula.

**Prompt:**
```
Son entegrasyon testini yap:

## 1. FULL E2E AKIM TESTİ

Senaryo: Yeni müşteri → Yeni quote → Sevkiyat → Proforma → e-Fatura

A) Müşteri Oluştur:
- [ ] CRM'de yeni müşteri ekle
- [ ] e-Fatura mükellefi olarak işaretle
- [ ] Posta kutusu etiketini gir
- [ ] Kaydet

B) Quote Oluştur:
- [ ] Yeni quote oluştur
- [ ] Müşteriyi seç
- [ ] Ürünleri ekle
- [ ] Kaydet

C) Sevkiyat Oluştur:
- [ ] Materials panelinden sevkiyat ekle
- [ ] TransportAccordion alanlarını doldur
- [ ] Kaydet
- [ ] relatedQuoteId bağlantısı kuruldu mu kontrol et

D) Proforma Oluştur:
- [ ] Quote detay → Fatura sekmesi
- [ ] "Proforma Oluştur" tıkla
- [ ] Proforma numarası oluştu
- [ ] PDF indirilebiliyor

E) e-Fatura İhracat:
- [ ] Senaryo ve tip seç
- [ ] "e-Fatura Aktar" tıkla
- [ ] invoiceStatus = invoiceExported oldu

F) e-Fatura İthalat:
- [ ] XML dosyası yükle (test XML)
- [ ] Fatura numarası ve ETTN parse edildi
- [ ] invoiceStatus = invoiceImported oldu

## 2. REGRESSION TESTLERİ

- [ ] Mevcut shipment işlevselliği bozulmadı
- [ ] Mevcut quote işlevselliği bozulmadı
- [ ] Mevcut müşteri işlevselliği bozulmadı
- [ ] Diğer modüller (production, materials) etkilenmedi

## 3. 7 GÜN KURALI TESTİ

- [ ] 5 gün önce sevkiyatı olan quote aç
- [ ] Sarı uyarı görünüyor
- [ ] 8 gün önce sevkiyatı olan quote aç
- [ ] Kırmızı uyarı görünüyor

## 4. PERFORMANS KONTROLÜ

- [ ] Quote listesi hızlı yükleniyor
- [ ] Fatura sekmesi hızlı açılıyor
- [ ] Büyük item listelerinde yavaşlama yok

## 5. DEPLOYMENT HAZIRLIĞI

A) Migration Kontrolü:
- [ ] Migration 037 başarıyla çalışıyor (dev)
- [ ] Rollback test edildi
- [ ] Production'a hazır

B) Feature Flag (opsiyonel):
- [ ] featureFlags.cjs'de invoiceExport flag'i eklendi
- [ ] Flag kapalıyken fatura sekmesi gizleniyor

C) Dokümantasyon:
- [ ] README güncellemesi
- [ ] Kullanım kılavuzu yazıldı
- [ ] API dokümantasyonu

Hata durumunda:
- Bug raporla (adım, beklenen, gerçekleşen)
- Log ve ekran görüntüsü kaydet
- Öncelik belirle (blocker/major/minor)
```

**Başarı Kriterleri:**
- [ ] Tüm E2E akış 0 hata ile tamamlandı
- [ ] Regression testleri geçti
- [ ] Production deployment planı hazır
- [ ] Rollback prosedürü belirlendi

---


---

## 📊 APPENDIX A ÖZET

| FAZ | Konu | Prompt Sayısı | Bağımlılık |
|-----|------|---------------|------------|
| 1 | Veritabanı (Migrations) | 8 (P1.1-P1.8) | - |
| 2 | Backend API | 7 (P2.1-P2.7) | FAZ 1 |
| 3 | Shipment Panel Sadeleştirme | 4 (P3.1-P3.4) | FAZ 2 |
| 4 | Quotes Panel Güncelleme | 6 (P4.1-P4.6) | FAZ 3 |
| 5 | CRM Entegrasyonları | 3 (P5.1-P5.3) | FAZ 4 |
| **TOPLAM** | | **28 PROMPT** | |

### Uygulama Sırası

```
P1.1 → P1.2 → P1.3 → P1.4 → P1.5 → P1.6 → P1.7 → P1.8 (DB TEST)
                                                        ↓
P2.1 → P2.2 → P2.3 → P2.4 → P2.5 → P2.6 → P2.7 (API TEST)
                                                        ↓
P3.1 → P3.2 → P3.3 → P3.4 (SHIPMENT TEST)
                                                        ↓
P4.1 → P4.2 → P4.3 → P4.4 → P4.5 → P4.6 (QUOTES TEST)
                                                        ↓
P5.1 → P5.2 → P5.3 (FINAL E2E TEST)
```

### Önemli Notlar

1. **Her prompt sonrasında test yapın** - Sonraki prompt'a geçmeden önce mevcut prompt'un başarılı olduğundan emin olun

2. **Git commit'leri** - Her FAZ sonunda veya majör değişiklik sonunda commit yapın:
   ```bash
   git add .
   git commit -m "feat(invoice): FAZ 1 - DB migrations completed"
   ```

3. **Hata durumunda** - Prompt başarısız olursa:
   - Hata mesajını kopyalayın
   - Yeni chat'te hata mesajıyla birlikte prompt'u tekrar verin
   - Gerekirse önceki prompt'a rollback yapın

4. **Paralel çalışma** - FAZ'lar arasında bağımlılık var, paralel yapılamaz

5. **Dosya yolları** - Prompt'larda verilen yollar önerilir, projenizde farklı olabilir

---

*Bu APPENDIX, INVOICE-EXPORT-REFACTOR-PLAN.md v3.0 dokümanının uygulama rehberidir.*
*Oluşturulma: 2025*

