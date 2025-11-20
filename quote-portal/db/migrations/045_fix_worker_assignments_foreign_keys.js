/**
 * Migration 045: Fix Worker Assignments Foreign Keys
 * 
 * Purpose: Convert worker_assignments to use proper INTEGER foreign keys
 * 
 * Changes:
 * 1. node_id: VARCHAR → INTEGER (FK to production_plan_nodes.id)
 * 2. id: VARCHAR → SERIAL (auto-increment primary key)
 * 
 * Background:
 * - Old Firebase system used VARCHAR IDs ("WO-001-01")
 * - New SQL system uses INTEGER auto-increment (1, 2, 3...)
 * - This migration aligns worker_assignments with production_plan_nodes
 * 
 * Benefits:
 * - Foreign key constraints (referential integrity)
 * - Better performance (integer index vs string)
 * - Proper cascade deletion
 * 
 * Created: 20 Kasım 2025
 */

export async function up(knex) {
  console.log('🔧 Migration 045: Fixing worker_assignments foreign keys...');
  
  // 1. Check if there's existing data
  const existingData = await knex('mes.worker_assignments').select('*');
  console.log(`   Found ${existingData.length} existing assignments (will be preserved)`);
  
  // 2. Create new table with correct schema
  await knex.schema.withSchema('mes').createTable('worker_assignments_new', (table) => {
    // Primary key (auto-increment)
    table.increments('id').primary();
    
    // Foreign keys
    table.string('plan_id', 100).notNullable()
      .references('id').inTable('mes.production_plans')
      .onDelete('CASCADE');
    
    table.string('work_order_code', 100).notNullable();
    
    table.integer('node_id').notNullable()
      .references('id').inTable('mes.production_plan_nodes')
      .onDelete('CASCADE')
      .comment('INTEGER foreign key to production_plan_nodes.id');
    
    table.string('operation_id', 100);
    table.string('worker_id', 100);
    table.string('worker_name', 255);
    table.string('station_id', 100);
    table.string('substation_id', 100);
    
    // Status and metadata
    table.string('status', 50).defaultTo('pending');
    table.jsonb('materials');
    table.jsonb('pre_production_reserved_amount');
    table.jsonb('actual_reserved_amounts');
    table.string('material_reservation_status', 50);
    table.integer('quantity');
    table.integer('priority').defaultTo(0);
    table.boolean('is_urgent').defaultTo(false);
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('assigned_at');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    
    // Scheduling (PHASE 3 fields from Migration 043)
    table.string('scheduling_mode', 20).defaultTo('fifo');
    table.integer('nominal_time');
    table.integer('effective_time');
    table.timestamp('expected_start');
    table.timestamp('optimized_start');
    table.timestamp('planned_end');
    table.timestamp('estimated_start_time').comment('PHASE 3: Shift-aware scheduling');
    table.timestamp('estimated_end_time').comment('PHASE 3: Task completion time');
    table.integer('sequence_number').comment('PHASE 3: Queue position (1=current, 2+=queued)');
    
    // Indexes
    table.index('plan_id');
    table.index('node_id');
    table.index('worker_id');
    table.index('status');
    table.index('estimated_start_time');
    table.index(['worker_id', 'sequence_number']);
    table.index(['substation_id', 'estimated_start_time']);
  });
  
  console.log('✅ Created worker_assignments_new table with INTEGER foreign keys');
  
  // 3. Migrate existing data (if any)
  if (existingData.length > 0) {
    console.log('   Migrating existing data...');
    
    for (const row of existingData) {
      // Try to find matching node by node_id (VARCHAR)
      const node = await knex('mes.production_plan_nodes')
        .where('node_id', row.node_id)
        .first();
      
      if (node) {
        // Migrate with INTEGER node_id
        await knex('mes.worker_assignments_new').insert({
          plan_id: row.plan_id,
          work_order_code: row.work_order_code,
          node_id: node.id, // INTEGER!
          operation_id: row.operation_id,
          worker_id: row.worker_id,
          worker_name: row.worker_name,
          station_id: row.station_id,
          substation_id: row.substation_id,
          status: row.status,
          materials: row.materials,
          pre_production_reserved_amount: row.pre_production_reserved_amount,
          actual_reserved_amounts: row.actual_reserved_amounts,
          material_reservation_status: row.material_reservation_status,
          quantity: row.quantity,
          priority: row.priority,
          is_urgent: row.is_urgent,
          created_at: row.created_at,
          assigned_at: row.assigned_at,
          started_at: row.started_at,
          completed_at: row.completed_at,
          scheduling_mode: row.scheduling_mode,
          nominal_time: row.nominal_time,
          effective_time: row.effective_time,
          expected_start: row.expected_start,
          optimized_start: row.optimized_start,
          planned_end: row.planned_end,
          estimated_start_time: row.estimated_start_time,
          estimated_end_time: row.estimated_end_time,
          sequence_number: row.sequence_number
        });
      } else {
        console.log(`   ⚠️  Warning: Could not migrate assignment ${row.id} - node not found`);
      }
    }
    
    console.log(`✅ Migrated ${existingData.length} assignments`);
  }
  
  // 4. Drop old table (CASCADE to drop dependent constraints) and rename new one
  await knex.raw('DROP TABLE mes.worker_assignments CASCADE');
  await knex.schema.withSchema('mes').renameTable('worker_assignments_new', 'worker_assignments');
  
  console.log('✅ Replaced old table with new schema');
  console.log('✅ Migration 045 complete - worker_assignments now uses INTEGER foreign keys');
}

export async function down(knex) {
  console.log('⏪ Rolling back Migration 045...');
  
  // Recreate old VARCHAR-based table
  await knex.schema.withSchema('mes').createTable('worker_assignments_old', (table) => {
    table.string('id', 100).primary();
    table.string('plan_id', 100).notNullable();
    table.string('work_order_code', 100).notNullable();
    table.string('node_id', 100).notNullable();
    table.string('operation_id', 100);
    table.string('worker_id', 100);
    table.string('worker_name', 255);
    table.string('station_id', 100);
    table.string('substation_id', 100);
    table.string('status', 50).defaultTo('pending');
    table.jsonb('materials');
    table.jsonb('pre_production_reserved_amount');
    table.jsonb('actual_reserved_amounts');
    table.string('material_reservation_status', 50);
    table.integer('quantity');
    table.integer('priority').defaultTo(0);
    table.boolean('is_urgent').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('assigned_at');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.string('scheduling_mode', 20).defaultTo('fifo');
    table.integer('nominal_time');
    table.integer('effective_time');
    table.timestamp('expected_start');
    table.timestamp('optimized_start');
    table.timestamp('planned_end');
    table.timestamp('estimated_start_time');
    table.timestamp('estimated_end_time');
    table.integer('sequence_number');
  });
  
  // Migrate data back (best effort)
  const currentData = await knex('mes.worker_assignments').select('*');
  for (const row of currentData) {
    const node = await knex('mes.production_plan_nodes').where('id', row.node_id).first();
    if (node) {
      await knex('mes.worker_assignments_old').insert({
        ...row,
        id: `WA-${row.id}`,
        node_id: node.node_id // Convert back to VARCHAR
      });
    }
  }
  
  await knex.schema.withSchema('mes').dropTable('worker_assignments');
  await knex.schema.withSchema('mes').renameTable('worker_assignments_old', 'worker_assignments');
  
  console.log('✅ Rolled back to VARCHAR-based worker_assignments');
}
