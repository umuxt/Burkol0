-- =====================================================
-- Migration: Shipment Items Support
-- Adds multi-item support to shipments (like orders/order_items)
-- Run this migration on materials schema
-- =====================================================

-- Start transaction
BEGIN;

-- =====================================================
-- 1. Create shipment_items table
-- =====================================================
CREATE TABLE IF NOT EXISTS materials.shipment_items (
    id SERIAL PRIMARY KEY,
    
    -- Relationships
    "shipmentId" INTEGER NOT NULL REFERENCES materials.shipments(id) ON DELETE CASCADE,
    "materialCode" VARCHAR(100) NOT NULL,
    
    -- Item details
    quantity NUMERIC(15,4) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(50) DEFAULT 'adet',
    "lotNumber" VARCHAR(100),
    notes TEXT,
    
    -- Stock movement reference (for traceability)
    "stockMovementId" INTEGER REFERENCES materials.stock_movements(id),
    
    -- Timestamps
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment ON materials.shipment_items("shipmentId");
CREATE INDEX IF NOT EXISTS idx_shipment_items_material ON materials.shipment_items("materialCode");

COMMENT ON TABLE materials.shipment_items IS 'Individual items within a shipment (one shipment can have many items)';
COMMENT ON COLUMN materials.shipment_items."shipmentId" IS 'Parent shipment ID';
COMMENT ON COLUMN materials.shipment_items."materialCode" IS 'Material code (M-xxxxxx)';
COMMENT ON COLUMN materials.shipment_items.quantity IS 'Quantity shipped';
COMMENT ON COLUMN materials.shipment_items."stockMovementId" IS 'Reference to stock movement for audit trail';

-- =====================================================
-- 2. Add new columns to shipments table
-- =====================================================

-- Shipment code for display (SHP-2025-0001 format)
ALTER TABLE materials.shipments 
ADD COLUMN IF NOT EXISTS "shipmentCode" VARCHAR(50);

-- Sequence number for the year
ALTER TABLE materials.shipments 
ADD COLUMN IF NOT EXISTS "shipmentSequence" INTEGER;

-- Customer information
ALTER TABLE materials.shipments 
ADD COLUMN IF NOT EXISTS "customerName" VARCHAR(200);

ALTER TABLE materials.shipments 
ADD COLUMN IF NOT EXISTS "customerCompany" VARCHAR(200);

ALTER TABLE materials.shipments 
ADD COLUMN IF NOT EXISTS "deliveryAddress" TEXT;

-- Rename description to notes for consistency (if not already)
-- Note: Only run if description column exists and notes doesn't
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'materials' 
        AND table_name = 'shipments' 
        AND column_name = 'description'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'materials' 
        AND table_name = 'shipments' 
        AND column_name = 'notes'
    ) THEN
        ALTER TABLE materials.shipments RENAME COLUMN description TO notes;
    END IF;
END $$;

-- Add notes if it doesn't exist (in case description didn't exist either)
ALTER TABLE materials.shipments 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- =====================================================
-- 3. Create shipment code sequence
-- =====================================================
CREATE SEQUENCE IF NOT EXISTS materials.shipment_code_seq START 1;

-- Create function to generate shipment code
CREATE OR REPLACE FUNCTION materials.generate_shipment_code()
RETURNS VARCHAR(50) AS $$
DECLARE
    current_year INTEGER;
    next_seq INTEGER;
    result VARCHAR(50);
BEGIN
    current_year := EXTRACT(YEAR FROM CURRENT_DATE);
    
    -- Check if we need to reset sequence for new year
    -- (In production, you might want a more sophisticated approach)
    SELECT COALESCE(MAX("shipmentSequence"), 0) + 1 
    INTO next_seq 
    FROM materials.shipments 
    WHERE EXTRACT(YEAR FROM "createdAt") = current_year;
    
    result := 'SHP-' || current_year || '-' || LPAD(next_seq::TEXT, 4, '0');
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. Migrate existing shipment data
-- =====================================================

