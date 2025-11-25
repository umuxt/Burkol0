/**
 * Migration: Add technicalStatus to substations
 * FAZ 4: Substation Technical Status Management
 * 
 * technicalStatus: UI için makina teknik durumu
 *   - 'active': Makina aktif, iş atanabilir (isActive=true)
 *   - 'passive': Geçici kapalı, iş atanamaz (isActive=false)
 *   - 'maintenance': Bakımda, iş atanamaz (isActive=false)
 * 
 * Not: Mevcut 'status' alanı (available/working/reserved) motor tarafından 
 * kullanılıyor ve dokunulmuyor. isActive'e göre otomatik güncelleniyor.
 */

export async function up(knex) {
  console.log('🔧 Adding technicalStatus to mes.substations...');
  
  await knex.schema.table('mes.substations', (table) => {
    // technicalStatus: active, passive, maintenance
    table.string('technicalStatus', 20).defaultTo('active')
      .comment('Technical status for UI: active, passive, maintenance');
  });
  
  // Migrate existing isActive to technicalStatus
  // isActive=true -> 'active', isActive=false -> 'passive'
  await knex.raw(`
    UPDATE mes.substations
    SET "technicalStatus" = CASE
      WHEN "isActive" = true THEN 'active'
      ELSE 'passive'
    END
  `);
  
  console.log('✅ technicalStatus field added successfully');
}

export async function down(knex) {
  console.log('🔧 Removing technicalStatus from mes.substations...');
  
  await knex.schema.table('mes.substations', (table) => {
    table.dropColumn('technicalStatus');
  });
  
  console.log('✅ technicalStatus field removed');
}
