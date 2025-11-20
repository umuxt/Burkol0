# MES FIFO & Optimization System - Database Requirements Analysis

## Current Implementation Status

### ✅ Already Implemented in Firebase (mesRoutes.js)

**FIFO Mode:**
- Worker-level FIFO scheduling (not per work order)
- Tasks sorted by `expectedStart` time
- Worker can start: urgent tasks OR first pending task
- Assignment schema includes `schedulingMode: 'fifo'` default

**Optimization Mode:**
- Priority-based scheduling (1=Low, 2=Normal, 3=High)
- `optimizedIndex` field for execution order
- `optimizedStart` time separate from `expectedStart`
- Urgent flag (`isUrgent`) for UI indication

### 📋 Assignment Schema (Firebase)

From `server/models/AssignmentSchema.json`:
```json
{
  "id": "WO-2025-001-01",
  "planId": "PLAN-001",
  "nodeId": "node-1",
  "workerId": "W-001",
  "stationId": "ST-001",
  "substationId": "SUB-001-A",
  
  // FIFO fields
  "expectedStart": "2025-11-14T08:00:00Z",
  "plannedEnd": "2025-11-14T09:00:00Z",
  
  // Optimization fields
  "priority": 2,                    // 1=Low, 2=Normal, 3=High
  "optimizedIndex": null,            // Execution order (null for FIFO)
  "optimizedStart": null,            // Optimized start time (null for FIFO)
  "isUrgent": false,                 // Urgent flag
  "schedulingMode": "fifo",          // "fifo" or "optimized"
  
  // Timing
  "nominalTime": 60,
  "effectiveTime": 75,
  
  // Material tracking (from Optimized-DATA-FLOW-STUDY.md)
  "preProductionReservedAmount": {"M-00-001": 11},
  "actualReservedAmounts": {"M-00-001": 8},
  "materialReservationStatus": "pending|reserved|consumed"
}
```

---

## PostgreSQL Migration Requirements

### 1. Current `mes_worker_assignments` Table (Migration 010)

**Existing columns:**
```javascript
table.string('id', 100).primary();
table.string('plan_id', 100).notNullable();
table.string('node_id', 100).notNullable();
table.string('worker_id', 100);
table.string('station_id', 100);
table.string('substation_id', 100);
table.string('status', 50);
table.integer('priority').defaultTo(0);           // ✅ Has priority
table.boolean('is_urgent').defaultTo(false);      // ✅ Has urgent flag
table.jsonb('pre_production_reserved_amount');    // ✅ Has pre-reservation
table.jsonb('actual_reserved_amounts');           // ✅ Has actual reservation
table.string('material_reservation_status', 50);  // ✅ Has reservation status
```

**❌ MISSING Fields for FIFO/Optimization:**
- `scheduling_mode` (fifo/optimized)
- `optimized_index` (execution order)
- `expected_start` (FIFO start time)
- `optimized_start` (Optimized start time)
- `planned_end` (planned end time)
- `nominal_time` (design-time duration)
- `effective_time` (efficiency-adjusted duration)
- `actual_start`, `actual_end` (actual execution times)

---

## Required Schema Updates

### Migration 028: Add FIFO & Optimization Fields to Assignments

```sql
ALTER TABLE mes_worker_assignments

-- Scheduling mode
ADD COLUMN scheduling_mode VARCHAR(20) DEFAULT 'fifo' CHECK (scheduling_mode IN ('fifo', 'optimized'));

-- Timing fields
ADD COLUMN nominal_time INTEGER NOT NULL;           -- Design-time duration (minutes)
ADD COLUMN effective_time INTEGER;                   -- Efficiency-adjusted duration
ADD COLUMN expected_start TIMESTAMP;                 -- FIFO: expected start
ADD COLUMN optimized_start TIMESTAMP;                -- Optimization: optimized start
ADD COLUMN planned_end TIMESTAMP;                    -- Planned end time
ADD COLUMN actual_start TIMESTAMP;                   -- Actual start time
ADD COLUMN actual_end TIMESTAMP;                     -- Actual completion time

-- Optimization fields
ADD COLUMN optimized_index INTEGER;                  -- Execution order (null for FIFO)

-- Pause/Resume tracking (from Optimized-DATA-FLOW-STUDY.md)
ADD COLUMN paused_at TIMESTAMP;                      -- When task was paused
ADD COLUMN current_pause_start TIMESTAMP;            -- Current pause start time
ADD COLUMN total_paused_time INTEGER DEFAULT 0;      -- Total paused duration (milliseconds)

-- Create indexes for common queries
CREATE INDEX idx_assignments_scheduling_mode ON mes_worker_assignments(scheduling_mode);
CREATE INDEX idx_assignments_expected_start ON mes_worker_assignments(expected_start) WHERE status = 'pending';
CREATE INDEX idx_assignments_optimized_index ON mes_worker_assignments(optimized_index) WHERE optimized_index IS NOT NULL;
CREATE INDEX idx_assignments_worker_status_fifo ON mes_worker_assignments(worker_id, status, expected_start);
```

