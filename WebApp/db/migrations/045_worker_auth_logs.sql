-- ============================================================
-- Migration 045: Worker Authentication & Activity Logs
-- Date: 2025-12-12
-- Purpose: Add PIN auth columns to workers and create activity log table
-- ============================================================

-- =================================
-- 1. Worker PIN & Token Columns
-- =================================
ALTER TABLE mes.workers ADD COLUMN IF NOT EXISTS "pinCode" VARCHAR(4);
ALTER TABLE mes.workers ADD COLUMN IF NOT EXISTS "pinUpdatedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE mes.workers ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE mes.workers ADD COLUMN IF NOT EXISTS "dailyToken" VARCHAR(64);
ALTER TABLE mes.workers ADD COLUMN IF NOT EXISTS "tokenGeneratedAt" TIMESTAMP WITH TIME ZONE;

-- =================================
-- 2. Worker Activity Logs Table
-- =================================
CREATE TABLE IF NOT EXISTS mes.worker_activity_logs (
  id SERIAL PRIMARY KEY,
  "workerId" VARCHAR(100) NOT NULL,
  "workerName" VARCHAR(255),
  
  -- Activity info
  action VARCHAR(50) NOT NULL,  -- login, logout, task_start, task_complete, task_pause, task_resume
  "entityType" VARCHAR(50),        -- assignment, session
  "entityId" VARCHAR(100),         -- Assignment ID or similar
  
  -- Production data (for task_complete)
  "quantityProduced" INTEGER,
  "defectQuantity" INTEGER,
  "scrapData" JSONB,
  
  -- Metadata
  details JSONB,
  "ipAddress" VARCHAR(45),
  "userAgent" TEXT,
  
  -- Timestamps
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =================================
-- 3. Indexes for Performance
-- =================================
CREATE INDEX IF NOT EXISTS idx_wal_worker ON mes.worker_activity_logs("workerId");
CREATE INDEX IF NOT EXISTS idx_wal_date ON mes.worker_activity_logs("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_wal_action ON mes.worker_activity_logs(action);

-- Composite index for history queries
CREATE INDEX IF NOT EXISTS idx_wal_worker_date ON mes.worker_activity_logs("workerId", "createdAt" DESC);

-- =================================
-- 4. Comments
-- =================================
COMMENT ON TABLE mes.worker_activity_logs IS 'İşçi aktivite logları - login, logout, görev başlatma/tamamlama';
COMMENT ON COLUMN mes.workers."pinCode" IS '4 haneli işçi PIN kodu';
COMMENT ON COLUMN mes.workers."dailyToken" IS 'Günlük geçerli token (24 saat)';
