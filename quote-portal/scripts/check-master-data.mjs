import db from '../db/connection.js';

try {
  const result = await db('mes.settings').where({ key: 'master-data' }).first();
  
  console.log('\n📊 Master Data Settings:');
  console.log('========================');
  
  if (!result) {
    console.log('❌ No master-data record found!');
    process.exit(0);
  }
  
  const data = result.value || {};
  console.log('\n🔧 Work Type:', data.timeSettings?.workType || 'NOT SET');
  console.log('🔧 Lane Count:', data.timeSettings?.laneCount || 'NOT SET');
  
  console.log('\n📅 Fixed Blocks:');
  const fb = data.timeSettings?.fixedBlocks || {};
  Object.entries(fb).forEach(([day, blocks]) => {
    if (blocks && blocks.length > 0) {
      console.log(`  ${day}: ${blocks.length} blocks`);
      blocks.forEach(b => console.log(`    - ${b.startTime || b.startHour} to ${b.endTime || b.endHour} (${b.type})`));
    } else {
      console.log(`  ${day}: [] (empty)`);
    }
  });
  
  console.log('\n📅 Shift Blocks:');
  const sb = data.timeSettings?.shiftBlocks || {};
  Object.entries(sb).forEach(([key, blocks]) => {
    if (blocks && blocks.length > 0) {
      console.log(`  ${key}: ${blocks.length} blocks`);
      blocks.forEach(b => console.log(`    - ${b.startTime || b.startHour} to ${b.endTime || b.endHour} (${b.type}) [lane: ${b.laneIndex}]`));
    } else {
      console.log(`  ${key}: [] (empty)`);
    }
  });
  
  await db.destroy();
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