-- Generate shipment codes for existing records without one
UPDATE materials.shipments s
SET 
    "shipmentCode" = 'SHP-' || EXTRACT(YEAR FROM s."createdAt")::TEXT || '-' || LPAD(
        (ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM s."createdAt") ORDER BY s.id))::TEXT, 
        4, 
        '0'
    ),
    "shipmentSequence" = (ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM s."createdAt") ORDER BY s.id))::INTEGER
WHERE s."shipmentCode" IS NULL;

-- Migrate existing single-item shipments to shipment_items
-- Only for records that have productCode but no items in shipment_items
INSERT INTO materials.shipment_items ("shipmentId", "materialCode", quantity, unit, notes, "createdAt", "updatedAt")
SELECT 
    s.id,
    s."productCode",
    COALESCE(s."shipmentQuantity", 0),
    'adet',
    s.description,
    s."createdAt",
    s."updatedAt"
FROM materials.shipments s
WHERE s."productCode" IS NOT NULL 
  AND s."productCode" != ''
  AND s."shipmentQuantity" > 0
  AND NOT EXISTS (
    SELECT 1 FROM materials.shipment_items si WHERE si."shipmentId" = s.id
  );

-- =====================================================
-- 5. Create helpful views
-- =====================================================

-- View for shipments with item counts
CREATE OR REPLACE VIEW materials.v_shipments_summary AS
SELECT 
    s.*,
    COALESCE(items.item_count, 0) as "itemCount",
    COALESCE(items.total_quantity, 0) as "totalQuantity"
FROM materials.shipments s
LEFT JOIN (
    SELECT 
        "shipmentId",
        COUNT(*) as item_count,
        SUM(quantity) as total_quantity
    FROM materials.shipment_items
    GROUP BY "shipmentId"
) items ON items."shipmentId" = s.id;

-- View for shipment items with material names
CREATE OR REPLACE VIEW materials.v_shipment_items_detail AS
SELECT 
    si.*,
    m.name as "materialName",
    m.category as "materialCategory",
    s."shipmentCode",
    s.status as "shipmentStatus",
    s."createdAt" as "shipmentDate"
FROM materials.shipment_items si
JOIN materials.shipments s ON s.id = si."shipmentId"
LEFT JOIN materials.materials m ON m.code = si."materialCode";

-- =====================================================
-- 6. Add trigger for updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION materials.update_shipment_items_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shipment_items_updated_at ON materials.shipment_items;
CREATE TRIGGER shipment_items_updated_at
    BEFORE UPDATE ON materials.shipment_items
    FOR EACH ROW
    EXECUTE FUNCTION materials.update_shipment_items_timestamp();

-- =====================================================
-- 7. Add constraint for unique shipment codes
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'shipments_shipment_code_unique'
    ) THEN
        ALTER TABLE materials.shipments 
        ADD CONSTRAINT shipments_shipment_code_unique UNIQUE ("shipmentCode");
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Constraint may already exist or data has duplicates';
END $$;

-- Commit transaction
COMMIT;

-- =====================================================
-- Rollback script (in case needed)
-- =====================================================
/*
BEGIN;

DROP VIEW IF EXISTS materials.v_shipment_items_detail;
DROP VIEW IF EXISTS materials.v_shipments_summary;

DROP TRIGGER IF EXISTS shipment_items_updated_at ON materials.shipment_items;
DROP FUNCTION IF EXISTS materials.update_shipment_items_timestamp();
DROP FUNCTION IF EXISTS materials.generate_shipment_code();
DROP SEQUENCE IF EXISTS materials.shipment_code_seq;

DROP TABLE IF EXISTS materials.shipment_items;

ALTER TABLE materials.shipments DROP COLUMN IF EXISTS "shipmentCode";
ALTER TABLE materials.shipments DROP COLUMN IF EXISTS "shipmentSequence";
ALTER TABLE materials.shipments DROP COLUMN IF EXISTS "customerName";
ALTER TABLE materials.shipments DROP COLUMN IF EXISTS "customerCompany";
ALTER TABLE materials.shipments DROP COLUMN IF EXISTS "deliveryAddress";

COMMIT;
*/
