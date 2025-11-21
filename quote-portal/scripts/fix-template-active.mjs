import db from '../db/connection.js';

try {
  console.log('\n🔧 Fixing template active states...\n');
  
  // Get all templates
  const templates = await db('quotes.form_templates')
    .select('id', 'name', 'is_active')
    .orderBy('created_at', 'desc');
  
  console.log('Current state:');
  templates.forEach(t => {
    const status = t.is_active ? '✅ ACTIVE' : '❌ INACTIVE';
    console.log(`  ${status} - ID: ${t.id}, Name: "${t.name}"`);
  });
  
  // Deactivate all except the latest one
  if (templates.length > 0) {
    const latestId = templates[0].id;
    
    console.log(`\n📌 Setting template ${latestId} as active, deactivating others...\n`);
    
    await db('quotes.form_templates')
      .update({ is_active: false, updated_at: db.fn.now() });
    
    await db('quotes.form_templates')
      .where('id', latestId)
      .update({ is_active: true, updated_at: db.fn.now() });
    
    console.log('✅ Fixed! New state:');
    
    const updated = await db('quotes.form_templates')
      .select('id', 'name', 'is_active')
      .orderBy('created_at', 'desc');
    
    updated.forEach(t => {
      const status = t.is_active ? '✅ ACTIVE' : '❌ INACTIVE';
      console.log(`  ${status} - ID: ${t.id}, Name: "${t.name}"`);
    });
  }
  
  await db.destroy();
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
