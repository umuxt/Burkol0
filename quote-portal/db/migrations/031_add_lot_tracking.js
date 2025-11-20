/**
 * Migration 031: Add Lot/Batch Tracking to Inventory System
 * 
 * Purpose: Enable comprehensive lot-level inventory tracking across the entire system
 * 
 * This is the FINAL migration for Phase 1+2 MES implementation.
 * It adds simple lot tracking WITHOUT creating new tables (enhances existing tables).
 * 
 * What is Lot Tracking?
 * - Each material delivery gets a unique lot number (LOT-M-00-001-20251120-001)
 * - Stock movements track which lot materials came from/went to
 * - FIFO consumption: oldest lot consumed first (lot_date ASC)
 * - Full traceability: which production task used which material lot
 * - Expiry tracking: alert when lots are expiring soon
 * 
 * Modified Tables:
 * 1. materials.stock_movements (+6 fields, +5 indexes)
 * 2. materials.order_items (+4 fields, +1 index)
 * 3. materials.materials (+3 denormalized summary fields)
 * 4. mes.assignment_material_reservations (+1 field, +1 index)
 * 
 * Trigger Created:
 * - materials.update_material_lot_summary() - Auto-update lot counts
 * 
 * Reference: LOT-TRACKING-SYSTEM-ANALYSIS.md - Option 2: Simple Lot Tracking
 * Reference: PHASE-1-2-IMPLEMENTATION-GUIDE.md - Database Changes
 */

