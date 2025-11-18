/**
 * Migration: Create quotes table
 * Converts Firebase 'quotes' collection to PostgreSQL
 */

export function up(knex) {
  return knex.schema.createTable('quotes', (table) => {
    // Primary key
    table.string('id', 100).primary();
    
    // Basic info
    table.string('quote_number', 100).unique();
    table.string('customer_name', 255);
    table.string('customer_email', 255);
    
    // Quote data
    table.jsonb('items'); // Quote items array
    table.jsonb('pricing'); // Pricing details
    table.jsonb('form_data'); // Form responses
    
    // Status
    table.string('status', 50).defaultTo('draft'); // draft, sent, approved, rejected
    
    // Production
    table.string('production_state', 50); // Onay Bekliyor, Üretiliyor, Tamamlandı, İptal Edildi
    table.timestamp('production_state_updated_at');
    table.string('production_state_updated_by', 255);
    
    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.string('created_by', 255);
    
    // Indexes
    table.index('quote_number');
    table.index('status');
    table.index('production_state');
    table.index('customer_email');
    table.index(['status', 'created_at']);
  });
}

export function down(knex) {
  return knex.schema.dropTableIfExists('quotes');
}
