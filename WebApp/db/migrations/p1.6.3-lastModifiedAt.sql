-- P1.6.3 Migration: Add lastModifiedAt column for export change tracking
-- Run this on both Local and Neon databases

-- Add lastModifiedAt column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'materials' 
      AND table_name = 'shipments' 
      AND column_name = 'lastModifiedAt'
  ) THEN
    ALTER TABLE materials.shipments 
      ADD COLUMN "lastModifiedAt" TIMESTAMPTZ;
    
    RAISE NOTICE 'Added column: lastModifiedAt';
  ELSE
    RAISE NOTICE 'Column already exists: lastModifiedAt';
  END IF;
END $$;

-- Initialize lastModifiedAt with updatedAt for existing records
UPDATE materials.shipments
SET "lastModifiedAt" = "updatedAt"
WHERE "lastModifiedAt" IS NULL;

-- Verify migration
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns 
WHERE table_schema = 'materials' 
  AND table_name = 'shipments'
  AND column_name = 'lastModifiedAt';

-- Expected output:
-- lastModifiedAt | timestamp with time zone | YES