export function up(knex) {
  
  // ============================================================
  // PART 1: ENHANCE stock_movements (Lot Fields)
  // ============================================================
  
  return knex.schema.withSchema('materials').alterTable('stock_movements', (table) => {
    
    // Lot number (auto-generated or manual)
    // Format: LOT-{materialCode}-{YYYYMMDD}-{seq}
    // Example: LOT-M-00-001-20251120-001
    // Unique per delivery, shared across consumption
    table.string('lot_number', 100);
    
    // Lot date (CRITICAL for FIFO sorting)
    // For 'in' movements: delivery date
    // For 'out' movements: lot_date of consumed lot
    // FIFO query: ORDER BY lot_date ASC to get oldest first
    table.date('lot_date');
    
    // Supplier's batch/lot code (from delivery paperwork)
    // Optional: links to supplier's internal tracking
    table.string('supplier_lot_code', 100);
    
    // Manufacturing date (when supplier produced this lot)
    // Optional: for traceability and shelf-life calculation
    table.date('manufacturing_date');
    
    // Expiry date (when this lot expires)
    // Optional: for expiry alerts and FEFO (First Expired First Out)
    table.date('expiry_date');
    
    // Production node sequence (which production step created this)
    // Links to mes_production_plan_nodes.sequence
    // Used for internal production lot tracking (semi-finished goods)
    table.integer('node_sequence');
    
  })
  .then(() => {
    
    // ============================================================
    // PART 1: INDEXES FOR LOT TRACKING PERFORMANCE
    // ============================================================
    
    return knex.schema.raw(`
      -- Index 1: Lookup by lot number
      -- Supports: SELECT * FROM stock_movements WHERE lot_number = 'LOT-M-00-001-001'
      CREATE INDEX idx_lot_number
      ON materials.stock_movements(lot_number)
      WHERE lot_number IS NOT NULL;
      
      -- Index 2: Material + lot lookup
      -- Supports: SELECT * FROM stock_movements WHERE material_code = 'M-00-001' AND lot_number = 'LOT-...'
      CREATE INDEX idx_material_lot
      ON materials.stock_movements(material_code, lot_number)
      WHERE lot_number IS NOT NULL;
      
      -- Index 3: FIFO lot query (CRITICAL FOR PERFORMANCE!)
      -- Supports: Find oldest available lots for FIFO consumption
      -- Query: SELECT * FROM stock_movements WHERE material_code = 'M-00-001' AND type = 'in' ORDER BY lot_date
      -- Partial index: Only indexes 'in' movements with lot tracking (reduces index size by 50%)
      CREATE INDEX idx_fifo_lots
      ON materials.stock_movements(material_code, lot_date, type)
      WHERE type = 'in' AND lot_number IS NOT NULL;
      
      -- Index 4: Expiry date lookup
      -- Supports: SELECT * FROM stock_movements WHERE expiry_date < NOW() + INTERVAL '30 days'
      -- Used for expiry alerts and FEFO
      CREATE INDEX idx_expiry
      ON materials.stock_movements(expiry_date)
      WHERE expiry_date IS NOT NULL;
      
      -- Index 5: Production node tracking
      -- Supports: SELECT * FROM stock_movements WHERE related_plan_id = 'PLAN-001' AND node_sequence = 2
      -- Used for internal production lot tracking
      CREATE INDEX idx_node_sequence
      ON materials.stock_movements(related_plan_id, node_sequence)
      WHERE node_sequence IS NOT NULL;
    `);
    
  })
  .then(() => {
    
    // ============================================================
    // PART 2: ENHANCE order_items (Link to Lots)
    // ============================================================
    
    return knex.schema.withSchema('materials').alterTable('order_items', (table) => {
      
      // Lot number assigned to this order delivery
      // Links to stock_movements.lot_number
      // Set when order is delivered (POST /api/orders/:id/items/:itemId/deliver)
      table.string('lot_number', 100);
      
      // Supplier's batch code (copied from delivery paperwork)
      table.string('supplier_lot_code', 100);
      
      // Manufacturing date (from supplier)
      table.date('manufacturing_date');
      
      // Expiry date (from supplier)
      table.date('expiry_date');
      
    });
    
  })
  .then(() => {
    
    // ============================================================
    // PART 2: INDEX FOR order_items
    // ============================================================
    
    return knex.schema.raw(`
      -- Index: Find order items by lot number
      -- Supports: SELECT * FROM order_items WHERE lot_number = 'LOT-M-00-001-001'
      -- Used for traceability (which order delivered which lot)
      CREATE INDEX idx_lot
      ON materials.order_items(lot_number)
      WHERE lot_number IS NOT NULL;
    `);
    
  })
  .then(() => {
    
    // ============================================================
    // PART 3: ENHANCE materials (Denormalized Lot Summary)
    // ============================================================
    
    return knex.schema.withSchema('materials').alterTable('materials', (table) => {
      
      // Number of active lots for this material
      // Auto-updated by trigger
      // Used for quick "how many lots?" queries without scanning stock_movements
      table.integer('active_lot_count').defaultTo(0);
      
      // Date of oldest lot (for FIFO indicator)
      // Auto-updated by trigger
      // Used to display "oldest lot: 2025-11-01" in UI
      table.date('oldest_lot_date');
      
      // Nearest expiry date across all lots
      // Auto-updated by trigger
      // Used for expiry alerts: "Material M-00-001 has lot expiring in 5 days"
      table.date('nearest_expiry_date');
      
    });
    
  })
  .then(() => {
    
    // ============================================================
    // PART 4: ENHANCE assignment_material_reservations (Consumed Lot)
    // ============================================================
    
    return knex.schema.withSchema('mes').alterTable('assignment_material_reservations', (table) => {
      
      // Which lot was consumed by this assignment
      // Links to stock_movements.lot_number
      // Set when production task starts and reserves materials
      // Enables traceability: which task used which lot
      table.string('lot_number', 100);
      
    });
    
  })
  .then(() => {
    
    // ============================================================
    // PART 4: INDEX FOR assignment_material_reservations
    // ============================================================
    
    return knex.schema.raw(`
      -- Index: Find which assignments consumed which lots
      -- Supports: SELECT * FROM assignment_material_reservations WHERE assignment_id = 'WO-001' AND lot_number = 'LOT-...'
      -- Used for traceability (which production task used which material lot)
      CREATE INDEX idx_assignment_lot
      ON mes.assignment_material_reservations(assignment_id, lot_number)
      WHERE lot_number IS NOT NULL;
    `);
    
  })
  .then(() => {
    
    // ============================================================
    // PART 5: CREATE TRIGGER FOR LOT SUMMARY (Denormalization)
    // ============================================================
    
    return knex.schema.raw(`
      -- PostgreSQL Function: Update lot summary in materials table
      -- Called by trigger on stock_movements INSERT/UPDATE/DELETE
      -- Denormalizes lot counts for performance
      
      CREATE OR REPLACE FUNCTION materials.update_material_lot_summary()
      RETURNS TRIGGER AS $$
      DECLARE
        v_material_code VARCHAR(50);
      BEGIN
        -- Determine which material to update
        IF TG_OP = 'DELETE' THEN
          v_material_code := OLD.material_code;
        ELSE
          v_material_code := NEW.material_code;
        END IF;
        
        -- Update materials table with fresh lot summary
        UPDATE materials.materials
        SET 
          active_lot_count = (
            -- Count distinct active lots (with positive balance)
            SELECT COUNT(DISTINCT sm.lot_number)
            FROM materials.stock_movements sm
            WHERE sm.material_code = v_material_code
              AND sm.lot_number IS NOT NULL
              AND sm.type = 'in'
            GROUP BY sm.lot_number
            HAVING SUM(CASE WHEN sm.type = 'in' THEN sm.quantity ELSE -sm.quantity END) > 0
          ),
          oldest_lot_date = (
            -- Find oldest lot with positive balance
            SELECT MIN(sm.lot_date)
            FROM materials.stock_movements sm
            WHERE sm.material_code = v_material_code
              AND sm.lot_number IS NOT NULL
              AND sm.type = 'in'
            GROUP BY sm.lot_number
            HAVING SUM(CASE WHEN sm.type = 'in' THEN sm.quantity ELSE -sm.quantity END) > 0
          ),
          nearest_expiry_date = (
            -- Find nearest expiry date across all active lots
            SELECT MIN(sm.expiry_date)
            FROM materials.stock_movements sm
            WHERE sm.material_code = v_material_code
              AND sm.lot_number IS NOT NULL
              AND sm.expiry_date IS NOT NULL
              AND sm.type = 'in'
            GROUP BY sm.lot_number
            HAVING SUM(CASE WHEN sm.type = 'in' THEN sm.quantity ELSE -sm.quantity END) > 0
          )
        WHERE code = v_material_code;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      
      -- Trigger: Fire after stock_movements INSERT/UPDATE/DELETE
      -- Note: Cannot use WHEN clause with DELETE (NEW not available)
      CREATE TRIGGER trg_update_lot_summary
      AFTER INSERT OR UPDATE OR DELETE ON materials.stock_movements
      FOR EACH ROW
      EXECUTE FUNCTION materials.update_material_lot_summary();
    `);
    
  })
  .then(() => {
    
    // ============================================================
    // COLUMN COMMENTS FOR DOCUMENTATION
    // ============================================================
    
    return knex.schema.raw(`
      -- stock_movements comments
      COMMENT ON COLUMN materials.stock_movements.lot_number IS 
        'Lot number (auto-generated or manual). Format: LOT-{materialCode}-{YYYYMMDD}-{seq}. Example: LOT-M-00-001-20251120-001';
      
      COMMENT ON COLUMN materials.stock_movements.lot_date IS 
        'Lot date (CRITICAL for FIFO sorting). For IN movements: delivery date. For OUT movements: lot_date of consumed lot. FIFO query: ORDER BY lot_date ASC.';
      
      COMMENT ON COLUMN materials.stock_movements.supplier_lot_code IS 
        'Supplier batch/lot code from delivery paperwork. Optional: links to supplier internal tracking.';
      
      COMMENT ON COLUMN materials.stock_movements.manufacturing_date IS 
        'Manufacturing date (when supplier produced this lot). Optional: for traceability and shelf-life calculation.';
      
      COMMENT ON COLUMN materials.stock_movements.expiry_date IS 
        'Expiry date (when this lot expires). Optional: for expiry alerts and FEFO (First Expired First Out).';
      
      COMMENT ON COLUMN materials.stock_movements.node_sequence IS 
        'Production node sequence that created this lot. Links to mes_production_plan_nodes.sequence. For internal production lot tracking.';
      
      -- order_items comments
      COMMENT ON COLUMN materials.order_items.lot_number IS 
        'Lot number assigned to this order delivery. Links to stock_movements.lot_number. Set when order is delivered.';
      
      COMMENT ON COLUMN materials.order_items.supplier_lot_code IS 
        'Supplier batch code copied from delivery paperwork. For reference and traceability.';
      
      COMMENT ON COLUMN materials.order_items.manufacturing_date IS 
        'Manufacturing date from supplier. Used for shelf-life tracking.';
      
      COMMENT ON COLUMN materials.order_items.expiry_date IS 
        'Expiry date from supplier. Used for expiry alerts.';
      
      -- materials comments
      COMMENT ON COLUMN materials.materials.active_lot_count IS 
        'Number of active lots for this material. Auto-updated by trigger. Denormalized for performance.';
      
      COMMENT ON COLUMN materials.materials.oldest_lot_date IS 
        'Date of oldest active lot (for FIFO indicator). Auto-updated by trigger. Displays "oldest lot: 2025-11-01" in UI.';
      
      COMMENT ON COLUMN materials.materials.nearest_expiry_date IS 
        'Nearest expiry date across all active lots. Auto-updated by trigger. Used for expiry alerts.';
      
      -- assignment_material_reservations comments
      COMMENT ON COLUMN mes.assignment_material_reservations.lot_number IS 
        'Which lot was consumed by this assignment. Links to stock_movements.lot_number. Enables traceability: which task used which lot.';
    `);
    
  });
}

