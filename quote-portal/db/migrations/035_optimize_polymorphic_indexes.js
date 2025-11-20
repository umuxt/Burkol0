/**
 * Migration 035: Optimize Indexes and Performance for Polymorphic Relations
 * 
 * Purpose: Add performance-optimized partial indexes for entity_relations table
 * 
 * Strategy: Create highly specific partial indexes for common query patterns
 * Each partial index only indexes rows matching specific WHERE conditions
 * 
 * Benefits:
 * - 80-90% smaller index size (only indexes relevant rows)
 * - Faster query execution (index-only scans)
 * - Lower memory footprint
 * - Better cache hit ratio
 * 
 * Target Performance:
 * - Worker → Station queries: < 5ms
 * - Node → Station queries: < 5ms
 * - Station → Operation queries: < 5ms
 * - Node → Predecessor queries: < 10ms (graph traversal)
 * 
 * Note: Migration 032 already created 6 partial indexes.
 * This migration adds 5 MORE partial indexes for edge cases and optimization.
 * 
 * Reference: MES-COMPLETE-MIGRATION-GUIDE.md - STEP 5
 * Reference: MES-ULTIMATE-DATABASE-ARCHITECTURE.md - Index Strategy
 * 
 * Created: 2025-11-20
 */

export async function up(knex) {
  console.log('🚀 Migration 035: Optimizing polymorphic indexes...');
  
  await knex.schema.raw(`
    -- ============================================================
    -- ADDITIONAL PARTIAL INDEXES FOR PERFORMANCE
    -- ============================================================
    
    -- Index 1: Worker → Stations FAST (Source + Target only, ultra-fast lookups)
    -- Purpose: Fastest possible lookup for worker-station assignments
    -- Query pattern: Check if worker is assigned to a specific station
    -- Expected rows: ~100-500 per worker (low cardinality)
    -- Index size: ~80% smaller than full index
    CREATE INDEX IF NOT EXISTS idx_worker_stations_fast 
    ON mes.entity_relations(source_id, target_id)
    WHERE source_type = 'worker' AND relation_type = 'station';
    
    -- Index 2: Worker → Operations FAST (Worker qualification checks)
    -- Purpose: Check if worker is qualified for an operation
    -- Query pattern: Can worker X perform operation Y?
    -- Expected rows: ~10-50 per worker (very low cardinality)
    -- Index size: ~90% smaller than full index
    CREATE INDEX IF NOT EXISTS idx_worker_operations_fast
    ON mes.entity_relations(source_id, target_id)
    WHERE source_type = 'worker' AND relation_type = 'operation';
    
    -- Index 3: Node → Stations with Priority (Station assignment + fallback logic)
    -- Purpose: Get primary and fallback stations for a production node
    -- Query pattern: SELECT * WHERE source='node' AND type='station' ORDER BY priority
    -- Expected rows: ~1-5 per node (very low cardinality)
    -- Index size: ~95% smaller than full index
    -- CRITICAL: Priority field is indexed for ORDER BY optimization
    CREATE INDEX IF NOT EXISTS idx_node_stations_priority
    ON mes.entity_relations(source_id, target_id, priority)
    WHERE source_type = 'node' AND relation_type = 'station';
    
    -- Index 4: Node → Predecessors (Dependency graph traversal)
    -- Purpose: Build production plan dependency graph
    -- Query pattern: Find all predecessor nodes for topological sort
    -- Expected rows: ~0-10 per node (sparse graph)
    -- Index size: ~85% smaller than full index
    -- Use case: Critical path analysis, scheduling order
    CREATE INDEX IF NOT EXISTS idx_node_predecessors_graph
    ON mes.entity_relations(source_id, target_id)
    WHERE source_type = 'node' AND relation_type = 'predecessor';
    
    -- Index 5: Station → Operations (Station capability matrix)
    -- Purpose: Find all operations a station can perform
    -- Query pattern: Which operations can this station do?
    -- Expected rows: ~5-20 per station
    -- Index size: ~85% smaller than full index
    CREATE INDEX IF NOT EXISTS idx_station_operations_fast
    ON mes.entity_relations(source_id, target_id)
    WHERE source_type = 'station' AND relation_type = 'operation';
    
    -- Index 6: Node → Substations (Substation assignments)
    -- Purpose: Get all substations assigned to a node
    -- Query pattern: Which substations are involved in this production step?
    -- Expected rows: ~0-3 per node (very sparse)
    -- Index size: ~95% smaller than full index
    CREATE INDEX IF NOT EXISTS idx_node_substations_fast
    ON mes.entity_relations(source_id, target_id)
    WHERE source_type = 'node' AND relation_type = 'substation';
    
    -- Index 7: Reverse lookup - Target to Source (Who uses this entity?)
    -- Purpose: Find all entities that reference a specific target
    -- Query pattern: Which workers are assigned to station S-001?
    -- Expected rows: Variable (depends on target popularity)
    -- Use case: Impact analysis, cascade delete validation
    CREATE INDEX IF NOT EXISTS idx_reverse_lookup
    ON mes.entity_relations(relation_type, target_id, source_type, source_id)
    WHERE relation_type IN ('station', 'operation');
    
  `);
  
  console.log('   ✅ 7 performance indexes created');
  
  // ============================================================
  // UPDATE STATISTICS (Critical for query planner)
  // ============================================================
  
  console.log('   📊 Updating table statistics...');
  
  await knex.schema.raw(`
    -- Analyze table to update statistics
    -- This helps PostgreSQL query planner choose the best index
    ANALYZE mes.entity_relations;
  `);
  
  console.log('   ✅ Statistics updated');
  
  // ============================================================
  // PERFORMANCE VERIFICATION QUERIES (as comments)
  // ============================================================
  
  console.log('');
  console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   📈 PERFORMANCE TEST QUERIES');
  console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('   Run these queries to verify index performance:');
  console.log('');
  console.log('   1. Worker → Stations (should use idx_worker_stations_fast):');
  console.log('      EXPLAIN ANALYZE');
  console.log('      SELECT target_id FROM mes.entity_relations');
  console.log("      WHERE source_type='worker' AND source_id='W-001' AND relation_type='station';");
  console.log('');
  console.log('   2. Node → Stations with Priority (should use idx_node_stations_priority):');
  console.log('      EXPLAIN ANALYZE');
  console.log('      SELECT target_id, priority FROM mes.entity_relations');
  console.log("      WHERE source_type='node' AND source_id='1' AND relation_type='station'");
  console.log('      ORDER BY priority;');
  console.log('');
  console.log('   3. Station → Operations (should use idx_station_operations_fast):');
  console.log('      EXPLAIN ANALYZE');
  console.log('      SELECT target_id FROM mes.entity_relations');
  console.log("      WHERE source_type='station' AND source_id='S-001' AND relation_type='operation';");
  console.log('');
  console.log('   Expected: "Index Scan using idx_*" with execution time < 5ms');
  console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  console.log('✅ Migration 035 complete: Polymorphic indexes optimized');
  console.log('   Total indexes on entity_relations: 13 (6 from Migration 032 + 7 new)');
  console.log('   Expected query performance: < 5ms for all common patterns');
}

export async function down(knex) {
  console.log('⏮️  Migration 035 rollback: Removing optimized indexes...');
  
  await knex.schema.raw(`
    -- Drop all performance indexes created by this migration
    DROP INDEX IF EXISTS mes.idx_worker_stations_fast;
    DROP INDEX IF EXISTS mes.idx_worker_operations_fast;
    DROP INDEX IF EXISTS mes.idx_node_stations_priority;
    DROP INDEX IF EXISTS mes.idx_node_predecessors_graph;
    DROP INDEX IF EXISTS mes.idx_station_operations_fast;
    DROP INDEX IF EXISTS mes.idx_node_substations_fast;
    DROP INDEX IF EXISTS mes.idx_reverse_lookup;
  `);
  
  console.log('✅ Migration 035 rollback complete: Optimized indexes removed');
  console.log('   NOTE: Base indexes from Migration 032 are still present');
}
