/**
 * Migration 037: Drop unused mes.orders table
 * 
 * Rationale:
 * - mes.orders was created by mistake in migration 014
 * - The correct table is materials.orders (for supplier orders)
 * - mes.orders is empty and never used in code
 * - Removing to avoid confusion
 * 
 * Correct tables:
 * - materials.orders → Supplier orders (active, 18 rows)
 * - mes.work_orders → Production work orders (active, needed)
 * 
 * Date: 2025-11-20
 */

export async function up(knex) {
  console.log('🗑️  Migration 037: Dropping unused mes.orders table...');
  
  // Verify it's empty before dropping
  const count = await knex('mes.orders').count('* as total').first();
  if (parseInt(count.total) > 0) {
    throw new Error('mes.orders is not empty! Migration aborted for safety.');
  }
  
  // Drop the table
  await knex.schema.withSchema('mes').dropTableIfExists('orders');
  
  console.log('✅ Migration 037: mes.orders table dropped successfully');
}

export async function down(knex) {
  console.log('⏪ Rolling back Migration 037: Recreating mes.orders...');
  
  // Recreate the table structure (but it will be empty)
  await knex.schema.withSchema('mes').createTable('orders', (table) => {
    table.increments('id').primary();
    table.string('order_code', 50);
    table.string('quote_id', 100);
    table.string('customer_name', 255);
    table.string('status', 50);
    table.jsonb('items');
    table.jsonb('data');
    table.integer('year_counter');
    table.string('year_key', 10);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.string('created_by', 100);
  });
  
  console.log('✅ Rollback 037: mes.orders table recreated');
}
