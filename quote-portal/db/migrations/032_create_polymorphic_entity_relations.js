/**
 * Migration 032: Create Polymorphic Entity Relations Table
 * 
 * Purpose: Consolidate 6 junction tables into a single polymorphic table
 * 
 * This migration creates mes.entity_relations to replace:
 * 1. mes.worker_stations (worker → station)
 * 2. mes.worker_operations (worker → operation)
 * 3. mes.station_operations (station → operation)
 * 4. mes.node_stations (node → station, with priority)
 * 5. mes.node_substations (node → substation)
 * 6. mes.node_predecessors (node → predecessor node)
 * 
 * Benefits:
 * - Reduces table count: 25 → 19 tables (24% optimization)
 * - Flexible schema: Easy to add new relationship types
 * - Consistent query pattern across all relationships
 * - Better index utilization with partial indexes
 * 
 * Polymorphic Pattern:
 * - source_type + source_id: "Who" (worker, station, node)
 * - relation_type + target_id: "What" (station, operation, predecessor, etc.)
 * - Metadata fields: priority, quantity, unit_ratio, is_derived
 * 
 * Reference: MES-COMPLETE-MIGRATION-GUIDE.md - STEP 1
 * Reference: MES-ULTIMATE-DATABASE-ARCHITECTURE.md - Decision 2
 */

