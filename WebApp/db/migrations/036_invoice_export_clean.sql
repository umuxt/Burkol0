-- =====================================================
-- Migration: 036_invoice_export_clean.sql
-- Tarih: 8 Aralık 2025
-- Açıklama: Temiz Invoice/Waybill Export Yapısı
-- Referans: INVOICE-EXPORT-INTEGRATION.md v2.0
-- =====================================================
-- Bu migration:
-- 1. Eski waybill-integration kalıntılarını temizler
-- 2. Yeni tabloları oluşturur
-- 3. Mevcut tablolara eksik kolonları ekler
-- 4. Trigger'ları günceller
-- =====================================================

BEGIN;

-- =====================================================
-- PART 0: TEMİZLİK - Eski/Gereksiz yapıları kaldır
-- =====================================================

-- Eski trigger'ı kaldır (duplicate olabilir)
DROP TRIGGER IF EXISTS shipment_items_calculate_totals ON materials.shipment_items;

-- Eski function'ı kaldır (yeniden oluşturulacak)
DROP FUNCTION IF EXISTS materials.calculate_shipment_item_totals() CASCADE;

-- =====================================================
-- PART 1: YENİ TABLOLAR
-- =====================================================

-- 1.1 KDV Muafiyet Kodları
CREATE TABLE IF NOT EXISTS materials.vat_exemption_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Örnek veriler (yoksa ekle)
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
('351', 'Tevkifat (Kısmi)')
ON CONFLICT (code) DO NOTHING;

-- 1.2 Tevkifat Oranları
CREATE TABLE IF NOT EXISTS materials.withholding_rates (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    rate DECIMAL(5,4) NOT NULL,
    name VARCHAR(200) NOT NULL,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO materials.withholding_rates (code, rate, name) VALUES
('1/10', 0.1000, '1/10 Tevkifat'),
('2/10', 0.2000, '2/10 Tevkifat'),
('3/10', 0.3000, '3/10 Tevkifat'),
('4/10', 0.4000, '4/10 Tevkifat'),
('5/10', 0.5000, '5/10 Tevkifat - Yapım işleri'),
('7/10', 0.7000, '7/10 Tevkifat - Danışmanlık'),
('9/10', 0.9000, '9/10 Tevkifat - İşgücü')
ON CONFLICT (code) DO NOTHING;

-- 1.3 Sistem Ayarları
CREATE TABLE IF NOT EXISTS materials.shipment_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" INTEGER
);

INSERT INTO materials.shipment_settings (key, value, description) VALUES
('csv_delimiter', ';', 'CSV dosya ayracı: ; veya , veya tab'),
('default_currency', 'TRY', 'Varsayılan para birimi'),
('default_tax_rate', '20', 'Varsayılan KDV oranı'),
('export_target', 'logo_tiger', 'Hedef program: logo_tiger, logo_go, zirve, excel'),
('company_name', 'Firma Adı', 'PDF için firma adı'),
('company_address', 'Firma Adresi', 'PDF için adres'),
('company_tax_office', 'Vergi Dairesi', 'PDF için VD'),
('company_tax_number', '0000000000', 'PDF için VKN')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- PART 2: SHIPMENTS TABLOSU GÜNCELLEMESİ
-- =====================================================

ALTER TABLE materials.shipments

-- Müşteri FK (quotes.customers ile ilişki)
ADD COLUMN IF NOT EXISTS "customerId" INTEGER REFERENCES quotes.customers(id) ON DELETE SET NULL,

-- Müşteri Snapshot (tarihsel kayıt)
ADD COLUMN IF NOT EXISTS "customerSnapshot" JSONB,

-- Farklı teslimat adresi
ADD COLUMN IF NOT EXISTS "useAlternateDelivery" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "alternateDeliveryAddress" JSONB,

-- Belge tipi (waybill/invoice/both)
ADD COLUMN IF NOT EXISTS "documentType" VARCHAR(20) DEFAULT 'waybill',
ADD COLUMN IF NOT EXISTS "includePrice" BOOLEAN DEFAULT false,

-- İskonto (genel belge iskontosu)
ADD COLUMN IF NOT EXISTS "discountType" VARCHAR(20),
ADD COLUMN IF NOT EXISTS "discountValue" DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "discountTotal" DECIMAL(15,2) DEFAULT 0,

