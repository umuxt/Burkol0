import db from '../db/connection.js';

try {
  console.log('\n📋 Checking price_settings table...\n');
  
  // Check if table exists
  const hasTable = await db.schema.withSchema('quotes').hasTable('price_settings');
  
  if (!hasTable) {
    console.log('❌ Table quotes.price_settings does NOT exist!');
    console.log('📝 Need to create migration for price_settings table\n');
  } else {
    console.log('✅ Table quotes.price_settings exists');
    
    // Get table structure
    const columns = await db('information_schema.columns')
      .where({ table_schema: 'quotes', table_name: 'price_settings' })
      .select('column_name', 'data_type', 'is_nullable')
      .orderBy('ordinal_position');
    
    console.log('\n📊 Table structure:');
    columns.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    // Get row count
    const count = await db('quotes.price_settings').count('* as count').first();
    console.log(`\n📈 Row count: ${count.count}`);
    
    if (parseInt(count.count) > 0) {
      const rows = await db('quotes.price_settings').select('*').limit(5);
      console.log('\n📄 Sample data:');
      rows.forEach(row => {
        console.log(`  ID: ${row.id}, Name: "${row.name}", Active: ${row.is_active}, Form Template: ${row.form_template_id || 'null'}`);
      });
    }
  }
  
  await db.destroy();
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
