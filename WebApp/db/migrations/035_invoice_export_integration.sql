-- =====================================================
-- Migration: 035_invoice_export_integration.sql
-- Tarih: 2025-12-08
-- Açıklama: Invoice & Waybill Export Integration
-- Referans: INVOICE-EXPORT-INTEGRATION.md
-- =====================================================

-- Start transaction
BEGIN;

-- =====================================================
-- PART 1: materials.shipments - Invoice/Waybill Fields
-- =====================================================

ALTER TABLE materials.shipments

-- Müşteri İlişkisi (Foreign Key + Snapshot Hybrid)
ADD COLUMN IF NOT EXISTS "customerId" INTEGER REFERENCES quotes.customers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "customerSnapshot" JSONB,

-- Quote İlişkisi (Parçalı Sevkiyat için)
ADD COLUMN IF NOT EXISTS "quoteId" VARCHAR(50) REFERENCES quotes.quotes(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "isPartialShipment" BOOLEAN DEFAULT false,

-- Belge Bilgileri
ADD COLUMN IF NOT EXISTS "documentType" VARCHAR(20) DEFAULT 'waybill', -- 'waybill' | 'invoice' | 'both'
ADD COLUMN IF NOT EXISTS "includePrice" BOOLEAN DEFAULT false,

-- Fiyat Bilgileri (Fatura için)
ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) DEFAULT 'TRY',
ADD COLUMN IF NOT EXISTS "subtotal" DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "taxTotal" DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "grandTotal" DECIMAL(15,2) DEFAULT 0,

-- Export Durumu
ADD COLUMN IF NOT EXISTS "exportedFormats" JSONB DEFAULT '[]'::jsonb, -- ["csv", "xml", "pdf"]
ADD COLUMN IF NOT EXISTS "exportedAt" TIMESTAMPTZ,

