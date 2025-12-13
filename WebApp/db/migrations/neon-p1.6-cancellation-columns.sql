-- P1.6 Migration: Add cancellation fields to shipments table
-- Run this on Neon production database

-- Check if columns already exist
DO $$ 
BEGIN
  -- Add cancellationReason
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'materials' 
      AND table_name = 'shipments' 
      AND column_name = 'cancellationReason'
  ) THEN
    ALTER TABLE materials.shipments ADD COLUMN "cancellationReason" TEXT;
    RAISE NOTICE 'Added column: cancellationReason';
  ELSE
    RAISE NOTICE 'Column already exists: cancellationReason';
  END IF;

  -- Add cancelledAt
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'materials' 
      AND table_name = 'shipments' 
      AND column_name = 'cancelledAt'
  ) THEN
    ALTER TABLE materials.shipments ADD COLUMN "cancelledAt" TIMESTAMPTZ;
    RAISE NOTICE 'Added column: cancelledAt';
  ELSE
    RAISE NOTICE 'Column already exists: cancelledAt';
  END IF;

  -- Add cancelledBy
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'materials' 
      AND table_name = 'shipments' 
      AND column_name = 'cancelledBy'
  ) THEN
    ALTER TABLE materials.shipments ADD COLUMN "cancelledBy" VARCHAR(255);
    RAISE NOTICE 'Added column: cancelledBy';
  ELSE
    RAISE NOTICE 'Column already exists: cancelledBy';
  END IF;
END $$;

-- Verify migration
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'materials' 
  AND table_name = 'shipments'
  AND column_name IN ('cancellationReason', 'cancelledAt', 'cancelledBy')
ORDER BY column_name;

-- Expected output:
-- cancelledAt       | timestamp with time zone | YES  | NULL
-- cancelledBy       | character varying        | YES  | NULL
-- cancellationReason| text                     | YES  | NULL
