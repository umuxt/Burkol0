const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin
const serviceAccountPath = path.join(__dirname, '../config/serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * Migration Script: Add personalSchedule to workers
 * 
 * This script adds default personalSchedule to all workers that don't have one.
 * Default schedule: Monday-Thursday (08:00-17:00), Friday (08:00-16:00), Weekend (off)
 * 
 * Usage:
 *   node scripts/migrate-worker-schedules.js
 */
async function migrateWorkerSchedules() {
  console.log('🔧 Starting worker schedule migration...\n');
  
  try {
    const workersSnapshot = await db.collection('mes-workers').get();
    console.log(`📊 Found ${workersSnapshot.size} worker(s) in database\n`);
    
    const batch = db.batch();
    let updateCount = 0;
    let skipCount = 0;
    
    const defaultSchedule = {
      mode: 'personal',
      enabled: true,
      timezone: 'Europe/Istanbul',
      blocks: {
        monday: [
          { type: 'work', start: '08:00', end: '12:00' },
          { type: 'break', start: '12:00', end: '13:00' },
          { type: 'work', start: '13:00', end: '17:00' }
        ],
        tuesday: [
          { type: 'work', start: '08:00', end: '12:00' },
          { type: 'break', start: '12:00', end: '13:00' },
          { type: 'work', start: '13:00', end: '17:00' }
        ],
        wednesday: [
          { type: 'work', start: '08:00', end: '12:00' },
          { type: 'break', start: '12:00', end: '13:00' },
          { type: 'work', start: '13:00', end: '17:00' }
        ],
        thursday: [
          { type: 'work', start: '08:00', end: '12:00' },
          { type: 'break', start: '12:00', end: '13:00' },
          { type: 'work', start: '13:00', end: '17:00' }
        ],
        friday: [
          { type: 'work', start: '08:00', end: '12:00' },
          { type: 'break', start: '12:00', end: '13:00' },
          { type: 'work', start: '13:00', end: '16:00' }
        ],
        saturday: [],  // Hafta sonu
        sunday: []     // Hafta sonu
      }
    };
    
    workersSnapshot.docs.forEach(doc => {
      const worker = doc.data();
      const workerId = worker.id || doc.id;
      const workerName = worker.name || workerId;
      
      // Check if already has personalSchedule with blocks
      if (worker.personalSchedule && worker.personalSchedule.blocks) {
        console.log(`⏭️  Skipping ${workerName} (already has personalSchedule)`);
        skipCount++;
        return;
      }
      
      // Add default schedule
      batch.update(doc.ref, {
        personalSchedule: defaultSchedule,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      updateCount++;
      console.log(`✅ Queued update for ${workerName}`);
    });
    
    console.log('\n' + '='.repeat(60));
    
    if (updateCount > 0) {
      console.log(`💾 Committing ${updateCount} update(s)...`);
      await batch.commit();
      console.log(`✅ Migration complete: ${updateCount} worker(s) updated, ${skipCount} skipped`);
    } else {
      console.log(`✅ No workers to update (${skipCount} already have schedules)`);
    }
    
    console.log('='.repeat(60) + '\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

// Run migration
migrateWorkerSchedules();