---

## Material Tracking Integration

### Current Implementation (JSONB)

```javascript
// In mes_worker_assignments table
pre_production_reserved_amount JSONB  // {"M-00-001": 11}
actual_reserved_amounts JSONB          // {"M-00-001": 8}
material_reservation_status VARCHAR    // 'pending', 'reserved', 'consumed'
```

### ✅ Stock Movements Integration

The existing `materials.stock_movements` table already supports MES integration:

```sql
-- From migration 019_create_stock_movements.js
sub_type VARCHAR(50)              -- 'wip_reservation', 'production_consumption', 'production_output'
reference VARCHAR(100)             -- Assignment ID (WO-001-01)
reference_type VARCHAR(50)         -- 'mes_task_start', 'mes_task_complete'
related_plan_id VARCHAR(50)        -- MES production plan ID
related_node_id VARCHAR(50)        -- MES operation node ID
requested_quantity DECIMAL(15,3)   -- ❌ MISSING: Need to add this field
partial_reservation BOOLEAN        -- ❌ MISSING: Need to add this field
```

**Required Addition to `stock_movements`:**

```sql
-- Migration 028b: Add FIFO material tracking fields
ALTER TABLE materials.stock_movements
ADD COLUMN requested_quantity DECIMAL(15, 3);      -- What was requested
ADD COLUMN partial_reservation BOOLEAN DEFAULT false; -- True if qty < requested
ADD COLUMN warning TEXT;                            -- Warning message for partial reservations
```

---

## FIFO Process Flow (Database Perspective)

### 1. Launch Plan (Create Assignments)

```sql
-- Insert assignments with FIFO scheduling
INSERT INTO mes_worker_assignments (
  id, plan_id, node_id, worker_id, station_id, substation_id,
  status, scheduling_mode, priority,
  nominal_time, effective_time,
  expected_start, planned_end,
  pre_production_reserved_amount
) VALUES (
  'WO-2025-001-01',
  'PLAN-001',
  'node-1',
  'W-001',
  'ST-001',
  'SUB-001-A',
  'pending',
  'fifo',                          -- FIFO mode
  2,                               -- Normal priority
  60,                              -- 60 min nominal
  75,                              -- 75 min effective (60/0.85 efficiency)
  '2025-11-14 08:00:00',          -- Expected start
  '2025-11-14 09:15:00',          -- Planned end
  '{"M-00-001": 11}'::jsonb       -- Pre-production reservation
);
```

### 2. Start Task (FIFO Mode)

**Get next task for worker:**
```sql
SELECT * FROM mes_worker_assignments
WHERE worker_id = 'W-001'
  AND status = 'pending'
  AND scheduling_mode = 'fifo'
ORDER BY 
  is_urgent DESC,                  -- Urgent tasks first
  expected_start ASC               -- Then FIFO order
LIMIT 1;
```

**Reserve materials:**
```sql
BEGIN TRANSACTION;

-- Update material stock
UPDATE materials.materials
SET stock = stock - 8,             -- Actual reserved (may be < requested)
    wip_reserved = wip_reserved + 8
WHERE code = 'M-00-001';

-- Record stock movement
INSERT INTO materials.stock_movements (
  material_code, type, sub_type,
  quantity, requested_quantity, partial_reservation,
  stock_before, stock_after,
  reference, reference_type,
  related_plan_id, related_node_id,
  warning, movement_date
) VALUES (
  'M-00-001', 'out', 'wip_reservation',
  8, 11, true,                     -- Reserved 8 out of requested 11
  20, 12,                          -- Stock: 20 → 12
  'WO-2025-001-01', 'mes_task_start',
  'PLAN-001', 'node-1',
  'Partial reservation: requested 11, reserved 8 due to insufficient stock',
  NOW()
);

-- Update assignment
UPDATE mes_worker_assignments
SET status = 'in_progress',
    actual_start = NOW(),
    actual_reserved_amounts = '{"M-00-001": 8}'::jsonb,
    material_reservation_status = 'reserved'
WHERE id = 'WO-2025-001-01';

COMMIT;
```

### 3. Pause Task

```sql
UPDATE mes_worker_assignments
SET status = 'paused',
    paused_at = NOW(),
    current_pause_start = NOW()
WHERE id = 'WO-2025-001-01';
```

### 4. Resume Task

