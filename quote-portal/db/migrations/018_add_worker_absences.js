/**
 * Migration: Add absences JSONB column to mes.workers
 */

export async function up(knex) {
  console.log('🔄 Checking absences column in mes.workers...');
  
  const hasColumn = await knex.schema.withSchema('mes').hasColumn('workers', 'absences');
  
  if (!hasColumn) {
    await knex.schema.withSchema('mes').alterTable('workers', (table) => {
      table.jsonb('absences').defaultTo('[]').notNullable();
    });
    console.log('✅ Successfully added absences column');
  } else {
    console.log('ℹ️ absences column already exists, skipping');
  }
}

export async function down(knex) {
  console.log('🔄 Removing absences column from mes.workers...');
  
  await knex.schema.withSchema('mes').alterTable('workers', (table) => {
    table.dropColumn('absences');
  });
  
  console.log('✅ Successfully removed absences column');
}