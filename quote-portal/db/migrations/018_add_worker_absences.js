/**
 * Migration: Add absences JSONB column to mes.workers
 * 
 * Absences structure:
 * [
 *   {
 *     "id": "abs-xyz123",
 *     "type": "vacation|sick|training|meeting|other",
 *     "startDate": "2025-11-25",
 *     "endDate": "2025-11-27",
 *     "reason": "Yıllık izin",
 *     "createdAt": "2025-11-25T10:30:00Z",
 *     "createdBy": "admin-id"
 *   }
 * ]
 */

exports.up = async function(knex) {
  console.log('🔄 Adding absences column to mes.workers...');
  
  await knex.schema.withSchema('mes').alterTable('workers', (table) => {
    table.jsonb('absences').defaultTo('[]').notNullable();
  });
  
  console.log('✅ Successfully added absences column');
};

exports.down = async function(knex) {
  console.log('🔄 Removing absences column from mes.workers...');
  
  await knex.schema.withSchema('mes').alterTable('workers', (table) => {
    table.dropColumn('absences');
  });
  
  console.log('✅ Successfully removed absences column');
};
