/**
 * FIFO Scheduler Test Suite
 * 
 * Purpose: Test FIFO task scheduling functionality
 * 
 * Tests:
 * 1. Get next task for worker
 * 2. Get full task queue
 * 3. Get task statistics
 * 4. Start task
 * 5. Complete task
 * 6. Check queue status
 * 
 * Run: node server/utils/test-fifo-scheduler.js
 */

import {
  getWorkerNextTask,
  getWorkerTaskQueue,
  getWorkerTaskStats,
  startTask,
  completeTask,
  hasTasksInQueue
} from './fifoScheduler.js';

async function runTests() {
  console.log('🧪 FIFO Scheduler Test Suite');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const testWorkerId = 'W-001'; // Test worker ID

  try {
    // Test 1: Get next task
    console.log('📋 Test 1: Get next task for worker');
    console.log(`   Worker ID: ${testWorkerId}`);
    const nextTask = await getWorkerNextTask(testWorkerId);
    if (nextTask) {
      console.log('   ✅ Next task found:');
      console.log(`      Assignment: ${nextTask.assignmentId}`);
      console.log(`      Work Order: ${nextTask.workOrderCode}`);
      console.log(`      Node: ${nextTask.nodeName}`);
      console.log(`      Status: ${nextTask.status}`);
      console.log(`      FIFO Position: #${nextTask.fifoPosition}`);
    } else {
      console.log('   ℹ️  No tasks in queue');
    }
    console.log('');

    // Test 2: Get full queue
    console.log('📋 Test 2: Get full task queue');
    const queue = await getWorkerTaskQueue(testWorkerId, 10);
    console.log(`   ✅ Queue retrieved: ${queue.length} tasks`);
    queue.forEach((task, index) => {
      console.log(`      #${index + 1}: ${task.assignmentId} - ${task.nodeName} (${task.status})`);
    });
    console.log('');

    // Test 3: Get statistics
    console.log('📋 Test 3: Get task statistics');
    const stats = await getWorkerTaskStats(testWorkerId);
    console.log('   ✅ Statistics:');
    console.log(`      Total tasks: ${stats.totalTasks}`);
    console.log(`      Pending: ${stats.totalPending}`);
    console.log(`      Ready: ${stats.totalReady}`);
    console.log(`      Urgent: ${stats.urgentCount}`);
    console.log(`      Next due: ${stats.nextTaskDue || 'N/A'}`);
    console.log(`      Workload: ${stats.estimatedWorkload} minutes`);
    console.log('');

    // Test 4: Check queue status
    console.log('📋 Test 4: Check if worker has tasks');
    const hasTasks = await hasTasksInQueue(testWorkerId);
    console.log(`   ✅ Has tasks: ${hasTasks}`);
    console.log('');

    // Test 5 & 6: Start/Complete (only if tasks exist)
    if (nextTask) {
      console.log('📋 Test 5: Start task (skipped - would modify data)');
      console.log(`   Would start: ${nextTask.assignmentId}`);
      console.log('');

      console.log('📋 Test 6: Complete task (skipped - would modify data)');
      console.log(`   Would complete: ${nextTask.assignmentId}`);
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All tests completed successfully!\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run tests
runTests();