-- Yasal Alanlar (Denormalized - Snapshot'tan da alınabilir ama export hızı için)
ADD COLUMN IF NOT EXISTS "customerTaxOffice" VARCHAR(200),
ADD COLUMN IF NOT EXISTS "customerTaxNumber" VARCHAR(11),
ADD COLUMN IF NOT EXISTS "customerCity" VARCHAR(100),
ADD COLUMN IF NOT EXISTS "customerDistrict" VARCHAR(100),
ADD COLUMN IF NOT EXISTS "customerPhone" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "customerEmail" VARCHAR(255);

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_shipments_customer_id ON materials.shipments("customerId");
CREATE INDEX IF NOT EXISTS idx_shipments_quote_id ON materials.shipments("quoteId");
CREATE INDEX IF NOT EXISTS idx_shipments_document_type ON materials.shipments("documentType");
CREATE INDEX IF NOT EXISTS idx_shipments_exported_at ON materials.shipments("exportedAt");

-- Kolonlar hakkında açıklamalar
COMMENT ON COLUMN materials.shipments."customerId" IS 'Foreign key to quotes.customers - NULL if unregistered customer';
COMMENT ON COLUMN materials.shipments."customerSnapshot" IS 'JSONB snapshot of customer data at shipment creation time (immutable historical record)';
COMMENT ON COLUMN materials.shipments."quoteId" IS 'Reference to quote for partial shipment tracking';
COMMENT ON COLUMN materials.shipments."isPartialShipment" IS 'True if this is a partial shipment of a larger quote';
COMMENT ON COLUMN materials.shipments."documentType" IS 'waybill (no price) | invoice (with price) | both';
COMMENT ON COLUMN materials.shipments."includePrice" IS 'Include pricing in export files (required for invoice)';
COMMENT ON COLUMN materials.shipments."exportedFormats" IS 'Array of exported formats: ["csv", "xml", "pdf", "json"]';

-- =====================================================
-- PART 2: materials.shipment_items - Pricing Fields
-- =====================================================

ALTER TABLE materials.shipment_items

-- Fiyat Bilgileri (Fatura için)
ADD COLUMN IF NOT EXISTS "unitPrice" DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS "taxRate" INTEGER DEFAULT 20, -- %0, %1, %8, %10, %18, %20
ADD COLUMN IF NOT EXISTS "lineSubtotal" DECIMAL(15,2) DEFAULT 0, -- unitPrice * quantity
ADD COLUMN IF NOT EXISTS "lineTax" DECIMAL(15,2) DEFAULT 0, -- lineSubtotal * (taxRate/100)
ADD COLUMN IF NOT EXISTS "lineTotal" DECIMAL(15,2) DEFAULT 0, -- lineSubtotal + lineTax

-- Parçalı Sevkiyat Takibi
ADD COLUMN IF NOT EXISTS "quoteItemId" INTEGER,
ADD COLUMN IF NOT EXISTS "isPartial" BOOLEAN DEFAULT false;

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_shipment_items_quote_item ON materials.shipment_items("quoteItemId");

-- Kolonlar hakkında açıklamalar
COMMENT ON COLUMN materials.shipment_items."unitPrice" IS 'Unit price for invoice (0 for waybill-only)';
COMMENT ON COLUMN materials.shipment_items."taxRate" IS 'VAT rate percentage (0, 1, 8, 10, 18, 20)';
COMMENT ON COLUMN materials.shipment_items."lineSubtotal" IS 'Calculated: unitPrice * quantity';
COMMENT ON COLUMN materials.shipment_items."lineTax" IS 'Calculated: lineSubtotal * (taxRate/100)';
COMMENT ON COLUMN materials.shipment_items."lineTotal" IS 'Calculated: lineSubtotal + lineTax';

-- =====================================================
-- PART 3: quotes.customers - ERP Integration Fields
-- =====================================================

ALTER TABLE quotes.customers

-- Eksik Yasal Alanlar (zaten varsa SKIP)
ADD COLUMN IF NOT EXISTS "city" VARCHAR(100),
ADD COLUMN IF NOT EXISTS "district" VARCHAR(100),
ADD COLUMN IF NOT EXISTS "postalCode" VARCHAR(20),

-- Logo/Zirve Entegrasyonu
ADD COLUMN IF NOT EXISTS "erpAccountCode" VARCHAR(50),
ADD COLUMN IF NOT EXISTS "erpSyncedAt" TIMESTAMPTZ;

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_customers_erp_code ON quotes.customers("erpAccountCode");
CREATE INDEX IF NOT EXISTS idx_customers_city ON quotes.customers("city");

-- Kolonlar hakkında açıklamalar
COMMENT ON COLUMN quotes.customers."erpAccountCode" IS 'Customer account code in ERP system (e.g., 120.01.001 in Logo)';
COMMENT ON COLUMN quotes.customers."erpSyncedAt" IS 'Last sync timestamp with ERP system';

-- =====================================================
-- PART 4: Helper Functions
-- =====================================================

-- Function: Calculate shipment totals from items
CREATE OR REPLACE FUNCTION materials.update_shipment_totals()
RETURNS TRIGGER AS $$
BEGIN
  -- Update parent shipment totals when items change
  UPDATE materials.shipments
  SET 
    "subtotal" = (
      SELECT COALESCE(SUM("lineSubtotal"), 0)
      FROM materials.shipment_items
      WHERE "shipmentId" = NEW."shipmentId"
    ),
    "taxTotal" = (
      SELECT COALESCE(SUM("lineTax"), 0)
      FROM materials.shipment_items
      WHERE "shipmentId" = NEW."shipmentId"
    ),
    "grandTotal" = (
      SELECT COALESCE(SUM("lineTotal"), 0)
      FROM materials.shipment_items
      WHERE "shipmentId" = NEW."shipmentId"
    ),
    "updatedAt" = NOW()
  WHERE id = NEW."shipmentId";
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update shipment totals on item insert/update
DROP TRIGGER IF EXISTS trg_update_shipment_totals ON materials.shipment_items;
CREATE TRIGGER trg_update_shipment_totals
  AFTER INSERT OR UPDATE ON materials.shipment_items
  FOR EACH ROW
  EXECUTE FUNCTION materials.update_shipment_totals();

-- =====================================================
-- PART 5: Data Validation
-- =====================================================

-- Verify all columns exist
DO $$
DECLARE
  missing_columns TEXT[];
BEGIN
  -- Check shipments columns
  SELECT array_agg(col) INTO missing_columns
  FROM (VALUES 
    ('customerId'), ('customerSnapshot'), ('quoteId'), ('isPartialShipment'),
    ('documentType'), ('includePrice'), ('currency'), ('subtotal'), ('taxTotal'),
    ('grandTotal'), ('exportedFormats'), ('exportedAt'),
    ('customerTaxOffice'), ('customerTaxNumber'), ('customerCity'),
    ('customerDistrict'), ('customerPhone'), ('customerEmail')
  ) AS expected(col)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'materials'
    AND table_name = 'shipments'
    AND column_name = expected.col
  );
  
  IF array_length(missing_columns, 1) > 0 THEN
    RAISE EXCEPTION 'Missing columns in materials.shipments: %', array_to_string(missing_columns, ', ');
  END IF;
  
  -- Check shipment_items columns
  SELECT array_agg(col) INTO missing_columns
  FROM (VALUES 
    ('unitPrice'), ('taxRate'), ('lineSubtotal'), ('lineTax'), ('lineTotal'),
    ('quoteItemId'), ('isPartial')
  ) AS expected(col)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'materials'
    AND table_name = 'shipment_items'
    AND column_name = expected.col
  );
  
  IF array_length(missing_columns, 1) > 0 THEN
    RAISE EXCEPTION 'Missing columns in materials.shipment_items: %', array_to_string(missing_columns, ', ');
  END IF;
  
  RAISE NOTICE '✅ Migration 035 completed successfully';
  RAISE NOTICE '✅ All columns verified in materials.shipments';
  RAISE NOTICE '✅ All columns verified in materials.shipment_items';
  RAISE NOTICE '✅ Helper functions and triggers created';
END $$;

-- Commit transaction
COMMIT;

-- =====================================================
-- Migration Notes:
-- =====================================================
-- 1. customerSnapshot: JSONB - tarihi kayıt için zorunlu (müşteri bilgileri sonradan değişebilir)
-- 2. Denormalized fields: customerTaxOffice, customerTaxNumber vb. export hızı için
-- 3. Snapshot yoksa export'ta bu alanlar kullanılır (fallback)
-- 4. includePrice: true ise fatura, false ise sadece irsaliye
-- 5. Trigger: shipment_items değiştiğinde totals otomatik hesaplanır
