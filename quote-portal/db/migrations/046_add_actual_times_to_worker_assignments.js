/**
 * Migration 046: Add Actual Times and Completion Data to Worker Assignments
 * 
 * Adds fields to track actual execution vs. estimated:
 * - started_at: When worker actually started (vs estimated_start_time)
 * - completed_at: When worker actually finished (vs estimated_end_time)
 * - actual_quantity: Actual output produced
 * - notes: Completion notes from worker
 * 
 * This enables:
 * - Performance tracking (actual vs estimated)
 * - Production variance analysis
 * - Worker feedback collection
 */

export async function up(knex) {
  console.log('📋 Migration 046: Adding actual quantity and notes to worker_assignments...');
  
  await knex.schema.withSchema('mes').table('worker_assignments', (table) => {
    // NOTE: started_at and completed_at already exist from earlier migration
    
    // Completion data
    table.decimal('actual_quantity', 12, 2)
      .comment('Actual quantity produced (may differ from planned)');
    table.text('notes')
      .comment('Worker notes on completion, issues, or variance');
  });
  
  console.log('✅ Added actual_quantity, notes');
  console.log('✅ started_at and completed_at already exist');
  console.log('');
  console.log('📊 Field Comparison:');
  console.log('   estimated_start_time → started_at (planned vs actual)');
  console.log('   estimated_end_time → completed_at (planned vs actual)');
  console.log('   (planned quantity from node) → actual_quantity');
}

export async function down(knex) {
  console.log('⏪ Rolling back Migration 046...');
  
  await knex.schema.withSchema('mes').table('worker_assignments', (table) => {
    // Drop only the columns we added
    table.dropColumn('actual_quantity');
    table.dropColumn('notes');
  });
  
  console.log('✅ Rolled back actual_quantity and notes');
}
