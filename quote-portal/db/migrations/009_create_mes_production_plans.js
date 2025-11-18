/**
 * Migration: Create MES production plans table
 * Converts Firebase 'mes-production-plans' collection to PostgreSQL
 * This is one of the most critical tables
 */

export function up(knex) {
  return knex.schema.createTable('mes_production_plans', (table) => {
    // Primary key
    table.string('id', 100).primary();
    
    // Work order
    table.string('work_order_code', 100).notNullable().unique();
    table.string('quote_id', 100);
    
    // Status
    table.string('status', 50).defaultTo('draft'); // draft, ready, production, completed, cancelled
    
    // Plan data (complex JSON structures)
    table.jsonb('nodes').notNullable(); // Array of operation nodes
    table.jsonb('material_summary'); // Aggregated material requirements
    table.jsonb('metadata'); // Plan metadata
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.string('created_by', 255);
    
    // Indexes
    table.index('work_order_code');
    table.index('quote_id');
    table.index('status');
    table.index(['status', 'created_at']);
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('mes_production_plans');
}
