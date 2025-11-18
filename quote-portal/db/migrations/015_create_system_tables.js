/**
 * Migration: Create additional system tables
 * orders, settings, system, price_settings_versions, form_versions
 */

export function up(knex) {
  return knex.schema
    // Orders table
    .createTable('orders', (table) => {
      table.increments('id').primary();
      table.string('order_code', 100).unique().notNullable();
      table.string('quote_id', 100);
      table.string('customer_name', 255);
      table.string('status', 50).defaultTo('pending');
      
      // Order data
      table.jsonb('items'); // Order items array
      table.jsonb('data'); // Additional order data
      
      // Counters
      table.integer('year_counter');
      table.string('year_key', 4);
      
      // Timestamps
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.string('created_by', 255);
      
      // Indexes
      table.index('order_code');
      table.index('quote_id');
      table.index('status');
      table.index(['created_at', 'status']);
    })
    
    // Settings table (key-value store)
    .createTable('settings', (table) => {
      table.string('id', 100).primary();
      table.string('key', 255).unique().notNullable();
      table.jsonb('value');
      table.text('description');
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.string('updated_by', 255);
      
      table.index('key');
    })
    
    // System config table
    .createTable('system_config', (table) => {
      table.string('id', 100).primary();
      table.string('key', 255).unique().notNullable();
      table.jsonb('value');
      table.text('description');
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      table.index('key');
    })
    
    // Price settings versions (versioning system)
    .createTable('price_settings_versions', (table) => {
      table.string('id', 100).primary();
      table.integer('version_number').notNullable();
      table.jsonb('settings_snapshot'); // Parameters, formula
      table.jsonb('parameters');
      table.text('formula');
      table.string('change_summary', 500);
      table.text('notes');
      table.string('user_tag', 255);
      table.integer('daily_index');
      table.string('date_key', 10);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.string('created_by', 255);
      
      table.index('version_number');
      table.index('created_at');
      table.index('date_key');
    })
    
    // Price settings metadata
    .createTable('price_settings_meta', (table) => {
      table.string('id', 100).primary();
      table.integer('version_counter').defaultTo(0);
      table.string('current_version_id', 100);
      table.integer('current_version_number');
      table.timestamp('last_updated_at');
      table.string('last_updated_by', 255);
      table.jsonb('daily_counters'); // Date-based counters
      
      table.foreign('current_version_id').references('id').inTable('price_settings_versions').onDelete('SET NULL');
    })
    
    // Form versions (form configuration versioning)
    .createTable('form_versions', (table) => {
      table.string('id', 100).primary();
      table.integer('version_number').notNullable();
      table.jsonb('config_snapshot'); // Form fields configuration
      table.string('change_summary', 500);
      table.text('notes');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.string('created_by', 255);
      
      table.index('version_number');
      table.index('created_at');
    })
    
    // Form versions metadata
    .createTable('form_versions_meta', (table) => {
      table.string('id', 100).primary();
      table.integer('version_counter').defaultTo(0);
      table.string('current_version_id', 100);
      table.integer('current_version_number');
      table.timestamp('last_updated_at');
      table.string('last_updated_by', 255);
      
      table.foreign('current_version_id').references('id').inTable('form_versions').onDelete('SET NULL');
    })
    
    // Audit logs (optional but useful)
    .createTable('audit_logs', (table) => {
      table.increments('id').primary();
      table.string('entity_type', 100).notNullable(); // users, materials, orders, etc.
      table.string('entity_id', 100).notNullable();
      table.string('action', 50).notNullable(); // create, update, delete
      table.jsonb('changes'); // Before/after data
      table.string('user_id', 255);
      table.string('user_email', 255);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.string('ip_address', 50);
      
      table.index('entity_type');
      table.index('entity_id');
      table.index('action');
      table.index('created_at');
      table.index(['entity_type', 'entity_id']);
    });
}

export function down(knex) {
  return knex.schema
    .dropTableIfExists('audit_logs')
    .dropTableIfExists('form_versions_meta')
    .dropTableIfExists('form_versions')
    .dropTableIfExists('price_settings_meta')
    .dropTableIfExists('price_settings_versions')
    .dropTableIfExists('system_config')
    .dropTableIfExists('settings')
    .dropTableIfExists('orders');
}
