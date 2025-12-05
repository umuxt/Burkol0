-- Migration: 026_option_code_system.sql
-- Purpose: Option Code System and Parameter Lookup Table (CLEAN START)
-- Date: 2024-12-05
-- PROMPT: Pre-D2-1

-- ============================================================================
-- PHASE 1: Clean form_field_options table
-- ============================================================================

-- 1.1: Remove deprecated columns
ALTER TABLE quotes.form_field_options DROP COLUMN IF EXISTS "optionValue";
ALTER TABLE quotes.form_field_options DROP COLUMN IF EXISTS "priceValue";

-- 1.2: Add optionCode column if not exists
ALTER TABLE quotes.form_field_options 
ADD COLUMN IF NOT EXISTS "optionCode" VARCHAR(20);

-- 1.3: Generate optionCode for existing records (FFOC-XXXX format)
UPDATE quotes.form_field_options 
SET "optionCode" = 'FFOC-' || LPAD(id::text, 4, '0')
WHERE "optionCode" IS NULL;

-- 1.4: Make optionCode NOT NULL
ALTER TABLE quotes.form_field_options 
ALTER COLUMN "optionCode" SET NOT NULL;

-- 1.5: Add UNIQUE constraint for optionCode (table-wide unique)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'form_field_options_code_unique'
  ) THEN
    ALTER TABLE quotes.form_field_options 
    ADD CONSTRAINT form_field_options_code_unique UNIQUE("optionCode");
  END IF;
END $$;

-- 1.6: Create index for optionCode
CREATE INDEX IF NOT EXISTS idx_form_field_options_code 
ON quotes.form_field_options("optionCode");

-- ============================================================================
-- PHASE 2: Create price_parameter_lookups table
-- ============================================================================

-- 2.1: Drop and recreate for clean start
DROP TABLE IF EXISTS quotes.price_parameter_lookups CASCADE;

-- 2.2: Create new lookup table
CREATE TABLE quotes.price_parameter_lookups (
  "id" SERIAL PRIMARY KEY,
  "parameterId" INTEGER NOT NULL REFERENCES quotes.price_parameters(id) ON DELETE CASCADE,
  "optionCode" VARCHAR(20) NOT NULL,  -- References form_field_options.optionCode
  "value" NUMERIC(15,4) NOT NULL,     -- Lookup value for this parameter
  "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  
  -- Each parameter can have only one lookup value per optionCode
  CONSTRAINT price_parameter_lookups_unique UNIQUE("parameterId", "optionCode")
);

-- 2.3: Add indexes for performance
CREATE INDEX idx_param_lookups_param_id 
ON quotes.price_parameter_lookups("parameterId");

CREATE INDEX idx_param_lookups_option_code 
ON quotes.price_parameter_lookups("optionCode");

-- ============================================================================
-- SCHEMA STRUCTURE (Final)
-- ============================================================================
/*
quotes.form_field_options:
  - id (PK)
  - fieldId (FK -> form_fields.id)
  - optionCode (UNIQUE, FFOC-XXXX format)
  - optionLabel
  - sortOrder
  - isActive
  - createdAt
  - updatedAt

quotes.price_parameter_lookups:
  - id (PK)
  - parameterId (FK -> price_parameters.id)
  - optionCode (references form_field_options.optionCode)
  - value (numeric lookup value)
  - createdAt
  - updatedAt
  - UNIQUE(parameterId, optionCode)

Usage:
  1. Each form field option gets a unique optionCode (FFOC-XXXX)
  2. Each price parameter can have different lookup values for the same option
  3. Example:
     - optionCode FFOC-0001 = "Steel"
     - Parameter "Unit Price" + FFOC-0001 = 150
     - Parameter "Labor Hours" + FFOC-0001 = 50
*/
