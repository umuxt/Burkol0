/**
 * Migration: Add missing fields to mes.operations
 * 
 * Changes:
 * 1. Add default_efficiency (decimal) - Default efficiency for operations (0.01-1.00)
 * 2. Add supervisor_id (string) - Reference to mes.workers for operation supervisor
 */

export function up(knex) {
  return knex.schema.withSchema('mes').table('operations', (table) => {
    // Add default efficiency (decimal between 0.01 and 1.00, default 1.00 = 100%)
    table.decimal('default_efficiency', 4, 2).defaultTo(1.00);
    
    // Add supervisor reference (optional)
    table.string('supervisor_id', 100).nullable();
    
    // Add foreign key to workers table
    table.foreign('supervisor_id')
      .references('id')
      .inTable('mes.workers')
      .onDelete('SET NULL');
  });
}

export function down(knex) {
  return knex.schema.withSchema('mes').table('operations', (table) => {
    table.dropForeign(['supervisor_id']);
    table.dropColumn('supervisor_id');
    table.dropColumn('default_efficiency');
  });
}
