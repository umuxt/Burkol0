/**
 * Migration 047: Add Actual Execution Fields to Production Plan Nodes
 * 
 * Adds fields to track actual node execution:
 * - status: pending|in_progress|completed|paused
 * - started_at: When node actually started
 * - completed_at: When node actually finished
 * - actual_quantity: Actual output produced
 * 
 * This enables:
 * - Real-time production tracking
 * - Status synchronization between nodes and assignments
 * - Performance analysis (estimated vs actual times)
 */

export async function up(knex) {
  console.log('📋 Migration 047: Adding actual execution fields to production_plan_nodes...');
  
  await knex.schema.withSchema('mes').table('production_plan_nodes', (table) => {
    // Node execution status
    table.string('status', 20)
      .defaultTo('pending')
      .comment('Node status: pending|in_progress|completed|paused');
    
    // Actual execution times
    table.timestamp('started_at')
      .comment('Actual start time (when first worker started)');
    table.timestamp('completed_at')
      .comment('Actual completion time (when node fully completed)');
    
    // Actual production data
    table.decimal('actual_quantity', 12, 2)
      .comment('Actual quantity produced (may differ from output_qty)');
    
    // Indexes for status queries
    table.index('status', 'idx_nodes_status');
    table.index(['plan_id', 'status'], 'idx_nodes_plan_status');
  });
  
  console.log('✅ Added status, started_at, completed_at, actual_quantity');
  console.log('✅ Created indexes for status queries');
  console.log('');
  console.log('📊 Node Status Flow:');
  console.log('   pending → in_progress → completed');
  console.log('   (can pause from in_progress → paused → in_progress)');
}

export async function down(knex) {
  console.log('⏪ Rolling back Migration 047...');
  
  await knex.schema.withSchema('mes').table('production_plan_nodes', (table) => {
    // Drop indexes first
    table.dropIndex('status', 'idx_nodes_status');
    table.dropIndex(['plan_id', 'status'], 'idx_nodes_plan_status');
    
    // Drop columns
    table.dropColumn('status');
    table.dropColumn('started_at');
    table.dropColumn('completed_at');
    table.dropColumn('actual_quantity');
  });
  
  console.log('✅ Rolled back node execution fields');
}
