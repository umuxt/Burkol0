/**
 * Migration 019: Create stock_movements table
 * Audit trail for all stock changes (orders, MES production, manual adjustments)
 * Replaces Firebase stockMovements collection
 */

export async function up(knex) {
  await knex.schema.withSchema('materials').createTable('stock_movements', (table) => {
    // Primary key
    table.increments('id').primary();
    
    // Material reference
    table.integer('material_id').unsigned();
    table.foreign('material_id')
      .references('id')
      .inTable('materials.materials')
      .onDelete('RESTRICT'); // Don't delete material with movement history
    table.string('material_code', 50).notNullable();
    table.string('material_name', 255);
    
    // Movement classification
    table.enum('type', ['in', 'out']).notNullable(); // in=giriş, out=çıkış
    table.string('sub_type', 50).notNullable(); // wip_release, production_consumption, production_output, order_delivery, manual_adjustment, etc.
    table.string('status', 50); // wip, production, completed, cancelled
    
    // Quantity information
    table.decimal('quantity', 15, 3).notNullable(); // Movement quantity
    table.string('unit', 20);
    table.decimal('stock_before', 15, 3); // Stock before movement
    table.decimal('stock_after', 15, 3); // Stock after movement
    
    // Production-specific fields (for MES integration)
    table.decimal('actual_output', 15, 3); // Üretilen miktar
    table.decimal('defect_quantity', 15, 3); // Fire miktarı
    table.decimal('planned_output', 15, 3); // Planlanan üretim
    
    // Cost tracking
    table.decimal('unit_cost', 15, 2);
    table.decimal('total_cost', 15, 2);
    table.string('currency', 10).defaultTo('TRY');
    
    // Reference to source (order, assignment, etc.)
    table.string('reference', 100); // Order ID, Assignment ID, etc.
    table.string('reference_type', 50); // order_delivery, mes_task_complete, manual_adjustment
    table.string('related_plan_id', 50); // MES production plan
    table.string('related_node_id', 50); // MES operation node
    
    // Location information
    table.string('warehouse', 100);
    table.string('location', 255);
    
    // Audit information
    table.text('notes');
    table.string('reason', 255); // Reason for movement
    table.timestamp('movement_date').defaultTo(knex.fn.now());
    table.boolean('approved').defaultTo(true);
    table.string('user_id', 100);
    table.string('user_name', 255);
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Indexes for common queries
    table.index('material_id'); // Fast material history lookup
    table.index('material_code'); // Fast lookup by code
    table.index('type'); // Filter by in/out
    table.index('sub_type'); // Filter by movement type
    table.index('status'); // Filter by status
    table.index('reference'); // Fast reference lookup (order, assignment)
    table.index('reference_type'); // Group by source type
    table.index('movement_date'); // Date range queries
    table.index(['material_id', 'movement_date']); // Material history with dates
    table.index(['reference', 'reference_type']); // Source document movements
  });
  
  console.log('✅ Migration 019: Created stock_movements table');
}

export async function down(knex) {
  await knex.schema.withSchema('materials').dropTableIfExists('stock_movements');
  
  console.log('✅ Migration 019 rolled back: Dropped stock_movements table');
}
