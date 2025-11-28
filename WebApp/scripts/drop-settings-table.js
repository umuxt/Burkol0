import db from '../db/connection.js';

async function dropSettingsTable() {
  try {
    console.log('🗑️ Dropping settings.settings table...');
    await db.schema.withSchema('settings').dropTableIfExists('settings');
    console.log('✅ settings.settings table dropped.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error dropping table:', error);
    process.exit(1);
  }
}

dropSettingsTable();
