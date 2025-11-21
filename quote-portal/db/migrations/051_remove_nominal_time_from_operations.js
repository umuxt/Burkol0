/**
 * Migration: Remove nominal_time from mes.operations
 * 
 * Reason: nominal_time is not used at operation definition level.
 * It's only used in production_plan_nodes where each node can have
 * its own nominal_time value (set in Plan Designer).
 * 
 * Operations table should only contain:
 * - Basic info (name, type, semi_output_code)
 * - Expected defect rate
 * - Default efficiency (for plan designer default)
 * - Supervisor
 * - Skills required
 */

export function up(knex) {
  return knex.schema.withSchema('mes').table('operations', (table) => {
    table.dropColumn('nominal_time');
  });
}

export function down(knex) {
  return knex.schema.withSchema('mes').table('operations', (table) => {
    // Restore if needed (with default 0)
    table.integer('nominal_time').defaultTo(0);
  });
}
