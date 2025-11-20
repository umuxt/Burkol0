import db from './db/connection.js';

async function testCreate() {
  try {
    const station_id = 'ST-002';
    const name = 'Kaynak Alt İstasyonu 1';
    const description = 'TIG kaynağı için birinci alt istasyon';
    
    console.log('1️⃣ Getting station info...');
    const station = await db('mes.stations')
      .select('id', 'substations')
      .where('id', station_id)
      .first();
    
    console.log('Station:', station);
    
    if (!station) {
      console.error('❌ Station not found');
      process.exit(1);
    }
    
    console.log('\n2️⃣ Parsing station code...');
    const stationCode = station_id.replace('ST-', '');
    console.log('Station code:', stationCode);
    
    console.log('\n3️⃣ Counting existing substations...');
    const existingCount = await db('mes.substations')
      .where('station_id', station_id)
      .count('* as count');
    
    console.log('Existing count:', existingCount[0].count);
    
    const nextNum = parseInt(existingCount[0].count) + 1;
    const newId = `ST-${stationCode}-${nextNum.toString().padStart(2, '0')}`;
    
    console.log('\n4️⃣ New ID:', newId);
    
    console.log('\n5️⃣ Inserting substation...');
    const result = await db('mes.substations')
      .insert({
        id: newId,
        name,
        station_id,
        description,
        is_active: true,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      })
      .returning('*');
    
    console.log('Created:', result[0]);
    
    console.log('\n6️⃣ Updating station substations array...');
    const currentSubstations = station.substations || [];
    console.log('Current substations:', currentSubstations);
    
    const updatedSubstations = [...currentSubstations, newId];
    console.log('Updated substations:', updatedSubstations);
    
    await db('mes.stations')
      .where('id', station_id)
      .update({
        substations: JSON.stringify(updatedSubstations),
        updated_at: db.fn.now()
      });
    
    console.log('✅ Station updated');
    
    console.log('\n7️⃣ Final verification...');
    const updatedStation = await db('mes.stations')
      .select('id', 'name', 'substations')
      .where('id', station_id)
      .first();
    
    console.log('Station after update:', updatedStation);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testCreate();
