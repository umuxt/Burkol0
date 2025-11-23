try {
  // Test launch endpoint
  console.log('🚀 Testing Launch Endpoint...');
  console.log('Plan: PLAN-008 (WO-005)');
  console.log('Nodes: 2 (Sequential: node-1 → node-2)');
  console.log('Workers: 2 active\n');
  
  const response = await fetch('http://localhost:3000/api/mes/production-plans/PLAN-008/launch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ workOrderCode: 'WO-005' })
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    console.log('❌ Launch Failed');
    console.log('Status:', response.status);
    console.log('Error:', JSON.stringify(data, null, 2));
  } else {
    console.log('✅ Launch Success!');
    console.log('\n📊 Summary:');
    console.log(`  Total Nodes: ${data.summary?.totalNodes || 0}`);
    console.log(`  Assigned Nodes: ${data.summary?.assignedNodes || 0}`);
    console.log(`  Total Workers: ${data.summary?.totalWorkers || 0}`);
    console.log(`  Total Substations: ${data.summary?.totalSubstations || 0}`);
    console.log(`  Estimated Duration: ${data.summary?.estimatedDuration || 0} minutes`);
    console.log(`  Parallel Paths: ${data.summary?.parallelPaths || 0}`);
    console.log(`  Queued Tasks: ${data.queuedTasks || 0}`);
    
    console.log('\n📋 Assignments:');
    (data.assignments || []).forEach((a, i) => {
      console.log(`  ${i + 1}. ${a.nodeName || a.nodeId}`);
      console.log(`     Worker: ${a.workerName} (ID: ${a.workerId})`);
      console.log(`     Substation: ${a.substationName} (ID: ${a.substationId})`);
      console.log(`     Time: ${new Date(a.estimatedStart).toLocaleTimeString()} - ${new Date(a.estimatedEnd).toLocaleTimeString()}`);
      console.log(`     Sequence: ${a.sequenceNumber}, Queued: ${a.isQueued}`);
    });
    
    if (data.warnings?.length > 0) {
      console.log('\n⚠️ Warnings:', data.warnings);
    }
  }
  
} catch (error) {
  console.error('❌ Request Error:', error.message);
  process.exit(1);
}
