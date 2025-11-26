/**
 * Migration: Add technicalStatus to substations
 */

export async function up(knex) {
  console.log('🔧 Checking technicalStatus in mes.substations...');
  
  const hasColumn = await knex.schema.withSchema('mes').hasColumn('substations', 'technicalStatus');
  
  if (!hasColumn) {
    await knex.schema.withSchema('mes').table('substations', (table) => {
      // technicalStatus: active, passive, maintenance
      table.string('technicalStatus', 20).defaultTo('active')
        .comment('Technical status for UI: active, passive, maintenance');
    });
    
    // Migrate existing isActive to technicalStatus
    await knex.raw(`
      UPDATE mes.substations
      SET "technicalStatus" = CASE
        WHEN "isActive" = true THEN 'active'
        ELSE 'passive'
      END
    `);
    
    console.log('✅ technicalStatus field added successfully');
  } else {
    console.log('ℹ️ technicalStatus field already exists, skipping');
  }
}

export async function down(knex) {
  console.log('🔧 Removing technicalStatus from mes.substations...');
  
  await knex.schema.withSchema('mes').table('substations', (table) => {
    table.dropColumn('technicalStatus');
  });
  
  console.log('✅ technicalStatus field removed');
}