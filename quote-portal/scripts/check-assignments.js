const admin = require('firebase-admin');
const serviceAccount = require('../config/serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function checkAssignments() {
  try {
    const snapshot = await db.collection('mes-worker-assignments')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    
    console.log('\n=== Recent Worker Assignments ===\n');
    
    if (snapshot.empty) {
      console.log('No assignments found');
      return;
    }
    
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`Assignment ID: ${doc.id}`);
      console.log(`  Plan ID: ${data.planId}`);
      console.log(`  Node ID: ${data.nodeId}`);
      console.log(`  Status: ${data.status}`);
      console.log(`  Worker ID: ${data.workerId}`);
      console.log(`  Station ID: ${data.stationId}`);
      console.log(`  Work Package: ${data.workPackageId || 'N/A'}`);
      console.log(`  Created: ${data.createdAt?.toDate() || 'N/A'}`);
      console.log('');
    });
    
    // Also check the latest plan
    const planSnapshot = await db.collection('mes-production-plans')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    
    if (!planSnapshot.empty) {
      console.log('\n=== Latest Production Plan ===\n');
      const planDoc = planSnapshot.docs[0];
      const planData = planDoc.data();
      console.log(`Plan ID: ${planDoc.id}`);
      console.log(`  Name: ${planData.name}`);
      console.log(`  Order Code: ${planData.orderCode}`);
      console.log(`  Status: ${planData.status}`);
      console.log(`  Nodes Count: ${planData.nodes?.length || 0}`);
      console.log(`  Execution Graph Count: ${planData.executionGraph?.length || 0}`);
      
      if (planData.executionGraph && planData.executionGraph.length > 0) {
        console.log('\n  Execution Graph Sample:');
        const firstNode = planData.executionGraph[0];
        console.log(`    Node ID: ${firstNode.nodeId}`);
        console.log(`    Material Inputs: ${firstNode.materialInputs?.length || 0}`);
        if (firstNode.materialInputs && firstNode.materialInputs.length > 0) {
          console.log(`    First Material: ${JSON.stringify(firstNode.materialInputs[0])}`);
        }
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

checkAssignments()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
