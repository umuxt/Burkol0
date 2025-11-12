const admin = require('firebase-admin');
const serviceAccount = require('../config/serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function resetCounter() {
  try {
    console.log('🧹 Cleaning up work packages for WO-001...\n');
    
    // Delete existing work packages for WO-001
    const assignmentsSnapshot = await db.collection('mes-worker-assignments')
      .where('workOrderCode', '==', 'WO-001')
      .get();
    
    if (!assignmentsSnapshot.empty) {
      console.log(`Found ${assignmentsSnapshot.size} work package(s) to delete:\n`);
      const batch = db.batch();
      assignmentsSnapshot.forEach(doc => {
        console.log(`  - Deleting ${doc.id}`);
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log('\n✅ Work packages deleted');
    } else {
      console.log('No work packages found for WO-001');
    }
    
    // Show current WO counter status
    const woCounterRef = db.collection('mes-counters').doc('work-orders');
    const woCounterSnap = await woCounterRef.get();
    
    if (woCounterSnap.exists) {
      const data = woCounterSnap.data();
      console.log('\n📊 Work Order Counter Status:');
      console.log(`  Next WO: WO-${String(data.next).padStart(3, '0')}`);
      console.log(`  Last Generated: ${data.lastGenerated || 'N/A'}`);
    } else {
      console.log('\n⚠️  Work Order counter not found (will be created on first WO generation)');
    }
    
    console.log('\n✅ Ready for fresh launch!');
    console.log('   Note: WO counter is NOT reset - it continues from last value');
    console.log('   Each plan will create work packages: WO-XXX-01, WO-XXX-02, etc.');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

resetCounter()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
