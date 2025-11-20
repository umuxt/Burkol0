/**
 * Migration: Add missing fields to mes.approved_quotes
 * Adds quote_id, customer info, delivery_date, price, quote_snapshot, updated_at
 */

export function up(knex) {
  return knex.schema
    .withSchema('mes')
    .alterTable('approved_quotes', (table) => {
      // Quote reference
      table.string('quote_id', 100);
      
      // Customer info
      table.string('customer', 255);
      table.string('company', 255);
      table.string('email', 255);
      table.string('phone', 100);
      
      // Delivery & pricing
      table.string('delivery_date', 50); // Store as string (can be date or text)
      table.decimal('price', 15, 2);
      
      // Quote snapshot (full quote data)
      table.jsonb('quote_snapshot');
      
      // Production state history
      table.jsonb('production_state_history');
      
      // Timestamps
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('quote_id');
      table.index('customer');
      table.index('delivery_date');
    });
}

export function down(knex) {
  return knex.schema
    .withSchema('mes')
    .alterTable('approved_quotes', (table) => {
      table.dropColumn('quote_id');
      table.dropColumn('customer');
      table.dropColumn('company');
      table.dropColumn('email');
      table.dropColumn('phone');
      table.dropColumn('delivery_date');
      table.dropColumn('price');
      table.dropColumn('quote_snapshot');
      table.dropColumn('production_state_history');
      table.dropColumn('updated_at');
    });
}