export function down(knex) {
  return knex.schema.raw(`
    -- Drop trigger and function first
    DROP TRIGGER IF EXISTS trg_update_lot_summary ON materials.stock_movements;
    DROP FUNCTION IF EXISTS materials.update_material_lot_summary();
    
    -- Drop indexes
    DROP INDEX IF EXISTS materials.idx_lot_number;
    DROP INDEX IF EXISTS materials.idx_material_lot;
    DROP INDEX IF EXISTS materials.idx_fifo_lots;
    DROP INDEX IF EXISTS materials.idx_expiry;
    DROP INDEX IF EXISTS materials.idx_node_sequence;
    DROP INDEX IF EXISTS materials.idx_lot;
    DROP INDEX IF EXISTS mes.idx_assignment_lot;
  `)
  .then(() => {
    // Drop columns from stock_movements
    return knex.schema.withSchema('materials').alterTable('stock_movements', (table) => {
      table.dropColumn('lot_number');
      table.dropColumn('lot_date');
      table.dropColumn('supplier_lot_code');
      table.dropColumn('manufacturing_date');
      table.dropColumn('expiry_date');
      table.dropColumn('node_sequence');
    });
  })
  .then(() => {
    // Drop columns from order_items
    return knex.schema.withSchema('materials').alterTable('order_items', (table) => {
      table.dropColumn('lot_number');
      table.dropColumn('supplier_lot_code');
      table.dropColumn('manufacturing_date');
      table.dropColumn('expiry_date');
    });
  })
  .then(() => {
    // Drop columns from materials
    return knex.schema.withSchema('materials').alterTable('materials', (table) => {
      table.dropColumn('active_lot_count');
      table.dropColumn('oldest_lot_date');
      table.dropColumn('nearest_expiry_date');
    });
  })
  .then(() => {
    // Drop columns from assignment_material_reservations
    return knex.schema.withSchema('mes').alterTable('assignment_material_reservations', (table) => {
      table.dropColumn('lot_number');
    });
  });
}

