-- Create assignment_status_history table
-- Run this manually: psql -d beeplan_dev -f create_status_history.sql

CREATE TABLE IF NOT EXISTS mes.assignment_status_history (
  id SERIAL PRIMARY KEY,
  "assignmentId" INTEGER NOT NULL,
  "fromStatus" VARCHAR(50),
  "toStatus" VARCHAR(50) NOT NULL,
  "changedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "changedBy" VARCHAR(100),
  reason TEXT,
  metadata JSONB,
  
  -- Foreign key
  CONSTRAINT fk_assignment
    FOREIGN KEY ("assignmentId") 
    REFERENCES mes.worker_assignments(id)
    ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_status_history_assignment 
  ON mes.assignment_status_history("assignmentId");

CREATE INDEX IF NOT EXISTS idx_status_history_changed_at 
  ON mes.assignment_status_history("changedAt");

CREATE INDEX IF NOT EXISTS idx_status_history_assignment_status 
  ON mes.assignment_status_history("assignmentId", "toStatus");

-- Log
SELECT 'Assignment status history table created successfully!' as message;
