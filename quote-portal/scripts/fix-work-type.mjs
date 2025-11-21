import db from '../db/connection.js';

try {
  console.log('\n🔧 Fixing work type from fixed to shift...\n');
  
  const result = await db('mes.settings').where({ key: 'master-data' }).first();
  
  if (!result) {
    console.log('❌ No master-data found!');
    process.exit(1);
  }
  
  const data = result.value || {};
  
  // Change workType to 'shift' since blocks are in shiftBlocks
  if (!data.timeSettings) {
    data.timeSettings = {};
  }
  
  data.timeSettings.workType = 'shift';
  
  console.log('✅ Changing workType to "shift"');
  console.log('✅ Lane count:', data.timeSettings.laneCount);
  
  await db('mes.settings')
    .where({ key: 'master-data' })
    .update({
      value: data,
      updated_at: db.fn.now(),
      updated_by: 'system-fix'
    });
  
  console.log('\n✅ Work type updated successfully!');
  console.log('📊 Now workers using "company" mode will see shift blocks\n');
  
  await db.destroy();
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
