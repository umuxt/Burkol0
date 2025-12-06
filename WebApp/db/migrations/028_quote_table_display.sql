-- Migration: 028_quote_table_display.sql
-- Tarih: 2025-12-06
-- Açıklama: Quote tablosu dinamik kolon desteği
-- Referans: QUOTE-TABLE-REFACTOR.md - PROMPT-QT1

-- =====================================================
-- 1. form_fields tablosuna display kolonları ekle
-- =====================================================
-- showInTable: Alan quotes tablosunda gösterilsin mi?
-- showInFilter: Alan filtre seçeneklerinde gösterilsin mi?
-- tableOrder: Tablodaki sıralama (0 = default, küçük sayı önce)
-- filterOrder: Filtredeki sıralama (0 = default, küçük sayı önce)

ALTER TABLE quotes.form_fields 
  ADD COLUMN IF NOT EXISTS "showInTable" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "showInFilter" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "tableOrder" INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "filterOrder" INTEGER DEFAULT 0;

-- =====================================================
-- 2. quotes tablosuna projectName kolonu ekle
-- =====================================================
-- projectName: Proje adı (zorunlu alan - yeni tekliflerde)
-- Mevcut kayıtlar 'oldStructure' değeri alacak
-- UI'da 'oldStructure' değeri gösterilmeyecek (frontend'de handle edilecek)

ALTER TABLE quotes.quotes 
  ADD COLUMN IF NOT EXISTS "projectName" VARCHAR(255) DEFAULT 'oldStructure';

-- NOT: Mevcut kayıtlar otomatik 'oldStructure' değerini alacak
-- Karmaşık UPDATE sorgusu kaldırıldı - gereksiz performans yükü

-- =====================================================
-- 3. Performans için Index'ler
-- =====================================================
-- Partial index: Sadece showInTable=true olanları indexle
CREATE INDEX IF NOT EXISTS idx_form_fields_show_in_table 
  ON quotes.form_fields("templateId", "showInTable") 
  WHERE "showInTable" = true;

-- Partial index: Sadece showInFilter=true olanları indexle
CREATE INDEX IF NOT EXISTS idx_form_fields_show_in_filter 
  ON quotes.form_fields("templateId", "showInFilter") 
  WHERE "showInFilter" = true;

-- projectName için index (arama ve sıralama için)
CREATE INDEX IF NOT EXISTS idx_quotes_project_name 
  ON quotes.quotes("projectName");

-- =====================================================
-- Doğrulama Sorguları (migration sonrası çalıştır)
-- =====================================================
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_schema = 'quotes' 
-- AND table_name = 'form_fields'
-- AND column_name IN ('showInTable', 'showInFilter', 'tableOrder', 'filterOrder');

-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_schema = 'quotes' 
-- AND table_name = 'quotes'
-- AND column_name = 'projectName';

-- =====================================================
-- ROLLBACK (gerekirse manuel çalıştır)
-- =====================================================
-- ALTER TABLE quotes.form_fields DROP COLUMN IF EXISTS "showInTable";
-- ALTER TABLE quotes.form_fields DROP COLUMN IF EXISTS "showInFilter";
-- ALTER TABLE quotes.form_fields DROP COLUMN IF EXISTS "tableOrder";
-- ALTER TABLE quotes.form_fields DROP COLUMN IF EXISTS "filterOrder";
-- ALTER TABLE quotes.quotes DROP COLUMN IF EXISTS "projectName";
-- DROP INDEX IF EXISTS quotes.idx_form_fields_show_in_table;
-- DROP INDEX IF EXISTS quotes.idx_form_fields_show_in_filter;
-- DROP INDEX IF EXISTS quotes.idx_quotes_project_name;
