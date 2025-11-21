/**
 * Migration: Add operation_ids and sub_skills columns to stations
 * Store station's operations and skills as JSONB arrays
 */

export function up(knex) {
  return knex.schema.withSchema('mes').alterTable('stations', (table) => {
    table.jsonb('operation_ids').defaultTo('[]');
    table.jsonb('sub_skills').defaultTo('[]');
  });
}

export function down(knex) {
  return knex.schema.withSchema('mes').alterTable('stations', (table) => {
    table.dropColumn('operation_ids');
    table.dropColumn('sub_skills');
  });
}
