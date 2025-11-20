/**
 * Migration 036: Remove employee_id column from mes.workers
 * 
 * Rationale:
 * - Single ID system (WK-001, WK-002, etc.) is sufficient
 * - Removes confusion between id and employee_id
 * - Simplifies worker creation (no need to provide two IDs)
 * 
 * Date: 2025-11-20
 */

export async function up(knex) {
  console.log('🔄 Migration 036: Removing employee_id from mes.workers...');
  
  // Drop the employee_id column
  await knex.schema.withSchema('mes').alterTable('workers', (table) => {
    table.dropColumn('employee_id');
  });
  
  console.log('✅ Migration 036: employee_id column removed successfully');
}

export async function down(knex) {
  console.log('⏪ Rolling back Migration 036: Adding employee_id back to mes.workers...');
  
  // Add the column back (but it will be empty)
  await knex.schema.withSchema('mes').alterTable('workers', (table) => {
    table.string('employee_id', 50);
  });
  
  console.log('✅ Rollback 036: employee_id column restored');
}
