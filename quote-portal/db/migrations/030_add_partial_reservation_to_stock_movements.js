/**
 * Migration 030: Add Partial Reservation Tracking to Stock Movements
 * 
 * Purpose: Enable partial reservation handling and assignment linkage for materials.stock_movements
 * 
 * This migration adds 4 fields to track:
 * 1. What was originally requested vs what was actually reserved
 * 2. Whether a partial reservation occurred (shortage)
 * 3. Warning messages for users about shortages
 * 4. Link to the MES assignment that caused the movement
 * 
 * Reference: Optimized-DATA-FLOW-STUDY.md - "Partial Reservation Handling"
 * Reference: MES-ULTIMATE-DATABASE-ARCHITECTURE.md - Material Shortage Tracking
 * 
 * Use Cases:
 * - Track material shortages during production start
 * - Link stock movements to specific MES tasks
 * - Warn users about partial reservations
 * - Enable traceability (which task consumed which materials)
 * 
 * Backward Compatibility:
 * - All new fields are NULLABLE
 * - Default values set where appropriate
 * - Existing stock movements continue to work
 * - No breaking changes to existing queries
 */

export function up(knex) {
  return knex.schema.withSchema('materials').alterTable('stock_movements', (table) => {
    
    // ============================================================
    // PARTIAL RESERVATION TRACKING
    // ============================================================
    
    // Original quantity requested (before shortage check)
    // Used to compare with actual quantity reserved
    // Example: requested_quantity=100, quantity=80 → partial reservation
    table.decimal('requested_quantity', 15, 3);
    
    // Flag indicating if this movement is a partial reservation
    // TRUE: Could not fulfill full request (shortage occurred)
    // FALSE or NULL: Full reservation successful
    table.boolean('partial_reservation').defaultTo(false);
    
    // Human-readable warning message about the partial reservation
    // Example: "Partial reservation: requested 100 kg, reserved 80 kg (shortage: 20 kg)"
    // Displayed to users in UI alerts
    table.text('warning');
    
    
    // ============================================================
    // MES ASSIGNMENT LINKAGE
    // ============================================================
    
    // Foreign key to mes.worker_assignments
    // Links this stock movement to the MES task that triggered it
    // NULL for non-MES movements (manual adjustments, order deliveries, etc.)
    // 
    // ON DELETE SET NULL: If assignment is deleted, stock movement remains
    // (preserves historical record even if task is cancelled)
    table.string('assignment_id', 100);
    
  })
  .then(() => {
    
    // ============================================================
    // INDEXES FOR PERFORMANCE
    // ============================================================
    
    return knex.schema.raw(`
      -- Index 1: Find all stock movements for a specific assignment
      -- Supports: SELECT * FROM stock_movements WHERE assignment_id = 'WO-001-01'
      -- Partial index: only indexes rows with assignment_id (reduces index size)
      CREATE INDEX idx_assignment_movements
      ON materials.stock_movements(assignment_id)
      WHERE assignment_id IS NOT NULL;
      
      -- Index 2: Find all partial reservations (shortage warnings)
      -- Supports: SELECT * FROM stock_movements WHERE partial_reservation = true
      -- Partial index: only indexes shortage cases (very small index)
      CREATE INDEX idx_partial_warnings
      ON materials.stock_movements(partial_reservation)
      WHERE partial_reservation = true;
    `);
    
  })
  .then(() => {
    
    // ============================================================
    // FOREIGN KEY CONSTRAINTS
    // ============================================================
    
    return knex.schema.raw(`
      -- FK to mes.worker_assignments
      -- ON DELETE SET NULL: Preserve stock movement history even if assignment deleted
      -- Allows historical analysis of material usage
      ALTER TABLE materials.stock_movements
      ADD CONSTRAINT fk_stock_movement_assignment
      FOREIGN KEY (assignment_id)
      REFERENCES mes.worker_assignments(id)
      ON DELETE SET NULL;
    `);
    
  })
  .then(() => {
    
    // ============================================================
    // CHECK CONSTRAINTS FOR DATA INTEGRITY
    // ============================================================
    
    return knex.schema.raw(`
      -- Constraint 1: If partial_reservation is true, quantity must be less than requested_quantity
      -- Prevents inconsistent state where partial_reservation=true but full quantity was reserved
      ALTER TABLE materials.stock_movements
      ADD CONSTRAINT chk_partial_reservation_logic
      CHECK (
        partial_reservation = false 
        OR partial_reservation IS NULL 
        OR (requested_quantity IS NOT NULL AND quantity < requested_quantity)
      );
      
      -- Constraint 2: requested_quantity must be positive if set
      ALTER TABLE materials.stock_movements
      ADD CONSTRAINT chk_requested_quantity_positive
      CHECK (requested_quantity IS NULL OR requested_quantity > 0);
      
      -- Constraint 3: If partial_reservation is true, warning should be set
      -- Ensures users are informed about shortages
      ALTER TABLE materials.stock_movements
      ADD CONSTRAINT chk_partial_warning_message
      CHECK (
        partial_reservation = false 
        OR partial_reservation IS NULL 
        OR warning IS NOT NULL
      );
    `);
    
  })
  .then(() => {
    
    // ============================================================
    // COLUMN COMMENTS FOR DOCUMENTATION
    // ============================================================
    
    return knex.schema.raw(`
      COMMENT ON COLUMN materials.stock_movements.requested_quantity IS 
        'Original quantity requested before shortage check. NULL for non-reservation movements.';
      
      COMMENT ON COLUMN materials.stock_movements.partial_reservation IS 
        'TRUE if could not fulfill full request due to shortage. FALSE or NULL if full reservation successful.';
      
      COMMENT ON COLUMN materials.stock_movements.warning IS 
        'Human-readable warning message about partial reservation. Example: "Partial reservation: requested 100 kg, reserved 80 kg".';
      
      COMMENT ON COLUMN materials.stock_movements.assignment_id IS 
        'Foreign key to mes.worker_assignments(id). Links stock movement to MES task. NULL for non-MES movements.';
    `);
    
  });
}

