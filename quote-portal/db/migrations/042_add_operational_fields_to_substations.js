/**
 * Migration 042: Add Operational Fields to Substations
 * 
 * Purpose: Add fields for substation operational tracking
 * 
 * New Fields:
 * - status: Track substation availability (available, reserved, in_use, maintenance)
 * - current_assignment_id: Link to current worker assignment
 * - assigned_worker_id: Current worker using this substation
 * - next_operations: Queue of upcoming operations (JSONB array)
 * 
 * Benefits:
 * - Real-time substation availability tracking
 * - Worker-substation assignment visibility
 * - Operation queue management for scheduling
 * - Better resource utilization
 * 
 * Created: 20 Kasım 2025
 */

export async function up(knex) {
  console.log('🔧 Migration 042: Adding operational fields to substations...');
  
  await knex.schema.withSchema('mes').table('substations', (table) => {
    // Status tracking
    table.string('status', 20).defaultTo('available')
      .comment('Substation status: available, reserved, in_use, maintenance');
    
    // Current assignment tracking
    table.integer('current_assignment_id')
      .comment('ID of current production plan node assignment');
    
    table.string('assigned_worker_id', 50)
      .references('id').inTable('mes.workers').onDelete('SET NULL')
      .comment('Worker currently using this substation');
    
    // Timestamps for tracking
    table.timestamp('reserved_at')
      .comment('When substation was reserved');
    
    table.timestamp('in_use_since')
      .comment('When current operation started');
    
    // Indexes
    table.index('status', 'idx_substations_status');
    table.index('assigned_worker_id', 'idx_substations_worker');
    table.index(['station_id', 'status'], 'idx_substations_station_status');
  });
  
  // Set all existing substations to 'available' status
  await knex('mes.substations')
    .update({ status: 'available' });
  
  console.log('✅ Added operational fields to substations');
  console.log('   - status (available/reserved/in_use/maintenance)');
  console.log('   - current_assignment_id');
  console.log('   - assigned_worker_id');
  console.log('   - reserved_at, in_use_since timestamps');
  console.log('   Note: Next operations query from production_plan_nodes table');
}

export async function down(knex) {
  console.log('⏮️  Migration 042 rollback: Removing operational fields...');
  
  await knex.schema.withSchema('mes').table('substations', (table) => {
    table.dropIndex('status', 'idx_substations_status');
    table.dropIndex('assigned_worker_id', 'idx_substations_worker');
    table.dropIndex(['station_id', 'status'], 'idx_substations_station_status');
    
    table.dropColumn('status');
    table.dropColumn('current_assignment_id');
    table.dropColumn('assigned_worker_id');
    table.dropColumn('reserved_at');
    table.dropColumn('in_use_since');
  });
  
  console.log('✅ Removed operational fields from substations');
}