```sql
UPDATE mes_worker_assignments
SET status = 'in_progress',
    total_paused_time = total_paused_time + EXTRACT(EPOCH FROM (NOW() - current_pause_start)) * 1000,
    current_pause_start = NULL
WHERE id = 'WO-2025-001-01';
```

### 5. Complete Task

```sql
BEGIN TRANSACTION;

-- Consume materials (return unused to stock)
UPDATE materials.materials
SET wip_reserved = wip_reserved - 8,   -- Release all reserved
    stock = stock + 2                   -- Return unused (8 - 6 consumed)
WHERE code = 'M-00-001';

-- Record consumption
INSERT INTO materials.stock_movements (
  material_code, type, sub_type,
  quantity, reference, reference_type,
  related_plan_id, related_node_id
) VALUES (
  'M-00-001', 'out', 'production_consumption',
  6, 'WO-2025-001-01', 'mes_task_complete',
  'PLAN-001', 'node-1'
);

-- Record output production
INSERT INTO materials.stock_movements (
  material_code, type, sub_type,
  quantity, reference, reference_type
) VALUES (
  'M-10-001', 'in', 'production_output',
  95, 'WO-2025-001-01', 'mes_task_complete'
);

-- Update assignment
UPDATE mes_worker_assignments
SET status = 'completed',
    actual_end = NOW(),
    material_reservation_status = 'consumed'
WHERE id = 'WO-2025-001-01';

COMMIT;
```

---

## Optimization Mode Database Support

### Additional Fields Needed

Already planned in migration above:
- ✅ `optimized_index` - Execution order
- ✅ `optimized_start` - Optimized start time
- ✅ `scheduling_mode` - Mode selector

### Optimization Algorithm Integration

**Get tasks in optimized order:**
```sql
SELECT * FROM mes_worker_assignments
WHERE worker_id = 'W-001'
  AND status = 'pending'
  AND scheduling_mode = 'optimized'
ORDER BY
  is_urgent DESC,                  -- Urgent first
  priority DESC,                   -- Then by priority (3,2,1)
  optimized_index ASC              -- Then optimized order
LIMIT 1;
```

**Switch between modes:**
```sql
-- Switch plan to optimization mode
UPDATE mes_worker_assignments
SET scheduling_mode = 'optimized',
    optimized_index = <calculated_value>,
    optimized_start = <optimized_time>
WHERE plan_id = 'PLAN-001';
```

---

## Summary: Database Changes Needed for FIFO/Optimization

### ✅ Already Supported (No Changes)
1. Priority field
2. Urgent flag
3. Material pre-reservation (JSONB)
4. Material actual reservation (JSONB)
5. Stock movements with MES reference

### ❌ Need to Add (Migration 028)

**mes_worker_assignments table:**
1. `scheduling_mode` VARCHAR(20) - 'fifo' or 'optimized'
2. `nominal_time` INTEGER - Design-time duration
3. `effective_time` INTEGER - Efficiency-adjusted duration
4. `expected_start` TIMESTAMP - FIFO expected start
5. `optimized_start` TIMESTAMP - Optimized start time
6. `planned_end` TIMESTAMP - Planned end time
7. `actual_start` TIMESTAMP - Actual start time
8. `actual_end` TIMESTAMP - Actual completion time
9. `optimized_index` INTEGER - Execution order for optimization
10. `paused_at` TIMESTAMP - Pause timestamp
11. `current_pause_start` TIMESTAMP - Current pause start
12. `total_paused_time` INTEGER - Total paused duration (ms)

**materials.stock_movements table:**
1. `requested_quantity` DECIMAL - What was requested
2. `partial_reservation` BOOLEAN - Partial reservation flag
3. `warning` TEXT - Warning messages

### 📊 Index Strategy
- `(worker_id, status, expected_start)` - FIFO queries
- `(scheduling_mode)` - Mode filtering
- `(optimized_index)` - Optimization order
- `(expected_start)` WHERE `status = 'pending'` - Partial index for FIFO

---

## Next Steps

1. ✅ Create migration 028 with all required fields
2. ✅ Update seed script to include FIFO/optimization data
3. Update MES API endpoints to use new fields
4. Implement optimization algorithm (future phase)
5. Build optimization modal UI (future phase)

---

## Compatibility Notes

**Backward Compatibility:**
- `scheduling_mode` defaults to 'fifo' - existing behavior preserved
- JSONB reservation fields unchanged - no migration needed
- Stock movements extend existing table - no breaking changes
- All new timestamp fields nullable - gradual adoption

**Migration Strategy:**
- Add new columns as nullable initially
- Backfill `nominal_time`, `effective_time` from existing data
- Populate `expected_start` from assignment creation times
- Set `scheduling_mode = 'fifo'` for all existing records
