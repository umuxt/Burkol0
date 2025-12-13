-- Refactor file storage to use R2/URL instead of BYTEA
-- Migration: 041_storage_refactor.sql

-- 1. Shipments Table
ALTER TABLE materials.shipments
ADD COLUMN "importedFileUrl" TEXT;

COMMENT ON COLUMN materials.shipments."importedFileUrl" IS 'R2/Storage URL for imported file';

-- 2. Quotes Table
ALTER TABLE quotes.quotes
ADD COLUMN "invoiceImportedFileUrl" TEXT;

COMMENT ON COLUMN quotes.quotes."invoiceImportedFileUrl" IS 'R2/Storage URL for imported invoice file';

-- 3. Quote Documents Table
ALTER TABLE quotes.quote_documents
ADD COLUMN "fileUrl" TEXT;

COMMENT ON COLUMN quotes.quote_documents."fileUrl" IS 'R2/Storage URL for document file';

-- Note: Existing bytea columns (importedFile, invoiceImportedFile, fileData) are NOT dropped yet to preserve data.
