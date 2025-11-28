import db from '../db/connection.js';

async function clearMigrationRecord() {
  try {
    console.log('🧹 Removing 021 migration record...');
    await db('knex_migrations')
      .where('name', '021_create_system_settings.js')
      .delete();
    console.log('✅ Migration record removed.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error removing migration record:', error);
    process.exit(1);
  }
}

clearMigrationRecord();
