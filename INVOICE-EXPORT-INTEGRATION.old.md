# 📦 İrsaliye & Fatura Export Entegrasyonu

> **Branch**: `invoice-export`  
> **Tarih**: 8 Aralık 2025  
> **Versiyon**: 2.0  
> **Amaç**: BeePlan Shipments modülünde irsaliye/fatura verilerini Logo, Zirve, Excel gibi harici sistemlere export etmek ve import ile tamamlamak

---

## 📋 İÇİNDEKİLER

1. [Genel Bakış](#1-genel-bakış)
2. [Netleştirilmiş Kararlar](#2-netleştirilmiş-kararlar)
3. [Veritabanı Yapısı](#3-veritabanı-yapısı)
4. [Backend API](#4-backend-api)
5. [Export Formatları](#5-export-formatları)
6. [UI/UX Akışları](#6-uiux-akışları)
7. [Veri Akışları](#7-veri-akışları)
8. [Implementation Prompts](#8-implementation-prompts)

---

## 1. GENEL BAKIŞ

### 1.1. Amaç ve Vizyon

**Problem**: BeePlan kullanıcıları irsaliye/fatura kesme yetkisine sahip değil. Logo, Zirve gibi muhasebe yazılımları bu işlemi yapıyor.

**Çözüm**: Hibrit yaklaşım ile:
1. BeePlan'da sevkiyat verisi oluştur
2. Logo/Zirve formatında dosya export et
3. Kullanıcı dosyayı muhasebe programına import etsin
4. Muhasebe programından gelen onay dosyasını BeePlan'a import et
5. Sevkiyat "completed" olsun, stok düşsün

### 1.2. Hedef Kullanıcı

**Profil**: 
- Herhangi bir ERP sistemi kullanmayan veya Excel kullanan KOBİ'ler
- Tam entegrasyon yerine hibrit yaklaşım isteyenler
- Kurulum karmaşıklığından kaçınan, kolay kullanım arayan işletmeler

**Beklentiler**:
- Manuel noktalar olabilir, ama akış net olsun
- Export/import basit olsun
- Mevcut iş akışlarını bozmadan entegre olsun

### 1.3. Temel Özellikler

| # | Özellik | Açıklama |
|---|---------|----------|
| 1 | **Sevkiyat Oluşturma** | Add Shipment Modal (genişletilmiş) veya Stok sayfasından hızlı |
| 2 | **Müşteri Yönetimi** | CRM'den seç VEYA inline ekle (CRM'e de kaydedilir) |
| 3 | **Çoklu Kalem** | Bir sevkiyatta birden fazla ürün |
| 4 | **Belge Tipi** | İrsaliye (fiyatsız) / Fatura (fiyatlı) / İkisi Birden |
| 5 | **Export** | CSV, XML (Logo/Zirve), PDF, JSON |
| 6 | **Import** | Muhasebe programından gelen onay dosyası |
| 7 | **Stok Yönetimi** | Stok, import (completed) anında düşer |

### 1.4. Kapsam Dışı (v2.0+)

- ❌ GİB e-İrsaliye/e-Fatura doğrudan entegrasyonu
- ❌ Otomatik API entegrasyonu (Logo/Zirve API)
- ❌ Mobil/tablet UI optimizasyonu
- ❌ Çoklu depo yönetimi

---

## 2. NETLEŞTİRİLMİŞ KARARLAR

### 2.1. Temel İş Kuralları

| # | Konu | Karar | Detay |
|---|------|-------|-------|
| 1 | Fiyatsız Fatura | ❌ YOK | Fatura seçilirse fiyat zorunlu |
| 2 | Yetersiz Stok | ❌ BLOK | Sevkiyat oluşturulamaz |
| 3 | Stok Düşme | Import anında | Status "completed" olunca stok düşer |
| 4 | Export Dosyası | Saklanmaz | Her seferinde yeniden üretilir |
| 5 | Import Dosyası | DB'de saklanır | Dosya + metadata kaydedilir |
| 6 | Kalem Silme | Import'a kadar | Completed sonrası silinemez |

### 2.2. Export/Import Kararları

| # | Konu | Karar | Detay |
|---|------|-------|-------|
| 1 | Formatlar | CSV, XML, PDF, JSON | Tümü desteklenir |
| 2 | CSV Ayracı | System Settings | `;` / `,` / `tab` seçenekleri |
| 3 | Hedef Program | Kullanıcı seçer | Logo Tiger, Logo GO, Zirve, Excel |
| 4 | Belge Numarası | İkili sistem | BeePlan: `SHP-XXXX`, Import sonrası Logo/Zirve no da kaydedilir |

### 2.3. Finans & Vergi Kararları

| # | Konu | Karar | Detay |
|---|------|-------|-------|
| 1 | Para Birimi | TRY default | Farklı seçilirse exchangeRate zorunlu |
| 2 | İskonto | Toggle ile | Satır + genel iskonto, default 0 |
| 3 | Tevkifat | Dropdown | 5/10, 7/10, 9/10 vs. standart oranlar |
| 4 | KDV Muafiyet | DB tablosu | `materials.vat_exemption_codes` |
| 5 | KDV Oranları | Standart | 0, 1, 8, 10, 18, 20 |

### 2.4. Ek Alanlar Kararları

| # | Konu | Karar | UI Konumu |
|---|------|-------|-----------|
| 1 | Teslim Adresi | Toggle ile | "Farklı adrese teslim" |
| 2 | Depo Kodu | Şimdilik yok | Boş gider |
| 3 | Lot/Seri | Serbest metin | Akordeon içinde |
| 4 | Satır Notu | Opsiyonel | Kalem satırında |
| 5 | Özel Kod | Serbest metin | Akordeon içinde |
| 6 | Maliyet Merkezi | Serbest metin | Akordeon içinde |

### 2.5. UI/UX Kararları

| # | Konu | Karar |
|---|------|-------|
| 1 | Modal | Mevcut Add Shipment genişletilecek |
| 2 | Stok Sayfası | Aynı modal, malzeme set edilmiş, tek kalem |
| 3 | Opsiyonel Alanlar | Minimal akordeonlar içinde gruplu |
| 4 | Quote Bilgisi | Sol tarafta gösterilir (bilgi amaçlı) |
| 5 | Müşteri Inline | Eklenirse CRM'e de kaydedilir |

### 2.6. Status Akışı

```
┌─────────┐     ┌─────────┐     ┌──────────┐     ┌───────────┐
│  draft  │ ──▶ │ pending │ ──▶ │ exported │ ──▶ │ completed │
└─────────┘     └────┬────┘     └────┬─────┘     └───────────┘
                     │               │
                     ▼               ▼
               ┌───────────┐   ┌───────────┐
               │ cancelled │   │ cancelled │
               └───────────┘   └───────────┘
```

| Status | Açıklama | İzin Verilen Aksiyonlar |
|--------|----------|------------------------|
| draft | Taslak, henüz kaydedilmedi | Düzenle, Sil |
| pending | Kaydedildi, export bekleniyor | Export, Düzenle, Sil, İptal |
| exported | Export edildi, import bekleniyor | Import, Re-export, Düzenle, Sil, İptal |
| completed | Import geldi, tamamlandı | Görüntüle (stok düştü) |
| cancelled | İptal edildi | Görüntüle |

---

## 3. VERİTABANI YAPISI

### 3.1. Genel Bakış

```
┌──────────────────────────┐     ┌─────────────────────────┐
│  quotes.customers        │     │ materials.vat_exemptions│
│  + erpAccountCode        │     │ (YENİ TABLO)            │
└───────────┬──────────────┘     └────────────┬────────────┘
            │                                  │
            │ FK: customerId                   │ FK: vatExemptionId
            ▼                                  ▼
┌──────────────────────────────────────────────────────────┐
│              materials.shipments (GÜNCELLENİYOR)         │
│  + customerSnapshot JSONB                                │
│  + documentType, currency, exchangeRate                  │
│  + discountType, discountValue, discountTotal            │
│  + subtotal, taxTotal, grandTotal                        │
│  + exportHistory JSONB, lastExportedAt                   │
│  + importedAt, importedFile, externalDocNumber           │
│  + deliveryAddress JSONB                                 │
└───────────────────────────┬──────────────────────────────┘
                            │
                            │ FK: shipmentId
                            ▼
┌──────────────────────────────────────────────────────────┐
│           materials.shipment_items (GÜNCELLENİYOR)       │
│  + unitPrice, taxRate, withholdingRate                   │
│  + discountRate, discountAmount                          │
│  + lineSubtotal, lineTax, lineTotal                      │
│  + lotNumber, serialNumber, notes                        │
│  + vatExemptionId                                        │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────┐     ┌─────────────────────────┐
│ materials.withholding    │     │ materials.system_settings│
│ _rates (YENİ TABLO)      │     │ (YENİ TABLO)            │
└──────────────────────────┘     └─────────────────────────┘
```

### 3.2. Yeni Tablolar

#### A) `materials.vat_exemption_codes` (KDV Muafiyet Kodları)

```sql
-- GİB standart muafiyet kodları
CREATE TABLE IF NOT EXISTS materials.vat_exemption_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,        -- '301', '302', '351' vs.
    name VARCHAR(200) NOT NULL,               -- Muafiyet adı
    description TEXT,                          -- Detaylı açıklama
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Örnek veriler (GİB standartları)
INSERT INTO materials.vat_exemption_codes (code, name) VALUES
('301', 'Mal ihracatı'),
('302', 'Hizmet ihracatı'),
('303', 'Diplomatik istisna'),
('304', 'Uluslararası taşımacılık'),
('305', 'Petrol arama'),
('306', 'Altın-gümüş alımı'),
('307', 'Yatırım teşvik belgeli'),
('308', 'Transit ticaret'),
('309', 'Geçici ithalat'),
('310', 'Fuar katılımı'),
('311', 'Deniz-hava araçları'),
('312', 'Liman-havalimanı hizmetleri'),
('350', 'Tevkifat (Tam)'),
('351', 'Tevkifat (Kısmi)');
```

#### B) `materials.withholding_rates` (Tevkifat Oranları)

```sql
-- Standart tevkifat oranları
CREATE TABLE IF NOT EXISTS materials.withholding_rates (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,        -- '5/10', '7/10', '9/10' vs.
    rate DECIMAL(5,4) NOT NULL,               -- 0.5000, 0.7000, 0.9000
    name VARCHAR(200) NOT NULL,               -- Açıklama
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Örnek veriler
INSERT INTO materials.withholding_rates (code, rate, name) VALUES
('1/10', 0.1000, '1/10 Tevkifat'),
('2/10', 0.2000, '2/10 Tevkifat'),
('3/10', 0.3000, '3/10 Tevkifat'),
('4/10', 0.4000, '4/10 Tevkifat'),
('5/10', 0.5000, '5/10 Tevkifat - Yapım işleri'),
('7/10', 0.7000, '7/10 Tevkifat - Danışmanlık'),
('9/10', 0.9000, '9/10 Tevkifat - İşgücü');
```

#### C) `materials.shipment_settings` (Sistem Ayarları)

```sql
-- Export/Import ayarları
CREATE TABLE IF NOT EXISTS materials.shipment_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" INTEGER
);

-- Varsayılan ayarlar
INSERT INTO materials.shipment_settings (key, value, description) VALUES
('csv_delimiter', ';', 'CSV dosya ayracı: ; veya , veya tab'),
('default_currency', 'TRY', 'Varsayılan para birimi'),
('default_tax_rate', '20', 'Varsayılan KDV oranı'),
('export_target', 'logo_tiger', 'Hedef program: logo_tiger, logo_go, zirve, excel'),
('company_name', 'Şirket Adı', 'PDF export için firma adı'),
('company_address', 'Adres', 'PDF export için firma adresi'),
('company_tax_office', 'Vergi Dairesi', 'PDF export için vergi dairesi'),
('company_tax_number', '0000000000', 'PDF export için VKN');
```

### 3.3. Mevcut Tablo Güncellemeleri

#### A) `materials.shipments` - Yeni Kolonlar

```sql
-- =====================================================
-- MÜŞTERİ BİLGİLERİ
-- =====================================================
ALTER TABLE materials.shipments
ADD COLUMN IF NOT EXISTS "customerId" INTEGER REFERENCES quotes.customers(id),
ADD COLUMN IF NOT EXISTS "customerSnapshot" JSONB NOT NULL DEFAULT '{}';
-- customerSnapshot örneği:
-- {
--   "name": "ABC Ltd.",
--   "company": "ABC Limited Şti.",
--   "taxOffice": "Kadıköy VD",
--   "taxNumber": "1234567890",
--   "address": "Örnek Mah. No:5",
--   "city": "İstanbul",
--   "district": "Kadıköy",
--   "phone": "+90 216 555 1234",
--   "email": "info@abc.com",
--   "erpAccountCode": "120.01.001"
-- }

-- =====================================================
-- TESLİM ADRESİ (Farklı adrese teslim için)
-- =====================================================
ADD COLUMN IF NOT EXISTS "useAlternateDelivery" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "deliveryAddress" JSONB;
-- deliveryAddress örneği:
-- {
--   "name": "Şube Adı",
--   "address": "Farklı Adres No:10",
--   "city": "Ankara",
--   "district": "Çankaya",
--   "phone": "+90 312 555 4321"
-- }

-- =====================================================
-- BELGE BİLGİLERİ
-- =====================================================
ADD COLUMN IF NOT EXISTS "documentType" VARCHAR(20) DEFAULT 'waybill',
-- 'waybill' (irsaliye), 'invoice' (fatura), 'both' (ikisi birden)

ADD COLUMN IF NOT EXISTS "includePrice" BOOLEAN DEFAULT false,
-- Fiyat bilgisi dahil mi?

-- =====================================================
-- PARA BİRİMİ & KUR
-- =====================================================
ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) DEFAULT 'TRY',
ADD COLUMN IF NOT EXISTS "exchangeRate" DECIMAL(15,6) DEFAULT 1.000000,
-- TRY dışı seçilirse exchangeRate zorunlu

-- =====================================================
-- İSKONTO (Genel)
-- =====================================================
ADD COLUMN IF NOT EXISTS "discountType" VARCHAR(20),
-- 'percentage' veya 'amount' veya NULL

ADD COLUMN IF NOT EXISTS "discountValue" DECIMAL(15,2) DEFAULT 0,
-- Yüzde ise 10.00 (%) veya tutar ise 500.00 (TL)

ADD COLUMN IF NOT EXISTS "discountTotal" DECIMAL(15,2) DEFAULT 0,
-- Hesaplanan toplam iskonto tutarı

-- =====================================================
-- TOPLAM FİYATLAR
-- =====================================================
ADD COLUMN IF NOT EXISTS "subtotal" DECIMAL(15,2) DEFAULT 0,
-- Ara toplam (KDV hariç, iskonto sonrası)

ADD COLUMN IF NOT EXISTS "taxTotal" DECIMAL(15,2) DEFAULT 0,
-- Toplam KDV

ADD COLUMN IF NOT EXISTS "withholdingTotal" DECIMAL(15,2) DEFAULT 0,
-- Toplam tevkifat tutarı

ADD COLUMN IF NOT EXISTS "grandTotal" DECIMAL(15,2) DEFAULT 0,
-- Genel toplam (KDV dahil)

-- =====================================================
-- EXPORT GEÇMİŞİ
-- =====================================================
ADD COLUMN IF NOT EXISTS "exportHistory" JSONB DEFAULT '{}',
-- Her format için timestamp:
-- {"csv": "2025-12-08T14:30:00Z", "xml": "2025-12-08T14:35:00Z", "pdf": null, "json": null}

ADD COLUMN IF NOT EXISTS "lastExportedAt" TIMESTAMPTZ,
-- En son export zamanı

ADD COLUMN IF NOT EXISTS "exportTarget" VARCHAR(50),
-- Hedef program: 'logo_tiger', 'logo_go', 'zirve', 'excel'

-- =====================================================
-- IMPORT BİLGİLERİ
-- =====================================================
ADD COLUMN IF NOT EXISTS "importedAt" TIMESTAMPTZ,
-- Import zamanı (completed olduğunda)

ADD COLUMN IF NOT EXISTS "importedBy" INTEGER,
-- Import yapan kullanıcı

ADD COLUMN IF NOT EXISTS "importedFile" BYTEA,
-- Import edilen dosya (binary)

ADD COLUMN IF NOT EXISTS "importedFileName" VARCHAR(255),
-- Dosya adı

ADD COLUMN IF NOT EXISTS "externalDocNumber" VARCHAR(100),
-- Logo/Zirve'den gelen resmi belge numarası

-- =====================================================
-- EK BİLGİLER
-- =====================================================
ADD COLUMN IF NOT EXISTS "specialCode" VARCHAR(100),
-- Logo/Zirve özel kod

ADD COLUMN IF NOT EXISTS "costCenter" VARCHAR(100),
-- Maliyet merkezi

ADD COLUMN IF NOT EXISTS "notes" TEXT;
-- Belge notu

-- =====================================================
-- İNDEKSLER
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_shipments_customer_id ON materials.shipments("customerId");
CREATE INDEX IF NOT EXISTS idx_shipments_status ON materials.shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_document_type ON materials.shipments("documentType");
CREATE INDEX IF NOT EXISTS idx_shipments_last_exported ON materials.shipments("lastExportedAt") 
    WHERE "lastExportedAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_external_doc ON materials.shipments("externalDocNumber") 
    WHERE "externalDocNumber" IS NOT NULL;
```

#### B) `materials.shipment_items` - Yeni Kolonlar

```sql
-- =====================================================
-- FİYAT BİLGİLERİ
-- =====================================================
ALTER TABLE materials.shipment_items
ADD COLUMN IF NOT EXISTS "unitPrice" DECIMAL(15,4) DEFAULT 0,
-- Birim fiyat

ADD COLUMN IF NOT EXISTS "taxRate" INTEGER DEFAULT 20,
-- KDV oranı: 0, 1, 8, 10, 18, 20
-- CHECK CONSTRAINT aşağıda

ADD COLUMN IF NOT EXISTS "vatExemptionId" INTEGER REFERENCES materials.vat_exemption_codes(id),
-- KDV muafiyet kodu (null ise muafiyet yok)

-- =====================================================
-- TEVKİFAT
-- =====================================================
ADD COLUMN IF NOT EXISTS "withholdingRateId" INTEGER REFERENCES materials.withholding_rates(id),
-- Tevkifat oranı referansı

ADD COLUMN IF NOT EXISTS "withholdingAmount" DECIMAL(15,2) DEFAULT 0,
-- Hesaplanan tevkifat tutarı

-- =====================================================
-- İSKONTO (Satır bazlı)
-- =====================================================
ADD COLUMN IF NOT EXISTS "discountRate" DECIMAL(5,2) DEFAULT 0,
-- İskonto yüzdesi (%)

ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(15,2) DEFAULT 0,
-- Hesaplanan iskonto tutarı

-- =====================================================
-- HESAPLANAN TUTARLAR
-- =====================================================
ADD COLUMN IF NOT EXISTS "lineSubtotal" DECIMAL(15,2) DEFAULT 0,
-- unitPrice * quantity

ADD COLUMN IF NOT EXISTS "lineDiscount" DECIMAL(15,2) DEFAULT 0,
-- lineSubtotal * (discountRate / 100)

ADD COLUMN IF NOT EXISTS "lineNetSubtotal" DECIMAL(15,2) DEFAULT 0,
-- lineSubtotal - lineDiscount

ADD COLUMN IF NOT EXISTS "lineTax" DECIMAL(15,2) DEFAULT 0,
-- lineNetSubtotal * (taxRate / 100)

ADD COLUMN IF NOT EXISTS "lineWithholding" DECIMAL(15,2) DEFAULT 0,
-- Satır bazlı tevkifat tutarı

ADD COLUMN IF NOT EXISTS "lineTotal" DECIMAL(15,2) DEFAULT 0,
-- lineNetSubtotal + lineTax - lineWithholding

-- =====================================================
-- LOT / SERİ / NOTLAR
-- =====================================================
ADD COLUMN IF NOT EXISTS "lotNumber" VARCHAR(100),
-- Lot numarası (serbest metin)

ADD COLUMN IF NOT EXISTS "serialNumber" VARCHAR(100),
-- Seri numarası (serbest metin)

ADD COLUMN IF NOT EXISTS "itemNotes" TEXT;
-- Satır notu

-- =====================================================
-- CONSTRAINT: KDV Oranı
-- =====================================================
ALTER TABLE materials.shipment_items
DROP CONSTRAINT IF EXISTS chk_tax_rate;

ALTER TABLE materials.shipment_items
ADD CONSTRAINT chk_tax_rate CHECK ("taxRate" IN (0, 1, 8, 10, 18, 20));
```

#### C) `quotes.customers` - ERP Alanları

```sql
-- ERP entegrasyonu için ek alanlar
ALTER TABLE quotes.customers
ADD COLUMN IF NOT EXISTS "erpAccountCode" VARCHAR(50),
-- Logo/Zirve cari kodu (örn: 120.01.001)

ADD COLUMN IF NOT EXISTS "erpSyncedAt" TIMESTAMPTZ;
-- Son senkronizasyon zamanı

CREATE INDEX IF NOT EXISTS idx_customers_erp_code 
ON quotes.customers("erpAccountCode") 
WHERE "erpAccountCode" IS NOT NULL;
```

### 3.4. Trigger: Fiyat Hesaplama

```sql
-- Shipment item fiyat hesaplama trigger'ı
CREATE OR REPLACE FUNCTION materials.calculate_shipment_item_totals()
RETURNS TRIGGER AS $$
DECLARE
    withholding_rate DECIMAL(5,4);
BEGIN
    -- Ara toplam
    NEW."lineSubtotal" := COALESCE(NEW."unitPrice", 0) * COALESCE(NEW.quantity, 0);
    
    -- İskonto
    NEW."lineDiscount" := NEW."lineSubtotal" * (COALESCE(NEW."discountRate", 0) / 100.0);
    
    -- Net ara toplam
    NEW."lineNetSubtotal" := NEW."lineSubtotal" - NEW."lineDiscount";
    
    -- KDV
    IF NEW."vatExemptionId" IS NOT NULL THEN
        NEW."lineTax" := 0; -- Muafiyet varsa KDV yok
    ELSE
        NEW."lineTax" := NEW."lineNetSubtotal" * (COALESCE(NEW."taxRate", 20) / 100.0);
    END IF;
    
    -- Tevkifat
    IF NEW."withholdingRateId" IS NOT NULL THEN
        SELECT rate INTO withholding_rate 
        FROM materials.withholding_rates 
        WHERE id = NEW."withholdingRateId";
        
        NEW."lineWithholding" := NEW."lineTax" * COALESCE(withholding_rate, 0);
    ELSE
        NEW."lineWithholding" := 0;
    END IF;
    
    -- Toplam
    NEW."lineTotal" := NEW."lineNetSubtotal" + NEW."lineTax" - NEW."lineWithholding";
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger oluştur
DROP TRIGGER IF EXISTS trigger_calculate_item_totals ON materials.shipment_items;
CREATE TRIGGER trigger_calculate_item_totals
    BEFORE INSERT OR UPDATE ON materials.shipment_items
    FOR EACH ROW
    EXECUTE FUNCTION materials.calculate_shipment_item_totals();
```

---

#### B) `materials.shipment_items` - Yeni Kolonlar

```sql
-- =====================================================
-- Fiyat Bilgileri (Fatura için)
-- =====================================================
ALTER TABLE materials.shipment_items

ADD COLUMN unitPrice DECIMAL(15,2) DEFAULT 0,
-- ⚠️ KURAL: Shipment.includePrice = true ise unitPrice > 0 ZORUNLU

ADD COLUMN taxRate INTEGER DEFAULT 20, 
-- KDV oranı: 0, 1, 8, 10, 18, 20 (sadece bu değerler geçerli)
-- CHECK CONSTRAINT eklenecek

ADD COLUMN lineSubtotal DECIMAL(15,2), -- unitPrice * quantity
ADD COLUMN lineTax DECIMAL(15,2), -- lineSubtotal * (taxRate/100)
ADD COLUMN lineTotal DECIMAL(15,2), -- lineSubtotal + lineTax

-- CHECK CONSTRAINT: KDV oranı kontrolü
ALTER TABLE materials.shipment_items
ADD CONSTRAINT chk_tax_rate CHECK (taxRate IN (0, 1, 8, 10, 18, 20));

ADD COLUMN unitPrice DECIMAL(15,2) DEFAULT 0,
ADD COLUMN taxRate INTEGER DEFAULT 20, -- KDV oranı (0, 1, 8, 10, 18, 20)
ADD COLUMN lineSubtotal DECIMAL(15,2), -- unitPrice * quantity
ADD COLUMN lineTax DECIMAL(15,2), -- lineSubtotal * (taxRate/100)
ADD COLUMN lineTotal DECIMAL(15,2), -- lineSubtotal + lineTax

-- =====================================================
-- Parçalı Sevkiyat Takibi
-- =====================================================
ADD COLUMN quoteItemId INTEGER, -- İleride quote_items tablosu eklenirse
ADD COLUMN isPartial BOOLEAN DEFAULT false;

-- Trigger: Fiyat hesaplama (INSERT/UPDATE)
CREATE OR REPLACE FUNCTION materials.calculate_shipment_item_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Ara toplam
  NEW."lineSubtotal" := NEW."unitPrice" * NEW.quantity;
  
  -- KDV
  NEW."lineTax" := NEW."lineSubtotal" * (NEW."taxRate" / 100.0);
  
  -- Toplam
  NEW."lineTotal" := NEW."lineSubtotal" + NEW."lineTax";
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_item_totals
  BEFORE INSERT OR UPDATE ON materials.shipment_items
  FOR EACH ROW
  EXECUTE FUNCTION materials.calculate_shipment_item_totals();
```

#### C) `quotes.customers` - ERP Entegrasyonu

```sql
-- =====================================================
-- ERP (Logo/Zirve) Entegrasyonu
-- =====================================================
ALTER TABLE quotes.customers

ADD COLUMN IF NOT EXISTS erpAccountCode VARCHAR(50), 
-- Logo/Zirve'deki cari kodu (120.01.001 gibi)

ADD COLUMN IF NOT EXISTS erpSyncedAt TIMESTAMPTZ;
-- Son senkronizasyon zamanı

CREATE INDEX idx_customers_erp_code ON quotes.customers(erpAccountCode) 
WHERE erpAccountCode IS NOT NULL;
```

### 2.2. Veri Akışı Diagramı

```
┌─────────────────┐
│ quotes.customers│ ◄─── Foreign Key (customerId)
│ + erpAccountCode│
└────────┬────────┘
         │
         │ 1:N
         ▼
┌─────────────────────────┐
│ materials.shipments     │
│ + customerSnapshot JSONB│ ◄─── Tarihsel kayıt (değişmez)
│ + quoteId               │
│ + documentType          │
│ + subtotal, taxTotal    │
│ + exportedFormats       │
└────────┬────────────────┘
         │
         │ 1:N
         ▼
┌──────────────────────────┐
│ materials.shipment_items │
│ + unitPrice              │
│ + taxRate                │
│ + lineTotal (trigger)    │
└──────────────────────────┘
```

---

## 3. BACKEND API

### 3.1. Endpoint'ler

#### **Shipment Routes** (`/api/materials/shipments`)

```javascript
// shipmentRoutes.js

router.post('/', shipmentController.createShipment);
// Body: { customerId?, customerSnapshot?, items: [], documentType, includePrice }
// Response: { shipment, exportUrls: { csv, xml, pdf } }

router.post('/quick', shipmentController.createQuickShipment);
// Stok sayfasından hızlı sevkiyat
// Body: { customerId?, materialCode, quantity, documentType }

router.get('/', shipmentController.getShipments);
// Query: ?status=pending&customerId=5&startDate=2025-12-01

router.get('/:id', shipmentController.getShipmentDetails);
// Response: shipment + items + customer + exportedFiles

router.patch('/:id/cancel', shipmentController.cancelShipment);
// Sevkiyat iptal → stok geri gelir

router.get('/quote/:quoteId/summary', shipmentController.getQuoteShipmentSummary);
// Parçalı sevkiyat takibi için
// Response: { totalOrdered, totalShipped, remaining, shipments: [] }
```

#### **Export Routes** (`/api/materials/export`)

```javascript
// exportRoutes.js

router.get('/shipment/:id/:format', exportController.exportShipment);
// format: csv | xml | pdf | json
// Response: File download (Content-Disposition: attachment)

router.post('/batch', exportController.batchExport);
// Body: { shipmentIds: [1,2,3], format: 'csv' }
// Response: ZIP file with multiple exports
```

### 3.2. Service Layer

#### **shipmentService.js** (Güncellenecek)

```javascript
/**
 * Yeni sevkiyat oluştur
 * @param {Object} data
 * @param {number} data.customerId - quotes.customers.id (opsiyonel, snapshot varsa)
 * @param {Object} data.customerSnapshot - Müşteri bilgileri snapshot (ZORUNLU)
 * @param {Array} data.items - [{ materialCode, quantity, unitPrice?, taxRate? }]
 * @param {string} data.documentType - 'waybill' | 'invoice' | 'both'
 * @param {boolean} data.includePrice - Fiyat bilgileri dahil mi?
 */
async function createShipment(data, user) {
  const trx = await db.transaction();
  
  try {
    // ============================================================
    // 1. VALİDASYONLAR
    // ============================================================
    
    // 1.1. customerSnapshot zorunlu kontrolü
    if (!data.customerSnapshot) {
      throw new Error('customerSnapshot zorunludur. customerId varsa otomatik doldurulur.');
    }
    
    // 1.2. Snapshot'ta zorunlu alanlar
    const requiredFields = ['name', 'taxOffice', 'taxNumber', 'address', 'city'];
    for (const field of requiredFields) {
      if (!data.customerSnapshot[field]) {
        throw new Error(`customerSnapshot.${field} zorunludur (export için gerekli)`);
      }
    }
    
    // 1.3. Fatura validasyonu
    if (data.documentType === 'invoice' || data.documentType === 'both') {
      if (!data.includePrice) {
        throw new Error('Fatura kesiyorsanız includePrice=true olmalı');
      }
      
      // Tüm items'larda fiyat kontrolü
      for (const item of data.items) {
        if (!item.unitPrice || item.unitPrice <= 0) {
          throw new Error(`Fatura için tüm ürünlerin fiyatı > 0 olmalı (${item.materialCode})`);
        }
      }
    }
    
    // 1.4. Items validasyonu
    if (!data.items || data.items.length === 0) {
      throw new Error('En az 1 ürün gerekli');
    }
    
    for (const item of data.items) {
      // Miktar kontrolü
      if (!item.quantity || item.quantity <= 0) {
        throw new Error(`Geçersiz miktar: ${item.materialCode} (${item.quantity})`);
      }
      
      // Stok kontrolü
      const material = await trx('materials.materials')
        .where({ code: item.materialCode })
        .first();
      
      if (!material) {
        throw new Error(`Malzeme bulunamadı: ${item.materialCode}`);
      }
      
      const availableStock = material.stock - (material.reserved || 0) - (material.wipReserved || 0);
      if (item.quantity > availableStock) {
        throw new Error(
          `Yetersiz stok: ${material.name}. ` +
          `Mevcut: ${availableStock}, İstenen: ${item.quantity}`
        );
      }
      
      // KDV oranı kontrolü
      const validTaxRates = [0, 1, 8, 10, 18, 20];
      if (item.taxRate && !validTaxRates.includes(item.taxRate)) {
        throw new Error(`Geçersiz KDV oranı: ${item.taxRate}. Geçerli değerler: ${validTaxRates.join(', ')}`);
      }
    }
    
    // ============================================================
    // 2. SHIPMENT CODE OLUŞTUR
    // ============================================================
    const shipmentCode = await generateShipmentCode();
    
    // ============================================================
    // 3. FİYAT HESAPLAMALARI (Fatura için)
    // ============================================================
    let subtotal = 0, taxTotal = 0, grandTotal = 0, shippedQuantityTotal = 0;
    
    const calculatedItems = data.items.map(item => {
      const quantity = parseFloat(item.quantity);
      const unitPrice = parseFloat(item.unitPrice || 0);
      const taxRate = parseInt(item.taxRate || 20);
      
      shippedQuantityTotal += quantity;
      
      if (data.includePrice) {
        const lineSubtotal = unitPrice * quantity;
        const lineTax = lineSubtotal * (taxRate / 100);
        const lineTotal = lineSubtotal + lineTax;
        
        subtotal += lineSubtotal;
        taxTotal += lineTax;
        grandTotal += lineTotal;
        
        return {
          ...item,
          unitPrice,
          taxRate,
          lineSubtotal,
          lineTax,
          lineTotal
        };
      }
      
      return { ...item, unitPrice: 0, taxRate: 20 };
    });
    
    // ============================================================
    // 4. PARÇALI SEVKİYAT HESAPLAMA (Quote varsa)
    // ============================================================
    let quoteRemainingQuantity = null;
    if (data.quoteId) {
      // Quote'taki toplam ve daha önce sevk edilenleri hesapla
      const quoteSummary = await getQuoteShipmentSummary(data.quoteId, trx);
      quoteRemainingQuantity = quoteSummary.totalOrdered - quoteSummary.totalShipped - shippedQuantityTotal;
    }
    
    // ============================================================
    // 5. SHIPMENT KAYDI OLUŞTUR
    // ============================================================
    const [shipment] = await trx('materials.shipments')
      .insert({
        shipmentCode,
        shipmentSequence: parseInt(shipmentCode.split('-')[2], 10),
        customerId: data.customerId || null,
        customerSnapshot: data.customerSnapshot, // JSONB
        quoteId: data.quoteId || null,
        isPartialShipment: !!data.quoteId,
        shippedQuantityTotal,
        quoteRemainingQuantity,
        documentType: data.documentType || 'waybill',
        includePrice: data.includePrice || false,
        currency: data.currency || 'TRY',
        subtotal: data.includePrice ? subtotal : null,
        taxTotal: data.includePrice ? taxTotal : null,
        grandTotal: data.includePrice ? grandTotal : null,
        exportedFormats: {}, // Boş object
        status: 'pending',
        notes: data.notes,
        createdBy: user?.email || 'system',
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning('*');
    
    // ============================================================
    // 6. ITEMS EKLE + STOK DÜŞ
    // ============================================================
    for (const item of calculatedItems) {
      await trx('materials.shipment_items').insert({
        shipmentId: shipment.id,
        materialCode: item.materialCode,
        quantity: item.quantity,
        unit: item.unit || 'adet',
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        lineSubtotal: item.lineSubtotal || null,
        lineTax: item.lineTax || null,
        lineTotal: item.lineTotal || null,
        lotNumber: item.lotNumber,
        notes: item.notes,
        isPartial: !!data.quoteId,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Stok düşümü
      const StockMovements = (await import('./stockMovements.js')).default;
      await StockMovements.createMovement(trx, {
        materialCode: item.materialCode,
        movementType: 'out',
        subType: 'shipment',
        quantity: item.quantity,
        referenceId: shipment.id,
        referenceType: 'shipment',
        notes: `Sevkiyat: ${shipmentCode}`,
        createdBy: user?.email
      });
    }
    
    await trx.commit();
    return shipment;
    
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}

/**
 * Hızlı sevkiyat (stok sayfasından tek ürün)
 */
async function createQuickShipment(data, user) {
  // customerSnapshot doldur
  let customerSnapshot = data.customerSnapshot;
  if (data.customerId && !customerSnapshot) {
    const customer = await db('quotes.customers')
      .where({ id: data.customerId })
      .first();
    
    if (!customer) {
      throw new Error('Müşteri bulunamadı');
    }
    
    customerSnapshot = {
      name: customer.name,
      company: customer.company,
      taxOffice: customer.taxOffice,
      taxNumber: customer.taxNumber,
      city: customer.city,
      district: customer.district,
      address: customer.address,
      phone: customer.phone,
      email: customer.email
    };
  }
  
  if (!customerSnapshot) {
    throw new Error('customerSnapshot veya customerId gerekli');
  }
  
  return createShipment({
    customerId: data.customerId,
    customerSnapshot,
    items: [{
      materialCode: data.materialCode,
      quantity: data.quantity,
      unit: data.unit,
      unitPrice: data.unitPrice,
      taxRate: data.taxRate || 20
    }],
    documentType: data.documentType || 'waybill',
    includePrice: data.documentType === 'invoice' || data.documentType === 'both',
    notes: data.notes
  }, user);
}

/**
 * Sevkiyat iptal → stok geri
 */
async function cancelShipment(shipmentId, reason, user) {
  const trx = await db.transaction();
  
  try {
    const shipment = await trx('materials.shipments')
      .where({ id: shipmentId })
      .first();
    
    if (!shipment) throw new Error('Sevkiyat bulunamadı');
    if (shipment.status === 'cancelled') throw new Error('Zaten iptal edilmiş');
    
    // Items'ları al
    const items = await trx('materials.shipment_items')
      .where({ shipmentId });
    
    // Her item için stok geri ekle
    for (const item of items) {
      await StockMovements.createMovement({
        materialCode: item.materialCode,
        movementType: 'in',
        subType: 'shipment_cancellation',
        quantity: item.quantity,
        referenceId: shipmentId,
        referenceType: 'shipment',
        notes: `Sevkiyat iptali: ${shipment.shipmentCode} - ${reason}`
      }, trx);
    }
    
    // Status güncelle
    await trx('materials.shipments')
      .where({ id: shipmentId })
      .update({
        status: 'cancelled',
        notes: db.raw(`CONCAT(COALESCE(notes, ''), '\n[İPTAL] ${reason} - ${new Date().toISOString()}')`)
      });
    
    await trx.commit();
    return { success: true };
    
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}
```

#### **exportService.js** (YENİ)

```javascript
// Export Service - Ana modül

import { generateCSV } from './generators/csvGenerator.js';
import { generateXML } from './generators/xmlGenerator.js';
import { generatePDF } from './generators/pdfGenerator.js';
import { generateJSON } from './generators/jsonGenerator.js';

/**
 * Sevkiyat export et
 * @param {number} shipmentId
 * @param {string} format - 'csv' | 'xml' | 'pdf' | 'json'
 */
async function exportShipment(shipmentId, format) {
  // 1. Shipment + Items + Customer verilerini al
  const shipment = await db('materials.shipments as s')
    .where({ 's.id': shipmentId })
    .first();
  
  const items = await db('materials.shipment_items as si')
    .join('materials.materials as m', 'si.materialCode', 'm.code')
    .where({ 'si.shipmentId': shipmentId })
    .select(
      'si.*',
      'm.name as materialName',
      'm.code as materialCode'
    );
  
  const data = {
    shipment,
    items,
    customer: shipment.customerSnapshot || {}
  };
  
  // 2. Format'a göre generate
  let result;
  switch (format.toLowerCase()) {
    case 'csv':
      result = await generateCSV(data);
      break;
    case 'xml':
      result = await generateXML(data);
      break;
    case 'pdf':
      result = await generatePDF(data);
      break;
    case 'json':
      result = generateJSON(data);
      break;
    default:
      throw new Error(`Desteklenmeyen format: ${format}`);
  }
  
  // 3. Export kaydını güncelle
  await db('materials.shipments')
    .where({ id: shipmentId })
    .update({
      exportedFormats: db.raw(`
        COALESCE("exportedFormats", '[]'::jsonb) || ?::jsonb
      `, [JSON.stringify([format])]),
      exportedAt: new Date()
    });
  
  return result;
}

export default {
  exportShipment
};
```

---

## 4. EXPORT FORMATLARI

### 4.1. CSV (Excel Import)

**Dosya**: `generators/csvGenerator.js`

```javascript
import { stringify } from 'csv-stringify/sync';

/**
 * CSV formatı oluştur
 * Excel'de açılabilir, manuel düzenleme kolay
 */
export async function generateCSV(data) {
  const { shipment, items, customer } = data;
  
  // Header satırı
  const records = [];
  
  // Müşteri bilgileri (ilk satırlar)
  records.push(['İrsaliye No', shipment.shipmentCode]);
  records.push(['Tarih', new Date(shipment.createdAt).toLocaleDateString('tr-TR')]);
  records.push(['Müşteri', customer.name || shipment.customerName]);
  records.push(['Vergi No', customer.taxNumber || shipment.customerTaxNumber]);
  records.push(['Vergi Dairesi', customer.taxOffice || shipment.customerTaxOffice]);
  records.push(['Adres', customer.address || shipment.deliveryAddress]);
  records.push([]); // Boş satır
  
  // Kalem başlıkları
  records.push([
    'Sıra',
    'Malzeme Kodu',
    'Malzeme Adı',
    'Miktar',
    'Birim',
    ...(shipment.includePrice ? ['Birim Fiyat', 'KDV %', 'Ara Toplam', 'KDV Tutarı', 'Toplam'] : [])
  ]);
  
  // Kalemler
  items.forEach((item, index) => {
    const row = [
      index + 1,
      item.materialCode,
      item.materialName,
      item.quantity,
      item.unit,
      ...(shipment.includePrice ? [
        item.unitPrice,
        item.taxRate,
        item.lineSubtotal,
        item.lineTax,
        item.lineTotal
      ] : [])
    ];
    records.push(row);
  });
  
  // Fatura ise toplamlar
  if (shipment.includePrice) {
    records.push([]);
    records.push(['', '', '', '', 'Ara Toplam:', shipment.subtotal]);
    records.push(['', '', '', '', 'KDV Toplam:', shipment.taxTotal]);
    records.push(['', '', '', '', 'Genel Toplam:', shipment.grandTotal, shipment.currency]);
  }
  
  const csv = stringify(records, {
    encoding: 'utf8',
    bom: true // Excel için UTF-8 BOM
  });
  
  return {
    content: csv,
    filename: `${shipment.shipmentCode}.csv`,
    mimeType: 'text/csv; charset=utf-8'
  };
}
```

### 4.2. XML (Logo/Zirve Import)

**Dosya**: `generators/xmlGenerator.js`

```javascript
import { create } from 'xmlbuilder2';

/**
 * Logo Tiger XML formatı oluştur
 * Logo'nun import standardına uygun
 */
export async function generateXML(data) {
  const { shipment, items, customer } = data;
  
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('Irsaliye')
      .ele('Baslik')
        .ele('BelgeNo').txt(shipment.shipmentCode).up()
        .ele('Tarih').txt(new Date(shipment.createdAt).toISOString().split('T')[0]).up()
        .ele('CariKodu').txt(customer.erpAccountCode || '').up()
        .ele('CariUnvan').txt(customer.name || shipment.customerName).up()
        .ele('VergiNo').txt(customer.taxNumber || shipment.customerTaxNumber).up()
        .ele('VergiDairesi').txt(customer.taxOffice || shipment.customerTaxOffice).up()
        .ele('Adres').txt(customer.address || shipment.deliveryAddress).up()
        .ele('Il').txt(customer.city || shipment.customerCity).up()
        .ele('Ilce').txt(customer.district || shipment.customerDistrict).up()
      .up()
      .ele('Satirlar');
  
  items.forEach((item, index) => {
    const satirNode = root.ele('Satir')
      .ele('SiraNo').txt(index + 1).up()
      .ele('StokKodu').txt(item.materialCode).up()
      .ele('StokAdi').txt(item.materialName).up()
      .ele('Miktar').txt(item.quantity).up()
      .ele('Birim').txt(item.unit).up();
    
    if (shipment.includePrice) {
      satirNode
        .ele('BirimFiyat').txt(item.unitPrice).up()
        .ele('KDVOrani').txt(item.taxRate).up()
        .ele('AraToplam').txt(item.lineSubtotal).up()
        .ele('KDVTutar').txt(item.lineTax).up()
        .ele('Toplam').txt(item.lineTotal).up();
    }
    
    satirNode.up();
  });
  
  if (shipment.includePrice) {
    root.up()
      .ele('Toplamlar')
        .ele('AraToplam').txt(shipment.subtotal).up()
        .ele('KDVToplam').txt(shipment.taxTotal).up()
        .ele('GenelToplam').txt(shipment.grandTotal).up()
        .ele('ParaBirimi').txt(shipment.currency).up();
  }
  
  const xml = root.end({ prettyPrint: true });
  
  return {
    content: xml,
    filename: `${shipment.shipmentCode}.xml`,
    mimeType: 'application/xml'
  };
}
```

### 4.3. PDF (Yazdırılabilir İrsaliye)

**Dosya**: `generators/pdfGenerator.js`

```javascript
import PDFDocument from 'pdfkit';

/**
 * PDF irsaliye/fatura oluştur
 */
export async function generatePDF(data) {
  const { shipment, items, customer } = data;
  
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      resolve({
        content: Buffer.concat(chunks),
        filename: `${shipment.shipmentCode}.pdf`,
        mimeType: 'application/pdf'
      });
    });
    doc.on('error', reject);
    
    // Başlık
    doc.fontSize(20).text(
      shipment.documentType === 'invoice' ? 'FATURA' : 'SEVKİYAT İRSALİYESİ',
      { align: 'center' }
    );
    doc.moveDown();
    
    // İrsaliye bilgileri
    doc.fontSize(10);
    doc.text(`İrsaliye No: ${shipment.shipmentCode}`);
    doc.text(`Tarih: ${new Date(shipment.createdAt).toLocaleDateString('tr-TR')}`);
    doc.moveDown();
    
    // Müşteri bilgileri
    doc.fontSize(12).text('Müşteri Bilgileri:', { underline: true });
    doc.fontSize(10);
    doc.text(`${customer.name || shipment.customerName}`);
    if (customer.company) doc.text(customer.company);
    doc.text(`VKN/TCKN: ${customer.taxNumber || shipment.customerTaxNumber}`);
    doc.text(`Vergi Dairesi: ${customer.taxOffice || shipment.customerTaxOffice}`);
    doc.text(`Adres: ${customer.address || shipment.deliveryAddress}`);
    doc.moveDown(2);
    
    // Kalemler tablosu
    const tableTop = doc.y;
    const col1 = 50;
    const col2 = 100;
    const col3 = 300;
    const col4 = 400;
    const col5 = 450;
    const col6 = shipment.includePrice ? 500 : null;
    
    // Tablo başlıkları
    doc.fontSize(10).fillColor('#000');
    doc.text('Sıra', col1, tableTop);
    doc.text('Kod', col2, tableTop);
    doc.text('Malzeme Adı', col3, tableTop);
    doc.text('Miktar', col4, tableTop);
    doc.text('Birim', col5, tableTop);
    if (shipment.includePrice) doc.text('Tutar', col6, tableTop);
    
    doc.moveTo(col1, tableTop + 15).lineTo(550, tableTop + 15).stroke();
    
    // Kalemler
    let y = tableTop + 25;
    items.forEach((item, index) => {
      doc.text(index + 1, col1, y);
      doc.text(item.materialCode, col2, y);
      doc.text(item.materialName.substring(0, 30), col3, y);
      doc.text(item.quantity, col4, y);
      doc.text(item.unit, col5, y);
      if (shipment.includePrice) {
        doc.text(`${item.lineTotal.toFixed(2)} TL`, col6, y);
      }
      y += 20;
    });
    
    // Fatura ise toplamlar
    if (shipment.includePrice) {
      doc.moveTo(col1, y).lineTo(550, y).stroke();
      y += 10;
      doc.fontSize(11);
      doc.text(`Ara Toplam: ${shipment.subtotal.toFixed(2)} ${shipment.currency}`, 400, y);
      y += 15;
      doc.text(`KDV Toplam: ${shipment.taxTotal.toFixed(2)} ${shipment.currency}`, 400, y);
      y += 15;
      doc.fontSize(12).fillColor('#c00');
      doc.text(`Genel Toplam: ${shipment.grandTotal.toFixed(2)} ${shipment.currency}`, 400, y);
    }
    
    doc.end();
  });
}
```

---

## 5. UI/UX AKIŞLARI

### 5.1. Stok Sayfasından Hızlı Sevkiyat

**Component**: `HizliSevkiyatModal.jsx`  
**Konum**: `/WebApp/domains/materials/components/shipments/HizliSevkiyatModal.jsx`  
**CSS**: Mevcut `materials.css` classları kullanılacak

```jsx
import React, { useState } from 'react';
import CustomerAutocomplete from '../../../shared/components/CustomerAutocomplete.jsx';

/**
 * Hızlı Sevkiyat Modal (Stok sayfasından)
 * Props:
 * - material: { code, name, stock, unit }
 * - onClose: () => void
 * - onSuccess: (shipment) => void
 */
export default function HizliSevkiyatModal({ material, onClose, onSuccess }) {
  const [customerId, setCustomerId] = useState(null);
  const [customerSnapshot, setCustomerSnapshot] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [documentType, setDocumentType] = useState('waybill');
  const [includePrice, setIncludePrice] = useState(false);
  const [unitPrice, setUnitPrice] = useState('');
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await fetch('/api/materials/shipments/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          customerSnapshot,
          materialCode: material.code,
          quantity: parseFloat(quantity),
          documentType,
          includePrice,
          unitPrice: includePrice ? parseFloat(unitPrice) : 0,
          taxRate: 20
        })
      });
      
      const result = await response.json();
      
      if (!response.ok) throw new Error(result.error);
      
      onSuccess(result);
      onClose();
      
    } catch (error) {
      alert('Hata: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Hızlı Sevkiyat</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="form-container">
          {/* Malzeme (disabled) */}
          <div className="form-group">
            <label>Malzeme</label>
            <input 
              type="text" 
              value={`${material.code} - ${material.name}`}
              disabled
              className="form-group-input"
            />
          </div>
          
          {/* Müşteri seçimi */}
          <div className="form-group">
            <label>Müşteri *</label>
            <CustomerAutocomplete
              onSelect={(customer) => {
                setCustomerId(customer.id);
                setCustomerSnapshot(customer);
              }}
            />
          </div>
          
          {/* Miktar */}
          <div className="form-group">
            <label>Miktar * (Max: {material.stock} {material.unit})</label>
            <input
              type="number"
              step="0.01"
              max={material.stock}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              className="form-group-input"
            />
          </div>
          
          {/* Belge tipi */}
          <div className="form-group">
            <label>Belge Tipi</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  value="waybill"
                  checked={documentType === 'waybill'}
                  onChange={(e) => {
                    setDocumentType(e.target.value);
                    setIncludePrice(false);
                  }}
                />
                İrsaliye
              </label>
              <label>
                <input
                  type="radio"
                  value="invoice"
                  checked={documentType === 'invoice'}
                  onChange={(e) => {
                    setDocumentType(e.target.value);
                    setIncludePrice(true);
                  }}
                />
                Fatura
              </label>
              <label>
                <input
                  type="radio"
                  value="both"
                  checked={documentType === 'both'}
                  onChange={(e) => {
                    setDocumentType(e.target.value);
                    setIncludePrice(true);
                  }}
                />
                İkisi Birden
              </label>
            </div>
          </div>
          
          {/* Fiyat (fatura ise) */}
          {includePrice && (
            <div className="form-group">
              <label>Birim Fiyat (TL) *</label>
              <input
                type="number"
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                required
                className="form-group-input"
              />
            </div>
          )}
          
          {/* Buttons */}
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              İptal
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Oluşturuluyor...' : 'Oluştur ve Export'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

### 5.2. Manuel Sevkiyat Wizard (3 Adım)

**Component**: `YeniSevkiyatWizard.jsx`  
**Konum**: `/WebApp/domains/materials/components/shipments/YeniSevkiyatWizard.jsx`

```jsx
import React, { useState } from 'react';

export default function YeniSevkiyatWizard({ onClose, onSuccess }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    customerId: null,
    customerSnapshot: null,
    items: [],
    documentType: 'waybill',
    includePrice: false
  });
  
  const steps = [
    { id: 1, title: 'Müşteri' },
    { id: 2, title: 'Ürünler' },
    { id: 3, title: 'Önizleme' }
  ];
  
  return (
    <div className="modal-overlay">
      <div className="modal-content modal-large">
        {/* Progress */}
        <div className="wizard-progress">
          {steps.map(step => (
            <div 
              key={step.id}
              className={`wizard-step ${currentStep >= step.id ? 'active' : ''}`}
            >
              <div className="step-number">{step.id}</div>
              <div className="step-title">{step.title}</div>
            </div>
          ))}
        </div>
        
        {/* Content */}
        <div className="wizard-body">
          {currentStep === 1 && <Step1Customer data={formData} onChange={setFormData} />}
          {currentStep === 2 && <Step2Items data={formData} onChange={setFormData} />}
          {currentStep === 3 && <Step3Preview data={formData} />}
        </div>
        
        {/* Navigation */}
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">İptal</button>
          
          {currentStep > 1 && (
            <button onClick={() => setCurrentStep(currentStep - 1)} className="btn btn-outline">
              ← Geri
            </button>
          )}
          
          {currentStep < 3 && (
            <button 
              onClick={() => setCurrentStep(currentStep + 1)}
              className="btn btn-primary"
            >
              İleri →
            </button>
          )}
          
          {currentStep === 3 && (
            <button onClick={handleSubmit} className="btn btn-success">
              Kaydet ve Export
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## 6. IMPLEMENTATION PLAN

### 6.1. Faz 1: Database & Backend (3 gün)

**Görevler:**
1. ✅ Migration oluştur: `035_invoice_export_integration.sql`
2. ✅ `shipmentService.js` güncelle (createShipment, cancelShipment)
3. ✅ `exportService.js` oluştur
4. ✅ CSV/XML generator'ları yaz
5. ✅ API endpoint'leri ekle (`shipmentRoutes.js`, `exportRoutes.js`)
6. ✅ Test: Postman ile API testleri

### 6.2. Faz 2: UI Components (2 gün)

**Görevler:**
1. ✅ `HizliSevkiyatModal.jsx` (stok sayfası butonu ile entegre)
2. ✅ `YeniSevkiyatWizard.jsx` (3 adımlı wizard)
3. ✅ Stok tablosuna "Sevk Et" butonu ekle
4. ✅ Sevkiyatlar sayfasına "Yeni İrsaliye" butonu ekle

### 6.3. Faz 3: Export & Polish (1 gün)

**Görevler:**
1. ✅ PDF generator (pdfkit entegrasyonu)
2. ✅ Export download logic (frontend)
3. ✅ Error handling & validation
4. ✅ UI polish (loading states, success messages)

### 6.4. Test Senaryoları

**Manuel Test Checklist:**

- [ ] Stok sayfasından hızlı sevkiyat
  - [ ] Kayıtlı müşteri ile
  - [ ] Yeni müşteri (inline form) ile
  - [ ] Sadece irsaliye (fiyatsız)
  - [ ] Fatura (fiyatlı)
  - [ ] CSV/XML/PDF export çalışıyor

- [ ] Manuel sevkiyat (wizard)
  - [ ] 3 adım sorunsuz geçiş
  - [ ] Çoklu ürün ekleme
  - [ ] Stok kontrolü çalışıyor
  - [ ] Önizleme doğru

- [ ] İptal işlemi
  - [ ] Stok geri geliyor
  - [ ] Movement kaydı oluşuyor

- [ ] Parçalı sevkiyat (elle test)
  - [ ] Quote'a 1000 adet atandı
  - [ ] 1. sevkiyat: 200 adet
  - [ ] 2. sevkiyat: 300 adet
  - [ ] Kalan: 500 adet gösterilmeli

---

## 7. ÖNEMLİ NOTLAR

### 7.1. CSS Sınıfları (materials.css'ten)

Kullanılacak mevcut classlar:
- `.modal-overlay`, `.modal-content`, `.modal-header`, `.modal-footer`
- `.form-group`, `.form-group-input`, `.radio-group`
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-success`
- `.wizard-progress`, `.wizard-step`, `.wizard-body`
- `.table-container`, `.materials-table`

### 7.2. Güvenlik

- ✅ SQL Injection: Parametreli sorgular (Knex ORM)
- ✅ XSS: React otomatik escape ediyor
- ✅ CSRF: Eski proje yapısında yok (eklenecek mi?)
- ✅ File Upload: Export'ta güvenli dosya adı oluştur

### 7.3. Performans

- ✅ Export büyük dosyalar için stream kullan (PDF)
- ✅ Batch export için queue sistemi düşün (RabbitMQ/Bull?)
- ✅ customerSnapshot JSONB indexing (GIN index)

---

---

## 8. EKSİK İMPLEMENTASYON DETAYLARI

### 8.1. Export Service Generator Detayları

#### `csvGenerator.js` - Logo/Excel Uyumlu Format

```javascript
// WebApp/domains/materials/api/services/export/csvGenerator.js
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

export function generateCSV(shipment, items) {
  // Logo Tiger/Go import formatı
  const headers = [
    'Cari Kodu',
    'Cari Ünvan',
    'VKN/TCKN',
    'Vergi Dairesi',
    'Adres',
    'İl',
    'İlçe',
    'Telefon',
    'Email',
    'İrsaliye No',
    'İrsaliye Tarihi',
    'Stok Kodu',
    'Stok Adı',
    'Miktar',
    'Birim',
    'Birim Fiyat',
    'KDV %',
    'Tutar',
    'KDV Tutarı',
    'Toplam'
  ];

  const snapshot = shipment.customerSnapshot;
  
  const rows = items.map(item => [
    snapshot.erpAccountCode || '',
    snapshot.company || snapshot.name,
    snapshot.taxNumber,
    snapshot.taxOffice,
    snapshot.address,
    snapshot.city,
    snapshot.district,
    snapshot.phone || '',
    snapshot.email || '',
    shipment.shipmentCode,
    format(new Date(shipment.createdAt), 'dd.MM.yyyy', { locale: tr }),
    item.materialCode,
    item.materialName || '',
    item.quantity,
    item.unit,
    item.unitPrice || 0,
    item.taxRate || 20,
    item.lineSubtotal || 0,
    item.lineTax || 0,
    item.lineTotal || 0
  ]);

  // CSV oluştur (UTF-8 BOM ile - Excel için)
  const BOM = '\uFEFF';
  const csvContent = [
    headers.join(';'),
    ...rows.map(row => row.join(';'))
  ].join('\n');

  return BOM + csvContent;
}
```

#### `xmlGenerator.js` - Logo XML Format (e-Dönüşüm Standardı)

```javascript
// WebApp/domains/materials/api/services/export/xmlGenerator.js
import { format } from 'date-fns';

export function generateLogoXML(shipment, items) {
  const snapshot = shipment.customerSnapshot;
  const docType = shipment.documentType === 'invoice' ? 'SATIS_FATURASI' : 'SEVK_IRSALIYESI';
  
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<BELGE>
  <TIP>${docType}</TIP>
  <NUMARA>${shipment.shipmentCode}</NUMARA>
  <TARIH>${format(new Date(shipment.createdAt), 'yyyy-MM-dd')}</TARIH>
  
  <CARI>
    <KODU>${snapshot.erpAccountCode || ''}</KODU>
    <UNVAN>${snapshot.company || snapshot.name}</UNVAN>
    <VKN>${snapshot.taxNumber}</VKN>
    <VERGI_DAIRESI>${snapshot.taxOffice}</VERGI_DAIRESI>
    <ADRES>${snapshot.address}</ADRES>
    <IL>${snapshot.city}</IL>
    <ILCE>${snapshot.district}</ILCE>
    <TELEFON>${snapshot.phone || ''}</TELEFON>
    <EMAIL>${snapshot.email || ''}</EMAIL>
  </CARI>
  
  <SATIRLAR>
${items.map((item, index) => `    <SATIR>
      <SIRA>${index + 1}</SIRA>
      <STOK_KODU>${item.materialCode}</STOK_KODU>
      <STOK_ADI><![CDATA[${item.materialName || ''}]]></STOK_ADI>
      <MIKTAR>${item.quantity}</MIKTAR>
      <BIRIM>${item.unit}</BIRIM>
      ${shipment.includePrice ? `<BIRIM_FIYAT>${item.unitPrice || 0}</BIRIM_FIYAT>
      <KDV_ORANI>${item.taxRate || 20}</KDV_ORANI>
      <TUTAR>${item.lineSubtotal || 0}</TUTAR>
      <KDV_TUTARI>${item.lineTax || 0}</KDV_TUTARI>
      <TOPLAM>${item.lineTotal || 0}</TOPLAM>` : ''}
    </SATIR>`).join('\n')}
  </SATIRLAR>
  
  ${shipment.includePrice ? `<OZET>
    <ARA_TOPLAM>${shipment.subtotal}</ARA_TOPLAM>
    <KDV_TOPLAM>${shipment.taxTotal}</KDV_TOPLAM>
    <GENEL_TOPLAM>${shipment.grandTotal}</GENEL_TOPLAM>
  </OZET>` : ''}
</BELGE>`;

  return xml;
}
```

#### `pdfGenerator.js` - Yazdırılabilir İrsaliye/Fatura

```javascript
// WebApp/domains/materials/api/services/export/pdfGenerator.js
import PDFDocument from 'pdfkit';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

export async function generatePDF(shipment, items, companyInfo) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const snapshot = shipment.customerSnapshot;
    const isInvoice = shipment.documentType === 'invoice' || shipment.includePrice;

    // Header
    doc.fontSize(20).text(isInvoice ? 'FATURA' : 'SEVKİYAT İRSALİYESİ', { align: 'center' });
    doc.moveDown();

    // Belge No ve Tarih
    doc.fontSize(10)
       .text(`Belge No: ${shipment.shipmentCode}`, 50, 100)
       .text(`Tarih: ${format(new Date(shipment.createdAt), 'dd.MM.yyyy HH:mm', { locale: tr })}`, 50, 115);

    // Gönderici Bilgileri (Sol)
    doc.fontSize(12).text('GÖNDERİCİ', 50, 150);
    doc.fontSize(10)
       .text(companyInfo.name || 'BeePlan Üretim', 50, 170)
       .text(`VD: ${companyInfo.taxOffice || ''}`, 50, 185)
       .text(`VKN: ${companyInfo.taxNumber || ''}`, 50, 200)
       .text(companyInfo.address || '', 50, 215);

    // Alıcı Bilgileri (Sağ)
    doc.fontSize(12).text('ALICI', 350, 150);
    doc.fontSize(10)
       .text(snapshot.company || snapshot.name, 350, 170)
       .text(`VD: ${snapshot.taxOffice}`, 350, 185)
       .text(`VKN: ${snapshot.taxNumber}`, 350, 200)
       .text(snapshot.address, 350, 215, { width: 200 });

    // Tablo başlıkları
    const tableTop = 280;
    doc.fontSize(9)
       .text('Sıra', 50, tableTop)
       .text('Stok Kodu', 80, tableTop)
       .text('Açıklama', 180, tableTop)
       .text('Miktar', 350, tableTop)
       .text('Birim', 410, tableTop);

    if (isInvoice) {
      doc.text('B.Fiyat', 450, tableTop)
         .text('KDV%', 500, tableTop)
         .text('Toplam', 530, tableTop);
    }

    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    // Ürün satırları
    let yPosition = tableTop + 25;
    items.forEach((item, index) => {
      doc.fontSize(8)
         .text(index + 1, 50, yPosition)
         .text(item.materialCode, 80, yPosition)
         .text(item.materialName || '', 180, yPosition, { width: 160 })
         .text(item.quantity, 350, yPosition)
         .text(item.unit, 410, yPosition);

      if (isInvoice) {
        doc.text((item.unitPrice || 0).toFixed(2), 450, yPosition)
           .text(item.taxRate || 20, 500, yPosition)
           .text((item.lineTotal || 0).toFixed(2), 530, yPosition);
      }

      yPosition += 20;
    });

    // Toplam (Fatura için)
    if (isInvoice) {
      yPosition += 20;
      doc.fontSize(10)
         .text('Ara Toplam:', 400, yPosition)
         .text(`${shipment.subtotal?.toFixed(2) || '0.00'} TL`, 500, yPosition);
      
      yPosition += 15;
      doc.text('KDV Toplam:', 400, yPosition)
         .text(`${shipment.taxTotal?.toFixed(2) || '0.00'} TL`, 500, yPosition);
      
      yPosition += 15;
      doc.fontSize(12)
         .text('GENEL TOPLAM:', 400, yPosition)
         .text(`${shipment.grandTotal?.toFixed(2) || '0.00'} TL`, 500, yPosition);
    }

    // Footer
    doc.fontSize(8)
       .text('BeePlan Üretim Yönetim Sistemi', 50, 750, { align: 'center' });

    doc.end();
  });
}
```

### 8.2. Validasyon Kuralları ve İş Mantığı

#### Sevkiyat Oluşturma Validasyonları

```javascript
// shipmentService.js - validateShipmentData()
function validateShipmentData(data, items) {
  const errors = [];

  // 1. Müşteri bilgileri kontrolü
  if (!data.customerId && !data.customerSnapshot) {
    errors.push('Müşteri bilgisi zorunludur (customerId veya customerSnapshot)');
  }

  if (data.customerSnapshot) {
    const required = ['name', 'taxNumber', 'taxOffice', 'address', 'city'];
    required.forEach(field => {
      if (!data.customerSnapshot[field]) {
        errors.push(`customerSnapshot.${field} zorunludur`);
      }
    });

    // VKN/TCKN format kontrolü
    const taxNumber = data.customerSnapshot.taxNumber;
    if (taxNumber && !/^\d{10,11}$/.test(taxNumber)) {
      errors.push('Vergi numarası 10 (VKN) veya 11 (TCKN) haneli olmalıdır');
    }
  }

  // 2. Kalem kontrolü
  if (!items || items.length === 0) {
    errors.push('En az 1 ürün eklemelisiniz');
  }

  items.forEach((item, index) => {
    if (!item.materialCode) {
      errors.push(`${index + 1}. üründe materialCode zorunludur`);
    }
    if (!item.quantity || item.quantity <= 0) {
      errors.push(`${index + 1}. üründe miktar 0'dan büyük olmalıdır`);
    }
  });

  // 3. Fatura kontrolü
  if (data.documentType === 'invoice' || data.includePrice) {
    items.forEach((item, index) => {
      if (item.unitPrice === undefined || item.unitPrice === null) {
        errors.push(`${index + 1}. üründe fiyat zorunludur (fatura kesilecek)`);
      }
      if (item.unitPrice < 0) {
        errors.push(`${index + 1}. üründe fiyat negatif olamaz`);
      }
      if (item.taxRate < 0 || item.taxRate > 100) {
        errors.push(`${index + 1}. üründe KDV oranı 0-100 arasında olmalıdır`);
      }
    });
  }

  // 4. Stok kontrolü (item validation'da yapılacak)
  // Her item için ayrı ayrı kontrol edilir

  return errors;
}
```

#### Stok Kontrolü Detayları

```javascript
// shipmentService.js - checkStockAvailability()
async function checkStockAvailability(items, trx = db) {
  const stockIssues = [];

  for (const item of items) {
    const material = await trx('materials.materials')
      .where({ code: item.materialCode })
      .first();

    if (!material) {
      stockIssues.push({
        materialCode: item.materialCode,
        issue: 'MATERIAL_NOT_FOUND',
        message: 'Malzeme bulunamadı'
      });
      continue;
    }

    const availableStock = material.stock - (material.reserved || 0) - (material.wipReserved || 0);

    if (item.quantity > availableStock) {
      stockIssues.push({
        materialCode: item.materialCode,
        materialName: material.name,
        issue: 'INSUFFICIENT_STOCK',
        requested: item.quantity,
        available: availableStock,
        shortage: item.quantity - availableStock,
        message: `Yetersiz stok. Mevcut: ${availableStock} ${material.unit}, İstenen: ${item.quantity} ${material.unit}`
      });
    }
  }

  return stockIssues;
}
```

### 8.3. Parçalı Sevkiyat Hesaplama Mantığı

#### Quote Summary Endpoint (Kalan Miktar Hesaplama)

```javascript
// shipmentService.js - getQuoteShipmentSummary()
export async function getQuoteShipmentSummary(quoteId) {
  // 1. Quote bilgilerini al
  const quote = await db('quotes.quotes')
    .where({ id: quoteId })
    .first();

  if (!quote) {
    throw new Error('Quote bulunamadı');
  }

  // 2. WorkOrder ve Production Plan output'u al
  const outputMaterial = await getQuoteOutputMaterial(quoteId);

  if (!outputMaterial) {
    return {
      quoteId,
      hasProduction: false,
      totalOrdered: null,
      shipped: 0,
      remaining: null,
      shipments: []
    };
  }

  // 3. Bu quote için yapılmış sevkiyatları al
  const shipments = await db('materials.shipments as s')
    .leftJoin('materials.shipment_items as si', 's.id', 'si.shipmentId')
    .where({ 's.quoteId': quoteId, 's.status': 'completed' })
    .whereNot({ 's.status': 'cancelled' })
    .select(
      's.id',
      's.shipmentCode',
      's.createdAt',
      db.raw('COALESCE(SUM(si.quantity), 0) as totalQuantity')
    )
    .groupBy('s.id', 's.shipmentCode', 's.createdAt')
    .orderBy('s.createdAt', 'desc');

  const totalShipped = shipments.reduce((sum, s) => sum + parseFloat(s.totalQuantity || 0), 0);

  // 4. Üretim planından beklenen miktarı al (form data'dan veya plan'dan)
  const expectedQuantity = quote.formData?.quantity || 0; // Form data'dan miktar
  const remaining = Math.max(0, expectedQuantity - totalShipped);

  return {
    quoteId,
    hasProduction: true,
    outputMaterial: outputMaterial.materialCode,
    totalOrdered: expectedQuantity,
    shipped: totalShipped,
    remaining,
    shippedPercentage: expectedQuantity > 0 ? ((totalShipped / expectedQuantity) * 100).toFixed(1) : 0,
    shipments: shipments.map(s => ({
      id: s.id,
      code: s.shipmentCode,
      date: s.createdAt,
      quantity: parseFloat(s.totalQuantity)
    }))
  };
}
```

### 8.4. Export Geçmişi Yönetimi

#### Export Format Tracking (Tekil Kayıt)

```javascript
// shipmentService.js - updateExportHistory()
async function updateExportHistory(shipmentId, format, trx = db) {
  const shipment = await trx('materials.shipments')
    .where({ id: shipmentId })
    .first();

  let exportedFormats = shipment.exportedFormats || [];
  
  // Format zaten export edildiyse, sadece timestamp güncelle
  const formatExists = exportedFormats.some(f => f.format === format);
  
  if (!formatExists) {
    exportedFormats.push({
      format, // 'csv' | 'xml' | 'pdf' | 'json'
      exportedAt: new Date().toISOString()
    });
  } else {
    // Mevcut format'ın timestamp'ini güncelle
    exportedFormats = exportedFormats.map(f => 
      f.format === format 
        ? { ...f, exportedAt: new Date().toISOString() }
        : f
    );
  }

  await trx('materials.shipments')
    .where({ id: shipmentId })
    .update({
      exportedFormats: JSON.stringify(exportedFormats),
      exportedAt: new Date() // Son export zamanı
    });

  return exportedFormats;
}
```

### 8.5. UI Component Skeleton'ları

#### YeniSevkiyatWizard.jsx - Tam Yapı

```javascript
// WebApp/domains/materials/components/shipments/YeniSevkiyatWizard.jsx
import React, { useState } from 'react';
import Step1CustomerSelection from './wizard/Step1CustomerSelection.jsx';
import Step2ItemSelection from './wizard/Step2ItemSelection.jsx';
import Step3ReviewAndExport from './wizard/Step3ReviewAndExport.jsx';

export default function YeniSevkiyatWizard({ isOpen, onClose, onSuccess }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [wizardData, setWizardData] = useState({
    customer: null,      // { customerId, snapshot: {...} }
    items: [],           // [{ materialCode, quantity, unitPrice, ... }]
    documentType: 'both',
    includePrice: false,
    exportFormats: ['csv', 'xml', 'pdf']
  });

  const updateWizardData = (field, value) => {
    setWizardData(prev => ({ ...prev, [field]: value }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1: return wizardData.customer !== null;
      case 2: return wizardData.items.length > 0;
      case 3: return true;
      default: return false;
    }
  };

  const handleSubmit = async () => {
    try {
      const response = await fetch('/api/materials/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: wizardData.customer.customerId,
          customerSnapshot: wizardData.customer.snapshot,
          items: wizardData.items,
          documentType: wizardData.documentType,
          includePrice: wizardData.includePrice,
          exportFormats: wizardData.exportFormats
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Sevkiyat oluşturulamadı');
      }

      // Export dosyalarını indir
      for (const format of wizardData.exportFormats) {
        const exportResponse = await fetch(`/api/materials/shipments/${result.shipment.id}/export/${format}`);
        const blob = await exportResponse.blob();
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${result.shipment.shipmentCode}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }

      onSuccess(result.shipment);
      onClose();
    } catch (error) {
      console.error('Shipment creation error:', error);
      alert(error.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content wizard-modal">
        <div className="modal-header">
          <h2>Yeni Sevkiyat Oluştur</h2>
          <button onClick={onClose} className="btn-close">×</button>
        </div>

        <div className="wizard-progress">
          <div className={`wizard-step ${currentStep >= 1 ? 'active' : ''}`}>1. Müşteri</div>
          <div className={`wizard-step ${currentStep >= 2 ? 'active' : ''}`}>2. Ürünler</div>
          <div className={`wizard-step ${currentStep >= 3 ? 'active' : ''}`}>3. Önizleme</div>
        </div>

        <div className="wizard-body">
          {currentStep === 1 && (
            <Step1CustomerSelection
              data={wizardData}
              onChange={updateWizardData}
            />
          )}
          {currentStep === 2 && (
            <Step2ItemSelection
              data={wizardData}
              onChange={updateWizardData}
            />
          )}
          {currentStep === 3 && (
            <Step3ReviewAndExport
              data={wizardData}
              onChange={updateWizardData}
            />
          )}
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
            disabled={currentStep === 1}
          >
            ← Geri
          </button>

          {currentStep < 3 ? (
            <button
              className="btn btn-primary"
              onClick={() => setCurrentStep(prev => prev + 1)}
              disabled={!canProceed()}
            >
              İleri →
            </button>
          ) : (
            <button
              className="btn btn-success"
              onClick={handleSubmit}
            >
              Kaydet ve Export
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## 9. AÇIK SORULAR VE KARARLAR

### 9.1. Netleştirilmiş Kararlar

✅ **Müşteri Adı/Adresi Garantisi**: `customerSnapshot` JSONB zorunludur. NULL olamaz.

✅ **Fatura Fiyat Zorunluluğu**: 
- `documentType === 'invoice'` ise `unitPrice` her item için zorunludur
- Validation `validateShipmentData()` fonksiyonunda yapılır

✅ **Export Geçmişi**: 
- `exportedFormats` JSONB array: `[{format: 'csv', exportedAt: '2025-12-08T14:30:00Z'}, ...]`
- Her format için ayrı timestamp
- `exportedAt` kolonunda son export zamanı (kolay sorgu için)

✅ **Kısmi Sevkiyat Kalan Miktar**: 
- Quote'ta fiziksel kolon YOK
- `getQuoteShipmentSummary(quoteId)` endpoint'i dinamik hesaplama yapar
- Frontend cache edebilir (performance için)

✅ **Stok Kontrolü**: 
- `checkStockAvailability()` fonksiyonu zorunludur
- Yetersiz stokta bile sevkiyat oluşabilir (uyarı ile)
- Frontend'de kullanıcıya uyarı gösterilir

✅ **KDV Oranı**: 
- Türkiye standartları: 0, 1, 8, 10, 18, 20
- Validation regex: `^(0|1|8|10|18|20)$`

✅ **Denormalize Kolonlar**: 
- `customerName`, `customerCompany`, `deliveryAddress` KALDIRILDI
- Tüm bilgiler `customerSnapshot` JSONB'de
- Export'ta snapshot parse edilir

### 9.2. Implementation Sırası (GÜNCEL)

**Faz 0: Hazırlık (ŞU AN)** ✅
- [x] Dokümantasyon tamamlandı
- [ ] Teknik review (geliştirici onayı)
- [ ] CSS class'ları kontrol edildi

**Faz 1: Database & Backend (2 gün)** ⏳
- [ ] Migration 035 oluştur ve çalıştır
- [ ] `shipments.js`, `shipmentItems.js` model güncelle
- [ ] `shipmentService.js` fonksiyonları yaz
- [ ] `exportService.js` ve generator'lar oluştur
- [ ] API routes ekle
- [ ] Postman test

**Faz 2: UI Components (2 gün)** ⏳
- [ ] `HizliSevkiyatModal.jsx` oluştur
- [ ] `YeniSevkiyatWizard.jsx` ve step component'ları
- [ ] Stok tablosuna "Sevk Et" butonu entegrasyonu
- [ ] Sevkiyatlar sayfası UI güncellemeleri

**Faz 3: Export & Test (1 gün)** ⏳
- [ ] PDF generator entegrasyonu (pdfkit)
- [ ] Export download logic
- [ ] Error handling ve validation testleri
- [ ] Manuel test senaryoları (checklist)

**Faz 4: Quote Entegrasyonu (v2.0 - Gelecek)** 🔮
- [ ] Quote detay sayfasına sevkiyat widget'ı
- [ ] `QuoteSevkiyatModal.jsx`
- [ ] Parçalı sevkiyat UI (progress bar)

---

**Son Güncelleme**: 8 Aralık 2025 - 16:45  
**Hazırlayan**: GitHub Copilot  
**Durum**: 📝 Dokümantasyon Tamamlandı (Hazırlık Aşaması) - Implementation Başlamadı
