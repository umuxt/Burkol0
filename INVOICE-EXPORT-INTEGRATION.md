# 📦 İrsaliye & Fatura Export Entegrasyonu

> **Branch**: `invoice-export`  
> **Tarih**: 8 Aralık 2025  
> **Versiyon**: 2.0  
> **Yedek**: `INVOICE-EXPORT-INTEGRATION.backup.md`

---

## 📋 İÇİNDEKİLER

1. [Genel Bakış](#1-genel-bakış)
2. [Netleştirilmiş Kararlar](#2-netleştirilmiş-kararlar)
3. [Veritabanı Yapısı](#3-veritabanı-yapısı)
4. [Backend API](#4-backend-api)
5. [Export Formatları](#5-export-formatları)
6. [UI/UX Tasarımı](#6-uiux-tasarımı)
7. [Veri Akışları](#7-veri-akışları)
8. [Implementation Prompts](#8-implementation-prompts)

---

## 1. GENEL BAKIŞ

### 1.1. Problem ve Çözüm

**Problem**: 
- BeePlan kullanıcıları irsaliye/fatura kesme yetkisine sahip değil
- Logo, Zirve gibi muhasebe yazılımları bu işlemi yapıyor
- Mevcut sistemler arası veri aktarımı manuel ve hata eğilimli

**Çözüm - Hibrit Yaklaşım**:
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   BeePlan'da    │     │  Logo/Zirve'de  │     │  BeePlan'da     │
│   Sevkiyat      │ ──▶ │  Fatura/İrsaliye│ ──▶ │  Import ile     │
│   Oluştur       │     │  Kes            │     │  Tamamla        │
│   + Export      │     │                 │     │  + Stok Düşür   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

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
| 2 | Yetersiz Stok | ❌ BLOK | Sevkiyat oluşturulamaz, hata verilir |
| 3 | Stok Düşme | Import anında | Status "completed" olunca stok düşer |
| 4 | Export Dosyası | Saklanmaz | Her seferinde yeniden üretilir |
| 5 | Import Dosyası | DB'de saklanır | Dosya + metadata kaydedilir |
| 6 | Kalem Silme | Import'a kadar | Completed sonrası silinemez |
| 7 | Müşteri Inline | CRM'e kaydedilir | Yeni müşteri hem sevkiyata hem CRM'e eklenir |

### 2.2. Export/Import Kararları

| # | Konu | Karar | Detay |
|---|------|-------|-------|
| 1 | Formatlar | CSV, XML, PDF, JSON | Tümü desteklenir |
| 2 | CSV Ayracı | System Settings | `;` / `,` / `tab` seçenekleri |
| 3 | Hedef Program | Kullanıcı seçer | Logo Tiger, Logo GO, Zirve, Excel |
| 4 | Belge Numarası | İkili sistem | BeePlan: `SHP-XXXX`, Import sonrası Logo/Zirve no da kaydedilir |
| 5 | Export Geçmişi | lastExportedAt | Format bazlı timestamp JSONB + son export zamanı |

### 2.3. Finans & Vergi Kararları

| # | Konu | Karar | Detay |
|---|------|-------|-------|
| 1 | Para Birimi | TRY default | Farklı seçilirse exchangeRate zorunlu |
| 2 | İskonto | Toggle ile | Satır + genel iskonto, default 0 |
| 3 | Tevkifat | Dropdown | 5/10, 7/10, 9/10 vs. DB tablosundan |
| 4 | KDV Muafiyet | DB tablosu | `materials.vat_exemption_codes` (GİB kodları) |
| 5 | KDV Oranları | Standart | 0, 1, 8, 10, 18, 20 |

### 2.4. Ek Alanlar Kararları

| # | Alan | Karar | UI Konumu |
|---|------|-------|-----------|
| 1 | Teslim Adresi | Toggle: "Farklı adrese teslim" | Müşteri bölümü |
| 2 | Depo Kodu | Şimdilik yok | - |
| 3 | Lot/Seri | Serbest metin | Akordeon: Lot/Seri |
| 4 | Satır Notu | Opsiyonel | Kalem satırında (opsiyonel) |
| 5 | Özel Kod | Serbest metin | Akordeon: Ek Bilgiler |
| 6 | Maliyet Merkezi | Serbest metin | Akordeon: Ek Bilgiler |

### 2.5. UI/UX Kararları

| # | Konu | Karar |
|---|------|-------|
| 1 | Modal | Mevcut Add Shipment Modal genişletilecek |
| 2 | Stok Sayfası | Aynı modal, malzeme set edilmiş, tek kalem |
| 3 | Opsiyonel Alanlar | Minimal akordeonlar içinde gruplu |
| 4 | Quote Bilgisi | Sol tarafta gösterilir (bilgi amaçlı) |

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

> **Migration**: `036_invoice_export_clean.sql`  
> **Durum**: ✅ UYGULANMIŞ (8 Aralık 2025)

### 3.1. Şema Genel Bakış

```
materials schema
├── shipments (✅ GÜNCELLENDİ - 63 kolon)
├── shipment_items (✅ GÜNCELLENDİ - 36 kolon)  
├── vat_exemption_codes (✅ YENİ - 7 kolon, 14 kayıt)
├── withholding_rates (✅ YENİ - 6 kolon, 7 kayıt)
└── shipment_settings (✅ YENİ - 6 kolon, 8 kayıt)

quotes schema
└── customers (✅ erpAccountCode eklendi)
```

### 3.1.1. SHIPMENTS - Tam Kolon Listesi

| Kolon | Tip | Nullable | Default | Kaynak |
|-------|-----|----------|---------|--------|
| `id` | integer | NOT NULL | SERIAL | Mevcut |
| `shipmentCode` | varchar | NOT NULL | - | Mevcut |
| `shipmentSequence` | integer | NOT NULL | - | Mevcut |
| `workOrderCode` | varchar | NULL | - | Mevcut |
| `quoteId` | varchar | NULL | - | Mevcut |
| `planId` | integer | NULL | - | Mevcut |
| `customerName` | varchar | NULL | - | Mevcut |
| `customerCompany` | varchar | NULL | - | Mevcut |
| `deliveryAddress` | text | NULL | - | Mevcut |
| `status` | varchar | NULL | 'pending' | Mevcut |
| `notes` | text | NULL | - | Mevcut |
| `createdBy` | varchar | NULL | - | Mevcut |
| `updatedBy` | varchar | NULL | - | Mevcut |
| `createdAt` | timestamptz | NULL | NOW() | Mevcut |
| `updatedAt` | timestamptz | NULL | NOW() | Mevcut |
| `shipmentCompletedAt` | timestamptz | NULL | - | Mevcut |
| `documentStatus` | varchar | NULL | 'draft' | Mevcut |
| `externalDocumentId` | varchar | NULL | - | Mevcut |
| `waybillDate` | timestamptz | NULL | - | Mevcut |
| `waybillTime` | time | NULL | - | Mevcut |
| `currency` | varchar | NULL | 'TRY' | Mevcut |
| `exchangeRate` | numeric | NULL | 1.0 | Mevcut |
| `transportType` | varchar | NULL | 'OWN_VEHICLE' | Mevcut |
| `driverName` | varchar | NULL | - | Mevcut |
| `driverTc` | varchar | NULL | - | Mevcut |
| `plateNumber` | varchar | NULL | - | Mevcut |
| `carrierCompany` | varchar | NULL | - | Mevcut |
| `carrierTcVkn` | varchar | NULL | - | Mevcut |
| `shipmentType` | varchar | NULL | 'standard' | Mevcut |
| `sourceDocument` | varchar | NULL | - | Mevcut |
| `sourceDocumentId` | integer | NULL | - | Mevcut |
| `netWeight` | numeric | NULL | - | Mevcut |
| `grossWeight` | numeric | NULL | - | Mevcut |
| `packageCount` | integer | NULL | - | Mevcut |
| `packageType` | varchar | NULL | - | Mevcut |
| `uploadedDocumentPath` | text | NULL | - | Mevcut |
| `uploadedAt` | timestamptz | NULL | - | Mevcut |
| `exportedAt` | timestamptz | NULL | - | Mevcut |
| `archivedAt` | timestamptz | NULL | - | Mevcut |
| `customerId` | integer | NULL | - | **YENİ** FK→customers |
| `customerSnapshot` | jsonb | NULL | - | **YENİ** |
| `useAlternateDelivery` | boolean | NULL | false | **YENİ** |
| `alternateDeliveryAddress` | jsonb | NULL | - | **YENİ** |
| `documentType` | varchar | NULL | 'waybill' | **YENİ** |
| `includePrice` | boolean | NULL | false | **YENİ** |
| `discountType` | varchar | NULL | - | **YENİ** |
| `discountValue` | numeric | NULL | 0 | **YENİ** |
| `discountTotal` | numeric | NULL | 0 | **YENİ** |
| `subtotal` | numeric | NULL | 0 | **YENİ** |
| `taxTotal` | numeric | NULL | 0 | **YENİ** |
| `withholdingTotal` | numeric | NULL | 0 | **YENİ** |
| `grandTotal` | numeric | NULL | 0 | **YENİ** |
| `exportHistory` | jsonb | NULL | '{}' | **YENİ** |
| `lastExportedAt` | timestamptz | NULL | - | **YENİ** |
| `exportTarget` | varchar | NULL | - | **YENİ** |
| `importedAt` | timestamptz | NULL | - | **YENİ** |
| `importedBy` | integer | NULL | - | **YENİ** |
| `importedFile` | bytea | NULL | - | **YENİ** |
| `importedFileName` | varchar | NULL | - | **YENİ** |
| `externalDocNumber` | varchar | NULL | - | **YENİ** |
| `specialCode` | varchar | NULL | - | **YENİ** |
| `costCenter` | varchar | NULL | - | **YENİ** |
| `documentNotes` | text | NULL | - | **YENİ** |

### 3.1.2. SHIPMENT_ITEMS - Tam Kolon Listesi

| Kolon | Tip | Nullable | Default | Kaynak |
|-------|-----|----------|---------|--------|
| `id` | integer | NOT NULL | SERIAL | Mevcut |
| `shipmentId` | integer | NOT NULL | - | Mevcut FK→shipments |
| `itemCode` | varchar | NULL | - | Mevcut |
| `itemSequence` | integer | NULL | - | Mevcut |
| `shipmentCode` | varchar | NULL | - | Mevcut |
| `materialId` | integer | NULL | - | Mevcut |
| `materialCode` | varchar | NOT NULL | - | Mevcut |
| `materialName` | varchar | NULL | - | Mevcut |
| `quantity` | numeric | NOT NULL | - | Mevcut |
| `unit` | varchar | NULL | 'adet' | Mevcut |
| `lotNumber` | varchar | NULL | - | Mevcut |
| `stockMovementId` | integer | NULL | - | Mevcut |
| `itemStatus` | varchar | NULL | 'pending' | Mevcut |
| `notes` | text | NULL | - | Mevcut |
| `createdAt` | timestamptz | NULL | NOW() | Mevcut |
| `updatedAt` | timestamptz | NULL | NOW() | Mevcut |
| `itemType` | varchar | NULL | 'material' | Mevcut |
| `serviceCardId` | integer | NULL | - | Mevcut FK→service_cards |
| `quoteItemId` | integer | NULL | - | Mevcut |
| `unitPrice` | numeric | NULL | - | Mevcut |
| `taxRate` | integer | NULL | 20 | Mevcut |
| `discountPercent` | numeric | NULL | 0 | Mevcut |
| `discountAmount` | numeric | NULL | 0 | Mevcut (trigger) |
| `subtotal` | numeric | NULL | - | Mevcut (trigger) |
| `taxAmount` | numeric | NULL | - | Mevcut (trigger) |
| `totalAmount` | numeric | NULL | - | Mevcut (trigger) |
| `serialNumbers` | ARRAY | NULL | - | Mevcut |
| `expiryDate` | date | NULL | - | Mevcut |
| `productionDate` | date | NULL | - | Mevcut |
| `erpItemCode` | varchar | NULL | - | Mevcut |
| `erpLineNumber` | integer | NULL | - | Mevcut |
| `itemNotes` | text | NULL | - | Mevcut |
| `vatExemptionId` | integer | NULL | - | **YENİ** FK→vat_exemption_codes |
| `withholdingRateId` | integer | NULL | - | **YENİ** FK→withholding_rates |
| `withholdingAmount` | numeric | NULL | 0 | **YENİ** (trigger) |
| `serialNumber` | varchar | NULL | - | **YENİ** |

### 3.2. YENİ TABLO: `materials.vat_exemption_codes`

KDV muafiyet kodları (GİB standartları):

```sql
CREATE TABLE IF NOT EXISTS materials.vat_exemption_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Örnek veriler
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

### 3.3. YENİ TABLO: `materials.withholding_rates`

Tevkifat oranları:

```sql
CREATE TABLE IF NOT EXISTS materials.withholding_rates (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    rate DECIMAL(5,4) NOT NULL,
    name VARCHAR(200) NOT NULL,
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

### 3.4. YENİ TABLO: `materials.shipment_settings`

Sistem ayarları:

```sql
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
('company_name', 'Firma Adı', 'PDF için firma adı'),
('company_address', 'Firma Adresi', 'PDF için adres'),
('company_tax_office', 'Vergi Dairesi', 'PDF için VD'),
('company_tax_number', '0000000000', 'PDF için VKN');
```

### 3.5. GÜNCELLEME: `quotes.customers`

ERP entegrasyonu için eklenen kolonlar:

```sql
ALTER TABLE quotes.customers
ADD COLUMN IF NOT EXISTS "erpAccountCode" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "erpSyncedAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_erp_code 
ON quotes.customers("erpAccountCode") 
WHERE "erpAccountCode" IS NOT NULL;
```

### 3.6. TRIGGER: Fiyat Otomatik Hesaplama

> **Not**: Mevcut kolon isimlerini kullanıyor (subtotal, taxAmount, totalAmount, discountPercent, discountAmount)

```sql
CREATE OR REPLACE FUNCTION materials.calculate_shipment_item_totals()
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
        NEW."discountAmount" := COALESCE(NEW."discountAmount", 0);
    END IF;
    
    -- 3. Net ara toplam (iskonto sonrası)
    net_subtotal := NEW."subtotal" - COALESCE(NEW."discountAmount", 0);
    
    -- 4. KDV hesabı (muafiyet varsa 0)
    IF NEW."vatExemptionId" IS NOT NULL THEN
        NEW."taxAmount" := 0;
    ELSE
        NEW."taxAmount" := net_subtotal * (COALESCE(NEW."taxRate", 20) / 100.0);
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
    NEW."totalAmount" := net_subtotal + NEW."taxAmount" - COALESCE(NEW."withholdingAmount", 0);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shipment_items_calculate_totals
    BEFORE INSERT OR UPDATE ON materials.shipment_items
    FOR EACH ROW
    EXECUTE FUNCTION materials.calculate_shipment_item_totals();
```

---

## 4. BACKEND API

### 4.1. Route Yapısı

```
/api/materials/
├── shipments/
│   ├── GET    /                    → Liste (filtreleme)
│   ├── POST   /                    → Yeni sevkiyat
│   ├── GET    /:id                 → Detay
│   ├── PATCH  /:id                 → Güncelle
│   ├── DELETE /:id                 → Sil
│   ├── PATCH  /:id/cancel          → İptal et
│   ├── POST   /:id/import          → Import dosyası yükle
│   └── GET    /:id/export/:format  → Export (csv/xml/pdf/json)
│
├── vat-exemptions/
│   └── GET    /                    → Liste
│
├── withholding-rates/
│   └── GET    /                    → Liste
│
└── settings/
    ├── GET    /                    → Tüm ayarlar
    └── PUT    /:key                → Ayar güncelle
```

### 4.2. POST `/api/materials/shipments` - Yeni Sevkiyat

**Request Body:**
```json
{
  "customerId": 5,
  "customerSnapshot": {
    "name": "ABC Ltd.",
    "company": "ABC Limited Şti.",
    "taxOffice": "Kadıköy VD",
    "taxNumber": "1234567890",
    "address": "Örnek Mah. No:5",
    "city": "İstanbul",
    "district": "Kadıköy",
    "phone": "+90 216 555 1234",
    "email": "info@abc.com"
  },
  "useAlternateDelivery": false,
  "alternateDeliveryAddress": null,
  "documentType": "invoice",
  "includePrice": true,
  "currency": "TRY",
  "exchangeRate": 1.0,
  "discountType": null,
  "discountValue": 0,
  "exportTarget": "logo_tiger",
  "specialCode": "",
  "costCenter": "",
  "documentNotes": "",
  "items": [
    {
      "materialCode": "M-001",
      "materialId": 15,
      "materialName": "Demir Levha",
      "quantity": 100,
      "unit": "adet",
      "unitPrice": 50.00,
      "taxRate": 20,
      "discountPercent": 0,
      "vatExemptionId": null,
      "withholdingRateId": null,
      "lotNumber": "",
      "serialNumber": "",
      "itemNotes": ""
    }
  ]
}
```

**Response (201):**
```json
{
  "success": true,
  "shipment": {
    "id": 123,
    "shipmentCode": "SHP-2025-0045",
    "status": "pending",
    "grandTotal": 6000.00
  }
}
```

**Validasyonlar:**
- `customerSnapshot` zorunlu (customerId opsiyonel ama snapshot şart)
- `documentType = 'invoice'|'both'` → `includePrice = true` zorunlu
- `includePrice = true` → tüm items'da `unitPrice > 0` zorunlu
- `currency != 'TRY'` → `exchangeRate > 0` zorunlu
- Her item için stok kontrolü → yetersizse HATA

**DB Kolon Eşleştirmesi:**
| Request Field | DB Column | Tablo |
|---------------|-----------|-------|
| `customerId` | `customerId` | shipments |
| `customerSnapshot` | `customerSnapshot` | shipments |
| `alternateDeliveryAddress` | `alternateDeliveryAddress` | shipments |
| `discountPercent` | `discountPercent` | shipment_items |
| `vatExemptionId` | `vatExemptionId` | shipment_items |
| `withholdingRateId` | `withholdingRateId` | shipment_items |

### 4.3. POST `/api/materials/shipments/:id/import` - Import

**Request:** `multipart/form-data`
- `file`: Yüklenen dosya
- `externalDocNumber`: Logo/Zirve belge no

**Response:**
```json
{
  "success": true,
  "shipment": {
    "id": 123,
    "status": "completed",
    "externalDocNumber": "A-2025-001234",
    "importedAt": "2025-12-08T15:00:00Z"
  },
  "stockUpdates": [
    {"materialCode": "M-001", "change": -100, "newStock": 400}
  ]
}
```

### 4.4. GET `/api/materials/shipments/:id/export/:format` - Export

**URL:** `/api/materials/shipments/123/export/csv?target=logo_tiger`

**Response:** Dosya download
- `Content-Type`: `text/csv` | `application/xml` | `application/pdf` | `application/json`
- `Content-Disposition`: `attachment; filename="SHP-2025-0045.csv"`

---

## 5. EXPORT FORMATLARI

### 5.1. CSV Formatı

**Ayraç:** System Settings'den (`csv_delimiter`)

**Kolonlar:**
```
Belge No;Tarih;Cari Kodu;Cari Ünvan;VKN;Vergi Dairesi;Adres;Şehir;İlçe;Telefon;Email;
Stok Kodu;Stok Adı;Miktar;Birim;Birim Fiyat;İskonto %;İskonto Tutar;KDV %;KDV Tutar;
Tevkifat Oranı;Tevkifat Tutar;Satır Toplam;Lot No;Seri No;Para Birimi;Döviz Kuru;
Genel İskonto;Ara Toplam;Toplam KDV;Toplam Tevkifat;Genel Toplam
```

### 5.2. XML Formatı (Logo Tiger/GO)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<BELGE>
  <TIP>SEVK_IRSALIYESI</TIP>
  <NUMARA>SHP-2025-0045</NUMARA>
  <TARIH>2025-12-08</TARIH>
  <PARA_BIRIMI>TRY</PARA_BIRIMI>
  <DOVIZ_KURU>1.000000</DOVIZ_KURU>
  
  <CARI>
    <KODU>120.01.001</KODU>
    <UNVAN>ABC Limited Şti.</UNVAN>
    <VKN>1234567890</VKN>
    <VERGI_DAIRESI>Kadıköy VD</VERGI_DAIRESI>
    <ADRES>Örnek Mah. No:5</ADRES>
    <IL>İstanbul</IL>
    <ILCE>Kadıköy</ILCE>
    <TELEFON>+90 216 555 1234</TELEFON>
    <EMAIL>info@abc.com</EMAIL>
  </CARI>
  
  <TESLIM_ADRESI>
    <!-- useAlternateDelivery = true ise doldurulur -->
  </TESLIM_ADRESI>
  
  <SATIRLAR>
    <SATIR>
      <SIRA>1</SIRA>
      <STOK_KODU>M-001</STOK_KODU>
      <STOK_ADI><![CDATA[Demir Levha]]></STOK_ADI>
      <MIKTAR>100</MIKTAR>
      <BIRIM>adet</BIRIM>
      <BIRIM_FIYAT>50.00</BIRIM_FIYAT>
      <ISKONTO_ORAN>0</ISKONTO_ORAN>
      <ISKONTO_TUTAR>0.00</ISKONTO_TUTAR>
      <KDV_ORANI>20</KDV_ORANI>
      <KDV_MUAFIYET></KDV_MUAFIYET>
      <TEVKIFAT_ORAN></TEVKIFAT_ORAN>
      <TEVKIFAT_TUTAR>0.00</TEVKIFAT_TUTAR>
      <ARA_TOPLAM>5000.00</ARA_TOPLAM>
      <KDV_TUTAR>1000.00</KDV_TUTAR>
      <TOPLAM>6000.00</TOPLAM>
      <LOT_NO></LOT_NO>
      <SERI_NO></SERI_NO>
      <NOT></NOT>
    </SATIR>
  </SATIRLAR>
  
  <OZET>
    <GENEL_ISKONTO_TIP></GENEL_ISKONTO_TIP>
    <GENEL_ISKONTO_DEGER>0</GENEL_ISKONTO_DEGER>
    <GENEL_ISKONTO_TUTAR>0.00</GENEL_ISKONTO_TUTAR>
    <ARA_TOPLAM>5000.00</ARA_TOPLAM>
    <KDV_TOPLAM>1000.00</KDV_TOPLAM>
    <TEVKIFAT_TOPLAM>0.00</TEVKIFAT_TOPLAM>
    <GENEL_TOPLAM>6000.00</GENEL_TOPLAM>
  </OZET>
  
  <EK_BILGILER>
    <OZEL_KOD></OZEL_KOD>
    <MALIYET_MERKEZI></MALIYET_MERKEZI>
    <BELGE_NOTU></BELGE_NOTU>
  </EK_BILGILER>
</BELGE>
```

### 5.3. PDF Formatı

**Yapı:**
- Header: Gönderici bilgileri (sol), Alıcı bilgileri (sağ)
- Belge No ve Tarih
- Ürün tablosu
- Toplamlar (fatura ise)
- Footer: BeePlan

**Şirket Bilgileri:** `materials.shipment_settings` tablosundan

### 5.4. JSON Formatı

Tüm shipment + items verisi JSON olarak.

---

## 6. UI/UX TASARIMI

### 6.1. Add Shipment Modal (Genişletilmiş)

```
┌─────────────────────────────────────────────────────────────────────┐
│ YENİ SEVKİYAT                                              [X]     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ┌─ MÜŞTERİ BİLGİLERİ ─────────────────────────────────────────────┐ │
│ │ Müşteri: [____________________▼]  [+ Yeni Müşteri]              │ │
│ │ Firma: ABC Limited Şti.           VKN: 1234567890               │ │
│ │ Vergi Dairesi: Kadıköy VD         Adres: Örnek Mah...           │ │
│ │                                                                  │ │
│ │ ☐ Farklı adrese teslim                                          │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ KALEMLER ───────────────────────────────────────────────────────┐ │
│ │ Malzeme          | Miktar | Birim | Fiyat  | KDV% | Toplam      │ │
│ │ [M-001 Demir ▼]  | [100 ] | adet  | [50.00]| [20] | 6,000.00    │ │
│ │ [+ Kalem Ekle]                                                   │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ┌─ BELGE TİPİ ─────────────────────────────────────────────────────┐ │
│ │ ○ İrsaliye (Fiyatsız)  ● Fatura (Fiyatlı)  ○ İkisi Birden       │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│ ▸ Para Birimi & Kur ──────────────────────────────── [Akordeon]    │
│ ▸ İskonto Ayarları ───────────────────────────────── [Akordeon]    │
│ ▸ Vergi Detayları ────────────────────────────────── [Akordeon]    │
│ ▸ Lot/Seri Bilgileri ─────────────────────────────── [Akordeon]    │
│ ▸ Ek Bilgiler ────────────────────────────────────── [Akordeon]    │
│                                                                     │
│ ┌─ EXPORT ─────────────────────────────────────────────────────────┐ │
│ │ Hedef Program: [Logo Tiger ▼]                                    │ │
│ │ ☑ CSV  ☑ XML  ☐ PDF  ☐ JSON                                     │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│                              [İptal]  [Kaydet & Export]            │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2. Akordeon Detayları

**▸ Para Birimi & Kur**
```
Para Birimi: [TRY ▼]
Döviz Kuru: [______] (TRY dışında zorunlu)
```

**▸ İskonto Ayarları**
```
☐ Satır İskontosu Uygula (her kalemde % alanı açılır)
☐ Genel İskonto Uygula
  Tip: ○ Yüzde  ○ Tutar
  Değer: [______] % veya TL
```

**▸ Vergi Detayları**
```
Varsayılan KDV: [20% ▼]
Tevkifat: [Yok ▼] (5/10, 7/10, 9/10...)
KDV Muafiyet: [Yok ▼] (301, 302, 351...)
```

**▸ Lot/Seri Bilgileri**
```
(Her kalem için ayrı ayrı)
```

**▸ Ek Bilgiler**
```
Özel Kod: [________________]
Maliyet Merkezi: [________________]
Belge Notu: [________________]
```

### 6.3. Stok Sayfası - Hızlı Sevkiyat

Aynı modal, farklar:
- Malzeme readonly (set edilmiş)
- Tek kalem (çoklu ekleme yok)
- Miktar max = mevcut stok

### 6.4. Sevkiyatlar Listesi ✅ GÜNCELLEME

> **Not**: İşlem butonları tabloya EKLENMEDİ. 
> Satıra tıklanınca detay paneli açılıyor, işlemler oradan yapılıyor.

**Tablo Kolonları:**
| Kod | Müşteri | Tarih | Sevkiyat Kalemleri | Tutar | Durum |

**Filter Bar (action-bar içinde):**
- [+ Yeni Sevkiyat] butonu
- [Yenile] butonu  
- Status dropdown (Tümü, Beklemede, Export Edildi, Tamamlandı, İptal)
- Tarih dropdown (Tüm Zamanlar, Son 7/30/90 Gün)
- Arama inputu
- Sonuç sayısı

**Durum Kolonu:**
- Status badge (renk kodlu)
- Export/Import icon'ları (📤 uploaded, 📥 imported, ✅ completed)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ [+ Yeni Sevkiyat] [Yenile] [Status ▼] [Tarih ▼] [Ara...] 12 sevkiyat          │
├────────────────────────────────────────────────────────────────────────────────┤
│ Kod      | Müşteri       | Tarih    | Sevkiyat Kalemleri      | Tutar    | Durum        │
│ SHP-0045 | ABC Ltd.      | 08.12.25 | [01|M-001|100 adet]     | ₺6.000   | Beklemede    │
│ SHP-0044 | XYZ A.Ş.      | 07.12.25 | [01|M-002|50] [02|M-003]| ₺12.500  | Exported 📤  │
│ SHP-0043 | DEF Ltd.      | 06.12.25 | [01|M-004|25 adet]      | ₺3.200   | Tamamlandı ✅│
└────────────────────────────────────────────────────────────────────────────────┘

→ Satıra tıkla = Detay paneli açılır (Export/Import/Düzenle/Sil işlemleri burada)
```

### 6.5. Export Sonrası Modal

```
┌─────────────────────────────────────────────────────────────┐
│ ✅ Export Başarılı!                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 📥 Dosya indirildi: SHP-2025-0045.csv                       │
│                                                             │
│ Logo/Zirve'den işlem tamamlandıktan sonra                   │
│ onay dosyasını yükleyebilirsiniz:                           │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │        📁 Dosya Seç veya Sürükle                        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Resmi Belge No: [__________________]                        │
│                                                             │
│              [Şimdi Değil]  [Dosya Yükle & Tamamla]        │
│                                                             │
│ 💡 Daha sonra: Sevkiyatlar > SHP-0045 > Import              │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. VERİ AKIŞLARI

### 7.1. Yeni Sevkiyat (Full Flow)

```
1. Kullanıcı [+ Yeni Sevkiyat] tıklar
   ↓
2. Add Shipment Modal açılır
   ↓
3. Müşteri seçer (CRM'den veya inline yeni)
   → Yeni müşteri ise CRM'e de kaydedilir
   ↓
4. Kalem(ler) ekler
   → Her kalem için stok kontrolü yapılır
   → Yetersizse HATA gösterilir
   ↓
5. Belge tipi seçer (İrsaliye/Fatura/İkisi)
   → Fatura ise fiyatlar zorunlu
   ↓
6. Opsiyonel: Akordeonları açar (iskonto, tevkifat, lot...)
   ↓
7. Export formatları seçer
   ↓
8. [Kaydet & Export] tıklar
   ↓
9. Backend:
   - Shipment kaydı oluşturulur (status: pending)
   - Items kaydedilir (fiyatlar trigger ile hesaplanır)
   - Seçili formatlarda dosyalar üretilir
   ↓
10. Frontend:
    - Dosyalar indirilir
    - "Import yüklemek ister misiniz?" modal açılır
```

### 7.2. Import (Tamamlama)

```
1. Kullanıcı Logo/Zirve'de işlemi tamamlar
   ↓
2. BeePlan'da sevkiyatı bulur (status: exported)
   ↓
3. [📥 Import] tıklar
   ↓
4. Dosya seçer + Resmi belge no girer
   ↓
5. [Yükle] tıklar
   ↓
6. Backend:
   - Dosya DB'ye kaydedilir (importedFile)
   - externalDocNumber set edilir
   - status → 'completed'
   - STOK DÜŞÜRÜLÜR (her item için)
   ↓
7. Frontend:
   - Başarı mesajı
   - Stok güncellemeleri gösterilir
```

### 7.3. Stok Sayfasından Hızlı Sevkiyat

```
1. Stok tablosunda malzeme satırında [Sevk Et] tıklar
   ↓
2. Hızlı Sevkiyat Modal açılır
   - Malzeme: SET (readonly)
   - Max miktar: Mevcut stok
   ↓
3. Müşteri seçer
   ↓
4. Miktar girer (stok limitli)
   ↓
5. Belge tipi seçer
   ↓
6. [Kaydet & Export]
   ↓
7. Normal akış devam eder
```

---

## 8. IMPLEMENTATION PROMPTS

> Bu bölüm, implementasyonu adım adım yapabilmek için hazırlanmış prompt'ları içerir.
> Her prompt bağımsız çalıştırılabilir ve önceki adımların tamamlanmış olduğunu varsayar.

### 8.1. FAZ 1: Veritabanı

**Prompt 1.1: Yeni Tablolar**
```
INVOICE-EXPORT-INTEGRATION.md dokümanındaki "3.2, 3.3, 3.4" bölümlerini referans alarak:

1. materials.vat_exemption_codes tablosunu oluştur
2. materials.withholding_rates tablosunu oluştur  
3. materials.shipment_settings tablosunu oluştur
4. Örnek verileri ekle

SQL dosyası olarak migration oluşturma, doğrudan çalıştırılacak SQL ver.
```

**Prompt 1.2: Shipments Güncelleme**
```
INVOICE-EXPORT-INTEGRATION.md dokümanındaki "3.5" bölümünü referans alarak:

materials.shipments tablosuna yeni kolonları ekle.
IF NOT EXISTS kullan, mevcut veriyi bozma.
```

**Prompt 1.3: Shipment Items Güncelleme**
```
INVOICE-EXPORT-INTEGRATION.md dokümanındaki "3.6" bölümünü referans alarak:

materials.shipment_items tablosuna yeni kolonları ekle.
Trigger'ı oluştur (3.8).
```

**Prompt 1.4: Customers Güncelleme**
```
INVOICE-EXPORT-INTEGRATION.md dokümanındaki "3.7" bölümünü referans alarak:

quotes.customers tablosuna erpAccountCode ve erpSyncedAt kolonlarını ekle.
```

### 8.2. FAZ 2: Backend API

**Prompt 2.1: Lookup API'ler**
```
Yeni endpoint'ler oluştur:
- GET /api/materials/vat-exemptions
- GET /api/materials/withholding-rates
- GET /api/materials/settings
- PUT /api/materials/settings/:key

Mevcut materials routes yapısına uygun şekilde.
```

**Prompt 2.2: Shipment Service Güncelleme**
```
WebApp/domains/materials/api/services/shipmentService.js dosyasını güncelle:

1. createShipment fonksiyonuna yeni alanları ekle
2. Validasyon kurallarını uygula (INVOICE-EXPORT-INTEGRATION.md 4.2)
3. Stok kontrolü ekle (yetersizse hata)
```

**Prompt 2.3: Import Endpoint**
```
POST /api/materials/shipments/:id/import endpoint'i oluştur:

1. Dosya upload (multipart/form-data)
2. externalDocNumber kaydet
3. Status → completed
4. Stok düşür (her item için)
5. stockUpdates döndür
```

**Prompt 2.4: Export Service**
```
WebApp/domains/materials/api/services/exportService.js oluştur:

1. generateCSV fonksiyonu (ayraç settings'den)
2. generateXML fonksiyonu (Logo Tiger formatı)
3. generatePDF fonksiyonu (pdfkit)
4. generateJSON fonksiyonu
```

### 8.3. FAZ 3: Frontend UI

**Prompt 3.1: Add Shipment Modal Güncelleme**
```
Mevcut AddShipmentModal.jsx dosyasını INVOICE-EXPORT-INTEGRATION.md "6.1" bölümüne göre güncelle:

1. Müşteri seçimi (CRM dropdown + inline ekleme)
2. Belge tipi seçimi (irsaliye/fatura/ikisi)
3. Akordeon grupları (para birimi, iskonto, vergi, lot, ek bilgiler)
4. Export format seçimi
5. customerSnapshot oluşturma
```

**Prompt 3.2: Akordeon Componentleri**
```
6.2 bölümündeki akordeon detaylarını component olarak oluştur:

1. CurrencyAccordion.jsx
2. DiscountAccordion.jsx
3. TaxAccordion.jsx
4. LotSerialAccordion.jsx
5. ExtraInfoAccordion.jsx
```

**Prompt 3.3: Sevkiyatlar Listesi** ✅ TAMAMLANDI
```
6.4 bölümündeki tasarıma göre ShipmentsTable.jsx güncelle:

1. Yeni kolon sıralaması: Kod | Müşteri | Tarih | Sevkiyat Kalemleri | Tutar | Durum
2. Müşteri = customerCompany öncelikli
3. Tutar kolonu eklendi (grandTotal + para birimi)
4. Filtreler action-bar'a eklendi:
   - Status dropdown (Tümü, Beklemede, Export Edildi, Tamamlandı, İptal)
   - Tarih dropdown (Tüm Zamanlar, Son 7/30/90 Gün)
   - Arama inputu
   - Sonuç sayısı
5. Status icon'ları (📤 exported, 📥 imported, ✅ completed)
6. İşlem butonları tabloya EKLENMEDİ - detay panelinden yapılacak
```

**Prompt 3.4: Export Sonrası Modal**
```
6.5 bölümündeki tasarıma göre ExportSuccessModal.jsx oluştur:

1. Başarı mesajı
2. Dosya bilgisi
3. Import file upload alanı
4. Resmi belge no input
5. "Şimdi Değil" ve "Yükle" butonları
```

### 8.4. FAZ 4: Export Generators

**Prompt 4.1: CSV Generator**
```
5.1 bölümündeki format ve kolonlara göre csvGenerator.js oluştur:

1. Settings'den ayraç al
2. UTF-8 BOM ekle (Excel uyumu)
3. Tüm kolonları dahil et
```

**Prompt 4.2: XML Generator**
```
5.2 bölümündeki Logo Tiger XML formatına göre xmlGenerator.js oluştur:

1. Tüm alanları dahil et
2. CDATA kullan (özel karakterler için)
3. Zirve formatı için ayrı fonksiyon (opsiyonel)
```

**Prompt 4.3: PDF Generator**
```
5.3 bölümüne göre pdfGenerator.js oluştur:

1. pdfkit kullan
2. Şirket bilgilerini settings'den al
3. Fatura/İrsaliye başlığı
4. Ürün tablosu
5. Toplamlar
```

### 8.5. FAZ 5: Test & Polish

**Prompt 5.1: Validasyon Testleri**
```
Aşağıdaki senaryoları test et:

1. Fatura + fiyatsız item → HATA
2. Yetersiz stok → HATA
3. TRY dışı para birimi + exchangeRate yok → HATA
4. customerSnapshot eksik → HATA
```

**Prompt 5.2: E2E Test**
```
Tam akışı test et:

1. Yeni sevkiyat oluştur
2. CSV export et
3. Import yükle
4. Status = completed kontrol
5. Stok düştü mü kontrol
```

---

## 📋 CHECKLIST

### Veritabanı ✅ TAMAMLANDI
- [x] vat_exemption_codes tablosu (14 kayıt)
- [x] withholding_rates tablosu (7 kayıt)
- [x] shipment_settings tablosu (8 kayıt)
- [x] shipments yeni kolonlar (24 kolon)
- [x] shipment_items yeni kolonlar (4 kolon)
- [x] customers erpAccountCode
- [x] Trigger: calculate_shipment_item_totals

### Backend ✅ TAMAMLANDI
- [x] GET /vat-exemptions (lookupController.js)
- [x] GET /withholding-rates (lookupController.js)
- [x] GET/PUT/POST /settings (lookupController.js)
- [x] POST /shipments (shipmentService.js - yeni alanlarla)
- [x] validateStockAvailability (yetersizse BLOK)
- [x] validateInvoiceExportData (fatura validasyonu)
- [x] POST /shipments/:id/import (stok düşürme dahil)
- [x] GET /shipments/:id/export/:format

### Export Generators ✅ TAMAMLANDI (exportService.js)
- [x] generateCSV (ayraç settings'den, UTF-8 BOM)
- [x] generateXML (Logo Tiger formatı, CDATA)
- [x] generatePDF (pdfkit, firma bilgileri settings'den)
- [x] generateJSON (pretty-printed)

### Frontend
- [x] AddShipmentModal güncelleme (Prompt 3.1 - CRM dropdown, belge tipi, customerSnapshot)
- [x] Akordeon componentleri (Prompt 3.2 - 5 accordion: Currency, Discount, Tax, LotSerial, ExtraInfo)
- [x] ShipmentsTable güncelleme (Prompt 3.3 - yeni kolonlar, filtreler, status icon'ları)
- [x] ExportSuccessModal (Prompt 3.4 - başarı mesajı, dosya bilgisi, import upload)
- [ ] ImportModal

### Test
- [ ] Validasyon testleri
- [ ] E2E akış testi

---

**Migration Dosyası**: `WebApp/db/migrations/036_invoice_export_clean.sql`  
**Yedek Dosya**: `INVOICE-EXPORT-INTEGRATION.backup.md`  
**Son Güncelleme**: 8 Aralık 2025  
**Durum**: ✅ FAZ 1 (DB) + FAZ 2 (Backend) Tamamlandı - FAZ 3 (Frontend) Bekliyor