-- Toplamlar
ADD COLUMN IF NOT EXISTS "subtotal" DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "taxTotal" DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "withholdingTotal" DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "grandTotal" DECIMAL(15,2) DEFAULT 0,

-- Export geçmişi
ADD COLUMN IF NOT EXISTS "exportHistory" JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "lastExportedAt" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "exportTarget" VARCHAR(50),

-- Import bilgileri
ADD COLUMN IF NOT EXISTS "importedAt" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "importedBy" INTEGER,
ADD COLUMN IF NOT EXISTS "importedFile" BYTEA,
ADD COLUMN IF NOT EXISTS "importedFileName" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "externalDocNumber" VARCHAR(100),

-- Ek bilgiler
ADD COLUMN IF NOT EXISTS "specialCode" VARCHAR(100),
ADD COLUMN IF NOT EXISTS "costCenter" VARCHAR(100),
ADD COLUMN IF NOT EXISTS "documentNotes" TEXT;

-- Yeni indeksler
CREATE INDEX IF NOT EXISTS idx_shipments_customer_id ON materials.shipments("customerId");
CREATE INDEX IF NOT EXISTS idx_shipments_document_type ON materials.shipments("documentType");
CREATE INDEX IF NOT EXISTS idx_shipments_external_doc ON materials.shipments("externalDocNumber") WHERE "externalDocNumber" IS NOT NULL;

-- =====================================================
-- PART 3: SHIPMENT_ITEMS TABLOSU GÜNCELLEMESİ
-- =====================================================

ALTER TABLE materials.shipment_items

-- Tevkifat ve muafiyet FK'ları
ADD COLUMN IF NOT EXISTS "vatExemptionId" INTEGER REFERENCES materials.vat_exemption_codes(id),
ADD COLUMN IF NOT EXISTS "withholdingRateId" INTEGER REFERENCES materials.withholding_rates(id),
ADD COLUMN IF NOT EXISTS "withholdingAmount" DECIMAL(15,2) DEFAULT 0,

-- Satır bazlı hesaplanan alanlar (mevcut isimleri koruyoruz)
-- subtotal, taxAmount, totalAmount, discountPercent, discountAmount ZATEN VAR

-- Seri numarası (mevcut serialNumbers ARRAY, text de ekleyelim)
ADD COLUMN IF NOT EXISTS "serialNumber" VARCHAR(100);

-- =====================================================
-- PART 4: CUSTOMERS TABLOSU GÜNCELLEMESİ
-- =====================================================

ALTER TABLE quotes.customers
ADD COLUMN IF NOT EXISTS "erpAccountCode" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "erpSyncedAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_erp_code ON quotes.customers("erpAccountCode") WHERE "erpAccountCode" IS NOT NULL;

-- =====================================================
-- PART 5: TRIGGER - Fiyat Otomatik Hesaplama
-- =====================================================

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

-- Trigger oluştur
CREATE TRIGGER shipment_items_calculate_totals
    BEFORE INSERT OR UPDATE ON materials.shipment_items
    FOR EACH ROW
    EXECUTE FUNCTION materials.calculate_shipment_item_totals();

-- =====================================================
-- PART 6: DOĞRULAMA
-- =====================================================

DO $$
BEGIN
    -- Yeni tablolar kontrol
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'materials' AND table_name = 'vat_exemption_codes') THEN
        RAISE EXCEPTION 'vat_exemption_codes tablosu oluşturulamadı';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'materials' AND table_name = 'withholding_rates') THEN
        RAISE EXCEPTION 'withholding_rates tablosu oluşturulamadı';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'materials' AND table_name = 'shipment_settings') THEN
        RAISE EXCEPTION 'shipment_settings tablosu oluşturulamadı';
    END IF;
    
    RAISE NOTICE '✅ Migration 036 başarıyla tamamlandı';
    RAISE NOTICE '✅ 3 yeni tablo oluşturuldu';
    RAISE NOTICE '✅ shipments tablosu güncellendi';
    RAISE NOTICE '✅ shipment_items tablosu güncellendi';
    RAISE NOTICE '✅ customers tablosu güncellendi';
    RAISE NOTICE '✅ Trigger güncellendi';
END $$;

COMMIT;
