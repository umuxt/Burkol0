/**
 * Test Worker Absence System
 * 
 * This script:
 * 1. Fetches a real worker
 * 2. Adds an absence record (sick leave for today)
 * 3. Verifies isWorkerAbsent() function works correctly
 * 4. Cleans up (removes test absence)
 */

const knexConfig = require('../knexfile.cjs');
const knex = require('knex')(knexConfig.development);

// Import isWorkerAbsent function (copy from mesRoutes.js)
function isWorkerAbsent(worker, date) {
  if (!worker.absences || !Array.isArray(worker.absences) || worker.absences.length === 0) {
    return false;
  }
  
  const checkDate = typeof date === 'string' ? date : date.toISOString().split('T')[0];
  
  return worker.absences.some(absence => {
    const { startDate, endDate } = absence;
    return checkDate >= startDate && checkDate <= endDate;
  });
}

async function testAbsenceSystem() {
  try {
    console.log('🧪 Testing Worker Absence System...\n');
    
    // 1. Get a real worker
    console.log('1️⃣ Fetching a real worker...');
    const worker = await knex('mes.workers')
      .select('*')
      .where('isActive', true)
      .first();
    
    if (!worker) {
      console.log('❌ No active workers found in database');
      await knex.destroy();
      return;
    }
    
    console.log(`✅ Found worker: ${worker.name} (${worker.id})`);
    console.log(`   Current absences: ${JSON.stringify(worker.absences)}\n`);
    
    // 2. Test isWorkerAbsent with current state
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    
    console.log('2️⃣ Testing isWorkerAbsent() BEFORE adding absence...');
    const isAbsentBefore = isWorkerAbsent(worker, today);
    console.log(`   isWorkerAbsent(${today}): ${isAbsentBefore} (expected: false)\n`);
    
    // 3. Add a test absence (sick leave for today + next 2 days)
    console.log('3️⃣ Adding test absence (sick leave for 3 days)...');
    const testAbsenceId = `test-abs-${Date.now()}`;
    const endDate = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];
    
    const currentAbsences = typeof worker.absences === 'string' 
      ? JSON.parse(worker.absences) 
      : (worker.absences || []);
    
    const newAbsence = {
      id: testAbsenceId,
      type: 'sick',
      startDate: today,
      endDate: endDate,
      reason: 'Test Hastalık İzni',
      createdAt: new Date().toISOString(),
      createdBy: 'test-script'
    };
    
    const updatedAbsences = [...currentAbsences, newAbsence];
    
    await knex('mes.workers')
      .where('id', worker.id)
      .update({
        absences: JSON.stringify(updatedAbsences)
      });
    
    console.log(`✅ Added absence: ${today} → ${endDate}`);
    console.log(`   Absence ID: ${testAbsenceId}\n`);
    
    // 4. Fetch updated worker and test again
    console.log('4️⃣ Testing isWorkerAbsent() AFTER adding absence...');
    const updatedWorker = await knex('mes.workers')
      .select('*')
      .where('id', worker.id)
      .first();
    
    const absences = typeof updatedWorker.absences === 'string'
      ? JSON.parse(updatedWorker.absences)
      : updatedWorker.absences;
    
    updatedWorker.absences = absences;
    
    const isAbsentToday = isWorkerAbsent(updatedWorker, today);
    const isAbsentTomorrow = isWorkerAbsent(updatedWorker, tomorrow);
    const isAbsentYesterday = isWorkerAbsent(updatedWorker, yesterday);
    
    console.log(`   isWorkerAbsent(${yesterday}): ${isAbsentYesterday} (expected: false)`);
    console.log(`   isWorkerAbsent(${today}): ${isAbsentToday} (expected: true)`);
    console.log(`   isWorkerAbsent(${tomorrow}): ${isAbsentTomorrow} (expected: true)\n`);
    
    // 5. Verify results
    const allTestsPassed = 
      !isAbsentBefore &&
      !isAbsentYesterday &&
      isAbsentToday &&
      isAbsentTomorrow;
    
    if (allTestsPassed) {
      console.log('✅ ALL TESTS PASSED! isWorkerAbsent() works correctly.\n');
    } else {
      console.log('❌ SOME TESTS FAILED!\n');
    }
    
    // 6. Cleanup - remove test absence
    console.log('5️⃣ Cleaning up test absence...');
    const cleanedAbsences = updatedAbsences.filter(abs => abs.id !== testAbsenceId);
    
    await knex('mes.workers')
      .where('id', worker.id)
      .update({
        absences: JSON.stringify(cleanedAbsences)
      });
    
    console.log(`✅ Test absence removed\n`);
    
    // 7. Summary
    console.log('📊 TEST SUMMARY:');
    console.log(`   Worker: ${worker.name}`);
    console.log(`   Test Absence: ${today} → ${endDate}`);
    console.log(`   isWorkerAbsent() Function: ${allTestsPassed ? '✅ WORKING' : '❌ BROKEN'}`);
    console.log(`   Database Integration: ✅ WORKING`);
    console.log(`   Cleanup: ✅ COMPLETED\n`);
    
    await knex.destroy();
    process.exit(allTestsPassed ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    await knex.destroy();
    process.exit(1);
  }
}

testAbsenceSystem();
