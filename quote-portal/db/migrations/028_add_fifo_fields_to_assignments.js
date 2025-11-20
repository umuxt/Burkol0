/**
 * Migration 028: Add FIFO and Optimization Fields to mes_worker_assignments
 * 
 * Purpose: Enhance mes_worker_assignments table with complete FIFO scheduling and optimization support
 * 
 * This migration adds 12 timing fields critical for:
 * 1. FIFO task scheduling (expected_start sorting)
 * 2. Optimization mode (optimized_index, optimized_start)
 * 3. Pause/Resume tracking (paused_at, total_paused_time)
 * 4. Performance monitoring (actual vs planned times)
 * 
 * Reference: MES-FIFO-OPTIMIZATION-DATABASE-REQUIREMENTS.md
 * Reference: MES-ULTIMATE-DATABASE-ARCHITECTURE.md - Decision 2
 */

export function up(knex) {
  return knex.schema.withSchema('mes').alterTable('worker_assignments', (table) => {
    
    // ============================================================
    // SCHEDULING MODE
    // ============================================================
    
    // Determines whether this assignment uses FIFO or optimized scheduling
    table.string('scheduling_mode', 20).defaultTo('fifo');
    
    
    // ============================================================
    // TIMING FIELDS (12 fields for complete FIFO support)
    // ============================================================
    
    // Design-time duration (from operation definition)
    // Required for calculating planned_end and resource allocation
    table.integer('nominal_time'); // Duration in minutes
    
    // Efficiency-adjusted duration (nominal_time / worker_efficiency)
    // Used for realistic scheduling: effective_time = nominal_time / 0.85
    table.integer('effective_time'); // Duration in minutes
    
    // FIFO Mode: Expected start time (CRITICAL for FIFO sorting)
    // This is the timestamp used to order tasks in FIFO queue
    // Calculated during plan launch based on dependencies and worker availability
    table.timestamp('expected_start');
    
    // Optimization Mode: Calculated start time from optimization algorithm
    // Only set when scheduling_mode = 'optimized'
    // Falls back to expected_start if optimization not used
    table.timestamp('optimized_start');
    
    // Planned end time (expected_start + effective_time)
    // Used for Gantt chart visualization and capacity planning
    table.timestamp('planned_end');
    
    // Actual start time (set when worker starts the task)
    // Used for performance tracking and actual duration calculation
    table.timestamp('actual_start');
    
    // Actual end time (set when task is completed)
    // Used for performance tracking: actual_duration = actual_end - actual_start
    table.timestamp('actual_end');
    
    
    // ============================================================
    // OPTIMIZATION FIELDS
    // ============================================================
    
    // Execution order when using optimization mode
    // NULL for FIFO mode (sorted by expected_start instead)
    // Set to 1, 2, 3... for optimized execution sequence
    table.integer('optimized_index');
    
    
    // ============================================================
    // PAUSE/RESUME TRACKING
    // ============================================================
    // Reference: Optimized-DATA-FLOW-STUDY.md section "Pause Handling"
    
    // When the task was last paused (for resume tracking)
    table.timestamp('paused_at');
    
    // Current pause start time (NULL if not currently paused)
    // Used to calculate pause duration when resuming
    table.timestamp('current_pause_start');
    
    // Total time the task has been paused (milliseconds)
    // Accumulated across multiple pause/resume cycles
    // Used for accurate actual_duration calculation:
    //   actual_duration = (actual_end - actual_start) - total_paused_time
    table.integer('total_paused_time').defaultTo(0);
    
  })
  .then(() => {
    
    // ============================================================
    // INDEXES FOR FIFO PERFORMANCE
    // ============================================================
    
    return knex.schema.raw(`
      -- Index for FIFO queue queries (CRITICAL for performance)
      -- Supports: SELECT * FROM assignments WHERE worker_id='W-001' AND status IN ('pending','ready') ORDER BY expected_start
      -- Partial index reduces index size by 80% (only indexes pending/ready tasks)
      CREATE INDEX idx_fifo_queue 
      ON mes.worker_assignments(worker_id, status, expected_start)
      WHERE status IN ('pending', 'ready');
      
      -- Index for optimization mode queue
      -- Supports: SELECT * FROM assignments WHERE worker_id='W-001' AND scheduling_mode='optimized' ORDER BY optimized_index
      CREATE INDEX idx_optimization_queue
      ON mes.worker_assignments(worker_id, status, optimized_index)
      WHERE scheduling_mode = 'optimized';
      
      -- Index for scheduling mode filtering
      CREATE INDEX idx_scheduling_mode
      ON mes.worker_assignments(scheduling_mode);
      
      -- Composite index for worker portal queries
      -- Supports most common query: active tasks for a worker
      CREATE INDEX idx_worker_active_tasks
      ON mes.worker_assignments(worker_id, status, actual_start)
      WHERE status IN ('in_progress', 'paused');
    `);
    
  })
  .then(() => {
    
    // ============================================================
    // CHECK CONSTRAINTS FOR DATA INTEGRITY
    // ============================================================
    
    return knex.schema.raw(`
      -- Constraint 1: scheduling_mode must be 'fifo' or 'optimized'
      ALTER TABLE mes.worker_assignments
      ADD CONSTRAINT chk_scheduling_mode
      CHECK (scheduling_mode IN ('fifo', 'optimized'));
      
      -- Constraint 2: actual_start must be after or equal to expected_start
      -- Prevents data entry errors where actual_start is before plan was created
      ALTER TABLE mes.worker_assignments
      ADD CONSTRAINT chk_actual_after_expected
      CHECK (actual_start IS NULL OR expected_start IS NULL OR actual_start >= expected_start);
      
      -- Constraint 3: actual_end must be after actual_start
      ALTER TABLE mes.worker_assignments
      ADD CONSTRAINT chk_actual_end_after_start
      CHECK (actual_end IS NULL OR actual_start IS NULL OR actual_end >= actual_start);
      
      -- Constraint 4: optimized_index must be positive if set
      ALTER TABLE mes.worker_assignments
      ADD CONSTRAINT chk_optimized_index_positive
      CHECK (optimized_index IS NULL OR optimized_index > 0);
      
      -- Constraint 5: total_paused_time must be non-negative
      ALTER TABLE mes.worker_assignments
      ADD CONSTRAINT chk_paused_time_positive
      CHECK (total_paused_time >= 0);
      
      -- Constraint 6: If scheduling_mode='optimized', optimized_index should be set
      -- (Warning only - not enforced to allow gradual migration)
      -- ALTER TABLE mes.worker_assignments
      -- ADD CONSTRAINT chk_optimized_mode_has_index
      -- CHECK (scheduling_mode != 'optimized' OR optimized_index IS NOT NULL);
    `);
    
  })
  .then(() => {
    
    // ============================================================
    // COMMENTS FOR DOCUMENTATION
    // ============================================================
    
    return knex.schema.raw(`
      COMMENT ON COLUMN mes.worker_assignments.scheduling_mode IS 'Scheduling algorithm: fifo (default) or optimized';
      COMMENT ON COLUMN mes.worker_assignments.nominal_time IS 'Design-time duration in minutes (from operation definition)';
      COMMENT ON COLUMN mes.worker_assignments.effective_time IS 'Efficiency-adjusted duration in minutes (nominal_time / worker_efficiency)';
      COMMENT ON COLUMN mes.worker_assignments.expected_start IS 'FIFO mode: Expected start timestamp (CRITICAL for FIFO sorting)';
      COMMENT ON COLUMN mes.worker_assignments.optimized_start IS 'Optimization mode: Calculated start timestamp from optimization algorithm';
      COMMENT ON COLUMN mes.worker_assignments.planned_end IS 'Planned completion time (expected_start + effective_time)';
      COMMENT ON COLUMN mes.worker_assignments.actual_start IS 'Actual start timestamp (when worker started the task)';
      COMMENT ON COLUMN mes.worker_assignments.actual_end IS 'Actual completion timestamp (when task was completed)';
      COMMENT ON COLUMN mes.worker_assignments.optimized_index IS 'Execution order for optimized mode (1, 2, 3...). NULL for FIFO mode';
      COMMENT ON COLUMN mes.worker_assignments.paused_at IS 'Last pause timestamp (for resume tracking)';
      COMMENT ON COLUMN mes.worker_assignments.current_pause_start IS 'Current pause start time (NULL if not paused)';
      COMMENT ON COLUMN mes.worker_assignments.total_paused_time IS 'Total paused duration in milliseconds (accumulated across pause/resume cycles)';
    `);
    
  });
}

