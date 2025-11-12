const admin = require('firebase-admin');
const serviceAccount = require('../config/serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function checkCounters() {
  try {
    console.log('\n=== MES Counters Check ===\n');
    
    // Get all counters
    const countersSnapshot = await db.collection('mes-counters').get();
    
    if (countersSnapshot.empty) {
      console.log('No counters found');
    } else {
      console.log(`Found ${countersSnapshot.size} counter(s):\n`);
      
      countersSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`Counter ID: ${doc.id}`);
        console.log(`  Next Value: ${data.next}`);
        console.log(`  Last Generated: ${data.lastGenerated || 'N/A'}`);
        console.log(`  Updated At: ${data.updatedAt?.toDate() || 'N/A'}`);
        console.log('');
      });
    }
    
    // Get WO-001 assignments
    console.log('\n=== WO-001 Work Packages ===\n');
    const assignmentsSnapshot = await db.collection('mes-worker-assignments')
      .where('workOrderCode', '==', 'WO-001')
      .orderBy('createdAt', 'asc')
      .get();
    
    if (assignmentsSnapshot.empty) {
      console.log('No work packages found for WO-001');
    } else {
      console.log(`Found ${assignmentsSnapshot.size} work package(s):\n`);
      assignmentsSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`Work Package ID: ${doc.id}`);
        console.log(`  Node ID: ${data.nodeId}`);
        console.log(`  Status: ${data.status}`);
        console.log(`  Worker: ${data.workerName || data.workerId}`);
        console.log(`  Station: ${data.stationName || data.stationId}`);
        console.log(`  Created: ${data.createdAt?.toDate() || 'N/A'}`);
        console.log('');
      });
    }
    
    // Get latest plan
    console.log('\n=== Latest Plan (PPL-1125-002) ===\n');
    const planDoc = await db.collection('mes-production-plans').doc('PPL-1125-002').get();
    
    if (planDoc.exists) {
      const planData = planDoc.data();
      console.log(`Plan Name: ${planData.name}`);
      console.log(`Order Code: ${planData.orderCode}`);
      console.log(`Nodes Count: ${planData.nodes?.length || 0}`);
      console.log(`Execution Graph Count: ${planData.executionGraph?.length || 0}`);
      
      if (planData.nodes && planData.nodes.length > 0) {
        console.log('\nNodes:');
        planData.nodes.forEach((node, i) => {
          console.log(`  ${i + 1}. Node ID: ${node.id}, Name: ${node.name}`);
        });
      }
      
      if (planData.executionGraph && planData.executionGraph.length > 0) {
        console.log('\nExecution Graph:');
        planData.executionGraph.forEach((node, i) => {
          console.log(`  ${i + 1}. Node ID: ${node.nodeId}, Name: ${node.name}`);
          console.log(`     Material Inputs: ${node.materialInputs?.length || 0}`);
          if (node.materialInputs && node.materialInputs.length > 0) {
            node.materialInputs.forEach(mat => {
              console.log(`       - ${mat.code}: ${mat.qty} ${mat.unit}`);
            });
          }
        });
      }
    } else {
      console.log('Plan not found');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.code === 'failed-precondition') {
      console.error('\n⚠️  Missing index! Run: npm run deploy:indexes');
    }
  }
}

checkCounters()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
