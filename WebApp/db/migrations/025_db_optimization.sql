-- ============================================================
-- PROMPT-B0: Database Optimization Migration
-- Date: 4 Aralık 2025
-- Description: quotes schema optimization
-- 
-- CHANGES:
--   B0.1: Merge price_formulas into price_settings
--   B0.2: Update quotes table (priceSettingId, remove duplicates)
--   B0.3: Clean up price_parameters
--   B0.4: Update quote_form_data FK behavior
--
-- BACKUP: db/backups/quotes_schema_backup_20251204.sql
-- ============================================================

BEGIN;

-- ============================================================
-- PHASE B0.1: Merge price_formulas into price_settings
-- ============================================================

-- 1.1: Add formulaExpression column to price_settings
ALTER TABLE quotes.price_settings 
ADD COLUMN IF NOT EXISTS "formulaExpression" TEXT;

-- 1.2: Migrate formula data from price_formulas to price_settings
UPDATE quotes.price_settings ps
SET "formulaExpression" = (
  SELECT pf."formulaExpression" 
  FROM quotes.price_formulas pf 
  WHERE pf."settingId" = ps.id 
  LIMIT 1
);

-- 1.3: Drop the FK from quotes to price_formulas first
ALTER TABLE quotes.quotes 
DROP CONSTRAINT IF EXISTS quotes_price_formula_id_foreign;

-- 1.4: Drop price_formulas table (HARD DELETE)
DROP TABLE IF EXISTS quotes.price_formulas CASCADE;

-- ============================================================
-- PHASE B0.2: Update quotes table
-- ============================================================

-- 2.1: Add priceSettingId column (direct reference instead of via price_formulas)
ALTER TABLE quotes.quotes 
ADD COLUMN IF NOT EXISTS "priceSettingId" INTEGER;

-- 2.2: Add formTemplateCode column (for version tracking)
ALTER TABLE quotes.quotes 
ADD COLUMN IF NOT EXISTS "formTemplateCode" VARCHAR(100);

-- 2.3: Add priceSettingCode column (for version tracking)
ALTER TABLE quotes.quotes 
ADD COLUMN IF NOT EXISTS "priceSettingCode" VARCHAR(100);

-- 2.4: Rename priceFormulaVersion to priceSettingVersion
ALTER TABLE quotes.quotes 
RENAME COLUMN "priceFormulaVersion" TO "priceSettingVersion";

-- 2.5: Backfill priceSettingId from active price_settings
-- (Since we're doing hard delete, just set to the active setting)
UPDATE quotes.quotes q
SET "priceSettingId" = (
  SELECT id FROM quotes.price_settings WHERE "isActive" = true LIMIT 1
)
WHERE q."priceSettingId" IS NULL;

-- 2.6: Backfill formTemplateCode from form_templates
UPDATE quotes.quotes q
SET "formTemplateCode" = (
  SELECT ft.code 
  FROM quotes.form_templates ft 
  WHERE ft.id = q."formTemplateId"
)
WHERE q."formTemplateCode" IS NULL AND q."formTemplateId" IS NOT NULL;

-- 2.7: Backfill priceSettingCode from price_settings
UPDATE quotes.quotes q
SET "priceSettingCode" = (
  SELECT ps.code 
  FROM quotes.price_settings ps 
  WHERE ps.id = q."priceSettingId"
)
WHERE q."priceSettingCode" IS NULL AND q."priceSettingId" IS NOT NULL;

-- 2.8: Remove duplicate column priceCalculatedAt (keep lastCalculatedAt)
ALTER TABLE quotes.quotes 
DROP COLUMN IF EXISTS "priceCalculatedAt";

-- 2.9: Remove old priceFormulaId column
ALTER TABLE quotes.quotes 
DROP COLUMN IF EXISTS "priceFormulaId";

-- 2.10: Add FK constraint for priceSettingId
ALTER TABLE quotes.quotes 
ADD CONSTRAINT quotes_price_setting_id_fk 
FOREIGN KEY ("priceSettingId") REFERENCES quotes.price_settings(id);

-- 2.11: Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_quotes_price_setting_id ON quotes.quotes("priceSettingId");
CREATE INDEX IF NOT EXISTS idx_quotes_form_template_code ON quotes.quotes("formTemplateCode");
CREATE INDEX IF NOT EXISTS idx_quotes_price_setting_code ON quotes.quotes("priceSettingCode");

-- ============================================================
-- PHASE B0.3: Clean up price_parameters
-- ============================================================

-- 3.1: Make settingId NOT NULL (all parameters must belong to a setting)
-- First, delete orphan parameters
DELETE FROM quotes.price_parameters WHERE "settingId" IS NULL;

-- 3.2: Add NOT NULL constraint
ALTER TABLE quotes.price_parameters 
ALTER COLUMN "settingId" SET NOT NULL;

-- 3.3: Add unique constraint on (settingId, code)
ALTER TABLE quotes.price_parameters 
DROP CONSTRAINT IF EXISTS price_parameters_setting_code_unique;

ALTER TABLE quotes.price_parameters 
ADD CONSTRAINT price_parameters_setting_code_unique UNIQUE ("settingId", "code");

-- 3.4: Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_price_parameters_setting_id ON quotes.price_parameters("settingId");
CREATE INDEX IF NOT EXISTS idx_price_parameters_type ON quotes.price_parameters(type);

-- ============================================================
-- PHASE B0.4: Update quote_form_data FK behavior
-- ============================================================

-- 4.1: Update FK to SET NULL on delete (instead of cascade)
ALTER TABLE quotes.quote_form_data 
DROP CONSTRAINT IF EXISTS quote_form_data_field_id_foreign;

-- Make fieldId nullable first
ALTER TABLE quotes.quote_form_data 
ALTER COLUMN "fieldId" DROP NOT NULL;

ALTER TABLE quotes.quote_form_data 
ADD CONSTRAINT quote_form_data_field_id_fk 
FOREIGN KEY ("fieldId") REFERENCES quotes.form_fields(id) ON DELETE SET NULL;

-- ============================================================
-- VERIFICATION QUERIES (run these after migration)
-- ============================================================

-- Check price_settings has formulaExpression
-- SELECT id, code, "formulaExpression" FROM quotes.price_settings;

-- Check quotes has new columns
-- SELECT id, "priceSettingId", "formTemplateCode", "priceSettingCode" FROM quotes.quotes LIMIT 5;

-- Verify price_formulas is dropped
-- SELECT COUNT(*) FROM quotes.price_formulas; -- Should fail

COMMIT;

-- ============================================================
-- POST-MIGRATION NOTES
-- ============================================================
-- 
-- Files to update after running this migration:
--   1. DELETE: db/models/priceFormulas.js
--   2. UPDATE: db/models/quotes.js (use priceSettingId, add code fields)
--   3. UPDATE: domains/crm/api/services/priceSettingsService.js (add formulaExpression)
--   4. UPDATE: domains/crm/components/pricing/PricingManager.jsx (API changes)
--   5. UPDATE: server/priceCalculator.js (use price_settings.formulaExpression)
--
-- ============================================================
