/**
 * Migration: Add location field to stations table
 * Frontend uses location field for station physical location tracking
 */

export function up(knex) {
  return knex.schema.withSchema('mes').alterTable('stations', (table) => {
    table.string('location', 255);
  });
}

export function down(knex) {
  return knex.schema.withSchema('mes').alterTable('stations', (table) => {
    table.dropColumn('location');
  });
}
