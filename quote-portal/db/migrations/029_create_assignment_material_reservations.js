/**
 * Migration 029: Create mes_assignment_material_reservations Table
 * 
 * Purpose: Replace JSONB pre_production_reserved_amount with normalized relational table
 * 
 * This migration creates a dedicated table for tracking material reservations across
 * the 3-phase material consumption lifecycle:
 * 
 * Phase 1: PRE-PRODUCTION (Plan Launch)
 *   - Calculate required materials based on BOM
 *   - Store in pre_production_qty (no actual reservation yet)
 * 
 * Phase 2: ACTUAL RESERVATION (Task Start)
 *   - Reserve actual materials from inventory (may be < pre_production due to shortage)
 *   - Store in actual_reserved_qty
 *   - Set reservation_status = 'reserved'
 * 
 * Phase 3: CONSUMPTION (Task Completion)
 *   - Record final consumed quantity
 *   - Store in consumed_qty
 *   - Set reservation_status = 'consumed'
 * 
 * This normalized approach replaces Firebase's JSONB approach:
 *   OLD: preProductionReservedAmount: {"M-00-001": 11, "M-00-002": 5}
 *   NEW: 2 rows in mes_assignment_material_reservations
 * 
 * Reference: MES-ULTIMATE-DATABASE-ARCHITECTURE.md - Decision 2
 * Reference: Optimized-DATA-FLOW-STUDY.md - Material Reservation Pattern
 */

