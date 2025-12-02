-- Migration: 024_crm_newflow_updates.sql
-- CRM New Flow - Database Updates
-- Date: 2024-12-02

-- ============================================
-- 1. CUSTOMERS TABLE - New Fields
-- ============================================

-- Add new columns to quotes.customers
ALTER TABLE quotes.customers
ADD COLUMN IF NOT EXISTS website VARCHAR(255),
ADD COLUMN IF NOT EXISTS fax VARCHAR(50),
ADD COLUMN IF NOT EXISTS iban VARCHAR(50),
ADD COLUMN IF NOT EXISTS "bankName" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "contactPerson" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "contactTitle" VARCHAR(100),
ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'Türkiye',
ADD COLUMN IF NOT EXISTS city VARCHAR(100),
ADD COLUMN IF NOT EXISTS "postalCode" VARCHAR(20);

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_customers_city ON quotes.customers(city);
CREATE INDEX IF NOT EXISTS idx_customers_country ON quotes.customers(country);

-- ============================================
-- 2. WORK ORDERS TABLE - Production Launch Flag
-- ============================================

-- Add productionLaunched flag for edit lock mechanism
ALTER TABLE mes.work_orders
ADD COLUMN IF NOT EXISTS "productionLaunched" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "productionLaunchedAt" TIMESTAMP;

-- Create index for productionLaunched queries
CREATE INDEX IF NOT EXISTS idx_work_orders_production_launched ON mes.work_orders("productionLaunched");

-- ============================================
-- VERIFICATION QUERIES (run manually to check)
-- ============================================

-- Check customers table:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'quotes' AND table_name = 'customers' ORDER BY ordinal_position;

-- Check work_orders table:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'mes' AND table_name = 'work_orders' ORDER BY ordinal_position;
