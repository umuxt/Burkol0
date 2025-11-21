/**
 * Migration: Add production state tracking to work_orders
 * Consolidates mes.approved_quotes functionality into mes.work_orders
 */

export const up = function(knex) {
  return knex.schema.table('mes.work_orders', function(table) {
    // Production state tracking (defaults to 'pending')
    table.string('production_state').defaultTo('pending');
    
    // Production state metadata
    table.timestamp('production_state_updated_at').defaultTo(knex.fn.now());
    table.string('production_state_updated_by');
    
    // Production state history tracking (JSON array)
    table.jsonb('production_state_history').defaultTo('[]');
    
    // Add index for querying by production state
    table.index('production_state');
  });
};

export const down = function(knex) {
  return knex.schema.table('mes.work_orders', function(table) {
    table.dropIndex('production_state');
    table.dropColumn('production_state_history');
    table.dropColumn('production_state_updated_by');
    table.dropColumn('production_state_updated_at');
    table.dropColumn('production_state');
  });
};