export function up(knex) {
  return knex.schema.withSchema('mes').createTable('assignment_material_reservations', (table) => {
    
    // ============================================================
    // PRIMARY KEY
    // ============================================================
    
    table.increments('id').primary();
    
    
    // ============================================================
    // FOREIGN KEYS
    // ============================================================
    
    // Assignment reference (which task is reserving materials)
    // ON DELETE CASCADE: If assignment is deleted, reservations are also deleted
    // This is safe because assignments are only deleted when entire plan is cancelled
    table.string('assignment_id', 100).notNullable();
    
    // Material reference (which material is being reserved)
    // ON DELETE RESTRICT: Cannot delete material if it has active reservations
    // This prevents accidental deletion of materials still in use
    table.string('material_code', 100).notNullable();
    
    
    // ============================================================
    // QUANTITY TRACKING (3-Phase Lifecycle)
    // ============================================================
    
    // Phase 1: PRE-PRODUCTION CALCULATION (at plan launch)
    // This is the PLANNED requirement calculated from BOM
    // Example: If BOM says "100 units need 11 kg steel", pre_production_qty = 11
    table.decimal('pre_production_qty', 10, 2).notNullable();
    
    // Phase 2: ACTUAL RESERVATION (at task start)
    // This is the ACTUAL amount reserved from inventory
    // May be LESS than pre_production_qty due to stock shortage
    // Example: Requested 11 kg, but only 8 kg available → actual_reserved_qty = 8
    // NULL until task starts (stays in 'pending' status)
    table.decimal('actual_reserved_qty', 10, 2);
    
    // Phase 3: CONSUMPTION (at task completion)
    // This is the FINAL consumed amount (recorded for traceability)
    // Usually equals actual_reserved_qty, but may differ if there's waste/excess
    // Example: Reserved 8 kg, consumed 7.5 kg, 0.5 kg waste
    // NULL until task completes
    table.decimal('consumed_qty', 10, 2);
    
    
    // ============================================================
    // STATUS TRACKING
    // ============================================================
    
    // Reservation lifecycle status:
    // - 'pending': Pre-production calculation done, awaiting task start
    // - 'reserved': Materials reserved at task start
    // - 'consumed': Materials consumed at task completion
    // - 'released': Reservation cancelled (task cancelled, materials returned)
    table.string('reservation_status', 20).defaultTo('pending');
    
    
    // ============================================================
    // AUDITING
    // ============================================================
    
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    
    // ============================================================
    // CONSTRAINTS
    // ============================================================
    
    // Each assignment can only have ONE reservation per material
    // Prevents duplicate entries: (WO-001-01, M-00-001) can only appear once
    table.unique(['assignment_id', 'material_code'], {
      indexName: 'uk_assignment_material'
    });
    
  })
  .then(() => {
    
    // ============================================================
    // FOREIGN KEY CONSTRAINTS
    // ============================================================
    
    return knex.schema.raw(`
      -- FK to mes.worker_assignments
      -- ON DELETE CASCADE: Delete reservations when assignment is deleted
      ALTER TABLE mes.assignment_material_reservations
      ADD CONSTRAINT fk_assignment
      FOREIGN KEY (assignment_id)
      REFERENCES mes.worker_assignments(id)
      ON DELETE CASCADE;
      
      -- FK to materials.materials
      -- ON DELETE RESTRICT: Cannot delete material if it has active reservations
      ALTER TABLE mes.assignment_material_reservations
      ADD CONSTRAINT fk_material
      FOREIGN KEY (material_code)
      REFERENCES materials.materials(code)
      ON DELETE RESTRICT;
    `);
    
  })
  .then(() => {
    
    // ============================================================
    // CHECK CONSTRAINTS (Data Integrity Rules)
    // ============================================================
    
    return knex.schema.raw(`
      -- Constraint 1: reservation_status must be valid
      ALTER TABLE mes.assignment_material_reservations
      ADD CONSTRAINT chk_reservation_status
      CHECK (reservation_status IN ('pending', 'reserved', 'consumed', 'released'));
      
      -- Constraint 2: Quantity progression must be logical
      -- consumed_qty <= actual_reserved_qty <= pre_production_qty
      -- (You can't consume more than you reserved, and can't reserve more than planned)
      ALTER TABLE mes.assignment_material_reservations
      ADD CONSTRAINT chk_quantity_progression
      CHECK (
        (consumed_qty IS NULL OR actual_reserved_qty IS NULL OR consumed_qty <= actual_reserved_qty)
        AND
        (actual_reserved_qty IS NULL OR actual_reserved_qty <= pre_production_qty)
      );
      
      -- Constraint 3: All quantities must be positive
      ALTER TABLE mes.assignment_material_reservations
      ADD CONSTRAINT chk_quantities_positive
      CHECK (
        pre_production_qty > 0
        AND (actual_reserved_qty IS NULL OR actual_reserved_qty >= 0)
        AND (consumed_qty IS NULL OR consumed_qty >= 0)
      );
      
      -- Constraint 4: Status transitions must make sense
      -- If status='reserved', actual_reserved_qty must be set
      -- If status='consumed', consumed_qty must be set
      ALTER TABLE mes.assignment_material_reservations
      ADD CONSTRAINT chk_status_consistency
      CHECK (
        (reservation_status != 'reserved' OR actual_reserved_qty IS NOT NULL)
        AND
        (reservation_status != 'consumed' OR consumed_qty IS NOT NULL)
      );
    `);
    
  })
  .then(() => {
    
    // ============================================================
    // INDEXES FOR PERFORMANCE
    // ============================================================
    
    return knex.schema.raw(`
      -- Index 1: Find all reservations for an assignment (most common query)
      -- Supports: SELECT * FROM reservations WHERE assignment_id = 'WO-001-01'
      CREATE INDEX idx_assignment_reservations
      ON mes.assignment_material_reservations(assignment_id);
      
      -- Index 2: Find all reservations for a material (inventory queries)
      -- Supports: SELECT * FROM reservations WHERE material_code = 'M-00-001'
      CREATE INDEX idx_material_reservations
      ON mes.assignment_material_reservations(material_code);
      
      -- Index 3: Filter by reservation status
      -- Supports: SELECT * FROM reservations WHERE reservation_status = 'reserved'
      CREATE INDEX idx_reservation_status
      ON mes.assignment_material_reservations(reservation_status);
      
      -- Index 4: Composite index for material shortage queries
      -- Supports: Find all assignments with partial reservations for a material
      CREATE INDEX idx_material_status_qty
      ON mes.assignment_material_reservations(material_code, reservation_status, actual_reserved_qty)
      WHERE actual_reserved_qty < pre_production_qty;
    `);
    
  })
  .then(() => {
    
    // ============================================================
    // COMMENTS FOR DOCUMENTATION
    // ============================================================
    
    return knex.schema.raw(`
      COMMENT ON TABLE mes.assignment_material_reservations IS 
        'Material reservations for MES worker assignments. Replaces JSONB pre_production_reserved_amount with normalized relational model.';
      
      COMMENT ON COLUMN mes.assignment_material_reservations.assignment_id IS 
        'Foreign key to mes.worker_assignments(id). Which task is reserving materials.';
      
      COMMENT ON COLUMN mes.assignment_material_reservations.material_code IS 
        'Foreign key to materials.materials(code). Which material is being reserved.';
      
      COMMENT ON COLUMN mes.assignment_material_reservations.pre_production_qty IS 
        'Planned material requirement calculated at plan launch from BOM. Always set.';
      
      COMMENT ON COLUMN mes.assignment_material_reservations.actual_reserved_qty IS 
        'Actual quantity reserved from inventory at task start. May be < pre_production_qty due to shortage. NULL until task starts.';
      
      COMMENT ON COLUMN mes.assignment_material_reservations.consumed_qty IS 
        'Final consumed quantity recorded at task completion. Usually equals actual_reserved_qty but may differ due to waste. NULL until task completes.';
      
      COMMENT ON COLUMN mes.assignment_material_reservations.reservation_status IS 
        'Lifecycle status: pending (calculated) → reserved (materials locked) → consumed (materials used) or released (cancelled).';
    `);
    
  });
}

