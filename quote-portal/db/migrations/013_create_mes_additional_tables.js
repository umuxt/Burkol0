/**
 * Migration: Create remaining MES tables
 * mes-approved-quotes, mes-alerts, mes-work-orders, mes-settings, mes-counters
 */

export function up(knex) {
  return knex.schema
    // MES Approved Quotes
    .createTable('mes_approved_quotes', (table) => {
      table.string('id', 100).primary();
      table.string('work_order_code', 100).unique();
      table.string('production_state', 50);
      table.timestamp('production_state_updated_at');
      table.string('production_state_updated_by', 255);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      
      table.index('work_order_code');
      table.index('production_state');
    })
    
    // MES Alerts
    .createTable('mes_alerts', (table) => {
      table.string('id', 100).primary();
      table.string('type', 50).notNullable(); // warning, error, info
      table.string('severity', 50); // low, medium, high, critical
      table.string('title', 255).notNullable();
      table.text('message');
      table.jsonb('metadata');
      table.boolean('is_read').defaultTo(false);
      table.boolean('is_resolved').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('resolved_at');
      table.string('resolved_by', 255);
      
      table.index('type');
      table.index('severity');
      table.index(['is_read', 'created_at']);
      table.index(['is_resolved', 'created_at']);
    })
    
    // MES Work Orders
    .createTable('mes_work_orders', (table) => {
      table.string('id', 100).primary();
      table.string('code', 100).unique().notNullable();
      table.string('quote_id', 100);
      table.string('status', 50);
      table.jsonb('data');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      table.index('code');
      table.index('quote_id');
      table.index('status');
    })
    
    // MES Settings
    .createTable('mes_settings', (table) => {
      table.string('id', 100).primary();
      table.string('key', 255).unique().notNullable();
      table.jsonb('value');
      table.text('description');
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.string('updated_by', 255);
      
      table.index('key');
    })
    
    // MES Counters (for auto-incrementing codes)
    .createTable('mes_counters', (table) => {
      table.string('id', 100).primary();
      table.string('prefix', 50).notNullable();
      table.integer('next_counter').defaultTo(1);
      table.jsonb('codes'); // Map of generated codes
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      table.index('prefix');
    });
}

export function down(knex) {
  return knex.schema
    .dropTableIfExists('mes_counters')
    .dropTableIfExists('mes_settings')
    .dropTableIfExists('mes_work_orders')
    .dropTableIfExists('mes_alerts')
    .dropTableIfExists('mes_approved_quotes');
}