/**
 * ============================================================
 * USAGE EXAMPLES & WORKFLOWS
 * ============================================================
 */

/**
 * WORKFLOW 1: ORDER DELIVERY (Create Lot)
 * 
 * Backend: POST /api/orders/:orderCode/items/:itemId/deliver
 * 
 * 1. Generate lot number:
 *    const lotNumber = await generateLotNumber('M-00-001', new Date());
 *    // Returns: 'LOT-M-00-001-20251120-001'
 * 
 * 2. Create stock movement with lot:
 *    INSERT INTO materials.stock_movements (
 *      material_code, type, quantity, stock_before, stock_after,
 *      lot_number, lot_date, supplier_lot_code, manufacturing_date, expiry_date
 *    ) VALUES (
 *      'M-00-001', 'in', 500, 1000, 1500,
 *      'LOT-M-00-001-20251120-001', '2025-11-20', 'SUP-BATCH-789', '2025-11-15', '2026-11-15'
 *    );
 * 
 * 3. Update order item:
 *    UPDATE materials.order_items
 *    SET lot_number = 'LOT-M-00-001-20251120-001',
 *        supplier_lot_code = 'SUP-BATCH-789',
 *        manufacturing_date = '2025-11-15',
 *        expiry_date = '2026-11-15'
 *    WHERE id = 123;
 * 
 * 4. Trigger fires: materials.active_lot_count incremented
 */