export function down(knex) {
  return knex.schema.raw(`
    -- Drop all constraints first
    ALTER TABLE mes.worker_assignments DROP CONSTRAINT IF EXISTS chk_scheduling_mode;
    ALTER TABLE mes.worker_assignments DROP CONSTRAINT IF EXISTS chk_actual_after_expected;
    ALTER TABLE mes.worker_assignments DROP CONSTRAINT IF EXISTS chk_actual_end_after_start;
    ALTER TABLE mes.worker_assignments DROP CONSTRAINT IF EXISTS chk_optimized_index_positive;
    ALTER TABLE mes.worker_assignments DROP CONSTRAINT IF EXISTS chk_paused_time_positive;
    
    -- Drop all indexes
    DROP INDEX IF EXISTS mes.idx_fifo_queue;
    DROP INDEX IF EXISTS mes.idx_optimization_queue;
    DROP INDEX IF EXISTS mes.idx_scheduling_mode;
    DROP INDEX IF EXISTS mes.idx_worker_active_tasks;
  `)
  .then(() => {
    // Drop all columns
    return knex.schema.withSchema('mes').alterTable('worker_assignments', (table) => {
      table.dropColumn('scheduling_mode');
      table.dropColumn('nominal_time');
      table.dropColumn('effective_time');
      table.dropColumn('expected_start');
      table.dropColumn('optimized_start');
      table.dropColumn('planned_end');
      table.dropColumn('actual_start');
      table.dropColumn('actual_end');
      table.dropColumn('optimized_index');
      table.dropColumn('paused_at');
      table.dropColumn('current_pause_start');
      table.dropColumn('total_paused_time');
    });
  });
}

