import db from '../db/connection.js';

async function resetMigrations() {
  try {
    console.log('🔄 Resetting knex_migrations table...');
    
    // Drop migration tables if they exist
    await db.schema.dropTableIfExists('knex_migrations_lock');
    await db.schema.dropTableIfExists('knex_migrations');
    
    console.log('✅ Migration history cleared.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error resetting migrations:', error);
    process.exit(1);
  }
}

resetMigrations();
