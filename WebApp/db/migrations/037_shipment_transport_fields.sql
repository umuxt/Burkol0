-- =====================================================
-- Migration: 037_shipment_transport_fields.sql
-- Tarih: 9 Aralık 2025
-- Açıklama: Transport ve eksik shipment alanları
-- =====================================================
-- Bu migration:
-- 1. Transport bilgilerini ekler (şoför, plaka, TC)
-- 2. Related quote ID ekler (7-day rule için)
-- 3. Waybill date ekler (sevk tarihi)
-- 4. Currency alanları ekler
-- =====================================================

BEGIN;

-- =====================================================
-- PART 1: SHIPMENTS TABLOSU - Eksik Alanlar
-- =====================================================

ALTER TABLE materials.shipments

-- 7-day rule için bağlı teklif
ADD COLUMN IF NOT EXISTS "relatedQuoteId" VARCHAR(50),

-- Transport bilgileri (JSON)
-- { driverName, driverTc, plateNumber, deliveryPerson, receiverPerson, deliveryNote }
ADD COLUMN IF NOT EXISTS "transport" JSONB DEFAULT '{}',

-- Waybill/sevk tarihi
ADD COLUMN IF NOT EXISTS "waybillDate" DATE,

-- Para birimi
ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10) DEFAULT 'TRY',
ADD COLUMN IF NOT EXISTS "exchangeRate" DECIMAL(10,4) DEFAULT 1.0;

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_shipments_related_quote ON materials.shipments("relatedQuoteId") WHERE "relatedQuoteId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_waybill_date ON materials.shipments("waybillDate");

-- =====================================================
-- PART 2: SHIPMENT_ITEMS TABLOSU - Fiyat Alanları
-- =====================================================

-- Note: shipment_items'ta unitPrice, taxRate, discountPercent zaten var (036'da eklendi)
-- Sadece eksik olanları kontrol edelim

ALTER TABLE materials.shipment_items

-- Birim fiyat (fiyatlı irsaliyeler için)
ADD COLUMN IF NOT EXISTS "unitPrice" DECIMAL(15,2) DEFAULT 0,

-- KDV oranı
ADD COLUMN IF NOT EXISTS "taxRate" DECIMAL(5,2) DEFAULT 20,

-- Satır iskontosu (%)
ADD COLUMN IF NOT EXISTS "discountPercent" DECIMAL(5,2) DEFAULT 0,

-- Hesaplanan iskonto tutarı
ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(15,2) DEFAULT 0,

-- Ara toplam (unitPrice * quantity - discountAmount)
ADD COLUMN IF NOT EXISTS "subtotal" DECIMAL(15,2) DEFAULT 0,

-- KDV tutarı (subtotal * taxRate / 100)
ADD COLUMN IF NOT EXISTS "taxAmount" DECIMAL(15,2) DEFAULT 0,

-- Genel toplam (subtotal + taxAmount - withholdingAmount)
ADD COLUMN IF NOT EXISTS "totalAmount" DECIMAL(15,2) DEFAULT 0;

COMMIT;

-- =====================================================
-- VERIFICATION QUERY
-- =====================================================
-- Run this to verify columns were added:
/*
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'materials' 
  AND table_name = 'shipments'
  AND column_name IN ('relatedQuoteId', 'transport', 'waybillDate', 'currency', 'exchangeRate')
ORDER BY ordinal_position;

SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'materials' 
  AND table_name = 'shipment_items'
  AND column_name IN ('unitPrice', 'taxRate', 'discountPercent', 'discountAmount', 'subtotal', 'taxAmount', 'totalAmount')
ORDER BY ordinal_position;
*/