export function up(knex) {
  return knex.schema.withSchema('mes').createTable('entity_relations', (table) => {
    
    // ============================================================
    // PRIMARY KEY
    // ============================================================
    
    table.increments('id').primary();
    
    
    // ============================================================
    // SOURCE ENTITY (Who)
    // ============================================================
    
    // Type of source entity: 'worker', 'station', 'node'
    table.string('source_type', 50).notNullable();
    
    // ID of source entity (references various tables)
    // worker: references mes.workers.id
    // station: references mes.stations.id
    // node: references mes.production_plan_nodes.id
    table.string('source_id', 100).notNullable();
    
    
    // ============================================================
    // TARGET/RELATION (What)
    // ============================================================
    
    // Type of relationship/target: 'station', 'operation', 'substation', 'material', 'predecessor'
    table.string('relation_type', 50).notNullable();
    
    // ID of target entity
    // station: references mes.stations.id
    // operation: references mes.operations.id
    // substation: references mes.substations.id
    // predecessor: references mes.production_plan_nodes.id
    // material: references materials.materials.code
    table.string('target_id', 100).notNullable();
    
    
    // ============================================================
    // METADATA (Relationship-specific data)
    // ============================================================
    
    // Priority (for station assignments)
    // 1 = primary station, 2 = fallback station, etc.
    // Used by: node → station relationships
    // NULL for other relationship types
    table.integer('priority');
    
    // Quantity (for material inputs)
    // Amount of material required
    // Used by: node → material relationships
    // NULL for other relationship types
    table.decimal('quantity', 10, 2);
    
    // Unit ratio (for material calculations)
    // Conversion ratio for material units
    // Used by: node → material relationships
    // NULL for other relationship types
    table.decimal('unit_ratio', 10, 4);
    
    // Is derived (for WIP materials)
    // TRUE if this material is produced by a previous node (WIP)
    // FALSE if this material is raw material from inventory
    // Used by: node → material relationships
    // NULL for other relationship types
    table.boolean('is_derived');
    
    
    // ============================================================
    // AUDIT FIELDS
    // ============================================================
    
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    
    // ============================================================
    // CONSTRAINTS
    // ============================================================
    
    // Unique constraint: Same relationship cannot exist twice
    // Example: Worker W-001 cannot be assigned to Station S-001 twice
    table.unique(['source_type', 'source_id', 'relation_type', 'target_id'], 
                 'uk_entity_relation');
    
    
    // ============================================================
    // INDEXES (General)
    // ============================================================
    
    // Index 1: Source lookup (find all relations FROM an entity)
    // Query: SELECT * FROM entity_relations WHERE source_type='worker' AND source_id='W-001'
    table.index(['source_type', 'source_id'], 'idx_source');
    
    // Index 2: Target lookup (find all relations TO an entity)
    // Query: SELECT * FROM entity_relations WHERE relation_type='station' AND target_id='S-001'
    table.index(['relation_type', 'target_id'], 'idx_target');
    
    // Index 3: Composite lookup (specific relationship type FROM entity)
    // Query: SELECT * FROM entity_relations WHERE source_type='worker' AND source_id='W-001' AND relation_type='station'
    table.index(['source_type', 'source_id', 'relation_type'], 'idx_composite');
    
  })
  .then(() => {
    
    // ============================================================
    // CHECK CONSTRAINTS
    // ============================================================
    
    return knex.schema.raw(`
      -- Constraint 1: Valid source types
      ALTER TABLE mes.entity_relations
      ADD CONSTRAINT chk_source_type 
      CHECK (source_type IN ('worker', 'station', 'node'));
      
      -- Constraint 2: Valid relation types
      ALTER TABLE mes.entity_relations
      ADD CONSTRAINT chk_relation_type
      CHECK (relation_type IN ('station', 'operation', 'substation', 'material', 'predecessor'));
      
      -- Constraint 3: Priority must be positive if set
      ALTER TABLE mes.entity_relations
      ADD CONSTRAINT chk_priority_positive
      CHECK (priority IS NULL OR priority > 0);
      
      -- Constraint 4: Quantity must be positive if set
      ALTER TABLE mes.entity_relations
      ADD CONSTRAINT chk_quantity_positive
      CHECK (quantity IS NULL OR quantity > 0);
      
      -- Constraint 5: Unit ratio must be positive if set
      ALTER TABLE mes.entity_relations
      ADD CONSTRAINT chk_unit_ratio_positive
      CHECK (unit_ratio IS NULL OR unit_ratio > 0);
    `);
    
  })
  .then(() => {
    
    // ============================================================
    // PARTIAL INDEXES (Performance Optimization)
    // ============================================================
    // These indexes are MUCH smaller because they only index specific relationship types
    // Expected index size reduction: 80-90% per partial index
    
    return knex.schema.raw(`
      -- Partial Index 1: Worker → Stations (Most frequently queried)
      -- Query: SELECT * FROM entity_relations WHERE source_type='worker' AND relation_type='station'
      -- Use case: Worker portal showing assigned stations
      CREATE INDEX idx_worker_stations
      ON mes.entity_relations(source_id, target_id)
      WHERE source_type = 'worker' AND relation_type = 'station';
      
      -- Partial Index 2: Worker → Operations (Worker qualifications)
      -- Query: SELECT * FROM entity_relations WHERE source_type='worker' AND relation_type='operation'
      -- Use case: Check if worker is qualified for an operation
      CREATE INDEX idx_worker_operations
      ON mes.entity_relations(source_id, target_id)
      WHERE source_type = 'worker' AND relation_type = 'operation';
      
      -- Partial Index 3: Node → Stations (With priority for fallback logic)
      -- Query: SELECT * FROM entity_relations WHERE source_type='node' AND relation_type='station' ORDER BY priority
      -- Use case: Production plan node showing primary and fallback stations
      CREATE INDEX idx_node_stations
      ON mes.entity_relations(source_id, target_id, priority)
      WHERE source_type = 'node' AND relation_type = 'station';
      
      -- Partial Index 4: Station → Operations (Station capabilities)
      -- Query: SELECT * FROM entity_relations WHERE source_type='station' AND relation_type='operation'
      -- Use case: Check which operations a station can perform
      CREATE INDEX idx_station_operations
      ON mes.entity_relations(source_id, target_id)
      WHERE source_type = 'station' AND relation_type = 'operation';
      
      -- Partial Index 5: Node → Predecessors (Dependency graph traversal)
      -- Query: SELECT * FROM entity_relations WHERE source_type='node' AND relation_type='predecessor'
      -- Use case: Build dependency graph for production plan
      CREATE INDEX idx_node_predecessors
      ON mes.entity_relations(source_id, target_id)
      WHERE source_type = 'node' AND relation_type = 'predecessor';
      
      -- Partial Index 6: Node → Substations
      -- Query: SELECT * FROM entity_relations WHERE source_type='node' AND relation_type='substation'
      -- Use case: Find substations required for a production node
      CREATE INDEX idx_node_substations
      ON mes.entity_relations(source_id, target_id)
      WHERE source_type = 'node' AND relation_type = 'substation';
    `);
    
  })
  .then(() => {
    
    // ============================================================
    // COMMENTS (Documentation)
    // ============================================================
    
    return knex.schema.raw(`
      COMMENT ON TABLE mes.entity_relations IS 
      'Polymorphic table consolidating 6 junction tables: worker_stations, worker_operations, station_operations, node_stations, node_substations, node_predecessors. Created in Migration 032.';
      
      COMMENT ON COLUMN mes.entity_relations.source_type IS 
      'Type of source entity: worker, station, or node';
      
      COMMENT ON COLUMN mes.entity_relations.source_id IS 
      'ID of source entity (references mes.workers.id, mes.stations.id, or mes.production_plan_nodes.id)';
      
      COMMENT ON COLUMN mes.entity_relations.relation_type IS 
      'Type of relationship: station, operation, substation, material, or predecessor';
      
      COMMENT ON COLUMN mes.entity_relations.target_id IS 
      'ID of target entity (varies by relation_type)';
      
      COMMENT ON COLUMN mes.entity_relations.priority IS 
      'Priority for station assignments (1=primary, 2=fallback). Used only for node→station relations.';
      
      COMMENT ON COLUMN mes.entity_relations.quantity IS 
      'Quantity of material required. Used only for node→material relations.';
      
      COMMENT ON COLUMN mes.entity_relations.unit_ratio IS 
      'Unit conversion ratio. Used only for node→material relations.';
      
      COMMENT ON COLUMN mes.entity_relations.is_derived IS 
      'TRUE if material is WIP from previous node. Used only for node→material relations.';
    `);
    
  });
}

export function down(knex) {
  return knex.schema.withSchema('mes').dropTableIfExists('entity_relations');
}
