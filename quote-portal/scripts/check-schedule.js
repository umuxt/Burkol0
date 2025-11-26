import db from '../db/connection.js';

// adjustStartTimeForSchedule fonksiyonunun kopyası
function adjustStartTimeForSchedule(startTime, scheduleBlocks) {
  if (!scheduleBlocks || scheduleBlocks.length === 0) {
    console.log('No schedule blocks, returning original time');
    return startTime;
  }
  
  const hour = startTime.getHours();
  const minute = startTime.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  console.log(`Input time: ${hour}:${minute} (${timeInMinutes} minutes from midnight)`);
  
  // Find if current time is within a work block
  for (const block of scheduleBlocks) {
    const startStr = block.start || block.startTime;
    const endStr = block.end || block.endTime;
    console.log(`Checking block: type=${block.type}, startStr=${startStr}, endStr=${endStr}`);
    if (block.type !== 'work' || !startStr || !endStr) continue;
    
    const [startHour, startMin] = startStr.split(':').map(Number);
    const [endHour, endMin] = endStr.split(':').map(Number);
    const blockStart = startHour * 60 + startMin;
    const blockEnd = endHour * 60 + endMin;
    
    console.log(`  Block range: ${blockStart}-${blockEnd} (${startStr}-${endStr})`);
    
    // If within work block, use as-is
    if (timeInMinutes >= blockStart && timeInMinutes < blockEnd) {
      console.log('  -> Time is WITHIN work block, returning as-is');
      return startTime;
    }
  }
  
  console.log('Time is NOT in any work block, finding next work block...');
  
  // Not in a work block - find next work block
  const workBlocks = scheduleBlocks
    .filter(b => b.type === 'work' && (b.start || b.startTime) && (b.end || b.endTime))
    .map(b => {
      const startStr = b.start || b.startTime;
      const [startHour, startMin] = startStr.split(':').map(Number);
      return {
        startMinutes: startHour * 60 + startMin,
        startHour,
        startMin
      };
    })
    .sort((a, b) => a.startMinutes - b.startMinutes);
  
  console.log('Work blocks found:', workBlocks.length);
  
  // Find first work block after current time
  for (const wb of workBlocks) {
    console.log(`  Checking work block at ${wb.startHour}:${wb.startMin} (${wb.startMinutes} minutes)`);
    if (wb.startMinutes > timeInMinutes) {
      const adjusted = new Date(startTime);
      adjusted.setHours(wb.startHour, wb.startMin, 0, 0);
      console.log(`  -> Found! Adjusting to ${adjusted.toISOString()}`);
      return adjusted;
    }
  }
  
  // All work blocks are before current time - move to next day's first work block
  if (workBlocks.length > 0) {
    const nextDay = new Date(startTime);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(workBlocks[0].startHour, workBlocks[0].startMin, 0, 0);
    console.log(`  -> All blocks passed, moving to next day: ${nextDay.toISOString()}`);
    return nextDay;
  }
  
  console.log('No work blocks defined, returning original time');
  return startTime;
}

async function check() {
  try {
    const settings = await db('mes.settings')
      .where('key', 'master-data')
      .first();
    
    if (settings?.value?.timeSettings) {
      const ts = settings.value.timeSettings;
      console.log('workType:', ts.workType);
      
      // Thursday için kontrol
      const dayName = 'thursday';
      const blocks = ts.fixedBlocks?.[dayName] || [];
      console.log('\n=== Thursday Schedule Blocks ===');
      console.log(JSON.stringify(blocks, null, 2));
      
      // Test: Gece 01:25 için adjust
      console.log('\n=== Test: 01:25 için adjust ===');
      const testTime = new Date('2025-11-27T01:25:00');
      console.log('Input:', testTime.toISOString());
      const adjusted = adjustStartTimeForSchedule(testTime, blocks);
      console.log('Output:', adjusted.toISOString());
      
      // Test: 10:00 için adjust (çalışma saati içinde)
      console.log('\n=== Test: 10:00 için adjust ===');
      const testTime2 = new Date('2025-11-27T10:00:00');
      console.log('Input:', testTime2.toISOString());
      const adjusted2 = adjustStartTimeForSchedule(testTime2, blocks);
      console.log('Output:', adjusted2.toISOString());
      
      // Test: 19:00 için adjust (çalışma saati sonrası)
      console.log('\n=== Test: 19:00 için adjust ===');
      const testTime3 = new Date('2025-11-27T19:00:00');
      console.log('Input:', testTime3.toISOString());
      const adjusted3 = adjustStartTimeForSchedule(testTime3, blocks);
      console.log('Output:', adjusted3.toISOString());
    }

    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

check();