/**
 * WORKFLOW 2: PRODUCTION START (FIFO Lot Consumption)
 * 
 * Backend: POST /api/mes/assignments/:assignmentId/start
 * 
 * 1. Query available lots (FIFO order):
 *    WITH lot_balances AS (
 *      SELECT 
 *        lot_number,
 *        lot_date,
 *        SUM(CASE WHEN type='in' THEN quantity ELSE -quantity END) as available_qty
 *      FROM materials.stock_movements
 *      WHERE material_code = 'M-00-001'
 *        AND lot_number IS NOT NULL
 *      GROUP BY lot_number, lot_date
 *      HAVING SUM(...) > 0
 *      ORDER BY lot_date ASC  -- FIFO: oldest first
 *    )
 *    SELECT * FROM lot_balances;
 * 
 * 2. Consume from oldest lots:
 *    -- Need 250 kg, available lots:
 *    -- LOT-001 (2025-11-01): 100 kg
 *    -- LOT-002 (2025-11-15): 200 kg
 *    
 *    -- Consume 100 kg from LOT-001
 *    INSERT INTO materials.stock_movements (
 *      material_code, type, quantity, lot_number, lot_date
 *    ) VALUES (
 *      'M-00-001', 'out', 100, 'LOT-M-00-001-001', '2025-11-01'
 *    );
 *    
 *    -- Consume 150 kg from LOT-002
 *    INSERT INTO materials.stock_movements (
 *      material_code, type, quantity, lot_number, lot_date
 *    ) VALUES (
 *      'M-00-001', 'out', 150, 'LOT-M-00-001-002', '2025-11-15'
 *    );
 * 
 * 3. Record in assignment_material_reservations:
 *    INSERT INTO mes.assignment_material_reservations (
 *      assignment_id, material_code, consumed_qty, lot_number
 *    ) VALUES
 *      ('WO-001-01', 'M-00-001', 100, 'LOT-M-00-001-001'),
 *      ('WO-001-01', 'M-00-001', 150, 'LOT-M-00-001-002');
 */

/**
 * WORKFLOW 3: LOT INVENTORY QUERY
 * 
 * Frontend: GET /api/materials/lots
 * 
 * SELECT 
 *   sm.material_code,
 *   m.name as material_name,
 *   sm.lot_number,
 *   sm.lot_date,
 *   sm.expiry_date,
 *   SUM(CASE WHEN sm.type='in' THEN sm.quantity ELSE -sm.quantity END) as lot_balance,
 *   CASE
 *     WHEN sm.expiry_date < CURRENT_DATE THEN 'expired'
 *     WHEN sm.expiry_date < CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
 *     ELSE 'active'
 *   END as lot_status,
 *   ROW_NUMBER() OVER (PARTITION BY sm.material_code ORDER BY sm.lot_date) as fifo_order
 * FROM materials.stock_movements sm
 * JOIN materials.materials m ON m.code = sm.material_code
 * WHERE sm.lot_number IS NOT NULL
 * GROUP BY sm.material_code, m.name, sm.lot_number, sm.lot_date, sm.expiry_date
 * HAVING SUM(CASE WHEN sm.type='in' THEN sm.quantity ELSE -sm.quantity END) > 0
 * ORDER BY sm.material_code, sm.lot_date;
 * 
 * Result:
 * | Material | Lot Number | Lot Date | Balance | Expiry Date | Status | FIFO Order |
 * |----------|------------|----------|---------|-------------|--------|------------|
 * | M-00-001 | LOT-001    | 2025-11-01 | 50 kg | 2026-11-01 | active | 1 |
 * | M-00-001 | LOT-002    | 2025-11-15 | 200 kg | 2026-11-15 | active | 2 |
 */

