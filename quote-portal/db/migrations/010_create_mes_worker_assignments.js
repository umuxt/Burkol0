/**
 * Migration: Create MES worker assignments table
 * Converts Firebase 'mes-worker-assignments' collection to PostgreSQL
 * Critical table for task management and FIFO system
 */

export function up(knex) {
  return knex.schema.createTable('mes_worker_assignments', (table) => {
    // Primary key
    table.string('id', 100).primary();
    
    // Plan reference
    table.string('plan_id', 100).notNullable();
    table.string('work_order_code', 100).notNullable();
    table.string('node_id', 100).notNullable();
    
    // Operation
    table.string('operation_id', 100);
    
    // Assignment
    table.string('worker_id', 100);
    table.string('worker_name', 255);
    table.string('station_id', 100);
    table.string('substation_id', 100);
    
    // Status
    table.string('status', 50).defaultTo('pending'); // pending, ready, in-progress, completed, cancelled
    
    // Materials
    table.jsonb('materials'); // Material requirements
    table.jsonb('pre_production_reserved_amount'); // Pre-production reservations
    table.jsonb('actual_reserved_amounts'); // Actual reservations
    table.string('material_reservation_status', 50); // pending, reserved, consumed
    
    // Task details
    table.integer('quantity');
    table.integer('priority').defaultTo(0);
    table.boolean('is_urgent').defaultTo(false);
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('assigned_at');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    
    // Indexes
    table.index('plan_id');
    table.index('work_order_code');
    table.index('worker_id');
    table.index('station_id');
    table.index('status');
    table.index(['status', 'priority']);
    table.index(['worker_id', 'status']);
    
    // Foreign keys
    table.foreign('plan_id').references('id').inTable('mes_production_plans').onDelete('CASCADE');
    table.foreign('worker_id').references('id').inTable('mes_workers').onDelete('SET NULL');
    table.foreign('station_id').references('id').inTable('mes_stations').onDelete('SET NULL');
    table.foreign('operation_id').references('id').inTable('mes_operations').onDelete('SET NULL');
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('mes_worker_assignments');
}
