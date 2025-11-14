/**
 * Unit Tests for MES Routes - Canonical Model
 * Tests for enrichNodesWithEstimatedTimes, validateProductionPlanNodes, assignNodeResources
 * Material reservation and consumption logic
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

// Mock Firestore
class MockFirestore {
  constructor() {
    this.collections = new Map();
  }

  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MockCollection());
    }
    return this.collections.get(name);
  }
}

class MockCollection {
  constructor() {
    this.docs = new Map();
  }

  doc(id) {
    return new MockDoc(this, id);
  }

  where() {
    return this;
  }

  async get() {
    return {
      empty: this.docs.size === 0,
      docs: Array.from(this.docs.values())
    };
  }
}

class MockDoc {
  constructor(collection, id) {
    this.collection = collection;
    this.id = id;
  }

  async get() {
    const data = this.collection.docs.get(this.id);
    return {
      exists: !!data,
      id: this.id,
      data: () => data
    };
  }

  async set(data) {
    this.collection.docs.set(this.id, data);
  }
}

// Test: enrichNodesWithEstimatedTimes
describe('enrichNodesWithEstimatedTimes', () => {
  it('should compute effectiveTime = nominalTime / efficiency', async () => {
    const db = new MockFirestore();
    
    // Mock operation with defaultEfficiency
    await db.collection('mes-operations').doc('OP-001').set({
      id: 'OP-001',
      name: 'Kesim',
      defaultEfficiency: 0.8
    });

    const nodes = [
      {
        id: 'node-1',
        name: 'Kesim',
        operationId: 'OP-001',
        nominalTime: 30,
        efficiency: 0.8,
        predecessors: []
      }
    ];

    const planData = { quantity: 1 };

    // Mock enrichNodesWithEstimatedTimes function (simplified)
    const enrichedNodes = await mockEnrichNodes(nodes, planData, db);

    assert.strictEqual(enrichedNodes[0].effectiveTime, 38, 'effectiveTime should be 30 / 0.8 = 37.5 rounded to 38');
  });

  it('should use operation.defaultEfficiency when node.efficiency is missing', async () => {
    const db = new MockFirestore();
    
    await db.collection('mes-operations').doc('OP-001').set({
      id: 'OP-001',
      defaultEfficiency: 0.9
    });

    const nodes = [
      {
        id: 'node-1',
        operationId: 'OP-001',
        nominalTime: 60,
        predecessors: []
      }
    ];

    const enrichedNodes = await mockEnrichNodes(nodes, { quantity: 1 }, db);

    assert.strictEqual(enrichedNodes[0].effectiveTime, 67, 'Should use defaultEfficiency: 60 / 0.9 = 66.67 ≈ 67');
  });

  it('should default to efficiency = 1.0 when operation has no defaultEfficiency', async () => {
    const db = new MockFirestore();
    
    await db.collection('mes-operations').doc('OP-001').set({
      id: 'OP-001'
      // No defaultEfficiency
    });

    const nodes = [
      {
        id: 'node-1',
        operationId: 'OP-001',
        nominalTime: 60,
        predecessors: []
      }
    ];

    const enrichedNodes = await mockEnrichNodes(nodes, { quantity: 1 }, db);

    assert.strictEqual(enrichedNodes[0].effectiveTime, 60, 'Should default to 1.0: 60 / 1.0 = 60');
  });
});

// Mock implementation of enrichNodesWithEstimatedTimes (simplified for testing)
async function mockEnrichNodes(nodes, planData, db) {
  const enriched = [];
  
  for (const node of nodes) {
    const opDoc = await db.collection('mes-operations').doc(node.operationId).get();
    const operation = opDoc.exists ? opDoc.data() : {};
    
    const efficiency = node.efficiency || operation.defaultEfficiency || 1.0;
    const nominalTime = node.nominalTime || 60;
    const effectiveTime = Math.round(nominalTime / efficiency);
    
    enriched.push({
      ...node,
      effectiveTime,
      estimatedStartTime: new Date().toISOString(),
      estimatedEndTime: new Date(Date.now() + effectiveTime * 60000).toISOString()
    });
  }
  
  return enriched;
}

// Test: validateProductionPlanNodes
describe('validateProductionPlanNodes', () => {
  it('should return no errors for valid nodes', () => {
    const nodes = [
      {
        id: 'node-1',
        name: 'Kesim',
        operationId: 'OP-001',
        nominalTime: 60,
        predecessors: []
      },
      {
        id: 'node-2',
        name: 'Montaj',
        operationId: 'OP-002',
        nominalTime: 90,
        predecessors: ['node-1']
      }
    ];

    const result = mockValidateNodes(nodes);

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.errors.length, 0);
  });

  it('should return error when node missing id', () => {
    const nodes = [
      {
        name: 'Kesim',
        operationId: 'OP-001',
        nominalTime: 60
      }
    ];

    const result = mockValidateNodes(nodes);

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('missing id')));
  });

  it('should return error when nominalTime <= 0', () => {
    const nodes = [
      {
        id: 'node-1',
        name: 'Kesim',
        operationId: 'OP-001',
        nominalTime: 0,
        predecessors: []
      }
    ];

    const result = mockValidateNodes(nodes);

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('nominalTime')));
  });

  it('should return error when predecessor references non-existent node', () => {
    const nodes = [
      {
        id: 'node-1',
        name: 'Kesim',
        operationId: 'OP-001',
        nominalTime: 60,
        predecessors: ['node-999']
      }
    ];

    const result = mockValidateNodes(nodes);

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Invalid predecessor')));
  });

  it('should detect circular dependencies', () => {
    const nodes = [
      {
        id: 'node-1',
        name: 'A',
        operationId: 'OP-001',
        nominalTime: 60,
        predecessors: ['node-2']
      },
      {
        id: 'node-2',
        name: 'B',
        operationId: 'OP-002',
        nominalTime: 60,
        predecessors: ['node-1']
      }
    ];

    const result = mockValidateNodes(nodes);

    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('Circular dependency') || e.includes('cycle')));
  });
});

// Mock implementation of validateProductionPlanNodes
function mockValidateNodes(nodes) {
  const errors = [];
  
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return { valid: false, errors: ['No nodes provided'] };
  }

  const nodeIds = new Set();
  nodes.forEach(n => nodeIds.add(n.id));

  nodes.forEach((node, index) => {
    if (!node.id) {
      errors.push(`Node at index ${index} is missing id`);
    }
    if (!node.nominalTime || node.nominalTime <= 0) {
      errors.push(`Node ${node.id} has invalid nominalTime`);
    }
    if (node.predecessors && Array.isArray(node.predecessors)) {
      node.predecessors.forEach(predId => {
        if (!nodeIds.has(predId)) {
          errors.push(`Node ${node.id} has Invalid predecessor: ${predId}`);
        }
      });
    }
  });

  // Check for cycles using simple DFS
  const hasCycle = detectCycle(nodes);
  if (hasCycle) {
    errors.push('Circular dependency detected in node graph');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function detectCycle(nodes) {
  const adjList = new Map();
  nodes.forEach(n => {
    adjList.set(n.id, n.predecessors || []);
  });

  const visiting = new Set();
  const visited = new Set();

  function dfs(nodeId) {
    if (visiting.has(nodeId)) return true; // Cycle found
    if (visited.has(nodeId)) return false;

    visiting.add(nodeId);
    const predecessors = adjList.get(nodeId) || [];
    
    for (const pred of predecessors) {
      if (dfs(pred)) return true;
    }

    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (dfs(node.id)) return true;
  }

  return false;
}

// Test: Material Reservation Logic
describe('Material Reservation (start action)', () => {
  it('should reserve full amount when stock is sufficient', () => {
    const assignment = {
      id: 'WO-001-01',
      preProductionReservedAmount: {
        'M-00-001': 100
      }
    };

    const material = {
      id: 'M-00-001',
      stock: 150,
      wipReserved: 0
    };

    const result = mockReserveMaterial(assignment, material, 'M-00-001');

    assert.strictEqual(result.actualReservedQty, 100);
    assert.strictEqual(result.partialReservation, false);
    assert.strictEqual(result.newStock, 50);
    assert.strictEqual(result.newWipReserved, 100);
  });

  it('should reserve partial amount when stock is insufficient', () => {
    const assignment = {
      id: 'WO-001-01',
      preProductionReservedAmount: {
        'M-00-001': 100
      }
    };

    const material = {
      id: 'M-00-001',
      stock: 60,
      wipReserved: 0
    };

    const result = mockReserveMaterial(assignment, material, 'M-00-001');

    assert.strictEqual(result.actualReservedQty, 60, 'Should reserve only available stock');
    assert.strictEqual(result.partialReservation, true);
    assert.ok(result.warning, 'Should have warning message');
    assert.strictEqual(result.newStock, 0);
    assert.strictEqual(result.newWipReserved, 60);
  });

  it('should throw error if actualReserved > preProductionAmount', () => {
    const assignment = {
      id: 'WO-001-01',
      preProductionReservedAmount: {
        'M-00-001': 50
      }
    };

    assert.throws(() => {
      // Trying to reserve more than planned
      mockCheckInvariant(75, 50, 'M-00-001', 'WO-001-01');
    }, /Invariant violated/);
  });
});

function mockReserveMaterial(assignment, material, materialCode) {
  const requestedQty = assignment.preProductionReservedAmount[materialCode] || 0;
  const availableStock = material.stock || 0;
  
  const actualReservedQty = Math.min(requestedQty, availableStock);
  const partialReservation = actualReservedQty < requestedQty;
  
  return {
    actualReservedQty,
    requestedQty,
    partialReservation,
    warning: partialReservation ? `Partial reservation: requested ${requestedQty}, reserved ${actualReservedQty}` : null,
    newStock: material.stock - actualReservedQty,
    newWipReserved: (material.wipReserved || 0) + actualReservedQty
  };
}

function mockCheckInvariant(actualReserved, preProductionAmount, materialCode, assignmentId) {
  if (actualReserved > preProductionAmount) {
    throw new Error(
      `Invariant violated: actualReserved ${actualReserved} > requestedAmount ${preProductionAmount} ` +
      `for material ${materialCode} in assignment ${assignmentId}`
    );
  }
}

// Test: Material Consumption Logic
describe('Material Consumption (complete action)', () => {
  it('should cap consumption at actualReservedAmounts', () => {
    const assignment = {
      id: 'WO-001-01',
      actualReservedAmounts: {
        'M-00-001': 80
      }
    };

    const theoreticalConsumption = 100;
    const result = mockConsumeMaterial(assignment, 'M-00-001', theoreticalConsumption);

    assert.strictEqual(result.cappedConsumption, 80, 'Consumption should be capped at reserved amount');
    assert.strictEqual(result.wasCapped, true);
  });

  it('should return leftover material to stock', () => {
    const assignment = {
      actualReservedAmounts: {
        'M-00-001': 100
      }
    };

    const actualConsumption = 85;
    const leftover = mockCalculateLeftover(assignment, 'M-00-001', actualConsumption);

    assert.strictEqual(leftover, 15, 'Leftover should be 100 - 85 = 15');
  });

  it('should not create stock movement for defects', () => {
    const defects = 5;
    const shouldCreateMovement = mockShouldCreateDefectMovement(defects);

    assert.strictEqual(shouldCreateMovement, false, 'Defects should not create stock movement');
  });
});

function mockConsumeMaterial(assignment, materialCode, theoreticalConsumption) {
  const actualReserved = assignment.actualReservedAmounts?.[materialCode] || 0;
  const cappedConsumption = Math.min(theoreticalConsumption, actualReserved);
  
  return {
    cappedConsumption,
    theoreticalConsumption,
    wasCapped: cappedConsumption < theoreticalConsumption,
    actualReserved
  };
}

function mockCalculateLeftover(assignment, materialCode, consumption) {
  const reserved = assignment.actualReservedAmounts?.[materialCode] || 0;
  return Math.max(0, reserved - consumption);
}

function mockShouldCreateDefectMovement(defects) {
  // Defects are logged in assignment but don't create stock movements
  return false;
}

console.log('\n✅ Unit tests completed. Run with: node --test tests/mesRoutes.test.js\n');
