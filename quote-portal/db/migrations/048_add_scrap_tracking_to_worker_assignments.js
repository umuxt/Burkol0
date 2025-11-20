/**
 * Migration 048: Add Scrap Tracking to Worker Assignments
 * 
 * Adds fields to track scrap and defects during task execution:
 * - input_scrap_count: JSONB counter for damaged input materials
 * - production_scrap_count: JSONB counter for production waste
 * - defect_quantity: Count of defective output units
 * 
 * This enables:
 * - Real-time scrap tracking during production
 * - Material waste analysis
 * - Quality metrics (defect rate calculation)
 * - Undo/redo scrap entry (increment/decrement)
 * 
 * JSONB Format:
 * {
 *   "MAT-001": 5,    // 5 units of MAT-001 scrapped
 *   "MAT-002": 3     // 3 units of MAT-002 scrapped
 * }
 */

export async function up(knex) {
  console.log('📋 Migration 048: Adding scrap tracking to worker_assignments...');
  
  await knex.schema.withSchema('mes').table('worker_assignments', (table) => {
    // Scrap tracking columns
    table.jsonb('input_scrap_count')
      .defaultTo('{}')
      .comment('Counter for damaged input materials: {"materialCode": quantity}');
    
    table.jsonb('production_scrap_count')
      .defaultTo('{}')
      .comment('Counter for production waste/scrap: {"materialCode": quantity}');
    
    table.decimal('defect_quantity', 12, 2)
      .defaultTo(0)
      .comment('Number of defective output units produced');
  });
  
  // Create GIN indexes for JSONB columns (enables fast lookup)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_worker_assignments_input_scrap 
    ON mes.worker_assignments USING gin(input_scrap_count)
  `);
  
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_worker_assignments_production_scrap 
    ON mes.worker_assignments USING gin(production_scrap_count)
  `);
  
  console.log('✅ Added scrap tracking columns:');
  console.log('   - input_scrap_count (JSONB)');
  console.log('   - production_scrap_count (JSONB)');
  console.log('   - defect_quantity (NUMERIC)');
  console.log('✅ Created GIN indexes for JSONB queries');
  console.log('');
  console.log('📊 Scrap Tracking Flow:');
  console.log('   1. Worker starts task');
  console.log('   2. Discovers damaged material → POST /work-packages/:id/scrap');
  console.log('   3. Material waste during production → increment counter');
  console.log('   4. Defective output discovered → increment defect_quantity');
  console.log('   5. Undo scrap entry → DELETE /work-packages/:id/scrap/...');
}

export async function down(knex) {
  console.log('⏪ Rolling back Migration 048...');
  
  // Drop indexes first
  await knex.raw('DROP INDEX IF EXISTS mes.idx_worker_assignments_input_scrap');
  await knex.raw('DROP INDEX IF EXISTS mes.idx_worker_assignments_production_scrap');
  
  // Drop columns
  await knex.schema.withSchema('mes').table('worker_assignments', (table) => {
    table.dropColumn('input_scrap_count');
    table.dropColumn('production_scrap_count');
    table.dropColumn('defect_quantity');
  });
  
  console.log('✅ Rolled back scrap tracking columns and indexes');
}