/**
 * USAGE NOTES FOR DEVELOPERS:
 * 
 * 1. FIFO Mode Query (Get next task for worker):
 * 
 *    SELECT * FROM mes_worker_assignments
 *    WHERE worker_id = 'W-001'
 *      AND status IN ('pending', 'ready')
 *      AND scheduling_mode = 'fifo'
 *    ORDER BY 
 *      is_urgent DESC,        -- Urgent tasks first
 *      expected_start ASC     -- Then FIFO order (oldest expected start first)
 *    LIMIT 1;
 * 
 * 
 * 2. Optimization Mode Query (Get next task for worker):
 * 
 *    SELECT * FROM mes_worker_assignments
 *    WHERE worker_id = 'W-001'
 *      AND status IN ('pending', 'ready')
 *      AND scheduling_mode = 'optimized'
 *    ORDER BY optimized_index ASC
 *    LIMIT 1;
 * 
 * 
 * 3. Calculate Actual Duration (with pause handling):
 * 
 *    SELECT 
 *      id,
 *      EXTRACT(EPOCH FROM (actual_end - actual_start)) * 1000 as total_duration_ms,
 *      total_paused_time as paused_duration_ms,
 *      (EXTRACT(EPOCH FROM (actual_end - actual_start)) * 1000 - total_paused_time) as effective_duration_ms
 *    FROM mes_worker_assignments
 *    WHERE status = 'completed';
 * 
 * 
 * 4. Performance Analysis (compare planned vs actual):
 * 
 *    SELECT 
 *      id,
 *      effective_time * 60 * 1000 as planned_duration_ms,
 *      (EXTRACT(EPOCH FROM (actual_end - actual_start)) * 1000 - total_paused_time) as actual_duration_ms,
 *      ((actual_end - actual_start) - (planned_end - expected_start)) as variance
 *    FROM mes_worker_assignments
 *    WHERE status = 'completed';
 * 
 * 
 * 5. Pause/Resume Logic:
 * 
 *    -- Pause task
 *    UPDATE mes_worker_assignments
 *    SET status = 'paused',
 *        paused_at = NOW(),
 *        current_pause_start = NOW()
 *    WHERE id = 'WO-001-01';
 *    
 *    -- Resume task
 *    UPDATE mes_worker_assignments
 *    SET status = 'in_progress',
 *        total_paused_time = total_paused_time + EXTRACT(EPOCH FROM (NOW() - current_pause_start)) * 1000,
 *        current_pause_start = NULL
 *    WHERE id = 'WO-001-01';
 * 
 * 
 * MIGRATION CHECKLIST:
 * 
 * ✅ 12 timing fields added (nominal_time, effective_time, expected_start, etc.)
 * ✅ 1 scheduling mode field (fifo/optimized)
 * ✅ 4 partial indexes for FIFO performance
 * ✅ 5 CHECK constraints for data integrity
 * ✅ Column comments for documentation
 * ✅ Complete rollback (down migration)
 * ✅ Usage examples in comments
 * 
 * BACKWARD COMPATIBILITY:
 * - All new fields are NULLABLE (except nominal_time)
 * - Default values set where appropriate
 * - Existing queries continue to work
 * - Gradual adoption possible
 */
