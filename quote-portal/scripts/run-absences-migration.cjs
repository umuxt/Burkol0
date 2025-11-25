/**
 * Run absences migration directly
 */
const knexConfig = require('../knexfile.cjs');
const knex = require('knex')(knexConfig.development);

async function runMigration() {
  try {
    console.log('🔄 Adding absences column to mes.workers...');
    
    // Check if column already exists
    const hasColumn = await knex.schema.withSchema('mes').hasColumn('workers', 'absences');
    
    if (hasColumn) {
      console.log('⚠️  absences column already exists, skipping...');
      await knex.destroy();
      return;
    }
    
    // Add the column
    await knex.schema.withSchema('mes').alterTable('workers', (table) => {
      table.jsonb('absences').defaultTo('[]').notNullable();
    });
    
    console.log('✅ Successfully added absences column to mes.workers');
    
    // Verify
    const columns = await knex.raw(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_schema = 'mes' 
        AND table_name = 'workers' 
        AND column_name = 'absences'
    `);
    
    console.log('📊 Column info:', columns.rows[0]);
    
    await knex.destroy();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await knex.destroy();
    process.exit(1);
  }
}

runMigration();
