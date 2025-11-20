import db from './db/connection.js';

async function testSubstation() {
  try {
    // Test max ID query
    console.log('Testing max ID query...');
    const [{ max_id }] = await db('mes.substations').max('id as max_id');
    console.log('Max ID:', max_id);
    
    const nextNum = max_id && max_id.startsWith('SUB-') 
      ? parseInt(max_id.split('-')[1]) + 1 
      : 1;
    const newId = `SUB-${nextNum.toString().padStart(3, '0')}`;
    console.log('Next ID:', newId);
    
    // Test insert
    console.log('\nTesting insert...');
    const result = await db('mes.substations')
      .insert({
        id: newId,
        name: 'Test Alt İstasyon',
        station_id: 'ST-002',
        description: 'Test açıklama',
        is_active: true,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      })
      .returning('*');
    
    console.log('Created:', result[0]);
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    process.exit(0);
  }
}

testSubstation();
