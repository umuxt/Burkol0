/**
 * Migration: Add delivery_date to quotes table
 * Critical field for production planning
 */

export const up = function(knex) {
  return knex.schema.table('quotes.quotes', function(table) {
    table.timestamp('delivery_date');
    table.index('delivery_date');
  });
};

export const down = function(knex) {
  return knex.schema.table('quotes.quotes', function(table) {
    table.dropIndex('delivery_date');
    table.dropColumn('delivery_date');
  });
};
