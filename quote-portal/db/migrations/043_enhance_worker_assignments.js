/**
 * Migration 043: Enhance Worker Assignments for PHASE 3 Launch
 * 
 * Adds timing and sequencing fields to mes.worker_assignments
 * Required for advanced launch algorithm with:
 * - Shift-aware scheduling
 * - Queue management
 * - Parallel node execution
 * 
 * New Fields:
 * - estimated_start_time: When worker should start (based on shift + queue)
 * - estimated_end_time: When task should complete (start + effective_time)
 * - sequence_number: Order of assignments for same worker (1, 2, 3...)
 */

export async function up(knex) {
  console.log('📋 Migration 043: Enhancing worker_assignments for PHASE 3...');
  
  await knex.schema.withSchema('mes').table('worker_assignments', (table) => {
    // Timing fields for scheduling
    table.timestamp('estimated_start_time')
      .comment('Estimated start time based on shift and queue');
    table.timestamp('estimated_end_time')
      .comment('Estimated completion time (start + effective_time)');
    
    // Sequencing for queue management
    table.integer('sequence_number')
      .comment('Order of assignments for same worker (1, 2, 3...)');
    
    // Indexes for performance
    table.index('estimated_start_time', 'idx_worker_assignments_est_start');
    table.index(['worker_id', 'sequence_number'], 'idx_worker_assignments_worker_seq');
    table.index(['substation_id', 'estimated_start_time'], 'idx_worker_assignments_sub_time');
  });
  
  console.log('✅ Added estimated_start_time, estimated_end_time, sequence_number');
  console.log('✅ Created indexes for scheduling queries');
}

export async function down(knex) {
  console.log('⏪ Rolling back Migration 043...');
  
  await knex.schema.withSchema('mes').table('worker_assignments', (table) => {
    // Drop indexes first
    table.dropIndex('estimated_start_time', 'idx_worker_assignments_est_start');
    table.dropIndex(['worker_id', 'sequence_number'], 'idx_worker_assignments_worker_seq');
    table.dropIndex(['substation_id', 'estimated_start_time'], 'idx_worker_assignments_sub_time');
    
    // Drop columns
    table.dropColumn('estimated_start_time');
    table.dropColumn('estimated_end_time');
    table.dropColumn('sequence_number');
  });
  
  console.log('✅ Rolled back worker_assignments enhancements');
}
