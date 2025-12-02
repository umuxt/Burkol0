-- ================================================
-- CRM Customers Table Creation
-- ================================================
-- Bu SQL dosyası terminalden şu şekilde çalıştırılacak:
-- psql -U postgres -d beeplan_db -f create-customers-table.sql

-- 1. Önce mevcut tabloyu sil (eğer varsa)
DROP TABLE IF EXISTS quotes.customers CASCADE;

-- 2. Customers tablosunu camelCase kolonlarla oluştur
CREATE TABLE quotes.customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  company VARCHAR(255),
  "taxOffice" VARCHAR(255),
  "taxNumber" VARCHAR(50),
  address TEXT,
  notes TEXT,
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- 3. Email için index (unique değil, aynı email'e sahip birden fazla müşteri olabilir)
CREATE INDEX idx_customers_email ON quotes.customers(email);

-- 4. Telefon için index
CREATE INDEX idx_customers_phone ON quotes.customers(phone);

-- 5. Company için index
CREATE INDEX idx_customers_company ON quotes.customers(company);

-- 6. isActive için index
CREATE INDEX idx_customers_active ON quotes.customers("isActive");

-- 7. quotes tablosuna yeni kolonlar ekle (camelCase)
ALTER TABLE quotes.quotes 
ADD COLUMN IF NOT EXISTS "isCustomer" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "customerId" INTEGER;

-- 8. Foreign key constraint ekle
ALTER TABLE quotes.quotes
ADD CONSTRAINT fk_quotes_customer
FOREIGN KEY ("customerId") REFERENCES quotes.customers(id)
ON DELETE SET NULL;

-- 9. Mevcut tüm quotes'ları isCustomer=false olarak işaretle
UPDATE quotes.quotes 
SET "isCustomer" = false, "customerId" = NULL
WHERE "isCustomer" IS NULL;

-- 10. Index'ler ekle
CREATE INDEX idx_quotes_customer_id ON quotes.quotes("customerId");
CREATE INDEX idx_quotes_is_customer ON quotes.quotes("isCustomer");

-- 11. Başarılı mesajı
SELECT 'Customers table created successfully!' as status;
SELECT COUNT(*) as total_quotes_updated FROM quotes.quotes WHERE "isCustomer" = false;