export function down(knex) {
  return knex.schema.raw(`
    -- Drop constraints first
    ALTER TABLE materials.stock_movements DROP CONSTRAINT IF EXISTS chk_partial_reservation_logic;
    ALTER TABLE materials.stock_movements DROP CONSTRAINT IF EXISTS chk_requested_quantity_positive;
    ALTER TABLE materials.stock_movements DROP CONSTRAINT IF EXISTS chk_partial_warning_message;
    ALTER TABLE materials.stock_movements DROP CONSTRAINT IF EXISTS fk_stock_movement_assignment;
    
    -- Drop indexes
    DROP INDEX IF EXISTS materials.idx_assignment_movements;
    DROP INDEX IF EXISTS materials.idx_partial_warnings;
  `)
  .then(() => {
    // Drop columns
    return knex.schema.withSchema('materials').alterTable('stock_movements', (table) => {
      table.dropColumn('requested_quantity');
      table.dropColumn('partial_reservation');
      table.dropColumn('warning');
      table.dropColumn('assignment_id');
    });
  });
}

/**
 * USAGE EXAMPLES:
 * 
 * 1. FULL RESERVATION (no shortage):
 * 
 *    INSERT INTO materials.stock_movements (
 *      material_code, type, quantity, 
 *      requested_quantity, partial_reservation, assignment_id
 *    ) VALUES (
 *      'M-00-001', 'out', 100.00,
 *      100.00, false, 'WO-001-01'
 *    );
 * 
 * 
 * 2. PARTIAL RESERVATION (shortage occurred):
 * 
 *    INSERT INTO materials.stock_movements (
 *      material_code, type, quantity, stock_before, stock_after,
 *      requested_quantity, partial_reservation, warning, assignment_id
 *    ) VALUES (
 *      'M-00-001', 'out', 80.00, 80.00, 0.00,
 *      100.00, true, 'Partial reservation: requested 100 kg, reserved 80 kg (shortage: 20 kg)', 'WO-001-01'
 *    );
 * 
 * 
 * 3. QUERY ALL PARTIAL RESERVATIONS:
 * 
 *    SELECT 
 *      material_code,
 *      requested_quantity,
 *      quantity as actual_quantity,
 *      (requested_quantity - quantity) as shortage,
 *      warning,
 *      assignment_id
 *    FROM materials.stock_movements
 *    WHERE partial_reservation = true
 *    ORDER BY movement_date DESC;
 * 
 * 
 * 4. QUERY ALL MOVEMENTS FOR AN ASSIGNMENT:
 * 
 *    SELECT 
 *      sm.material_code,
 *      m.name as material_name,
 *      sm.type,
 *      sm.quantity,
 *      sm.partial_reservation,
 *      sm.warning
 *    FROM materials.stock_movements sm
 *    JOIN materials.materials m ON m.code = sm.material_code
 *    WHERE sm.assignment_id = 'WO-001-01'
 *    ORDER BY sm.movement_date;
 * 
 * 
 * 5. DETECT MATERIAL SHORTAGES BY ASSIGNMENT:
 * 
 *    -- Which assignments had material shortages?
 *    SELECT 
 *      assignment_id,
 *      COUNT(*) as shortage_count,
 *      ARRAY_AGG(DISTINCT material_code) as materials_with_shortage,
 *      SUM(requested_quantity - quantity) as total_shortage_qty
 *    FROM materials.stock_movements
 *    WHERE partial_reservation = true
 *      AND assignment_id IS NOT NULL
 *    GROUP BY assignment_id
 *    ORDER BY shortage_count DESC;
 * 
 * 
 * 6. BACKEND LOGIC - CREATE PARTIAL RESERVATION:
 * 
 *    const requestedQty = 100; // From BOM
 *    const availableStock = await getAvailableStock('M-00-001');
 *    
 *    const actualQty = Math.min(requestedQty, availableStock);
 *    const isPartial = actualQty < requestedQty;
 *    
 *    const movement = {
 *      material_code: 'M-00-001',
 *      type: 'out',
 *      quantity: actualQty,
 *      requested_quantity: requestedQty,
 *      partial_reservation: isPartial,
 *      warning: isPartial 
 *        ? `Partial reservation: requested ${requestedQty} kg, reserved ${actualQty} kg (shortage: ${requestedQty - actualQty} kg)`
 *        : null,
 *      assignment_id: 'WO-001-01'
 *    };
 *    
 *    await db('materials.stock_movements').insert(movement);
 * 
 * 
 * MIGRATION CHECKLIST:
 * 
 * ✅ 4 new fields added (requested_quantity, partial_reservation, warning, assignment_id)
 * ✅ 2 partial indexes for performance (assignment, partial_reservation)
 * ✅ 1 foreign key to mes.worker_assignments
 * ✅ 3 CHECK constraints for data integrity
 * ✅ Column comments for documentation
 * ✅ Complete rollback (down migration)
 * ✅ Usage examples in comments
 * 
 * NEXT STEPS:
 * - Migration 031: Add lot tracking fields (lot_number, lot_date, etc.)
 * - Backend: Implement partial reservation logic in material reservation service
 * - UI: Display shortage warnings in worker portal
 * - Reports: Material shortage analysis dashboard
 */
