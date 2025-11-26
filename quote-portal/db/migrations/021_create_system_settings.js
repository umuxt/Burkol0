export async function up(knex) {
  await knex.schema.createSchemaIfNotExists('settings');
  
  const hasTable = await knex.schema.withSchema('settings').hasTable('settings');
  
  if (!hasTable) {
    await knex.schema.withSchema('settings').createTable('settings', (table) => {
      table.string('key', 50).primary(); // e.g., 'system_config', 'feature_flags'
      table.jsonb('value').notNullable(); // Store settings as JSONB
      table.timestamp('updatedAt').defaultTo(knex.fn.now());
      table.string('updatedBy', 100);

      table.comment('Stores global system settings and configurations.');
    });
    console.log('✅ Created settings.settings table');
  } else {
    console.log('ℹ️ settings.settings table already exists, skipping');
  }
}

export async function down(knex) {
  await knex.schema.withSchema('settings').dropTableIfExists('settings');
  await knex.schema.dropSchemaIfExists('settings'); // Only drop if schema is empty or no other tables
  console.log('✅ Dropped settings.settings table');
}