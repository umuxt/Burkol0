-- =====================================================
-- Migration: 038_quote_documents.sql
-- Tarih: 9 Aralık 2025
-- Açıklama: Quote Documents Tablosu - Proforma, Export, Import Belgeleri
-- Referans: INVOICE-EXPORT-REFACTOR-PLAN.md FAZ 4
-- =====================================================
-- Bu migration:
-- 1. quotes.quote_documents tablosunu oluşturur
-- 2. Gerekli indeksleri ekler
-- 3. Proforma numara sequence'ı oluşturur
-- 4. Mevcut verileri (varsa) taşır
-- =====================================================

BEGIN;

-- =====================================================
-- PART 1: YENİ TABLO - quote_documents
-- =====================================================

CREATE TABLE IF NOT EXISTS quotes.quote_documents (
    id                  SERIAL PRIMARY KEY,
    "quoteId"           VARCHAR(50) NOT NULL REFERENCES quotes.quotes(id) ON DELETE CASCADE,
    "documentType"      VARCHAR(20) NOT NULL,  -- 'proforma' | 'export' | 'import'
    "documentNumber"    VARCHAR(50),           -- PF-2025-0001 veya fatura no
    "ettn"              VARCHAR(50),           -- GİB ETTN (sadece import)
    "invoiceScenario"   VARCHAR(20),           -- TEMELFATURA | TICARIFATURA | IHRACAT
    "invoiceType"       VARCHAR(20),           -- SATIS | IADE
    "exportFormat"      VARCHAR(20),           -- xml | csv | pdf
    "exportTarget"      VARCHAR(50),           -- LOGO | ZIRVE | OTHER
    "fileData"          BYTEA,                 -- Sadece import için (GİB resmi belgesi)
    "fileName"          VARCHAR(255),
    "mimeType"          VARCHAR(100),
    "createdAt"         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "createdBy"         VARCHAR(100),
    "notes"             TEXT,
    CONSTRAINT valid_document_type CHECK ("documentType" IN ('proforma', 'export', 'import'))
);

-- =====================================================
-- PART 2: İNDEKSLER
-- =====================================================

-- QuoteId'ye göre hızlı sorgulama
CREATE INDEX IF NOT EXISTS idx_quote_documents_quote_id 
    ON quotes.quote_documents("quoteId");

-- Document type'a göre filtreleme
CREATE INDEX IF NOT EXISTS idx_quote_documents_type 
    ON quotes.quote_documents("documentType");

-- Proforma numarası tekil olmalı (sadece proforma tipinde)
CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_documents_proforma_number 
    ON quotes.quote_documents("documentNumber") 
    WHERE "documentType" = 'proforma' AND "documentNumber" IS NOT NULL;

-- ETTN tekil olmalı (sadece import tipinde)
CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_documents_ettn 
    ON quotes.quote_documents("ettn") 
    WHERE "documentType" = 'import' AND "ettn" IS NOT NULL;

-- Tarih bazlı sorgulama (en son belgeler)
CREATE INDEX IF NOT EXISTS idx_quote_documents_created_at 
    ON quotes.quote_documents("createdAt" DESC);

-- =====================================================
-- PART 3: PROFORMA NUMARA SEQUENCE
-- =====================================================

-- Sequence oluştur (yoksa)
CREATE SEQUENCE IF NOT EXISTS quotes.proforma_number_seq START 1;

-- Proforma numarası oluşturma fonksiyonu
CREATE OR REPLACE FUNCTION quotes.generate_proforma_number()
RETURNS VARCHAR AS $$
DECLARE
    next_num INTEGER;
    year_str VARCHAR(4);
BEGIN
    SELECT nextval('quotes.proforma_number_seq') INTO next_num;
    year_str := to_char(CURRENT_DATE, 'YYYY');
    RETURN 'PF-' || year_str || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 4: MEVCUT VERİLERİ TAŞI
-- =====================================================

-- quotes.quotes tablosundan proforma verilerini taşı (varsa)
INSERT INTO quotes.quote_documents ("quoteId", "documentType", "documentNumber", "createdAt", "notes")
SELECT 
    id as "quoteId",
    'proforma' as "documentType",
    "proformaNumber" as "documentNumber",
    COALESCE("proformaCreatedAt", CURRENT_TIMESTAMP) as "createdAt",
    'Migration 038: quotes.quotes tablosundan taşındı' as "notes"
FROM quotes.quotes 
WHERE "proformaNumber" IS NOT NULL
ON CONFLICT DO NOTHING;

-- quotes.quotes tablosundan import verilerini taşı (varsa)
INSERT INTO quotes.quote_documents (
    "quoteId", "documentType", "documentNumber", "ettn", 
    "invoiceScenario", "invoiceType", "fileData", "fileName", "createdAt", "notes"
)
SELECT 
    id as "quoteId",
    'import' as "documentType",
    "invoiceNumber" as "documentNumber",
    "invoiceEttn" as "ettn",
    "invoiceScenario",
    "invoiceType",
    "invoiceImportedFile" as "fileData",
    "invoiceImportedFileName" as "fileName",
    COALESCE("invoiceImportedAt", CURRENT_TIMESTAMP) as "createdAt",
    'Migration 038: quotes.quotes tablosundan taşındı' as "notes"
FROM quotes.quotes 
WHERE "invoiceNumber" IS NOT NULL OR "invoiceEttn" IS NOT NULL
ON CONFLICT DO NOTHING;

-- =====================================================
-- PART 5: DOĞRULAMA
-- =====================================================

DO $$
DECLARE
    doc_count INTEGER;
    proforma_count INTEGER;
    import_count INTEGER;
BEGIN
    -- Tablo kontrol
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'quotes' AND table_name = 'quote_documents'
    ) THEN
        RAISE EXCEPTION 'quote_documents tablosu oluşturulamadı';
    END IF;
    
    -- Sequence kontrol
    IF NOT EXISTS (
        SELECT 1 FROM pg_sequences 
        WHERE schemaname = 'quotes' AND sequencename = 'proforma_number_seq'
    ) THEN
        RAISE EXCEPTION 'proforma_number_seq sequence oluşturulamadı';
    END IF;
    
    -- Fonksiyon kontrol
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'quotes' AND p.proname = 'generate_proforma_number'
    ) THEN
        RAISE EXCEPTION 'generate_proforma_number fonksiyonu oluşturulamadı';
    END IF;
    
    -- Taşınan veri sayısı
    SELECT COUNT(*) INTO doc_count FROM quotes.quote_documents;
    SELECT COUNT(*) INTO proforma_count FROM quotes.quote_documents WHERE "documentType" = 'proforma';
    SELECT COUNT(*) INTO import_count FROM quotes.quote_documents WHERE "documentType" = 'import';
    
    RAISE NOTICE '✅ Migration 038 başarıyla tamamlandı';
    RAISE NOTICE '✅ quotes.quote_documents tablosu oluşturuldu';
    RAISE NOTICE '✅ 5 indeks eklendi';
    RAISE NOTICE '✅ proforma_number_seq sequence oluşturuldu';
    RAISE NOTICE '✅ generate_proforma_number() fonksiyonu eklendi';
    RAISE NOTICE '📊 Toplam taşınan belge: %', doc_count;
    RAISE NOTICE '📊 Proforma belgeleri: %', proforma_count;
    RAISE NOTICE '📊 Import belgeleri: %', import_count;
END $$;

COMMIT;
