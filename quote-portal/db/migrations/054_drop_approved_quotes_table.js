/**
 * Migration: Drop mes.approved_quotes table
 * Table is no longer used - all functionality moved to mes.work_orders
 */

export const up = function(knex) {
  return knex.schema.dropTableIfExists('mes.approved_quotes');
};

export const down = function(knex) {
  // Recreate table if needed to rollback
  return knex.schema.createTable('mes.approved_quotes', function(table) {
    table.increments('id').primary();
    table.string('work_order_code', 100);
    table.string('quote_id', 100);
    table.string('production_state');
    table.timestamp('production_state_updated_at');
    table.string('production_state_updated_by');
    table.string('customer');
    table.string('company');
    table.string('email');
    table.string('phone');
    table.timestamp('delivery_date');
    table.decimal('price', 15, 2);
    table.jsonb('quote_snapshot');
    table.jsonb('production_state_history');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index('work_order_code');
    table.index('quote_id');
    table.index('production_state');
  });
};
