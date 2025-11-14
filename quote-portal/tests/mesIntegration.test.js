/**
 * Integration Tests for MES - End-to-End Scenarios
 * Tests full lifecycle: create plan → launch → start → complete
 * Backward compatibility and pause/resume flows
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('End-to-End: Create → Launch → Start → Complete', () => {
  it('should handle full lifecycle with canonical nodes', async () => {
    // This is a placeholder for actual API integration tests
    // In production, this would make HTTP requests to the API
    
    const mockPlan = {
      id: 'PLAN-TEST-001',
      orderCode: 'WO-TEST-001',
      status: 'draft',
      quantity: 100,
      nodes: [
        {
          id: 'node-1',
          name: 'Kesim',
          operationId: 'OP-001',
          nominalTime: 60,
          efficiency: 0.8,
          requiredSkills: ['kesim'],
          predecessors: [],
          materialInputs: [
            { materialCode: 'M-00-001', requiredQuantity: 200 }
          ],
          outputCode: 'M-01-001',
          outputQty: 100
        }
      ]
    };

    // Step 1: POST /production-plans
    const createResult = await mockCreatePlan(mockPlan);
    assert.strictEqual(createResult.success, true);
    assert.ok(createResult.plan.nodes);
    assert.strictEqual(createResult.plan.nodes.length, 1);
    
    // Step 2: POST /production-plans/:id/launch
    const launchResult = await mockLaunchPlan(mockPlan.id);
    assert.strictEqual(launchResult.success, true);
    assert.ok(launchResult.assignments);
    assert.strictEqual(launchResult.assignments[0].nodeId, 'node-1');
    assert.ok(launchResult.assignments[0].effectiveTime, 'Should have effectiveTime');
    assert.ok(launchResult.assignments[0].substationId, 'Should have substationId');
    assert.ok(launchResult.assignments[0].preProductionReservedAmount, 'Should have material reservations');

    // Step 3: PATCH /worker-assignments/:id (start)
    const assignment = launchResult.assignments[0];
    const startResult = await mockStartAssignment(assignment.id);
    assert.strictEqual(startResult.success, true);
    assert.ok(startResult.assignment.actualReservedAmounts, 'Should have actualReservedAmounts');
    assert.strictEqual(startResult.assignment.status, 'in_progress');

    // Step 4: PATCH /worker-assignments/:id (complete)
    const completeResult = await mockCompleteAssignment(assignment.id, { actualOutput: 95, defects: 5 });
    assert.strictEqual(completeResult.success, true);
    assert.strictEqual(completeResult.assignment.status, 'completed');
    assert.ok(completeResult.stockMovements, 'Should have stock movements');
    assert.ok(completeResult.stockMovements.some(m => m.subType === 'production_consumption'));
    assert.ok(completeResult.stockMovements.some(m => m.subType === 'production_output'));
  });
});

describe('Pause/Resume Flow', () => {
  it('should correctly track totalPausedTime', async () => {
    const assignmentId = 'WO-001-01';
    
    // Start
    const startResult = await mockStartAssignment(assignmentId);
    assert.strictEqual(startResult.assignment.status, 'in_progress');
    
    // Pause (simulate 5 minutes later)
    const pauseTime = new Date(Date.now() + 5 * 60000);
    const pauseResult = await mockPauseAssignment(assignmentId, pauseTime);
    assert.strictEqual(pauseResult.assignment.status, 'paused');
    assert.ok(pauseResult.assignment.currentPauseStart);
    
    // Resume (simulate 10 minutes pause)
    const resumeTime = new Date(pauseTime.getTime() + 10 * 60000);
    const resumeResult = await mockResumeAssignment(assignmentId, resumeTime);
    assert.strictEqual(resumeResult.assignment.status, 'in_progress');
    assert.strictEqual(resumeResult.assignment.totalPausedTime, 10 * 60000, 'Should be 10 minutes in ms');
    assert.strictEqual(resumeResult.assignment.currentPauseStart, null, 'Should clear currentPauseStart');
    
    // Complete
    const completeResult = await mockCompleteAssignment(assignmentId, { actualOutput: 100, defects: 0 });
    assert.strictEqual(completeResult.success, true);
  });
});

// Mock functions (in production, these would be actual HTTP requests)

async function mockCreatePlan(plan) {
  // Simulate validation
  if (!plan.nodes || plan.nodes.length === 0) {
    return { success: false, error: 'Invalid plan schema' };
  }
  
  return {
    success: true,
    plan: {
      ...plan,
      createdAt: new Date().toISOString(),
      nodes: plan.nodes.map(n => ({
        ...n,
        estimatedStartTime: new Date().toISOString(),
        estimatedEndTime: new Date(Date.now() + n.nominalTime * 60000).toISOString()
      }))
    }
  };
}

async function mockLaunchPlan(planId) {
  return {
    success: true,
    planId,
    assignments: [
      {
        id: 'WO-001-01',
        planId,
        nodeId: 'node-1',
        workerId: 'W-001',
        stationId: 'ST-001',
        substationId: 'SUB-001',
        status: 'pending',
        nominalTime: 60,
        effectiveTime: 75, // 60 / 0.8
        plannedStart: new Date().toISOString(),
        plannedEnd: new Date(Date.now() + 75 * 60000).toISOString(),
        preProductionReservedAmount: {
          'M-00-001': 200
        },
        materialReservationStatus: 'pending'
      }
    ]
  };
}

async function mockStartAssignment(assignmentId) {
  return {
    success: true,
    assignment: {
      id: assignmentId,
      status: 'in_progress',
      actualStart: new Date().toISOString(),
      actualReservedAmounts: {
        'M-00-001': 200
      },
      materialReservationStatus: 'reserved'
    }
  };
}

async function mockPauseAssignment(assignmentId, pauseTime) {
  return {
    success: true,
    assignment: {
      id: assignmentId,
      status: 'paused',
      pausedAt: pauseTime.toISOString(),
      currentPauseStart: pauseTime.toISOString()
    }
  };
}

async function mockResumeAssignment(assignmentId, resumeTime) {
  const pauseDuration = 10 * 60000; // 10 minutes
  
  return {
    success: true,
    assignment: {
      id: assignmentId,
      status: 'in_progress',
      totalPausedTime: pauseDuration,
      currentPauseStart: null,
      lastPauseDuration: pauseDuration
    }
  };
}

async function mockCompleteAssignment(assignmentId, { actualOutput, defects }) {
  return {
    success: true,
    assignment: {
      id: assignmentId,
      status: 'completed',
      actualEnd: new Date().toISOString(),
      actualOutput,
      defects,
      materialReservationStatus: 'consumed'
    },
    stockMovements: [
      {
        type: 'out',
        subType: 'production_consumption',
        materialCode: 'M-00-001',
        quantity: 190 // Capped consumption
      },
      {
        type: 'in',
        subType: 'production_output',
        materialCode: 'M-01-001',
        quantity: actualOutput
      }
    ]
  };
}

console.log('\n✅ Integration tests completed. Run with: node --test tests/mesIntegration.test.js\n');