export function down(knex) {
  // Drop all constraints and indexes first (handled automatically by DROP TABLE CASCADE)
  return knex.schema.withSchema('mes').dropTableIfExists('assignment_material_reservations');
}

/**
 * USAGE EXAMPLES FOR DEVELOPERS:
 * 
 * 1. CREATE PRE-PRODUCTION RESERVATIONS (at plan launch):
 * 
 *    -- For assignment WO-001-01, reserve materials from BOM
 *    INSERT INTO mes.assignment_material_reservations 
 *      (assignment_id, material_code, pre_production_qty, reservation_status)
 *    VALUES
 *      ('WO-001-01', 'M-00-001', 11.00, 'pending'),  -- 11 kg steel
 *      ('WO-001-01', 'M-00-002', 5.00, 'pending');   -- 5 kg aluminum
 * 
 * 
 * 2. RESERVE MATERIALS (at task start):
 * 
 *    BEGIN TRANSACTION;
 *    
 *    -- Update reservation with actual reserved quantity
 *    UPDATE mes.assignment_material_reservations
 *    SET actual_reserved_qty = 8.00,           -- Only 8 kg available (shortage!)
 *        reservation_status = 'reserved',
 *        updated_at = NOW()
 *    WHERE assignment_id = 'WO-001-01'
 *      AND material_code = 'M-00-001';
 *    
 *    -- Lock inventory
 *    UPDATE materials.materials
 *    SET stock = stock - 8,
 *        wip_reserved = wip_reserved + 8
 *    WHERE code = 'M-00-001';
 *    
 *    COMMIT;
 * 
 * 
 * 3. CONSUME MATERIALS (at task completion):
 * 
 *    UPDATE mes.assignment_material_reservations
 *    SET consumed_qty = 7.50,                  -- Consumed 7.5 kg (0.5 kg waste)
 *        reservation_status = 'consumed',
 *        updated_at = NOW()
 *    WHERE assignment_id = 'WO-001-01'
 *      AND material_code = 'M-00-001';
 * 
 * 
 * 4. QUERY TOTAL RESERVATIONS BY MATERIAL:
 * 
 *    -- How much material M-00-001 is currently reserved?
 *    SELECT 
 *      material_code,
 *      SUM(actual_reserved_qty) as total_reserved,
 *      COUNT(*) as active_reservations
 *    FROM mes.assignment_material_reservations
 *    WHERE material_code = 'M-00-001'
 *      AND reservation_status = 'reserved'
 *    GROUP BY material_code;
 * 
 * 
 * 5. FIND PARTIAL RESERVATIONS (shortage warnings):
 * 
 *    -- Which assignments have material shortages?
 *    SELECT 
 *      r.assignment_id,
 *      r.material_code,
 *      r.pre_production_qty as requested,
 *      r.actual_reserved_qty as reserved,
 *      (r.pre_production_qty - r.actual_reserved_qty) as shortage
 *    FROM mes.assignment_material_reservations r
 *    WHERE r.actual_reserved_qty < r.pre_production_qty
 *      AND r.reservation_status = 'reserved';
 * 
 * 
 * 6. RELEASE RESERVATIONS (when task is cancelled):
 * 
 *    BEGIN TRANSACTION;
 *    
 *    -- Get reserved quantities
 *    SELECT material_code, actual_reserved_qty
 *    FROM mes.assignment_material_reservations
 *    WHERE assignment_id = 'WO-001-01'
 *      AND reservation_status = 'reserved';
 *    
 *    -- Return materials to stock
 *    UPDATE materials.materials
 *    SET stock = stock + 8,
 *        wip_reserved = wip_reserved - 8
 *    WHERE code = 'M-00-001';
 *    
 *    -- Update reservation status
 *    UPDATE mes.assignment_material_reservations
 *    SET reservation_status = 'released',
 *        updated_at = NOW()
 *    WHERE assignment_id = 'WO-001-01';
 *    
 *    COMMIT;
 * 
 * 
 * MIGRATION CHECKLIST:
 * 
 * ✅ Table created with 8 columns
 * ✅ Primary key (id)
 * ✅ 2 Foreign keys (assignment_id, material_code)
 * ✅ Unique constraint (assignment_id, material_code)
 * ✅ 4 CHECK constraints for data integrity
 * ✅ 4 Indexes for performance
 * ✅ Column comments for documentation
 * ✅ Complete rollback (down migration)
 * 
 * BENEFITS OVER JSONB APPROACH:
 * 
 * ✅ Proper FK constraints (referential integrity)
 * ✅ Indexable for fast queries (cannot index JSONB keys efficiently)
 * ✅ Easy aggregation (SUM, COUNT work naturally)
 * ✅ Type safety (DECIMAL enforced, not "11" vs 11)
 * ✅ Audit trail (updated_at tracks changes)
 * ✅ Clear lifecycle tracking (pending → reserved → consumed)
 * ✅ Partial reservation detection (actual < pre_production)
 * ✅ Material shortage warnings (built-in index)
 * 
 * 2-PHASE COMMIT PATTERN:
 * 
 * The normalized table enables proper 2-phase commit for material reservations:
 * 
 * 1. PRE-CALCULATION PHASE (Plan Launch):
 *    - Calculate all material requirements from BOM
 *    - Insert rows with pre_production_qty, status='pending'
 *    - NO inventory lock yet (just calculation)
 * 
 * 2. RESERVATION PHASE (Task Start):
 *    - Lock inventory in materials.materials (FOR UPDATE)
 *    - Update actual_reserved_qty (may be < pre_production)
 *    - Set status='reserved'
 *    - Transaction ensures atomicity
 * 
 * This pattern is IMPOSSIBLE with JSONB because you cannot lock individual
 * material codes within a JSONB field, and cannot track status per material.
 */