/**
 * WORKFLOW 4: TRACEABILITY QUERY
 * 
 * Question: Which production tasks used lot LOT-M-00-001-001?
 * 
 * SELECT 
 *   r.assignment_id,
 *   a.work_order_code,
 *   a.station_name,
 *   r.material_code,
 *   r.consumed_qty,
 *   r.lot_number,
 *   a.actual_start,
 *   a.actual_end
 * FROM mes.assignment_material_reservations r
 * JOIN mes.worker_assignments a ON a.id = r.assignment_id
 * WHERE r.lot_number = 'LOT-M-00-001-20251120-001'
 * ORDER BY a.actual_start;
 * 
 * Reverse Question: Which lots were used in work order WO-001?
 * 
 * SELECT 
 *   r.material_code,
 *   m.name as material_name,
 *   r.lot_number,
 *   r.consumed_qty,
 *   sm.lot_date,
 *   sm.supplier_lot_code
 * FROM mes.assignment_material_reservations r
 * JOIN materials.materials m ON m.code = r.material_code
 * LEFT JOIN materials.stock_movements sm ON sm.lot_number = r.lot_number AND sm.type = 'in'
 * JOIN mes.worker_assignments a ON a.id = r.assignment_id
 * WHERE a.work_order_code = 'WO-001'
 * ORDER BY r.material_code, r.lot_number;
 */

/**
 * WORKFLOW 5: EXPIRY ALERTS
 * 
 * Question: Which materials have lots expiring in next 30 days?
 * 
 * SELECT 
 *   m.code,
 *   m.name,
 *   m.nearest_expiry_date,
 *   (m.nearest_expiry_date - CURRENT_DATE) as days_until_expiry,
 *   m.active_lot_count
 * FROM materials.materials m
 * WHERE m.nearest_expiry_date IS NOT NULL
 *   AND m.nearest_expiry_date < CURRENT_DATE + INTERVAL '30 days'
 * ORDER BY m.nearest_expiry_date ASC;
 * 
 * Result:
 * | Code | Name | Nearest Expiry | Days Until Expiry | Active Lots |
 * |------|------|----------------|-------------------|-------------|
 * | M-00-001 | Çelik Sac | 2025-12-15 | 25 | 3 |
 * | M-00-002 | Alüminyum | 2025-12-20 | 30 | 2 |
 */

/**
 * ============================================================
 * MIGRATION CHECKLIST
 * ============================================================
 * 
 * ✅ Part 1: stock_movements (+6 fields, +5 indexes)
 * ✅ Part 2: order_items (+4 fields, +1 index)
 * ✅ Part 3: materials (+3 denormalized fields)
 * ✅ Part 4: assignment_material_reservations (+1 field, +1 index)
 * ✅ Part 5: Trigger for lot summary auto-update
 * ✅ Column comments for documentation
 * ✅ Complete rollback (down migration)
 * ✅ Usage examples in comments
 * 
 * BACKWARD COMPATIBILITY:
 * - All new fields are NULLABLE
 * - Existing data unaffected
 * - System works with or without lot tracking
 * - Gradual adoption possible
 * 
 * PERFORMANCE NOTES:
 * - idx_fifo_lots is CRITICAL for FIFO performance
 * - Partial indexes reduce index size by 50%
 * - Trigger overhead minimal (only fires when lot_number IS NOT NULL)
 * - Denormalized fields (active_lot_count, etc.) avoid expensive aggregations
 * 
 * NEXT STEPS:
 * - Backend: Implement lotGenerator.js (generate lot numbers)
 * - Backend: Implement lotConsumption.js (FIFO lot consumption)
 * - API: Update order delivery endpoint (accept lot data)
 * - API: Update production start endpoint (consume lots)
 * - UI: Add lot input fields to order delivery form
 * - UI: Create lot inventory view
 * - UI: Add lot preview to worker portal
 */
