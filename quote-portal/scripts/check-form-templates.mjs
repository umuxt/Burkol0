import db from '../db/connection.js';

try {
  console.log('\n📋 Form Templates Status:');
  console.log('========================\n');
  
  const templates = await db('quotes.form_templates')
    .select('id', 'code', 'name', 'version', 'is_active')
    .orderBy('created_at', 'desc');
  
  templates.forEach(t => {
    const status = t.is_active ? '✅ ACTIVE' : '❌ INACTIVE';
    console.log(`${status} - ID: ${t.id}, Name: "${t.name}", Version: ${t.version}`);
  });
  
  console.log(`\nTotal: ${templates.length} templates`);
  
  await db.destroy();
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
