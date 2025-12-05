-- Migration 027: Link Price Settings to Form Template
-- Purpose: Track which form template version the pricing is synced with
-- This allows showing "Form Güncelle" warning when form changes

-- Add linkedFormTemplateId to price_settings
ALTER TABLE quotes.price_settings 
ADD COLUMN IF NOT EXISTS "linkedFormTemplateId" INTEGER REFERENCES quotes.form_templates(id);

-- Update existing active price settings to link to current active form template
UPDATE quotes.price_settings ps
SET "linkedFormTemplateId" = (
  SELECT id FROM quotes.form_templates WHERE "isActive" = true LIMIT 1
)
WHERE ps."isActive" = true AND ps."linkedFormTemplateId" IS NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_price_settings_linked_form 
ON quotes.price_settings("linkedFormTemplateId");

COMMENT ON COLUMN quotes.price_settings."linkedFormTemplateId" IS 
'Form template ID that this pricing version is synced with. Used to detect form changes.';
