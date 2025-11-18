import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';
import { getSession } from './auth.js'
import jsondb from '../src/lib/jsondb.js'
import { adjustMaterialStock, consumeMaterials } from './materialsRoutes.js'
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const planSchema = require('./models/ProductionPlanSchema.json');
const assignmentSchema = require('./models/AssignmentSchema.json');
const featureFlags = require('../config/featureFlags.cjs');

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validatePlan = ajv.compile(planSchema);
const validateAssignment = ajv.compile(assignmentSchema);

const router = express.Router();

// Log feature flag status on module load
featureFlags.logStatus();

// ============================================================================
// METRICS COLLECTION
// ============================================================================
// Simple in-memory counters for monitoring key events
// In production, integrate with Prometheus/Datadog/CloudWatch
const metrics = {
  reservation_mismatch_count: 0,
  consumption_capped_count: 0,
  validation_error_count: 0,
  
  increment(metricName) {
    if (this.hasOwnProperty(metricName)) {
      this[metricName]++;
      console.log(`📊 METRIC: ${metricName} = ${this[metricName]}`);
    }
  },
  
  reset() {
    this.reservation_mismatch_count = 0;
    this.consumption_capped_count = 0;
    this.validation_error_count = 0;
  },
  
  getAll() {
    return {
      reservation_mismatch_count: this.reservation_mismatch_count,
      consumption_capped_count: this.consumption_capped_count,
      validation_error_count: this.validation_error_count
    };
  }
};

// ============================================================================
// NODE ID NORMALIZATION HELPERS
// ============================================================================

// ============================================================================
// NORMALIZATION LAYER REMOVED (PROMPT 9)
// - getNodeId() helper removed: Frontend always sends 'nodeId' (not 'id')
// - normalizeNodes() removed: No fallback logic needed
// - Backend expects canonical schema: node.nodeId, node.nominalTime
// ============================================================================

console.log('✅ MES Routes module loaded - including semi-code endpoints');

// Middleware to authenticate requests (reuse existing auth)
function withAuth(req, res, next) {
  // Basic token presence check
  const token = req.headers.authorization?.replace('Bearer ', '') || ''
  if (!token && req.hostname !== 'localhost') {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  // Attach session user when possible (for createdBy/updatedBy fields)
  try {
    if (token && token.startsWith('dev-')) {
      req.user = { email: 'dev@burkol.com', userName: 'Dev User' }
    } else if (token) {
      const s = getSession(token)
      if (s) req.user = s
    }
  } catch {}
  next()
}

// Date helpers to store explicit date and time parts
function formatDateParts(d) {
  try {
    const dt = (d instanceof Date) ? d : new Date(d)
    const pad = (n) => String(n).padStart(2, '0')
    const yyyy = dt.getFullYear()
    const mm = pad(dt.getMonth() + 1)
    const dd = pad(dt.getDate())
    const HH = pad(dt.getHours())
    const MM = pad(dt.getMinutes())
    const SS = pad(dt.getSeconds())
    return { date: `${yyyy}-${mm}-${dd}`, time: `${HH}:${MM}:${SS}` }
  } catch {
    return { date: null, time: null }
  }
}

// Generate next Work Order code (WO-001, WO-002, etc.)
// Uses a single counter document: mes-counters/work-orders
async function generateWorkOrderCode(db) {
  const counterRef = db.collection('mes-counters').doc('work-orders');
  
  return await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    let next = 1;
    
    if (snap.exists) {
      const data = snap.data() || {};
      next = Number.isFinite(data.next) ? data.next : 1;
    }
    
    // Format: WO-001, WO-002, WO-003...
    const workOrderCode = `WO-${String(next).padStart(3, '0')}`;
    
    // Update counter
    tx.set(counterRef, { 
      next: next + 1, 
      updatedAt: new Date(),
      lastGenerated: workOrderCode
    }, { merge: true });
    
    console.log(`🔢 Generated Work Order Code: ${workOrderCode}`);
    
    return workOrderCode;
  });
}

// Generate work package IDs for all assignments in a plan
// Uses simple in-memory counter (01, 02, 03...) - no Firebase counter needed for nodes
// Format: WO-001-01, WO-001-02, WO-001-03...
function generateWorkPackageIds(workOrderCode, assignmentsCount) {
  if (!workOrderCode) {
    throw new Error('workOrderCode is required for generating work package IDs');
  }
  
  console.log(`🔢 Generating ${assignmentsCount} work package IDs for order: ${workOrderCode}`);
  
  const ids = [];
  for (let i = 1; i <= assignmentsCount; i++) {
    const workPackageId = `${workOrderCode}-${String(i).padStart(2, '0')}`;
    ids.push(workPackageId);
  }
  
  console.log(`  ✅ Generated IDs: ${ids.join(', ')}`);
  return ids;
}

// Helper function to handle Firestore operations
async function handleFirestoreOperation(operation, res) {
  try {
    const result = await operation();
    res.json(result);
  } catch (error) {
    console.error('Firestore operation error:', error);
    
    // Use error properties if available (status, code)
    const status = error.status || 500;
    const errorCode = error.code || 'internal_server_error';
    
    // Build response object (avoid circular references)
    const errorResponse = { 
      error: errorCode,
      message: error.message
    };
    
    // Add validation errors if available (but avoid circular refs)
    if (error.validationErrors && Array.isArray(error.validationErrors)) {
      errorResponse.details = error.validationErrors;
    }
    
    res.status(status).json(errorResponse);
  }
}

// ============================================================================
// MATERIAL RESERVATION HELPERS
// ============================================================================

/**
 * Apply output code suffix for finished products
 * If a node is the final node (no other nodes use it as predecessor),
 * append 'F' suffix to outputCode to mark it as finished product
 * 
 * @param {Array} nodes - All nodes in the plan
 * @returns {Array} Nodes with updated outputCodes
 */
function applyOutputCodeSuffixes(nodes) {
  if (!nodes || !Array.isArray(nodes)) return nodes;
  
  return nodes.map(node => {
    if (!node.outputCode) return node;
    
    // Check if this node is a finished product (no other nodes use it as predecessor)
    const isFinishedProduct = !nodes.some(n => 
      Array.isArray(n.predecessors) && n.predecessors.includes(node.nodeId)
    );
    
    // If it's a finished product and doesn't already have 'F' suffix, add it
    if (isFinishedProduct && !node.outputCode.endsWith('F')) {
      const updatedNode = { ...node };
      updatedNode.outputCode = `${node.outputCode}F`;
      console.log(`✅ Applied 'F' suffix to finished product: ${node.outputCode} → ${updatedNode.outputCode}`);
      return updatedNode;
    }
    
    return node;
  });
}

/**
 * Calculate pre-production reserved amounts for a work package
 * Takes into account the expected defect rate and input/output ratio
 * 
 * NEW LOGIC:
 * 1. Calculate input/output ratio for each material
 * 2. Calculate expected defects in output units
 * 3. Convert to input units using the ratio
 * 
 * Example:
 * - Output: 100 units, Defect Rate: 1%
 * - Expected defects: 100 * 0.01 = 1 unit (in output)
 * - Material M-008: 2 units input → 1 unit output (ratio = 2)
 * - Required input for 100 output: 100 * 2 = 200 units
 * - Defect input: 1 * 2 = 2 units
 * - Total reserved: 200 + 2 = 202 units
 * 
 * @param {Object} node - Execution graph node with materialInputs and outputQty
 * @param {number} expectedDefectRate - Expected defect rate from operation (percentage)
 * @param {number} planQuantity - Production plan quantity multiplier
 * @returns {Object} Object with materialCode as key and reserved quantity as value
 */
function calculatePreProductionReservedAmount(node, expectedDefectRate = 0, planQuantity = 1) {
  const preProductionReservedAmount = {};
  
  if (!node || !node.materialInputs || !Array.isArray(node.materialInputs)) {
    console.warn(`⚠️ calculatePreProductionReservedAmount: node ${node?.id} has no materialInputs!`);
    console.warn(`   node.materialInputs:`, node?.materialInputs);
    return preProductionReservedAmount;
  }
  
  // Get output quantity (planned output for this operation)
  const outputQty = parseFloat(node.outputQty) || 0;
  
  if (outputQty <= 0) {
    console.warn(`Node ${node.nodeId} has no outputQty, cannot calculate input/output ratio. Using direct input quantities.`);
    // Fallback: use input quantities directly
    node.materialInputs.forEach(material => {
      // Material schema: materialCode, requiredQuantity (legacy code/qty still supported for materials)
      const materialCode = material.materialCode || material.code;
      const requiredQty = (material.requiredQuantity || material.qty || material.required || 0) * planQuantity;
      if (materialCode && requiredQty > 0) {
        preProductionReservedAmount[materialCode] = 
          (preProductionReservedAmount[materialCode] || 0) + requiredQty;
      }
    });
    return preProductionReservedAmount;
  }
  
  // Calculate scaled output based on plan quantity
  const scaledOutputQty = outputQty * planQuantity;
  
  // Ensure defect rate is a valid number between 0 and 100
  const defectRate = Math.max(0, Math.min(100, parseFloat(expectedDefectRate) || 0));
  
  // Calculate expected defects in OUTPUT units
  const expectedDefectsInOutput = scaledOutputQty * (defectRate / 100);
  
  console.log(`📊 Rehin Calculation for node ${node.nodeId}:`);
  console.log(`   Output: ${scaledOutputQty}, Defect Rate: ${defectRate}%, Expected Defects: ${expectedDefectsInOutput}`);
  
  // Process each input material
  node.materialInputs.forEach(material => {
    // Material schema: materialCode, requiredQuantity (legacy code/qty still supported)
    const materialCode = material.materialCode || material.code;
    const inputQtyPerOperation = material.requiredQuantity || material.qty || material.required || 0;
    
    if (!materialCode || inputQtyPerOperation <= 0) return;
    
    // Calculate input/output ratio for THIS material
    // Example: If 2 units of M-008 produces 1 unit of output, ratio = 2
    const inputOutputRatio = inputQtyPerOperation / outputQty;
    
    // Required input for planned good output
    const requiredInputForGoodOutput = scaledOutputQty * inputOutputRatio;
    
    // Additional input needed for expected defects
    const additionalInputForDefects = expectedDefectsInOutput * inputOutputRatio;
    
    // Total reserved = normal requirement + defect buffer
    const totalReserved = requiredInputForGoodOutput + additionalInputForDefects;
    
    // Round up to avoid fractional units
    const reservedQty = Math.ceil(totalReserved);
    
    console.log(`   Material ${materialCode}:`);
    console.log(`      Input/Output Ratio: ${inputOutputRatio.toFixed(4)} (${inputQtyPerOperation}/${outputQty})`);
    console.log(`      Required for good output: ${requiredInputForGoodOutput.toFixed(2)}`);
    console.log(`      Additional for defects: ${additionalInputForDefects.toFixed(2)}`);
    console.log(`      Total reserved: ${reservedQty}`);
    
    // Accumulate if material appears multiple times
    preProductionReservedAmount[materialCode] = 
      (preProductionReservedAmount[materialCode] || 0) + reservedQty;
  });
  
  return preProductionReservedAmount;
}

/**
 * Calculate planned output for a work package
 * 
 * @param {Object} node - Execution graph node with output information
 * @param {number} planQuantity - Production plan quantity multiplier
 * @returns {Object} Object with materialCode as key and planned quantity as value
 */
function calculatePlannedOutput(node, planQuantity = 1) {
  const plannedOutput = {};
  
  if (!node) return plannedOutput;
  
  // Check if node has output material (semi-finished product or final product)
  if (node.outputCode && node.outputQty) {
    const outputQty = parseFloat(node.outputQty) || 0;
    if (outputQty > 0) {
      plannedOutput[node.outputCode] = outputQty * planQuantity;
    }
  }
  
  return plannedOutput;
}

// ============================================================================
// EXECUTION STATE HELPERS
// ============================================================================

/**
 * Get execution state for all tasks in a production plan
 * Calculates prerequisites and determines task status (ready, blocked, in_progress, etc.)
 * @param {string} planId - Production plan ID
 * @returns {Promise<Array>} Array of task execution states
 */
async function getPlanExecutionState(planId) {
  const db = getFirestore();
  
  // Fetch plan document
  const planDoc = await db.collection('mes-production-plans').doc(planId).get();
  if (!planDoc.exists) {
    throw new Error(`Plan not found: ${planId}`);
  }
  
  const planData = planDoc.data();
  const nodes = planData.nodes || [];
  const materialSummary = planData.materialSummary || {};
  
  // Fetch all assignments for this plan
  const assignmentsSnapshot = await db.collection('mes-worker-assignments')
    .where('planId', '==', planId)
    .get();
  
  const assignments = new Map();
  assignmentsSnapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.nodeId) {
      assignments.set(data.nodeId, { id: doc.id, ...data });
    }
  });
  
  // Fetch workers and stations for availability check
  const [workersSnapshot, stationsSnapshot, substationsSnapshot] = await Promise.all([
    db.collection('mes-workers').get(),
    db.collection('mes-stations').get(),
    db.collection('mes-substations').get()
  ]);
  
  const workers = new Map();
  workersSnapshot.docs.forEach(doc => {
    workers.set(doc.id, { id: doc.id, ...doc.data() });
  });
  
  const stations = new Map();
  stationsSnapshot.docs.forEach(doc => {
    stations.set(doc.id, { id: doc.id, ...doc.data() });
  });
  
  const substations = new Map();
  substationsSnapshot.docs.forEach(doc => {
    substations.set(doc.id, { id: doc.id, ...doc.data() });
  });
  
  // Build completion status map for predecessor checks
  const completedNodes = new Set();
  assignments.forEach((assignment, nodeId) => {
    if (assignment.status === 'completed') {
      completedNodes.add(nodeId);
    }
  });
  
  // Process each node
  const tasks = nodes.map(node => {
    const nodeId = node.nodeId;
    const assignment = assignments.get(nodeId);
    const workerId = node.assignedWorkerId || assignment?.workerId;
    
    // Get stationId from assignedStations array (schema-compliant: stationId or id)
    const stationId = (Array.isArray(node.assignedStations) && (node.assignedStations[0]?.stationId || node.assignedStations[0]?.id)) 
      || assignment?.stationId;
    
    // Check prerequisites
    const predecessorsDone = Array.isArray(node.predecessors)
      ? node.predecessors.every(predId => completedNodes.has(predId))
      : true;
    
    const worker = workerId ? workers.get(workerId) : null;
    const workerAvailable = !workerId || !worker 
      ? true // No worker assigned yet, or worker doesn't exist
      : !worker.currentTask || worker.currentTask.planId === planId && worker.currentTask.nodeId === nodeId;
    
    // Check substation availability (instead of station)
    // Substations track actual machine workload, not the general station category
    const substationId = assignment?.substationId || null;
    const substation = substationId ? substations.get(substationId) : null;
    const substationAvailable = !substationId || !substation
      ? true // No substation assigned yet, or substation doesn't exist
      : !substation.currentOperation || substation.currentOperation === nodeId;
    
    // DEBUG: Substation check details
    if (substationId) {
      console.log(`   🔧 Substation ${substationId} check:`);
      console.log(`      Substation exists: ${!!substation}`);
      console.log(`      Substation currentOperation: ${substation?.currentOperation}`);
      console.log(`      Node ID: ${nodeId}`);
      console.log(`      Match: ${substation?.currentOperation === nodeId}`);
      console.log(`      Available: ${substationAvailable}`);
    }
    
    // Global material check (per plan, not per node yet)
    const materialsReady = !materialSummary.hasShortages;
    
    // DEBUG: Log prerequisite checks for this node
    console.log(`🔍 getPlanExecutionState - Node ${nodeId}:`);
    console.log(`   Predecessors: ${JSON.stringify(node.predecessors || [])}`);
    console.log(`   predecessorsDone: ${predecessorsDone}, completedNodes: [${Array.from(completedNodes).join(', ')}]`);
    console.log(`   workerAvailable: ${workerAvailable}, workerId: ${workerId}`);
    console.log(`   substationAvailable: ${substationAvailable}, substationId: ${substationId}`);
    console.log(`   materialsReady: ${materialsReady}`);
    console.log(`   assignment status: ${assignment?.status || 'no assignment'}`);
    
    // Determine task status
    let status = 'pending';
    
    if (assignment) {
      // Status from assignment takes precedence
      if (assignment.status === 'completed') {
        status = 'completed';
      } else if (assignment.status === 'in_progress') {
        status = 'in_progress';
      } else if (assignment.status === 'paused') {
        status = 'paused';
      } else if (assignment.status === 'pending') {
        // Check if ready or blocked
        if (predecessorsDone && workerAvailable && substationAvailable && materialsReady) {
          status = 'ready';
        } else {
          status = 'blocked';
        }
      }
    } else {
      // No assignment yet - check if can be started
      if (predecessorsDone && workerAvailable && substationAvailable && materialsReady) {
        status = 'ready';
      } else {
        status = 'blocked';
      }
    }
    
    return {
      planId,
      nodeId: nodeId,
      name: node.name,
      operationId: node.operationId,
      operationName: node.operationName,
      
      // Resource assignments
      workerId,
      workerName: node.workerName,
      stationId,
      stationName: node.stationName,
      substationId,
      substationCode: substation?.code || null,
      
      // Substation workload info (for busy status display)
      substationCurrentOperation: substation?.currentOperation || null,
      substationCurrentWorkPackageId: substation?.currentWorkPackageId || null,
      substationCurrentExpectedEnd: substation?.currentExpectedEnd || null,
      
      // Status and prerequisites
      status,
      prerequisites: {
        predecessorsDone,
        workerAvailable,
        substationAvailable,
        stationAvailable: substationAvailable, // Alias for frontend compatibility
        materialsReady
      },
      
      // Pause metadata (to differentiate plan pause vs worker pause)
      pauseContext: assignment?.pauseContext || null,
      pauseReason: assignment?.pauseReason || null,
      pausedBy: assignment?.pausedBy || null,
      pausedByName: assignment?.pausedByName || null,
      pausedAt: assignment?.pausedAt || null,
      
      // Timing (PROMPT 11: use expectedStart, fallback to plannedStart for old assignments)
      expectedStart: assignment?.expectedStart || assignment?.plannedStart || null,
      priority: assignment?.priority || 2, // 1=Low, 2=Normal, 3=High
      estimatedNominalTime: node.estimatedNominalTime,
      estimatedEffectiveTime: node.estimatedEffectiveTime,
      
      // Assignment details (if exists)
      assignmentId: assignment?.id || null,
      assignedAt: assignment?.createdAt || null,
      actualStart: assignment?.actualStart || null,
      actualEnd: assignment?.actualEnd || null,
      
      // Predecessor info for UI
      predecessors: node.predecessors || [],
      
      // Material output info
      hasOutputs: node.hasOutputs,
      outputCode: node.outputCode,
      outputQty: node.outputQty
    };
  });
  
  // Sort by expectedStart time (FIFO)
  tasks.sort((a, b) => {
    const aTime = a.expectedStart ? new Date(a.expectedStart).getTime() : 0;
    const bTime = b.expectedStart ? new Date(b.expectedStart).getTime() : 0;
    return aTime - bTime;
  });
  
  return tasks;
}

// ============================================================================
// OPERATIONS ROUTES
// ============================================================================

// GET /api/mes/operations - Get all operations
router.get('/operations', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const snapshot = await db.collection('mes-operations').orderBy('name').get();
    const operations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return { operations };
  }, res);
});

// POST /api/mes/operations - Create/Update multiple operations (batch)
router.post('/operations', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { operations } = req.body;
    if (!Array.isArray(operations)) {
      throw new Error('Operations must be an array');
    }
    // Basic validation
    const invalid = operations.find(op => !op || !op.id || !Array.isArray(op.skills))
    if (invalid) {
      throw new Error('Each operation must have id and skills array')
    }

    const db = getFirestore();
    const batch = db.batch();

    // Get existing operations to find deletions
    const existingSnapshot = await db.collection('mes-operations').get();
    const existingIds = new Set(existingSnapshot.docs.map(doc => doc.id));
    const newIds = new Set(operations.map(op => op.id));

    // Add/Update operations
    operations.forEach(operation => {
      const docRef = db.collection('mes-operations').doc(operation.id);
      batch.set(docRef, {
        ...operation,
        updatedAt: new Date()
      }, { merge: true });
    });

    // Delete removed operations
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        const docRef = db.collection('mes-operations').doc(id);
        batch.delete(docRef);
      }
    });

    await batch.commit();
    return { success: true, updated: operations.length };
  }, res);
});

// ============================================================================
// WORKERS ROUTES
// ============================================================================

// GET /api/mes/workers - Get all workers
router.get('/workers', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const snapshot = await db.collection('mes-workers').orderBy('name').get();
    const nowIso = new Date().toISOString();
    const normalize = (doc) => {
      const data = doc.data();
      const w = { id: doc.id, ...data };
      // default status
      w.status = (w.status || w.availability || 'available').toString();
      if (/active/i.test(w.status)) w.status = 'available';
      if (/enabled|on/i.test(w.status)) w.status = 'available';
      if (/off|inactive|removed/i.test(w.status)) w.status = 'inactive';
      if (/break|paused|rest/i.test(w.status)) w.status = 'break';
      if (/busy|working/i.test(w.status)) w.status = 'busy';
      // compute leave flag
      const leaveStart = w.leaveStart || (w.leave && w.leave.start) || null;
      const leaveEnd = w.leaveEnd || (w.leave && w.leave.end) || null;
      w.onLeave = false;
      if (leaveStart && leaveEnd) {
        try {
          const s = new Date(leaveStart).toISOString();
          const e = new Date(leaveEnd).toISOString();
          w.onLeave = s <= nowIso && nowIso <= e;
        } catch (err) {
          w.onLeave = false;
        }
      }
      return w;
    };

    const workers = snapshot.docs.map(normalize);
    return { workers };
  }, res);
});

// POST /api/mes/workers - Create/Update multiple workers (batch)
router.post('/workers', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { workers } = req.body;
    if (!Array.isArray(workers)) {
      throw new Error('Workers must be an array');
    }
    // Basic validation: each worker must have at least one skill
    const invalid = workers.find(w => !w || !Array.isArray(w.skills) || w.skills.length === 0)
    if (invalid) {
      throw new Error('Each worker must have at least one skill');
    }

    const db = getFirestore();
    const batch = db.batch();

    // Load master time settings once to compute company schedules when needed
    const mdDoc = await db.collection('mes-settings').doc('master-data').get();
    const master = mdDoc.exists ? (mdDoc.data() || {}) : {};
    const timeSettings = master.timeSettings || { workType: 'fixed', laneCount: 1, fixedBlocks: {}, shiftBlocks: {} };

    // Helper to compute blocks for a day from master time settings
    function getShiftBlocksForDay(ts, day, shiftNo) {
      // 0) Standard shifts array model: shifts: [{ id: '1', blocks: { monday: [...] } }]
      if (Array.isArray(ts?.shifts)) {
        const shift = ts.shifts.find(s => s.id === String(shiftNo || '1'));
        if (shift && shift.blocks && Array.isArray(shift.blocks[day])) {
          return shift.blocks[day];
        }
      }
      
      // Aggregated model with laneIndex under `shift-${day}`
      const agg = ts?.shiftBlocks?.[`shift-${day}`];
      if (Array.isArray(agg)) {
        if (!shiftNo) return agg;
        const idx = (parseInt(shiftNo, 10) || 1) - 1;
        return agg.filter(b => (b && typeof b.laneIndex === 'number') ? b.laneIndex === idx : false);
      }
      // Split‑by‑lane model: shiftByLane: { '1': { day: [...] }, '2': { day: [...] } }
      const byLane = ts?.shiftByLane;
      if (byLane && typeof byLane === 'object') {
        if (shiftNo) {
          return Array.isArray(byLane[String(parseInt(shiftNo, 10) || 1)]?.[day])
            ? byLane[String(parseInt(shiftNo, 10) || 1)][day]
            : [];
        }
        let combined = [];
        Object.keys(byLane).forEach(k => { if (Array.isArray(byLane[k]?.[day])) combined = combined.concat(byLane[k][day]) });
        return combined;
      }
      // Named keys like `${day}-1`, `${day}_1`, `shift-1-${day}`, `shift-${day}-1`
      const keys = Object.keys(ts || {});
      if (keys.length) {
        const collect = (n) => {
          const patterns = [
            new RegExp(`^${day}[-_]${n}$`, 'i'),
            new RegExp(`^shift[-_]${day}[-_]${n}$`, 'i'),
            new RegExp(`^shift[-_]${n}[-_]${day}$`, 'i')
          ];
          const matchKey = keys.find(k => patterns.some(p => p.test(k)));
          const arr = matchKey && Array.isArray(ts[matchKey]) ? ts[matchKey] : [];
          return arr;
        };
        if (shiftNo) return collect(parseInt(shiftNo, 10) || 1);
        let combined = [];
        for (let n = 1; n <= 7; n++) { const arr = collect(n); if (arr.length) combined = combined.concat(arr) }
        return combined;
      }
      return [];
    }

    function normalizeSkills(skills) {
      if (Array.isArray(skills)) return skills;
      if (typeof skills === 'string') return skills.split(',').map(s=>s.trim()).filter(Boolean);
      return [];
    }

    function sanitizeWorkerPayload(worker) {
      const id = worker.id || `w-${Math.random().toString(36).slice(2,9)}`;
      const skills = normalizeSkills(worker.skills);
      const status = (worker.status || 'available').toLowerCase();

      // Normalize schedule: only allow one model via personalSchedule with mode
      const ps = (worker.personalSchedule && typeof worker.personalSchedule === 'object') ? worker.personalSchedule : null;
      let personalSchedule = null;
      if (ps) {
        const mode = (ps.mode === 'personal' || ps.mode === 'company') ? ps.mode : 'company';
        if (mode === 'company') {
          const shiftNo = ps.shiftNo || (timeSettings?.workType === 'shift' ? '1' : undefined);
          // Company mode: only save mode and shiftNo, blocks come from master-data
          personalSchedule = {
            mode: 'company',
            ...(shiftNo ? { shiftNo } : {})
          };
        } else {
          // personal mode: accept provided blocks, default missing days to []
          const blocks = ps.blocks && typeof ps.blocks === 'object' ? ps.blocks : {};
          const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
          const normalized = {};
          days.forEach(d => { normalized[d] = Array.isArray(blocks[d]) ? blocks[d] : [] });
          personalSchedule = { mode: 'personal', blocks: normalized };
        }
      } else {
        // No schedule provided: default to company mode (no blocks stored)
        const shiftNo = (timeSettings?.workType === 'shift') ? '1' : undefined;
        personalSchedule = {
          mode: 'company',
          ...(shiftNo ? { shiftNo } : {})
        };
      }

      const payload = {
        id,
        name: (worker.name || '').trim(),
        email: (worker.email || '').trim(),
        phone: (worker.phone || '').trim(),
        skills,
        status,
        station: worker.station || '',
        currentTask: worker.currentTask || '',
        personalSchedule,
        updatedAt: new Date()
      };
      return payload;
    }

    // Get existing workers to find deletions
    const existingSnapshot = await db.collection('mes-workers').get();
    const existingIds = new Set(existingSnapshot.docs.map(doc => doc.id));
    const newIds = new Set(workers.map(w => w.id));

    // Add/Update workers
    workers.forEach(worker => {
      const payload = sanitizeWorkerPayload(worker);
      const docRef = db.collection('mes-workers').doc(payload.id);
      // Delete legacy/duplicate schedule fields to enforce single weekly schedule source
      const deletes = {
        schedule: admin.firestore.FieldValue.delete(),
        companySchedule: admin.firestore.FieldValue.delete(),
        personalScheduleOld: admin.firestore.FieldValue.delete(),
        companyTimeSettings: admin.firestore.FieldValue.delete(),
        timeSource: admin.firestore.FieldValue.delete()
      };
      batch.set(docRef, { ...deletes, ...payload }, { merge: true });
    });

    // Delete removed workers
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        const docRef = db.collection('mes-workers').doc(id);
        batch.delete(docRef);
      }
    });

    await batch.commit();
    return { success: true, updated: workers.length };
  }, res);
});

// GET /api/mes/workers/:id/stations - Get stations where this worker can work
router.get('/workers/:id/stations', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const db = getFirestore();
    
    // Get the worker data
    const workerDoc = await db.collection('mes-workers').doc(id).get();
    if (!workerDoc.exists) {
      throw new Error('Worker not found');
    }
    
    const worker = { id: workerDoc.id, ...workerDoc.data() };
    const workerSkills = Array.isArray(worker.skills) ? worker.skills : [];
    
    // Get all stations
    const stationsSnapshot = await db.collection('mes-stations').get();
    const stations = stationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get operations to compute inherited skills for stations
    const operationsSnapshot = await db.collection('mes-operations').get();
    const operations = operationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filter stations where worker can work (has all required skills)
    const compatibleStations = stations.filter(station => {
      // Compute station's effective skills (from operations + station-specific skills)
      const inheritedSkills = [];
      if (Array.isArray(station.operationIds)) {
        station.operationIds.forEach(opId => {
          const operation = operations.find(op => op.id === opId);
          if (operation && Array.isArray(operation.subSkills)) {
            inheritedSkills.push(...operation.subSkills);
          }
        });
      }
      
      const stationSpecificSkills = Array.isArray(station.subSkills) ? station.subSkills : [];
      const stationEffectiveSkills = Array.from(new Set([...inheritedSkills, ...stationSpecificSkills]));
      
      // Check if worker has all required skills for this station
      return stationEffectiveSkills.every(requiredSkill => 
        workerSkills.includes(requiredSkill)
      );
    });
    
    return { 
      workerId: id,
      workerName: worker.name,
      workerSkills: workerSkills,
      compatibleStations: compatibleStations.map(station => {
        // Also include the required skills for each station for display
        const inheritedSkills = [];
        if (Array.isArray(station.operationIds)) {
          station.operationIds.forEach(opId => {
            const operation = operations.find(op => op.id === opId);
            if (operation && Array.isArray(operation.subSkills)) {
              inheritedSkills.push(...operation.subSkills);
            }
          });
        }
        const stationSpecificSkills = Array.isArray(station.subSkills) ? station.subSkills : [];
        const stationEffectiveSkills = Array.from(new Set([...inheritedSkills, ...stationSpecificSkills]));
        
        return {
          ...station,
          requiredSkills: stationEffectiveSkills
        };
      })
    };
  }, res);
});

// ============================================================================
// STATIONS ROUTES
// ============================================================================

// GET /api/mes/stations - Get all stations
router.get('/stations', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    
    // Get all stations
    const stationsSnapshot = await db.collection('mes-stations').orderBy('name').get();
    const stations = stationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Get all substations
    const subStationsSnapshot = await db.collection('mes-substations').get();
    const subStationsByStation = {};
    
    subStationsSnapshot.docs.forEach(doc => {
      const subStation = { id: doc.id, ...doc.data() };
      const stationId = subStation.stationId;
      
      if (!subStationsByStation[stationId]) {
        subStationsByStation[stationId] = [];
      }
      
      subStationsByStation[stationId].push({
        code: subStation.code,
        status: subStation.status
      });
    });
    
    // Merge substations back into station objects for frontend compatibility
    const stationsWithSubStations = stations.map(station => ({
      ...station,
      subStations: subStationsByStation[station.id] || []
    }));
    
    return { stations: stationsWithSubStations };
  }, res);
});

// POST /api/mes/stations - Create/Update multiple stations (batch)
// Now manages mes-substations as separate documents in their own collection
router.post('/stations', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { stations } = req.body;
    if (!Array.isArray(stations)) {
      throw new Error('Stations must be an array');
    }
    // Basic validation: each station must be linked to at least one operation
    const invalid = stations.find(s => !s || !Array.isArray(s.operationIds) || s.operationIds.length === 0)
    if (invalid) {
      throw new Error('Each station must reference at least one operation (operationIds)');
    }

    const db = getFirestore();
    
    // Get existing stations to find deletions
    const existingSnapshot = await db.collection('mes-stations').get();
    const existingIds = new Set(existingSnapshot.docs.map(doc => doc.id));
    const newIds = new Set(stations.map(s => s.id));
    
    // Pre-fetch all existing substations (before transaction)
    const allSubStationsSnapshot = await db.collection('mes-substations').get();
    const existingSubStationsByStation = {};
    allSubStationsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (!existingSubStationsByStation[data.stationId]) {
        existingSubStationsByStation[data.stationId] = [];
      }
      existingSubStationsByStation[data.stationId].push(doc.ref);
    });
    
    // Use a batch for better performance (transactions have query limitations)
    const batch = db.batch();
    
    // Step 1: Process each station
    for (const station of stations) {
      const stationId = station.id;
      const subStations = Array.isArray(station.subStations) ? station.subStations : [];
      
      // Step 1a: Delete old substations for this station
      const oldSubStationRefs = existingSubStationsByStation[stationId] || [];
      oldSubStationRefs.forEach(ref => {
        batch.delete(ref);
      });
      
      // Step 1b: Create new substation documents
      subStations.forEach(subStation => {
        if (!subStation.code) return; // Skip invalid substations
        
        // Use the code as-is (it's already in format like ST-XXX-1)
        const subStationId = subStation.code;
        const subStationRef = db.collection('mes-substations').doc(subStationId);
        
        batch.set(subStationRef, {
          id: subStationId,
          code: subStation.code,
          stationId: stationId,
          status: subStation.status || 'active',
          // Workload tracking fields (initialized as null)
          currentOperation: null,
          currentWorkPackageId: null,
          currentPlanId: null,
          currentExpectedEnd: null,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      });
      
      // Step 1c: Save station document WITHOUT embedded subStations array and WITHOUT status field
      const stationRef = db.collection('mes-stations').doc(stationId);
      const { subStations: _, status: __, ...stationDataWithoutSubStations } = station;
      
      batch.set(stationRef, {
        ...stationDataWithoutSubStations,
        subStationCount: subStations.length,
        updatedAt: new Date()
      }, { merge: true });
    }
    
    // Step 2: Delete removed stations and their substations
    for (const id of existingIds) {
      if (!newIds.has(id)) {
        // Delete station
        const stationRef = db.collection('mes-stations').doc(id);
        batch.delete(stationRef);
        
        // Delete all substations of this station
        const subStationRefs = existingSubStationsByStation[id] || [];
        subStationRefs.forEach(ref => {
          batch.delete(ref);
        });
      }
    }
    
    // Commit all changes
    await batch.commit();

    return { success: true, updated: stations.length };
  }, res);
});

// GET /api/mes/stations/:id/workers - Get workers that can work at this station
router.get('/stations/:id/workers', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const db = getFirestore();
    
    // Get the station data
    const stationDoc = await db.collection('mes-stations').doc(id).get();
    if (!stationDoc.exists) {
      throw new Error('Station not found');
    }
    
    const station = { id: stationDoc.id, ...stationDoc.data() };
    
    // Get operations to compute inherited skills
    const operationsSnapshot = await db.collection('mes-operations').get();
    const operations = operationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Compute station's effective skills (from operations + station-specific skills)
    const inheritedSkills = [];
    if (Array.isArray(station.operationIds)) {
      station.operationIds.forEach(opId => {
        const operation = operations.find(op => op.id === opId);
        if (operation && Array.isArray(operation.subSkills)) {
          inheritedSkills.push(...operation.subSkills);
        }
      });
    }
    
    const stationSpecificSkills = Array.isArray(station.subSkills) ? station.subSkills : [];
    const stationEffectiveSkills = Array.from(new Set([...inheritedSkills, ...stationSpecificSkills]));
    
    // Get all workers
    const workersSnapshot = await db.collection('mes-workers').orderBy('name').get();
    const allWorkers = workersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filter workers that have ALL the skills required by the station
    const compatibleWorkers = allWorkers.filter(worker => {
      const workerSkills = Array.isArray(worker.skills) ? worker.skills : [];
      
      // Check if worker has all required skills
      return stationEffectiveSkills.every(requiredSkill => 
        workerSkills.includes(requiredSkill)
      );
    });
    
    return { 
      stationId: id,
      stationName: station.name,
      requiredSkills: stationEffectiveSkills,
      compatibleWorkers
    };
  }, res);
});

// DELETE /api/mes/stations/:id - Delete a single station (does not require full payload)
router.delete('/stations/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params
    const db = getFirestore()
    
    // Delete all substations belonging to this station
    const subStationsSnapshot = await db.collection('mes-substations')
      .where('stationId', '==', id)
      .get()
    
    const batch = db.batch()
    
    // Add all substation deletes to batch
    subStationsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref)
    })
    
    // Add station delete to batch
    batch.delete(db.collection('mes-stations').doc(id))
    
    // Commit all deletes atomically
    await batch.commit()
    
    return { success: true, id, deletedSubStations: subStationsSnapshot.size }
  }, res)
});

// ============================================================================
// WORK ORDERS ROUTES
// ============================================================================

// GET /api/mes/work-orders - Get all work orders
router.get('/work-orders', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const snapshot = await db.collection('mes-work-orders')
      .orderBy('createdAt', 'desc')
      .get();
    const workOrders = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return { workOrders };
  }, res);
});

// POST /api/mes/work-orders - Create work order
router.post('/work-orders', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const workOrder = req.body;
    if (!workOrder.id) {
      throw new Error('Work order ID is required');
    }

    const db = getFirestore();
    await db.collection('mes-work-orders').doc(workOrder.id).set({
      ...workOrder,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return { success: true, id: workOrder.id };
  }, res);
});

// PUT /api/mes/work-orders/:id - Update work order
router.put('/work-orders/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const updates = req.body;

    const db = getFirestore();
    await db.collection('mes-work-orders').doc(id).update({
      ...updates,
      updatedAt: new Date()
    });

    return { success: true, id };
  }, res);
});

// DELETE /api/mes/work-orders/:id - Delete work order
router.delete('/work-orders/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const db = getFirestore();
    await db.collection('mes-work-orders').doc(id).delete();
    return { success: true, id };
  }, res);
});

// ============================================================================
// APPROVED QUOTES ROUTES (Read-only listing for Production Planning)
// ============================================================================

// GET /api/mes/approved-quotes - List approved quotes copied from Quotes as Work Orders
router.get('/approved-quotes', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const snapshot = await db.collection('mes-approved-quotes')
      .orderBy('createdAt', 'desc')
      .get();
    const approvedQuotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return { approvedQuotes };
  }, res);
});

// POST /api/mes/approved-quotes/ensure - Ensure an approved quote is copied as WO
router.post('/approved-quotes/ensure', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { quoteId } = req.body || {}
    if (!quoteId) {
      return { success: false, error: 'quoteId_required' }
    }

    const db = getFirestore();
    const col = db.collection('mes-approved-quotes')

    // Already exists?
    const existsSnap = await col.where('quoteId', '==', quoteId).limit(1).get()
    if (!existsSnap.empty) {
      return { success: true, ensured: true, workOrderCode: existsSnap.docs[0].id }
    }

    // Load quote from jsondb
    const quote = jsondb.getQuote(quoteId)
    if (!quote) {
      const e = new Error('quote_not_found'); e.status = 404; throw e
    }
    const st = String(quote.status || '').toLowerCase()
    if (!(st === 'approved' || st === 'onaylandı' || st === 'onaylandi')) {
      return { success: false, error: 'quote_not_approved', status: quote.status || null }
    }

    // Delivery date required to ensure approved quote is usable in MES
    if (!quote.deliveryDate || String(quote.deliveryDate).trim() === '') {
      return { success: false, error: 'delivery_date_required' }
    }

    // Generate next WO code using centralized counter
    const code = await generateWorkOrderCode(db);

    const approvedDoc = {
      workOrderCode: code,
      quoteId,
      status: 'approved',
      customer: quote.name || quote.customer || null,
      company: quote.company || null,
      email: quote.email || null,
      phone: quote.phone || null,
      deliveryDate: quote.deliveryDate || null,
      price: quote.price ?? quote.calculatedPrice ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      quoteSnapshot: quote
    }

    await col.doc(code).set(approvedDoc, { merge: true })
    return { success: true, ensured: true, workOrderCode: code }
  }, res)
})

// ============================================================================
// MASTER DATA ROUTES
// ============================================================================

// GET /api/mes/master-data - Get available skills and operation types
router.get('/master-data', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const doc = await db.collection('mes-settings').doc('master-data').get();
    
    if (!doc.exists) {
      // Return defaults if no master data exists
      return {
        availableSkills: ['Kaynak', 'Tornalama', 'Freze', 'Montaj'],
        availableOperationTypes: ['İmalat', 'Kontrol', 'Montaj', 'Paketleme'],
        stationEfficiency: 1.0,  // Default station efficiency multiplier
        workerEfficiency: 1.0,   // Default worker efficiency multiplier
        // default empty time settings for company schedule
        timeSettings: {
          workType: 'fixed',
          laneCount: 1,
          fixedBlocks: {},
          shiftBlocks: {}
        }
      };
    }

    const data = doc.data() || {}
    // Map legacy field names if present
    if (!data.availableSkills && Array.isArray(data.skills)) {
      data.availableSkills = data.skills
    }
    if (!data.availableOperationTypes && Array.isArray(data.operationTypes)) {
      data.availableOperationTypes = data.operationTypes
    }
    // Ensure efficiency defaults
    data.stationEfficiency = data.stationEfficiency ?? 1.0;
    data.workerEfficiency = data.workerEfficiency ?? 1.0;
    // Ensure timeSettings exists with safe defaults
    data.timeSettings = data.timeSettings || { workType: 'fixed', laneCount: 1, fixedBlocks: {}, shiftBlocks: {} }
    return data;
  }, res);
});

// POST /api/mes/master-data - Update master data
router.post('/master-data', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { availableSkills, availableOperationTypes, timeSettings, stationEfficiency, workerEfficiency } = req.body || {};
    
    console.log('POST /api/mes/master-data - Received:', { 
      availableSkills, 
      availableOperationTypes, 
      timeSettings,
      stationEfficiency,
      workerEfficiency
    });
    
    const db = getFirestore();
    const payload = {
      ...(availableSkills ? { availableSkills } : {}),
      ...(availableOperationTypes ? { availableOperationTypes } : {}),
      ...(timeSettings ? { timeSettings } : {}),
      ...(stationEfficiency !== undefined ? { stationEfficiency: parseFloat(stationEfficiency) || 1.0 } : {}),
      ...(workerEfficiency !== undefined ? { workerEfficiency: parseFloat(workerEfficiency) || 1.0 } : {}),
      updatedAt: new Date()
    }
    
    console.log('Firebase payload to save:', payload);
    await db.collection('mes-settings').doc('master-data').set(payload, { merge: true });

    return { success: true };
  }, res);
});

// ============================================================================
// PRODUCTION PLANS ROUTES  
// ============================================================================

// ============================================================================
// PRODUCTION PLAN VALIDATION HELPER
// ============================================================================

/**
 * Enrich production plan nodes with estimated start/end times
 * Calculates timing based on dependencies, worker schedules, and durations
 * 
 * @param {Array} nodes - Array of plan nodes
 * @param {Object} planData - Plan data with quantity, status, etc.
 * @param {Object} db - Firestore database instance
 * @returns {Promise<Array>} Enriched nodes with estimatedStartTime and estimatedEndTime
 */
async function enrichNodesWithEstimatedTimes(nodes, planData, db) {
  const nodesToProcess = nodes;
  
  if (!Array.isArray(nodesToProcess) || nodesToProcess.length === 0) {
    return nodes; // Return original nodes if nothing to process
  }
  
  // Fetch workers, stations, substations, and operations for estimation
  const [workersSnap, stationsSnap, substationsSnap, operationsSnap] = await Promise.all([
    db.collection('mes-workers').where('status', '==', 'active').get(),
    db.collection('mes-work-stations').get(),
    db.collection('mes-substations').get(),
    db.collection('mes-operations').get()
  ]);
  
  const workers = workersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const stations = stationsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const substations = substationsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const operations = new Map(operationsSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() }]));
  
  // Initialize schedule tracking
  const workerSchedule = new Map(); // workerId -> [{nodeId, start, end}]
  const substationSchedule = new Map(); // substationId -> [{nodeId, start, end}] (CANONICAL: uses substationId)
  const nodeEndTimes = new Map(); // nodeId -> Date (for dependency tracking)
  
  console.log('🕐 Starting node time enrichment...');
  
  // Build dependency graph to process in order
  const processed = new Set();
  const enrichedNodesMap = new Map();
  
  // Process nodes in dependency order
  async function processNode(node) {
    const nodeId = node.nodeId;
    
    if (processed.has(nodeId)) {
      return enrichedNodesMap.get(nodeId);
    }
    
    // ========================================================================
    // COMPUTE EFFECTIVE TIME WITH EFFICIENCY (CANONICAL)
    // ========================================================================
    // Load operation to get defaultEfficiency
    const operation = operations.get(node.operationId);
    const defaultEfficiency = operation?.defaultEfficiency || 1.0;
    
    // Use node efficiency override if present, otherwise use operation default
    const efficiency = node.efficiency || defaultEfficiency;
    
    // Use canonical nominalTime field only
    const nominalTime = node.nominalTime || 60;
    
    // Compute effectiveTime using inverse proportionality: effectiveTime = nominalTime / efficiency
    // Example: nominalTime=60, efficiency=0.8 → effectiveTime=75 (takes longer with lower efficiency)
    const effectiveTime = Math.round(nominalTime / efficiency);
    
    // Enrich node with effectiveTime
    node.effectiveTime = effectiveTime;
    node.nominalTime = nominalTime; // Ensure canonical field is set
    
    console.log(`Node ${nodeId}: nominalTime=${nominalTime}, efficiency=${efficiency.toFixed(2)}, effectiveTime=${effectiveTime}`);
    
    // Process predecessors first
    const predecessors = node.predecessors || [];
    for (const predId of predecessors) {
      const predNode = nodesToProcess.find(n => n.nodeId === predId);
      if (predNode && !processed.has(predId)) {
        await processNode(predNode);
      }
    }
    
    // Use assignNodeResources to calculate timing
    const assignment = await assignNodeResources(
      node,
      workers,
      stations,
      substations,
      workerSchedule,
      substationSchedule,
      planData,
      nodeEndTimes,
      db
    );
    
    if (assignment.error) {
      // If assignment fails, use simple time estimation
      console.warn(`⚠️ Could not auto-assign node ${nodeId}: ${assignment.message}`);
      
      // Error fallback: use pre-computed effectiveTime
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + effectiveTime * 60000);
      
      enrichedNodesMap.set(nodeId, {
        ...node,
        estimatedStartTime: startTime.toISOString(),
        estimatedEndTime: endTime.toISOString(),
        estimatedDuration: effectiveTime,
        effectiveTime: effectiveTime,
        nominalTime: nominalTime
      });
      
      nodeEndTimes.set(nodeId, endTime);
    } else {
      // Success - add estimated times to node (CANONICAL FIELDS)
      const startTime = new Date(assignment.plannedStart);
      const endTime = new Date(assignment.plannedEnd);
      
      enrichedNodesMap.set(nodeId, {
        ...node,
        estimatedStartTime: assignment.plannedStart,
        estimatedEndTime: assignment.plannedEnd,
        estimatedDuration: assignment.effectiveTime,
        effectiveTime: assignment.effectiveTime, // CANONICAL
        nominalTime: nominalTime, // CANONICAL
        estimatedWorkerId: assignment.workerId,
        estimatedWorkerName: assignment.workerName,
        estimatedStationId: assignment.stationId,
        estimatedStationName: assignment.stationName,
        estimatedSubstationId: assignment.substationId // CANONICAL
      });
      
      // Track end time for dependency resolution
      nodeEndTimes.set(nodeId, endTime);
      
      // Update schedules for next iterations
      if (!workerSchedule.has(assignment.workerId)) {
        workerSchedule.set(assignment.workerId, []);
      }
      workerSchedule.get(assignment.workerId).push({
        nodeId,
        start: startTime,
        end: endTime
      });
      
      // CRITICAL FIX: Track substation schedule, not station schedule
      const substationId = assignment.substationId;
      if (substationId) {
        if (!substationSchedule.has(substationId)) {
          substationSchedule.set(substationId, []);
        }
        substationSchedule.get(substationId).push({
          nodeId,
          start: startTime,
          end: endTime
        });
      }
      
      console.log(`✅ Node ${nodeId}: ${assignment.plannedStart} → ${assignment.plannedEnd} (${assignment.effectiveTime} min)`);
    }
    
    processed.add(nodeId);
    return enrichedNodesMap.get(nodeId);
  }
  
  // Process all nodes
  for (const node of nodesToProcess) {
    await processNode(node);
  }
  
  // Return enriched nodes in original order
  return nodesToProcess.map(node => {
    const nodeId = node.nodeId;
    return enrichedNodesMap.get(nodeId) || node;
  });
}

/**
 * Validate production plan nodes for completeness and data integrity (CANONICAL SCHEMA)
 * Ensures all nodes have required fields before plan can be saved
 * 
 * @param {Array} nodes - Array of plan nodes (canonical schema)
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
function validateProductionPlanNodes(nodes) {
  const errors = [];
  const nodesToValidate = nodes;
  
  if (!Array.isArray(nodesToValidate) || nodesToValidate.length === 0) {
    errors.push('Production plan must have at least one operation node');
    return { valid: false, errors };
  }
  
  // Build predecessor map for starting node detection
  const predecessorMap = new Map();
  nodesToValidate.forEach(node => {
    const nodeId = node.nodeId;
    const preds = node.predecessors || [];
    predecessorMap.set(nodeId, preds);
  });
  
  nodesToValidate.forEach((node, index) => {
    const nodeId = node.nodeId;
    const nodeLabel = `Node ${index + 1} (${nodeId || 'unknown'})`;
    
    // 1. Validate node ID (CANONICAL - required)
    if (!node.nodeId || typeof node.nodeId !== 'string' || node.nodeId.trim() === '') {
      errors.push(`${nodeLabel}: Node id is required and must be a non-empty string`);
    }
    
    // 2. Validate operation name
    if (!node.name || typeof node.name !== 'string' || node.name.trim() === '') {
      errors.push(`${nodeLabel}: Operation name is required`);
    }
    
    // 3. Validate nominalTime (CANONICAL - required)
    const nominalTime = node.nominalTime;
    if (!Number.isFinite(nominalTime) || nominalTime < 1) {
      errors.push(`${nodeLabel}: nominalTime must be a number >= 1 minute`);
    }
    
    // 4. Validate efficiency (CANONICAL - optional)
    if (node.efficiency !== undefined && node.efficiency !== null) {
      const eff = parseFloat(node.efficiency);
      if (!Number.isFinite(eff) || eff <= 0 || eff > 1) {
        errors.push(`${nodeLabel}: efficiency must be between 0.01 and 1.0`);
      }
    }
    
    // 5. Validate assignmentMode and assignedWorkerId (CANONICAL)
    if (node.assignmentMode === 'manual') {
      if (!node.assignedWorkerId || typeof node.assignedWorkerId !== 'string' || node.assignedWorkerId.trim() === '') {
        errors.push(`${nodeLabel}: assignmentMode='manual' requires assignedWorkerId to be present and non-empty`);
      }
    }
    
    // 6. Validate station assignments
    const stations = node.assignedStations || [];
    if (!Array.isArray(stations) || stations.length === 0) {
      errors.push(`${nodeLabel}: At least one work station must be assigned`);
    }
    
    // 7. Validate output quantity
    const outputQty = node.outputQty;
    if (!Number.isFinite(outputQty) || outputQty <= 0) {
      errors.push(`${nodeLabel}: Output quantity must be a number greater than 0`);
    }
    
    // 8. Validate material inputs
    const materials = node.materialInputs || [];
    const materialInputs = node.materialInputs || [];
    const allMaterials = materials.length > 0 ? materials : materialInputs;
    
    // Debug log for material validation
    if (allMaterials.length > 0) {
      console.log(`🔍 ${nodeLabel} materials:`, JSON.stringify(allMaterials, null, 2));
    }
    
    // Check each material has a valid quantity (CANONICAL: requiredQuantity)
    allMaterials.forEach((material, matIndex) => {
      const matQty = material.requiredQuantity;
      console.log(`   Material ${matIndex + 1}: requiredQuantity=${material.requiredQuantity}, resolved=${matQty}`);
      if (!Number.isFinite(matQty) || matQty < 0) {
        errors.push(`${nodeLabel}, Material ${matIndex + 1}: Quantity must be a valid number >= 0`);
      }
    });
    
    // Check starting nodes (no predecessors) have at least one material
    const predecessors = node.predecessors || [];
    const isStartingNode = !Array.isArray(predecessors) || predecessors.length === 0;
    
    if (isStartingNode) {
      // Starting nodes must have at least one non-derived material
      const nonDerivedMaterials = allMaterials.filter(m => !m.derivedFrom);
      
      if (nonDerivedMaterials.length === 0) {
        errors.push(`${nodeLabel}: Starting operations must have at least one material input`);
      }
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// POST /api/mes/production-plans/next-id - Generate next sequential plan id (PPL-MMYY-XXX)
router.post('/production-plans/next-id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // 01-12
    const year = String(now.getFullYear()).slice(-2); // Last 2 digits of year (25 for 2025)
    const monthYear = `${month}${year}`;
    const pad = (n) => String(n).padStart(3, '0'); // Changed to 3 digits for XXX format
    const counterRef = db.collection('mes-counters').doc(`plan-${monthYear}`);

    const id = await db.runTransaction(async (tx) => {
      const snap = await tx.get(counterRef);
      let next = 1;
      if (snap.exists) {
        const data = snap.data() || {};
        next = Number.isFinite(data.next) ? data.next : 1;
      }
      const newId = `PPL-${monthYear}-${pad(next)}`;
      tx.set(counterRef, { next: next + 1, updatedAt: new Date() }, { merge: true });
      return newId;
    });

    return { id };
  }, res);
});

// GET /api/mes/production-plans - Get production plans (exclude templates)
router.get('/production-plans', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    // Fetch all then filter out templates to avoid relying on composite indexes
    const snapshot = await db.collection('mes-production-plans').orderBy('createdAt', 'desc').get();
    const all = snapshot.docs.map(doc => {
      const plan = { id: doc.id, ...doc.data() };
      return plan;
    });
    const productionPlans = all.filter(p => (p.status || p.type || '').toString().toLowerCase() !== 'template');
    return { productionPlans };
  }, res);
});

// POST /api/mes/production-plans - Create production plan
router.post('/production-plans', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const productionPlan = req.body;
    const { assignments } = productionPlan; // Extract assignments from plan data
    
    // Validate plan schema (controlled by feature flag)
    if (featureFlags.ENABLE_VALIDATION) {
      if (!validatePlan(productionPlan)) {
        metrics.increment('validation_error_count');
        console.error('❌ Plan validation failed:', validatePlan.errors);
        // Return error and stop execution (prevents circular JSON error)
        throw Object.assign(
          new Error('Invalid plan schema'),
          { status: 400, code: 'validation_error', validationErrors: validatePlan.errors }
        );
      }
    } else {
      console.warn('⚠️ Validation disabled by feature flag - accepting plan without validation');
    }
    
    if (!productionPlan.id) {
      throw new Error('Production plan ID is required');
    }

    // ========================================================================
    // VALIDATE PRODUCTION PLAN NODES (CANONICAL SCHEMA)
    // ========================================================================
    
    // Debug: Log first node to see what's received
    if (productionPlan.nodes && productionPlan.nodes.length > 0) {
      console.log('🔍 Backend received node 0:', JSON.stringify(productionPlan.nodes[0], null, 2));
    }
    
    const validation = validateProductionPlanNodes(
      productionPlan.nodes || []
    );
    
    if (!validation.valid) {
      const error = new Error('Production plan validation failed');
      error.status = 400;
      error.code = 'validation_error';
      error.validationErrors = validation.errors;
      error.message = `Validation failed: ${validation.errors.join('; ')}`;
      throw error;
    }

    const db = getFirestore();
    const now = new Date();
    const parts = formatDateParts(now);
    const actorEmail = (req.user && req.user.email) || null;
    const actorName = (req.user && (req.user.name || req.user.userName)) || null;
    const createdBy = actorEmail || actorName || null;

    // ========================================================================
    // ENRICH NODES WITH ESTIMATED START/END TIMES (CANONICAL)
    // ========================================================================
    // Add estimated timing information to nodes based on:
    // 1. Node nominalTime and efficiency → effectiveTime
    // 2. Predecessor dependencies
    // 3. Worker schedule constraints (if available)
    
    const enrichedNodes = await enrichNodesWithEstimatedTimes(
      productionPlan.nodes || [],
      productionPlan,
      db
    );
    
    // Apply output code suffixes for finished products ('F' suffix)
    const nodesWithSuffixes = applyOutputCodeSuffixes(enrichedNodes);
    
    // Remove assignments from plan data to avoid storing in plan document
    const planData = { ...productionPlan };
    planData.nodes = nodesWithSuffixes;
    delete planData.assignments;
    
    // Handle 'released' status - add release metadata
    if (productionPlan.status === 'released') {
      planData.releasedAt = now;
      planData.releasedBy = actorEmail || createdBy;
      planData.releasedByName = actorName || createdBy || null;
    }

    // Check if status is 'production' and autoAssign is true
    const shouldAutoAssign = productionPlan.status === 'production' && productionPlan.autoAssign === true && assignments && Array.isArray(assignments);

    if (shouldAutoAssign) {
      // Use transaction for consistency
      const result = await db.runTransaction(async (transaction) => {
        // Create the plan
        const planRef = db.collection('mes-production-plans').doc(productionPlan.id);
        transaction.set(planRef, {
          ...planData,
          createdAt: now,
          updatedAt: now,
          createdDate: productionPlan.createdDate || parts.date,
          createdTime: productionPlan.createdTime || parts.time,
          updatedDate: parts.date,
          updatedTime: parts.time,
          createdBy: actorEmail || createdBy,
          createdByName: actorName || createdBy || null,
          updatedBy: actorEmail || createdBy,
          updatedByName: actorName || createdBy || null
        }, { merge: true });

        // Generate assignment IDs (simple sequential numbering within plan)
        const workOrderCode = productionPlan.orderCode || productionPlan.id;
        const assignmentIds = generateWorkPackageIds(workOrderCode, assignments.length);

        // Create assignments with work order-based IDs
        assignments.forEach((assignment, index) => {
          const assignmentId = assignmentIds[index];
          const docRef = db.collection('mes-worker-assignments').doc(assignmentId);
          
          transaction.set(docRef, {
            id: assignmentId,
            planId: productionPlan.id,
            workOrderCode: workOrderCode,
            nodeId: assignment.nodeId || null,
            workerId: assignment.workerId || null,
            stationId: assignment.stationId || null,
            subStationCode: assignment.subStationCode || null,
            start: assignment.start ? new Date(assignment.start) : null,
            end: assignment.end ? new Date(assignment.end) : null,
            status: assignment.status || 'pending',
            createdAt: now,
            updatedAt: now,
            createdBy: actorEmail || 'system'
          });
        })

        return { success: true, id: productionPlan.id, assignmentsCreated: assignments.length };
      });

      return result;
    } else {
      // Normal creation without assignments
      await db.collection('mes-production-plans').doc(productionPlan.id).set({
        ...planData,
        createdAt: now,
        updatedAt: now,
        createdDate: productionPlan.createdDate || parts.date,
        createdTime: productionPlan.createdTime || parts.time,
        updatedDate: parts.date,
        updatedTime: parts.time,
        createdBy: actorEmail || createdBy,
        createdByName: actorName || createdBy || null,
        updatedBy: actorEmail || createdBy,
        updatedByName: actorName || createdBy || null
      }, { merge: true });
      
      // If status is 'released' and orderCode exists, update approved quote production state
      if (productionPlan.status === 'released' && productionPlan.orderCode) {
        // Async update - don't block response
        updateApprovedQuoteProductionState(
          productionPlan.orderCode, 
          'Üretiliyor',
          actorEmail || 'system'
        ).catch(err => {
          console.error('Failed to update approved quote state on plan release:', err);
        });
      }

      return { success: true, id: productionPlan.id };
    }
  }, res);
});

// PUT /api/mes/production-plans/:id - Update production plan
router.put('/production-plans/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const updates = req.body;
    const { assignments } = updates; // Extract assignments from updates to avoid storing in plan doc

    // ========================================================================
    // VALIDATE PRODUCTION PLAN SCHEMA
    // ========================================================================
    // Validate plan schema if full plan object is provided (controlled by feature flag)
    if (updates.nodes && updates.id) {
      if (featureFlags.ENABLE_VALIDATION) {
        if (!validatePlan(updates)) {
          metrics.increment('validation_error_count');
          console.error('❌ Plan update validation failed:', validatePlan.errors);
          return res.status(400).json({ 
            error: 'Invalid plan schema', 
            details: validatePlan.errors 
          });
        }
      } else {
        console.warn('⚠️ Validation disabled by feature flag - accepting plan update without validation');
      }
      
    }

    // ========================================================================
    // VALIDATE PRODUCTION PLAN NODES (CANONICAL SCHEMA)
    // ========================================================================
    if (updates.nodes) {
      
      const validation = validateProductionPlanNodes(
        updates.nodes || []
      );
      
      if (!validation.valid) {
        const error = new Error('Production plan validation failed');
        error.status = 400;
        error.code = 'validation_error';
        error.validationErrors = validation.errors;
        error.message = `Validation failed: ${validation.errors.join('; ')}`;
        throw error;
      }
    }

    const db = getFirestore();
    const updatedByEmail = (req.user && req.user.email) || null;
    const updatedByName = (req.user && (req.user.name || req.user.userName)) || null;
    const now = new Date();
    const parts = formatDateParts(now);

    // Remove assignments from updates to avoid storing in plan document
    const planUpdates = { ...updates };
    delete planUpdates.assignments;
    
    // Apply output code suffixes for finished products if nodes are being updated
    if (planUpdates.nodes && Array.isArray(planUpdates.nodes)) {
      planUpdates.nodes = applyOutputCodeSuffixes(planUpdates.nodes);
    }
    
    // Check if status is transitioning to 'released' - add release metadata
    if (updates.status === 'released') {
      // Get current plan to check if it wasn't already released
      const currentPlanRef = db.collection('mes-production-plans').doc(id);
      const currentPlanSnap = await currentPlanRef.get();
      const currentPlan = currentPlanSnap.exists ? currentPlanSnap.data() : null;
      
      // Only set releasedAt/releasedBy if not already set (first release)
      if (!currentPlan || !currentPlan.releasedAt) {
        planUpdates.releasedAt = now;
        planUpdates.releasedBy = updatedByEmail || 'system';
        planUpdates.releasedByName = updatedByName || null;
      }
    }

    // Check if status is changing to 'production' and autoAssign is true
    const shouldAutoAssign = updates.status === 'production' && updates.autoAssign === true && assignments && Array.isArray(assignments);

    if (shouldAutoAssign) {
      // Use transaction to ensure consistency between plan update and assignments
      const result = await db.runTransaction(async (transaction) => {
        // Update the plan
        const planRef = db.collection('mes-production-plans').doc(id);
        transaction.set(planRef, {
          ...planUpdates,
          updatedAt: now,
          updatedDate: parts.date,
          updatedTime: parts.time,
          ...(updatedByEmail ? { updatedBy: updatedByEmail } : {}),
          ...(updatedByName ? { updatedByName } : {})
        }, { merge: true });

        // Delete existing assignments for this plan
        const existingQuery = db.collection('mes-worker-assignments').where('planId', '==', id);
        const existingSnapshot = await transaction.get(existingQuery);
        
        existingSnapshot.docs.forEach(doc => {
          transaction.delete(doc.ref);
        });

        // Generate assignment IDs (simple sequential numbering within plan)
        const workOrderCode = updates.orderCode || planUpdates.orderCode || id;
        const assignmentIds = generateWorkPackageIds(workOrderCode, assignments.length);

        // Create new assignments with work order-based IDs
        assignments.forEach((assignment, index) => {
          const assignmentId = assignmentIds[index];
          const docRef = db.collection('mes-worker-assignments').doc(assignmentId);
          
          transaction.set(docRef, {
            id: assignmentId,
            planId: id,
            workOrderCode: workOrderCode,
            nodeId: assignment.nodeId || null,
            workerId: assignment.workerId || null,
            stationId: assignment.stationId || null,
            subStationCode: assignment.subStationCode || null,
            start: assignment.start ? new Date(assignment.start) : null,
            end: assignment.end ? new Date(assignment.end) : null,
            status: assignment.status || 'pending',
            createdAt: now,
            updatedAt: now,
            createdBy: updatedByEmail || 'system'
          });
        })

        return { success: true, id, assignmentsCreated: assignments.length };
      });

      return result;
    } else {
      // Normal update without assignments
      await db.collection('mes-production-plans').doc(id).set({
        ...planUpdates,
        updatedAt: now,
        updatedDate: parts.date,
        updatedTime: parts.time,
        ...(updatedByEmail ? { updatedBy: updatedByEmail } : {}),
        ...(updatedByName ? { updatedByName } : {})
      }, { merge: true });
      
      // If status is transitioning to 'released' and orderCode exists, update approved quote
      if (updates.status === 'released' && updates.orderCode) {
        // Async update - don't block response
        updateApprovedQuoteProductionState(
          updates.orderCode, 
          'Üretiliyor',
          updatedByEmail || 'system'
        ).catch(err => {
          console.error('Failed to update approved quote state on plan release:', err);
        });
      }
      
      // ========================================================================
      // AUTOMATIC MATERIAL CONSUMPTION & WIP PRODUCTION ON PLAN RELEASE
      // ========================================================================
      // When a production plan transitions to 'released' status, the system
      // automatically processes material movements based on the materialSummary
      // stored in the plan document.
      //
      // MATERIAL SUMMARY STRUCTURE:
      // - materialSummary.materialInputs: All input materials (raw + derived WIP)
      //   Each item: { materialCode, name, requiredQuantity, unit, isDerived }
      // - materialSummary.wipOutputs: All WIP materials produced by plan nodes
      //   Each item: { code, name, quantity, unit, nodeId, operationId }
      //
      // CONSUMPTION FLOW:
      // 1. Raw Materials: Consumed from stock (negative delta)
      //    - Base raw materials (steel, plastic, etc.)
      //    - Derived WIP materials (semi-finished products from previous operations)
      //    - WIP consumption is tracked in material.consumedBy array
      //
      // 2. WIP Production: Added to stock (positive delta)
      //    - Creates WIP material if doesn't exist
      //    - Sets metadata: type='wip', category='WIP', consumedBy=[]
      //    - Links to source plan/node/operation
      //
      // ERROR HANDLING:
      // - Continues on individual material errors (continueOnError: true)
      // - Insufficient stock errors are logged but don't fail the release
      // - Results stored in plan.stockMovements for audit trail
      // ========================================================================
      
      // If status is transitioning to 'released', process material consumption and WIP production
      if (updates.status === 'released') {
        try {
          // Get the full plan data to access materialSummary
          const planRef = db.collection('mes-production-plans').doc(id);
          const planSnap = await planRef.get();
          const planData = planSnap.exists ? planSnap.data() : null;
          
          if (planData && planData.materialSummary) {
            console.log(`🏭 Processing material movements for plan ${id}...`);
            
            const materialSummary = planData.materialSummary;
            const stockResults = { materialInputs: null, wipOutputs: null };
            
            // 1. Consume material inputs (negative delta)
            // NOTE: This includes both base raw materials and derived WIP materials
            // consumed as inputs. WIP materials will be tracked in their consumedBy array.
            if (Array.isArray(materialSummary.materialInputs) && materialSummary.materialInputs.length > 0) {
              const consumptionList = materialSummary.materialInputs.map(mat => ({
                code: mat.materialCode || mat.code,
                qty: mat.requiredQuantity || mat.qty || 0,
                reason: `production_plan_${id}`,
                nodeId: null // Could be enhanced to track per-node consumption
              }));
              
              stockResults.materialInputs = await consumeMaterials(consumptionList, {
                userId: updatedByEmail || 'system',
                orderId: planData.orderCode || id,
                planId: id, // Pass planId for WIP consumption tracking
                continueOnError: true // Continue even if some materials fail
              });
              
              console.log(
                `✓ Material inputs: ${stockResults.materialInputs.consumed.length} consumed, ` +
                `${stockResults.materialInputs.failed.length} failed`
              );
              
              // Log WIP consumption separately for visibility
              const wipConsumed = stockResults.materialInputs.consumed.filter(m => m.isWIP);
              if (wipConsumed.length > 0) {
                console.log(`  └─ WIP materials consumed: ${wipConsumed.map(w => w.material).join(', ')}`);
              }
            }
            
            // 2. Produce WIP outputs (positive delta)
            if (Array.isArray(materialSummary.wipOutputs) && materialSummary.wipOutputs.length > 0) {
              const wipResults = { produced: [], failed: [] };
              
              for (const wip of materialSummary.wipOutputs) {
                const wipCode = wip.code || wip.id;
                const wipQty = parseFloat(wip.quantity || 0);
                
                if (!wipCode || wipQty <= 0) continue;
                
                try {
                  // Try to produce the WIP material
                  const result = await adjustMaterialStock(wipCode, wipQty, {
                    reason: `wip_production_plan_${id}`,
                    userId: updatedByEmail || 'system',
                    orderId: planData.orderCode || id
                  });
                  
                  wipResults.produced.push({
                    material: result.materialCode,
                    name: result.materialName,
                    qty: wipQty,
                    previousStock: result.previousStock,
                    newStock: result.newStock
                  });
                  
                } catch (error) {
                  // If WIP doesn't exist, create it
                  if (error.message.includes('not found')) {
                    try {
                      console.log(`📦 Creating new semi-finished material: ${wipCode}`);
                      
                      const newWipRef = db.collection('materials').doc(wipCode);
                      await newWipRef.set({
                        code: wipCode,
                        name: wip.name || wipCode,
                        type: 'semi_finished', // Semi-finished product type
                        category: 'SEMI_FINISHED',
                        stock: wipQty,
                        unit: wip.unit || 'pcs',
                        status: 'Aktif',
                        produced: true,
                        createdAt: now,
                        updatedAt: now,
                        createdBy: updatedByEmail || 'system',
                        source: 'production_plan',
                        sourcePlanId: id,
                        sourceNodeId: wip.nodeId || null,
                        sourceOperationId: wip.operationId || null,
                        consumedBy: [], // Initialize empty array for consumption tracking
                        productionHistory: [] // Initialize empty array for production history
                      });
                      
                      wipResults.produced.push({
                        material: wipCode,
                        name: wip.name || wipCode,
                        qty: wipQty,
                        previousStock: 0,
                        newStock: wipQty,
                        created: true
                      });
                      
                    } catch (createError) {
                      console.error(`Failed to create WIP ${wipCode}:`, createError.message);
                      wipResults.failed.push({
                        material: wipCode,
                        qty: wipQty,
                        error: createError.message
                      });
                    }
                  } else {
                    wipResults.failed.push({
                      material: wipCode,
                      qty: wipQty,
                      error: error.message
                    });
                  }
                }
              }
              
              stockResults.wipOutputs = wipResults;
              console.log(
                `✓ WIP outputs: ${wipResults.produced.length} produced, ` +
                `${wipResults.failed.length} failed`
              );
            }
            
            // Log summary
            if (stockResults.materialInputs || stockResults.wipOutputs) {
              console.log(`✅ Material movements completed for plan ${id}`);
              
              // Optionally store the stock movement results in the plan document for audit
              await planRef.update({
                stockMovements: {
                  timestamp: now,
                  materialInputs: stockResults.materialInputs,
                  wipOutputs: stockResults.wipOutputs
                }
              });
            }
          }
        } catch (stockError) {
          // Log error but don't fail the plan release
          console.error(`⚠️ Material movements failed for plan ${id}:`, stockError.message);
          
          // Store the error in the plan document
          await db.collection('mes-production-plans').doc(id).update({
            stockMovementError: {
              timestamp: now,
              error: stockError.message
            }
          });
        }
      }

      return { success: true, id };
    }
  }, res);
});

// DELETE /api/mes/production-plans/:id - Delete production plan
router.delete('/production-plans/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const db = getFirestore();
    const planRef = db.collection('mes-production-plans').doc(id);
    
    // Get plan data before deletion to check orderCode and status
    const planSnap = await planRef.get();
    const planData = planSnap.exists ? planSnap.data() : null;
    
    // Delete the plan
    await planRef.delete();
    
    // Optional: Rollback approved quote state if plan was released
    if (planData && planData.status === 'released' && planData.orderCode) {
      // Async rollback - don't block response
      updateApprovedQuoteProductionState(
        planData.orderCode,
        'Üretim Onayı Bekliyor',
        req.user?.email || 'system'
      ).catch(err => {
        console.error('Failed to rollback approved quote state on plan deletion:', err);
      });
    }
    
    return { success: true, id };
  }, res);
});

// GET /api/mes/production-plans/:id/tasks - Get task execution states with prerequisites
router.get('/production-plans/:id/tasks', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    
    if (!id) {
      const e = new Error('plan_id_required');
      e.status = 400;
      throw e;
    }
    
    const tasks = await getPlanExecutionState(id);
    return { tasks };
  }, res);
});

// ============================================================================
// TEMPLATES ROUTES
// ============================================================================

// GET /api/mes/templates - Get templates from the same collection using status/type flag
router.get('/templates', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    // Prefer status == 'template' when available; otherwise filter client-side
    let templates = [];
    try {
      const snapshot = await db.collection('mes-production-plans')
        .where('status', '==', 'template')
        .orderBy('createdAt', 'desc')
        .get();
      templates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
      // Fallback without where (in case of missing index) and filter in memory
      const snapshot = await db.collection('mes-production-plans').orderBy('createdAt', 'desc').get();
      const all = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      templates = all.filter(t => (t.status || t.type || '').toString().toLowerCase() === 'template');
    }
    return { templates };
  }, res);
});

// POST /api/mes/templates - Create template in mes-production-plans with status = 'template'
router.post('/templates', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const template = req.body;
    if (!template.id) {
      throw new Error('Template ID is required');
    }

    const db = getFirestore();
    const now = new Date()
    const parts = formatDateParts(now)
    const actorEmail = (req.user && req.user.email) || null
    const actorName = (req.user && (req.user.name || req.user.userName)) || null
    // Normalize createdAt to Date
    const createdAtDate = template.createdAt ? new Date(template.createdAt) : now
    const createdParts = formatDateParts(createdAtDate)
    
    // Apply output code suffixes for finished products if nodes exist
    const templateData = { ...template };
    if (templateData.nodes && Array.isArray(templateData.nodes)) {
      templateData.nodes = applyOutputCodeSuffixes(templateData.nodes);
    }
    
    await db.collection('mes-production-plans').doc(template.id).set({
      ...templateData,
      status: (template.status || 'template'),
      createdAt: createdAtDate,
      updatedAt: now,
      createdDate: template.createdDate || createdParts.date,
      createdTime: template.createdTime || createdParts.time,
      updatedDate: parts.date,
      updatedTime: parts.time,
      // Track template edit info
      lastModifiedAt: now,
      lastModifiedDate: parts.date,
      lastModifiedTime: parts.time,
      ...(actorEmail ? { lastModifiedBy: actorEmail, updatedBy: actorEmail } : {}),
      ...(actorName ? { lastModifiedByName: actorName, updatedByName: actorName } : {}),
      // Also keep owner/createdBy for listing
      ...(!template.owner ? (actorEmail ? { owner: actorEmail } : {}) : {}),
      ...(!template.createdBy ? (actorEmail ? { createdBy: actorEmail } : {}) : {}),
      ...(!template.ownerName ? (actorName ? { ownerName: actorName } : {}) : {}),
      ...(!template.createdByName ? (actorName ? { createdByName: actorName } : {}) : {})
    }, { merge: true });

    // Safety: if a legacy collection 'mes-templates' exists and was written by old client, remove duplicate
    try {
      const legacyRef = db.collection('mes-templates').doc(template.id)
      const legacySnap = await legacyRef.get()
      if (legacySnap.exists) {
        await legacyRef.delete()
        console.log(`[MES] Removed legacy duplicate from mes-templates: ${template.id}`)
      }
    } catch (e) {
      // best-effort cleanup, ignore
    }

    return { success: true, id: template.id };
  }, res);
});

// DELETE /api/mes/templates/:id - Delete template from mes-production-plans
router.delete('/templates/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const db = getFirestore();
    await db.collection('mes-production-plans').doc(id).delete();
    // Best-effort cleanup in legacy collection too
    try { await db.collection('mes-templates').doc(id).delete() } catch {}
    return { success: true, id };
  }, res);
});

// One-time migration endpoint: move any legacy 'mes-templates' docs into 'mes-production-plans'
router.post('/templates/migrate-from-legacy', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore()
    const legacyCol = db.collection('mes-templates')
    let migrated = 0
    let removed = 0
    try {
      const snap = await legacyCol.get()
      for (const doc of snap.docs) {
        const data = doc.data() || {}
        const id = doc.id
        await db.collection('mes-production-plans').doc(id).set({
          ...data,
          status: (data.status || 'template'),
          migratedAt: new Date()
        }, { merge: true })
        migrated++
        await legacyCol.doc(id).delete()
        removed++
      }
    } catch (e) {
      console.warn('[MES] Legacy templates migration issue:', e?.message)
    }
    return { success: true, migrated, removed }
  }, res)
})

// ============================================================================
// MATERIALS ROUTES
// ============================================================================
// NOTE: The 'mes-materials' collection has been removed from the codebase.
// All materials are now stored in the unified 'materials' collection.
// If you have legacy data in 'mes-materials', it should be migrated to 'materials'
// before running this code.

// GET /api/mes/materials - Get all materials from unified materials collection
router.get('/materials', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const snapshot = await db.collection('materials')
      .orderBy('name')
      .get();
    const materials = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    return { materials };
  }, res);
});

// POST /api/mes/materials - Create/Update multiple materials (batch)
router.post('/materials', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { materials } = req.body;
    if (!Array.isArray(materials)) {
      throw new Error('Materials must be an array');
    }

    const db = getFirestore();
    const batch = db.batch();

    // Get existing materials to find deletions
    const existingSnapshot = await db.collection('materials').get();
    const existingIds = new Set(existingSnapshot.docs.map(doc => doc.id));
    const newIds = new Set(materials.map(m => m.id));

    // Add/Update materials
    materials.forEach(material => {
      const docRef = db.collection('materials').doc(material.id);
      batch.set(docRef, {
        ...material,
        updatedAt: new Date()
      }, { merge: true });
    });

    // Delete removed materials
    existingIds.forEach(id => {
      if (!newIds.has(id)) {
        const docRef = db.collection('materials').doc(id);
        batch.delete(docRef);
      }
    });

    await batch.commit();
    return { success: true, updated: materials.length };
  }, res);
});

// POST /api/mes/materials/check-availability - Check material availability for production plan
router.post('/materials/check-availability', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { materials: requiredMaterials } = req.body;
    
    if (!Array.isArray(requiredMaterials)) {
      throw new Error('Required materials must be an array');
    }

    const db = getFirestore();
    
    // Fetch materials from the unified materials collection only
    // NOTE: 'mes-materials' collection has been removed - all data is in 'materials'
    const snapshot = await db.collection('materials').get();
    
    // Build lookup maps by code, id, and name
    const materialStockMap = new Map();
    
    // Process materials
    snapshot.docs.forEach(doc => {
      const mat = { id: doc.id, ...doc.data() };
      const stock = parseFloat(mat.stock || mat.available) || 0;
      const code = mat.code || mat.id;
      
      // Add to map with multiple keys for flexible lookup
      if (code) materialStockMap.set(code.toLowerCase(), { ...mat, code, stock });
      if (mat.id) materialStockMap.set(mat.id.toLowerCase(), { ...mat, code, stock });
      if (mat.name) materialStockMap.set(mat.name.toLowerCase(), { ...mat, code, stock });
    });

    // Check each required material
    const materialChecks = requiredMaterials.map(required => {
      const requiredQty = parseFloat(required.required) || 0;
      
      // Try to find material by code, then id, then name
      let material = null;
      const searchKeys = [
        required.code?.toLowerCase(),
        required.id?.toLowerCase(),
        required.name?.toLowerCase()
      ].filter(Boolean);
      
      for (const key of searchKeys) {
        if (materialStockMap.has(key)) {
          material = materialStockMap.get(key);
          break;
        }
      }
      
      const availableQty = material ? material.stock : 0;
      const shortage = Math.max(0, requiredQty - availableQty);
      const isAvailable = shortage === 0;
      
      // Placeholder for future reservation system
      // Currently always true if material exists and is available
      const canReserve = material && isAvailable;
      
      return {
        code: required.code || material?.code || required.id || '',
        name: required.name || material?.name || '',
        id: required.id || material?.id || '',
        required: requiredQty,
        available: availableQty,
        unit: required.unit || material?.unit || 'pcs',
        isAvailable,
        shortage,
        status: isAvailable ? 'ok' : 'shortage',
        canReserve // Placeholder for future reservation feature
      };
    });

    const allAvailable = materialChecks.every(check => check.isAvailable);
    const shortages = materialChecks.filter(check => !check.isAvailable);
    const canReserveAll = materialChecks.every(check => check.canReserve);

    return {
      allAvailable,
      canReserveAll, // Placeholder: true if all materials can be reserved
      materials: materialChecks,
      shortages,
      totalShortageItems: shortages.length,
      checkedAt: new Date().toISOString()
    };
  }, res);
});

// ============================================================================
// ORDERS ROUTES
// ============================================================================

// GET /api/mes/orders - Get all MES orders from Firestore (no mock)
router.get('/orders', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    // Read from 'mes-orders' collection if present; otherwise return empty list
    const snapshot = await db.collection('mes-orders').get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return { orders };
  }, res);
});

// ============================================================================
// HELPER: Update approved quote production state (internal use)
// ============================================================================
async function updateApprovedQuoteProductionState(orderCode, productionState, updatedBy = 'system') {
  if (!orderCode || !productionState) {
    console.warn('updateApprovedQuoteProductionState: orderCode or productionState missing');
    return { success: false, reason: 'missing_parameters' };
  }
  
  // Validate production state
  const validStates = [
    'Üretim Onayı Bekliyor',
    'Üretiliyor',
    'Üretim Durduruldu', 
    'Üretim Tamamlandı',
    'İptal Edildi'
  ];
  
  if (!validStates.includes(productionState)) {
    console.warn(`updateApprovedQuoteProductionState: invalid state '${productionState}'`);
    return { success: false, reason: 'invalid_state' };
  }
  
  try {
    const db = getFirestore();
    const col = db.collection('mes-approved-quotes');
    
    // Find document by orderCode (workOrderCode field)
    const snapshot = await col.where('workOrderCode', '==', orderCode).limit(1).get();
    
    if (snapshot.empty) {
      console.log(`updateApprovedQuoteProductionState: order '${orderCode}' not found in approved quotes`);
      return { success: false, reason: 'not_found' };
    }
    
    const doc = snapshot.docs[0];
    const now = new Date().toISOString();
    
    // Update production state with history
    await doc.ref.update({
      productionState,
      updatedAt: now,
      productionStateHistory: admin.firestore.FieldValue.arrayUnion({
        state: productionState,
        timestamp: now,
        updatedBy
      })
    });
    
    console.log(`✓ Updated approved quote '${orderCode}' to state '${productionState}'`);
    return { success: true, orderCode, productionState };
  } catch (error) {
    console.error(`updateApprovedQuoteProductionState error for '${orderCode}':`, error);
    return { success: false, reason: 'firestore_error', error: error.message };
  }
}

// PATCH /api/mes/approved-quotes/:workOrderCode/production-state - Update production state
router.patch('/approved-quotes/:workOrderCode/production-state', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { workOrderCode } = req.params;
    const { productionState } = req.body || {};
    
    if (!workOrderCode) {
      const e = new Error('workOrderCode_required'); e.status = 400; throw e;
    }
    
    if (!productionState) {
      const e = new Error('productionState_required'); e.status = 400; throw e;
    }
    
    // Validate production state
    const validStates = [
      'Üretim Onayı Bekliyor',
      'Üretiliyor',
      'Üretim Durduruldu', 
      'Üretim Tamamlandı',
      'İptal Edildi'
    ];
    
    if (!validStates.includes(productionState)) {
      const e = new Error('invalid_production_state'); e.status = 400; throw e;
    }
    
    const db = getFirestore();
    const col = db.collection('mes-approved-quotes');
    
    // Find document by workOrderCode
    const snapshot = await col.where('workOrderCode', '==', workOrderCode).limit(1).get();
    
    if (snapshot.empty) {
      const e = new Error(`${workOrderCode} için onaylı teklif bulunamadı. Quotes ekranından bu work order'ı oluşturup tekrar deneyin.`);
      e.status = 404;
      e.code = 'approved_quote_not_found';
      throw e;
    }
    
    const doc = snapshot.docs[0];
    
    // Update production state
    await doc.ref.update({
      productionState,
      updatedAt: new Date().toISOString(),
      productionStateHistory: admin.firestore.FieldValue.arrayUnion({
        state: productionState,
        timestamp: new Date().toISOString(),
        updatedBy: req.user?.email || 'system'
      })
    });
    
    return { 
      success: true, 
      workOrderCode,
      productionState,
      updatedAt: new Date().toISOString()
    };
  }, res);
});

// ============================================================================
// WORKER ASSIGNMENTS ROUTES
// ============================================================================

// POST /api/mes/worker-assignments/batch - Replace all assignments for a plan
router.post('/worker-assignments/batch', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { planId, assignments } = req.body;
    
    if (!planId) {
      throw new Error('planId is required');
    }
    
    if (!Array.isArray(assignments)) {
      throw new Error('assignments must be an array');
    }

    const db = getFirestore();
    
    // Validate worker and station IDs exist
    const workerIds = [...new Set(assignments.map(a => a.workerId).filter(Boolean))];
    const stationIds = [...new Set(assignments.map(a => a.stationId).filter(Boolean))];
    
    if (workerIds.length > 0) {
      const workersSnapshot = await db.collection('mes-workers').where('__name__', 'in', workerIds).get();
      const existingWorkerIds = new Set(workersSnapshot.docs.map(doc => doc.id));
      const invalidWorkerIds = workerIds.filter(id => !existingWorkerIds.has(id));
      if (invalidWorkerIds.length > 0) {
        throw new Error(`Invalid worker IDs: ${invalidWorkerIds.join(', ')}`);
      }
    }
    
    if (stationIds.length > 0) {
      const stationsSnapshot = await db.collection('mes-stations').where('__name__', 'in', stationIds).get();
      const existingStationIds = new Set(stationsSnapshot.docs.map(doc => doc.id));
      const invalidStationIds = stationIds.filter(id => !existingStationIds.has(id));
      if (invalidStationIds.length > 0) {
        throw new Error(`Invalid station IDs: ${invalidStationIds.join(', ')}`);
      }
    }

    // Use transaction to ensure consistency
    const result = await db.runTransaction(async (transaction) => {
      // Delete existing assignments for this plan
      const existingQuery = db.collection('mes-worker-assignments').where('planId', '==', planId);
      const existingSnapshot = await transaction.get(existingQuery);
      
      existingSnapshot.docs.forEach(doc => {
        transaction.delete(doc.ref);
      });

      // Fetch plan to get nodes and operation details
      const planRef = db.collection('mes-production-plans').doc(planId);
      const planDoc = await transaction.get(planRef);
      
      let planData = null;
      let nodes = [];
      let planQuantity = 1;
      let operationsMap = new Map();
      
      if (planDoc.exists) {
        planData = planDoc.data();
        nodes = planData.nodes || [];
        planQuantity = planData.quantity || 1;
        
        // Fetch operations to get expectedDefectRate
        const operationsSnapshot = await db.collection('mes-operations').get();
        operationsSnapshot.docs.forEach(doc => {
          const opData = doc.data();
          operationsMap.set(doc.id, opData);
        });
      }

      // Generate assignment IDs (simple sequential numbering within plan)
      const workOrderCode = planData?.orderCode || planId;
      const assignmentIds = generateWorkPackageIds(workOrderCode, assignments.length);

      // Create new assignments with material reservation calculations
      const now = new Date();
      const createdBy = req.user?.email || 'system';
      
      assignments.forEach((assignment, index) => {
        const assignmentId = assignmentIds[index];
        const docRef = db.collection('mes-worker-assignments').doc(assignmentId);
        
        // Find the node in nodes array
        const node = nodes.find(n => n.nodeId === assignment.nodeId);
        
        // Get operation data for defect rate
        const operation = node && node.operationId ? operationsMap.get(node.operationId) : null;
        const expectedDefectRate = operation?.expectedDefectRate || 0;
        
        // Calculate material reservations
        const preProductionReservedAmount = node 
          ? calculatePreProductionReservedAmount(node, expectedDefectRate, planQuantity)
          : {};
        
        const plannedOutput = node 
          ? calculatePlannedOutput(node, planQuantity)
          : {};
        
        transaction.set(docRef, {
          id: assignmentId,
          planId,
          workOrderCode: workOrderCode,
          nodeId: assignment.nodeId || null,
          workerId: assignment.workerId || null,
          stationId: assignment.stationId || null,
          subStationCode: assignment.subStationCode || null,
          start: assignment.start ? new Date(assignment.start) : null,
          end: assignment.end ? new Date(assignment.end) : null,
          status: assignment.status || 'pending',
          // Material reservation fields
          preProductionReservedAmount: Object.keys(preProductionReservedAmount).length > 0 
            ? preProductionReservedAmount 
            : null,
          plannedOutput: Object.keys(plannedOutput).length > 0 
            ? plannedOutput 
            : null,
          materialReservationStatus: 'pending', // pending, reserved, consumed
          createdAt: now,
          updatedAt: now,
          createdBy
        });
      });

      return { success: true, planId, assignmentCount: assignments.length };
    });

    return result;
  }, res);
});

// POST /api/mes/worker-assignments/activate - Activate assignments for a released plan
router.post('/worker-assignments/activate', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { planId, status } = req.body;
    
    if (!planId) {
      throw new Error('planId is required');
    }
    
    const assignmentStatus = status || 'active'; // Default to 'active' if not provided
    
    const db = getFirestore();
    
    // Fetch all assignments for this plan
    const assignmentsSnapshot = await db.collection('mes-worker-assignments')
      .where('planId', '==', planId)
      .get();
    
    if (assignmentsSnapshot.empty) {
      console.log(`No assignments found for plan ${planId}`);
      return { success: true, planId, activatedCount: 0, message: 'No assignments to activate' };
    }
    
    const assignments = assignmentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log(`Activating ${assignments.length} assignments for plan ${planId}`);
    
    // Use transaction to ensure consistency across workers and stations
    const result = await db.runTransaction(async (transaction) => {
      const updates = {
        workersUpdated: 0,
        stationsUpdated: 0,
        workersMissing: [],
        stationsMissing: []
      };
      
      // Process each assignment
      for (const assignment of assignments) {
        const { workerId, stationId, nodeId, start } = assignment;
        
        // Update worker's currentTask
        if (workerId) {
          const workerRef = db.collection('mes-workers').doc(workerId);
          const workerDoc = await transaction.get(workerRef);
          
          if (workerDoc.exists) {
            transaction.update(workerRef, {
              currentTask: {
                planId,
                nodeId: nodeId || null,
                stationId: stationId || null,
                start: start || null,
                status: assignmentStatus
              },
              updatedAt: new Date()
            });
            updates.workersUpdated++;
          } else {
            console.warn(`Worker ${workerId} not found for assignment ${assignment.id}`);
            updates.workersMissing.push(workerId);
          }
        }
        
        // Update station's currentOperation and currentWorker
        if (stationId) {
          const stationRef = db.collection('mes-stations').doc(stationId);
          const stationDoc = await transaction.get(stationRef);
          
          if (stationDoc.exists) {
            transaction.update(stationRef, {
              currentOperation: nodeId || null,
              currentWorker: workerId || null,
              updatedAt: new Date()
            });
            updates.stationsUpdated++;
          } else {
            console.warn(`Station ${stationId} not found for assignment ${assignment.id}`);
            updates.stationsMissing.push(stationId);
          }
        }
      }
      
      return {
        success: true,
        planId,
        activatedCount: assignments.length,
        workersUpdated: updates.workersUpdated,
        stationsUpdated: updates.stationsUpdated,
        ...(updates.workersMissing.length > 0 && { workersMissing: updates.workersMissing }),
        ...(updates.stationsMissing.length > 0 && { stationsMissing: updates.stationsMissing })
      };
    });
    
    console.log(`✓ Activated assignments for plan ${planId}:`, result);
    return result;
  }, res);
});

// GET /api/mes/workers/:id/assignments - Get worker assignments
router.get('/workers/:id/assignments', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const { status } = req.query;
    
    const db = getFirestore();
    
    // Verify worker exists
    const workerDoc = await db.collection('mes-workers').doc(id).get();
    if (!workerDoc.exists) {
      throw new Error('Worker not found');
    }

    // Build query with equality filters only
    let query = db.collection('mes-worker-assignments').where('workerId', '==', id);
    
    if (status) {
      query = query.where('status', '==', status);
    }
    
    const snapshot = await query.get();
    const assignments = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Convert Firestore timestamps to ISO strings
      start: doc.data().start?.toDate?.()?.toISOString() || doc.data().start,
      end: doc.data().end?.toDate?.()?.toISOString() || doc.data().end,
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || doc.data().updatedAt
    }));

    // Sort by start time in JavaScript (nulls last)
    assignments.sort((a, b) => {
      if (!a.start && !b.start) return 0;
      if (!a.start) return 1;
      if (!b.start) return -1;
      return new Date(a.start).getTime() - new Date(b.start).getTime();
    });

    return { assignments };
  }, res);
});

// ============================================================================
// WORKER PORTAL ROUTES
// ============================================================================

// GET /api/mes/worker-portal/tasks - Get active tasks for worker
router.get('/worker-portal/tasks', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    
    // Get workerId from query param (required)
    const workerId = req.query.workerId;
    
    if (!workerId) {
      const e = new Error('Worker ID is required. Please provide ?workerId=<id> parameter');
      e.status = 400;
      e.code = 'worker_id_required';
      throw e;
    }
    
    // Verify worker exists
    const workerDoc = await db.collection('mes-workers').doc(workerId).get();
    if (!workerDoc.exists) {
      const e = new Error('worker_not_found');
      e.status = 404;
      e.code = 'worker_not_found';
      throw e;
    }
    
    const workerData = workerDoc.data();
    
    // Get all assignments for this worker with active statuses
    const assignmentsSnapshot = await db.collection('mes-worker-assignments')
      .where('workerId', '==', workerId)
      .get();
    
    if (assignmentsSnapshot.empty) {
      return { tasks: [], nextTaskId: null };
    }
    
    // Get unique plan IDs and station IDs to fetch additional data
    const planIds = [...new Set(assignmentsSnapshot.docs.map(doc => doc.data().planId))];
    const stationIds = [...new Set(assignmentsSnapshot.docs.map(doc => doc.data().stationId).filter(Boolean))];
    
    // Fetch execution states for all plans (to get accurate prerequisites)
    const planStatesMap = new Map();
    for (const planId of planIds) {
      try {
        const planState = await getPlanExecutionState(planId);
        planStatesMap.set(planId, planState);
      } catch (err) {
        console.error(`Failed to fetch plan state ${planId}:`, err);
      }
    }
    
    // Fetch plans
    const plansMap = new Map();
    for (const planId of planIds) {
      try {
        const planDoc = await db.collection('mes-production-plans').doc(planId).get();
        if (planDoc.exists) {
          plansMap.set(planId, planDoc.data());
        }
      } catch (err) {
        console.error(`Failed to fetch plan ${planId}:`, err);
      }
    }
    
    // Fetch stations
    const stationsMap = new Map();
    if (stationIds.length > 0) {
      const stationsSnapshot = await db.collection('mes-stations').where('__name__', 'in', stationIds).get();
      stationsSnapshot.docs.forEach(doc => {
        stationsMap.set(doc.id, doc.data());
      });
    }
    
    // Build tasks from assignments
    const allTasks = [];
    
    for (const doc of assignmentsSnapshot.docs) {
      const assignment = { id: doc.id, ...doc.data() };
      
      // Skip only completed tasks; keep cancelled_pending_report for scrap reporting
      if (assignment.status === 'completed' || assignment.status === 'cancelled') {
        continue;
      }
      
      const plan = plansMap.get(assignment.planId);
      const station = assignment.stationId ? stationsMap.get(assignment.stationId) : null;
      
      // Get execution state for this plan
      const planState = planStatesMap.get(assignment.planId);
      
      // Find node state from plan execution state
      let nodeState = null;
      if (planState && planState.taskStates) {
        nodeState = planState.taskStates.find(ts => ts.nodeId === assignment.nodeId);
      }
      
      // Find node info from plan's nodes array
      let nodeInfo = null;
      if (plan && plan.nodes && assignment.nodeId) {
        nodeInfo = plan.nodes.find(node => node.nodeId === assignment.nodeId);
      }
      
      // Build task object
      const task = {
        // Assignment info
        assignmentId: assignment.id,
        planId: assignment.planId,
        workOrderCode: assignment.workOrderCode || plan?.workOrderCode || 'Unknown',
        nodeId: assignment.nodeId,
        status: assignment.status || 'pending',
        
        // Priority system (PROMPT 11: priority + expectedStart for FIFO)
        priority: assignment.priority || 2, // 1=Low, 2=Normal, 3=High
        expectedStart: assignment.expectedStart || assignment.plannedStart || null,
        isUrgent: assignment.isUrgent || false,
        
        // Worker info
        workerId: assignment.workerId,
        workerName: workerData.name,
        
        // Station info
        stationId: assignment.stationId,
        stationName: station?.name || 'Belirsiz',
        substationId: nodeState?.substationId || assignment.substationId || null,
        substationCode: nodeState?.substationCode || assignment.substationCode || null,
        
        // Substation workload info (for busy status display)
        substationCurrentOperation: nodeState?.substationCurrentOperation || null,
        substationCurrentWorkPackageId: nodeState?.substationCurrentWorkPackageId || null,
        substationCurrentExpectedEnd: nodeState?.substationCurrentExpectedEnd || null,
        
        // Task details from node
        name: nodeInfo?.name || 'İsimsiz Görev',
        operationId: nodeInfo?.operationId,
        operationName: nodeInfo?.operationName,
        estimatedNominalTime: nodeInfo?.estimatedNominalTime || 0,
        estimatedEffectiveTime: nodeInfo?.estimatedEffectiveTime || 0,
        
        // Timing
        assignedAt: assignment.createdAt,
        actualStart: assignment.actualStart?.toDate ? assignment.actualStart.toDate().toISOString() : assignment.actualStart || null,
        actualEnd: assignment.actualEnd?.toDate ? assignment.actualEnd.toDate().toISOString() : assignment.actualEnd || null,
        plannedStart: nodeState?.plannedStart || assignment.plannedStart || null,
        plannedEnd: nodeState?.plannedEnd || assignment.plannedEnd || null,
        
        // Pause metadata (to differentiate plan pause vs worker pause)
        pauseContext: assignment.pauseContext || null,
        pauseReason: assignment.pauseReason || null,
        pausedBy: assignment.pausedBy || null,
        pausedByName: assignment.pausedByName || null,
        pausedAt: assignment.pausedAt || null,
        
        // Prerequisites from execution state (accurate real-time check)
        prerequisites: nodeState?.prerequisites || {
          predecessorsDone: true,
          workerAvailable: true,
          substationAvailable: true,
          stationAvailable: true,
          materialsReady: !plan?.materialSummary?.hasShortages
        },
        
        // Predecessor info for UI
        predecessors: nodeInfo?.predecessors || [],
        
        // Material info (for fire counter system)
        preProductionReservedAmount: assignment.preProductionReservedAmount || {},
        materialInputs: nodeInfo?.materialInputs || assignment.materialInputs || {},
        
        // Material output info
        hasOutputs: nodeInfo?.hasOutputs || false,
        outputCode: nodeInfo?.outputCode,
        outputQty: nodeInfo?.outputQty,
        plannedOutput: assignment.plannedOutput || {}
      };
      
      allTasks.push(task);
    }
    
    // Sort by expectedStart (FIFO scheduling)
    allTasks.sort((a, b) => {
      const aTime = a.expectedStart ? new Date(a.expectedStart).getTime() : 0;
      const bTime = b.expectedStart ? new Date(b.expectedStart).getTime() : 0;
      return aTime - bTime;
    });
    
    // Find next task (first pending or ready task)
    const nextTask = allTasks.find(t => t.status === 'pending' || t.status === 'ready');
    const nextTaskId = nextTask?.assignmentId || null;
    
    return { tasks: allTasks, nextTaskId };
  }, res);
});

// ============================================================================
// MIGRATION ENDPOINT FOR ASSIGNMENT IDS
// ============================================================================
// POST /api/mes/migrate-assignment-ids - Migrate existing assignment IDs to work order format
router.post('/migrate-assignment-ids', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { dryRun = true } = req.body;
    const userEmail = req.user?.email || 'system';
    
    console.log(`🚀 Starting assignment ID migration (${dryRun ? 'DRY RUN' : 'LIVE'})`);
    
    const db = getFirestore();
    
    // Fetch all assignments
    const assignmentsSnapshot = await db.collection('mes-worker-assignments').get();
    const assignments = assignmentsSnapshot.docs.map(doc => ({
      id: doc.id,
      ref: doc.ref,
      ...doc.data()
    }));
    
    console.log(`Found ${assignments.length} assignments to process`);
    
    if (assignments.length === 0) {
      return { success: true, message: 'No assignments found', migrations: [] };
    }
    
    // Get unique plan IDs to fetch plan data
    const planIds = [...new Set(assignments.map(a => a.planId).filter(Boolean))];
    
    // Fetch plan data to get work order codes
    const plansMap = new Map();
    for (const planId of planIds) {
      try {
        const planDoc = await db.collection('mes-production-plans').doc(planId).get();
        if (planDoc.exists) {
          const planData = planDoc.data();
          plansMap.set(planId, planData);
        }
      } catch (error) {
        console.warn(`Failed to fetch plan ${planId}:`, error.message);
      }
    }
    
    // Group assignments by work order code and prepare migrations
    const assignmentGroups = new Map();
    const counters = new Map();
    const migrations = [];
    
    for (const assignment of assignments) {
      const plan = plansMap.get(assignment.planId);
      const workOrderCode = plan?.orderCode || assignment.workOrderCode || assignment.planId || 'UNKNOWN';
      
      if (!assignmentGroups.has(workOrderCode)) {
        assignmentGroups.set(workOrderCode, []);
      }
      assignmentGroups.get(workOrderCode).push(assignment);
    }
    
    // Generate new IDs for each work order group
    for (const [workOrderCode, workOrderAssignments] of assignmentGroups) {
      for (const assignment of workOrderAssignments) {
        const oldId = assignment.id;
        
        // Skip if already in new format
        if (oldId.startsWith(workOrderCode + '-') && /\d{2}$/.test(oldId)) {
          continue;
        }
        
        // Generate new ID
        const counterKey = `workpackage-${workOrderCode}`;
        let counter = counters.get(counterKey) || 0;
        counter++;
        counters.set(counterKey, counter);
        
        const newId = `${workOrderCode}-${String(counter).padStart(2, '0')}`;
        
        migrations.push({
          oldId,
          newId,
          workOrderCode,
          assignment
        });
      }
    }
    
    console.log(`Migration plan: ${migrations.length} assignments to migrate`);
    
    if (dryRun) {
      return {
        success: true,
        dryRun: true,
        totalAssignments: assignments.length,
        migrationsNeeded: migrations.length,
        workOrdersAffected: assignmentGroups.size,
        migrations: migrations.map(m => ({ oldId: m.oldId, newId: m.newId, workOrderCode: m.workOrderCode }))
      };
    }
    
    // Execute migrations in batches
    const BATCH_SIZE = 450;
    let processedCount = 0;
    
    for (let i = 0; i < migrations.length; i += BATCH_SIZE) {
      const batch = migrations.slice(i, i + BATCH_SIZE);
      const firestoreBatch = db.batch();
      
      for (const migration of batch) {
        const { oldId, newId, assignment } = migration;
        
        // Create new document
        const newRef = db.collection('mes-worker-assignments').doc(newId);
        const newData = { ...assignment };
        newData.id = newId;
        delete newData.ref;
        firestoreBatch.set(newRef, newData);
        
        // Delete old document
        firestoreBatch.delete(assignment.ref);
      }
      
      await firestoreBatch.commit();
      processedCount += batch.length;
      console.log(`Migrated batch: ${processedCount}/${migrations.length}`);
    }
    
    // Update counters
    const counterBatch = db.batch();
    for (const [counterKey, count] of counters) {
      const counterRef = db.collection('mes-counters').doc(counterKey);
      counterBatch.set(counterRef, { 
        next: count + 1, 
        updatedAt: new Date(),
        migratedAt: new Date(),
        migratedBy: userEmail
      }, { merge: true });
    }
    await counterBatch.commit();
    
    console.log(`✅ Migration completed: ${processedCount} assignments migrated`);
    
    return {
      success: true,
      dryRun: false,
      totalAssignments: assignments.length,
      migrated: processedCount,
      workOrdersAffected: assignmentGroups.size,
      countersUpdated: counters.size,
      migratedBy: userEmail,
      migratedAt: new Date().toISOString()
    };
  }, res);
});

// ============================================================================
// WORK PACKAGE (ASSIGNMENT) UPDATE ENDPOINT
// ============================================================================
// PATCH /api/mes/work-packages/:id - Update work package with actions
// This is the unified endpoint for all task state changes: start, pause, station_error, complete
// Replaces the old /worker-portal/tasks endpoint for consistency
router.patch('/work-packages/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id: assignmentId } = req.params;
    const { action, scrapQty, stationNote, actualOutputQuantity, defectQuantity, scrapCounters } = req.body;
    
    // DEBUG: Log incoming request
    console.log(`🔍 DEBUG - PATCH /work-packages/${assignmentId}`);
    console.log(`   Action: ${action}`);
    console.log(`   Body:`, { action, scrapQty, stationNote, actualOutputQuantity, defectQuantity, scrapCounters });
    
    if (!assignmentId) {
      const e = new Error('work_package_id_required');
      e.status = 400;
      throw e;
    }
    
    if (!action) {
      const e = new Error('action_required');
      e.status = 400;
      throw e;
    }
    
    const validActions = ['start', 'pause', 'station_error', 'complete'];
    if (!validActions.includes(action)) {
      const e = new Error('invalid_action');
      e.status = 400;
      throw e;
    }
    
    const db = getFirestore();
    const now = new Date();
    const actorEmail = req.user?.email || 'system';
    const actorName = req.user?.name || req.user?.userName || null;
    
    // Get assignment (work package)
    const assignmentDoc = await db.collection('mes-worker-assignments').doc(assignmentId).get();
    if (!assignmentDoc.exists) {
      const e = new Error('work_package_not_found');
      e.status = 404;
      throw e;
    }
    
  const assignment = assignmentDoc.data();
  const { planId, nodeId, workerId, stationId } = assignment;
  // Ensure we have the workOrderCode from the assignment for post-transaction checks
  let workOrderCode = assignment.workOrderCode || assignment.workOrder || null;
    
    // Execute action in atomic transaction
    const result = await db.runTransaction(async (transaction) => {
      const assignmentRef = db.collection('mes-worker-assignments').doc(assignmentId);
      const workerRef = workerId ? db.collection('mes-workers').doc(workerId) : null;
      let stationRef = stationId ? db.collection('mes-stations').doc(stationId) : null; // Changed to let for reassignment
      
      let updateData = { updatedAt: now };
      let workerUpdate = null;
      let stationUpdate = null;
      let alertCreated = false;
      let scrapAdjustment = null;
      let materialReservationResult = null;
      let counterResetFields = {}; // Declare here for use after switch
      
      switch (action) {
        case 'start':
          // PRECONDITION CHECK: Verify task is ready to start
          // Get fresh execution state to validate prerequisites
          try {
            const tasks = await getPlanExecutionState(planId);
            const currentTask = tasks.find(t => t.assignmentId === assignmentId);
            
            if (!currentTask) {
              const e = new Error('Task not found in execution graph');
              e.status = 404;
              throw e;
            }
            
            // DEBUG: Log task status and prerequisites
            console.log(`🔍 DEBUG START - Task ${assignmentId}:`);
            console.log(`   Status: ${currentTask.status}`);
            console.log(`   Prerequisites:`, currentTask.prerequisites);
            console.log(`   Node ID: ${currentTask.nodeId}`);
            console.log(`   Predecessors:`, currentTask.predecessors);
            
            // Check if task status is ready, pending, or paused (but only if not plan-paused)
            if (currentTask.status === 'paused' && currentTask.pauseContext === 'plan') {
              const e = new Error('Task cannot be started: paused by admin');
              e.status = 400;
              e.code = 'precondition_failed';
              throw e;
            }
            
            if (currentTask.status !== 'ready' && currentTask.status !== 'pending' && currentTask.status !== 'paused') {
              console.error(`❌ Task ${assignmentId} has invalid status for starting: ${currentTask.status}`);
              const e = new Error(`Task cannot be started: current status is ${currentTask.status}`);
              e.status = 400;
              e.code = 'precondition_failed';
              throw e;
            }
            
            // Check prerequisites
            const prereqs = currentTask.prerequisites || {};
            const failedPrereqs = [];
            
            if (!prereqs.predecessorsDone) failedPrereqs.push('Önceki görevler tamamlanmadı');
            if (!prereqs.workerAvailable) failedPrereqs.push('İşçi meşgul');
            if (!prereqs.substationAvailable) failedPrereqs.push('Alt istasyon meşgul'); // Changed from stationAvailable
            if (!prereqs.materialsReady) failedPrereqs.push('Malzeme eksik');
            
            if (failedPrereqs.length > 0) {
              const e = new Error(`Preconditions not met: ${failedPrereqs.join(', ')}`);
              e.status = 400;
              e.code = 'precondition_failed';
              e.details = failedPrereqs;
              throw e;
            }
            
            // RE-VALIDATE MATERIAL AVAILABILITY
            // Fetch the plan to check materials haven't been depleted since launch
            const planDoc = await db.collection('mes-production-plans').doc(planId).get();
            if (planDoc.exists) {
              const planData = planDoc.data();
              const planQuantity = planData.quantity || 1;
              const materialValidation = await validateMaterialAvailability(
                planData,
                planQuantity,
                db
              );
              
              if (!materialValidation.allAvailable) {
                const e = new Error('Malzemeler tükendi, görev başlatılamıyor');
                e.status = 409;
                e.code = 'material_shortage';
                e.shortages = materialValidation.shortages;
                e.details = materialValidation.details;
                throw e;
              }
            }
          } catch (err) {
            // If it's a precondition error or material shortage, re-throw
            if (err.code === 'precondition_failed' || err.code === 'material_shortage') {
              throw err;
            }
            // Otherwise, log warning but allow start (backward compatibility)
            console.warn('Precondition check failed, but allowing start:', err.message);
          }
          
          // ========================================================================
          // MATERIAL RESERVATION: Deduct from stock and add to wipReserved
          // ========================================================================
          // When a worker starts a task, materials are physically moved from 
          // warehouse stock to the production floor (WIP area).
          // This is an atomic operation that:
          // 1. Deducts from material.stock (physical inventory)
          // 2. Adds to material.wipReserved (in-production inventory)
          // ========================================================================
          
          // DEBUG: Log assignment details
          console.log(`🔍 DEBUG - Assignment ${assignmentId}:`);
          console.log(`   materialReservationStatus: ${assignment.materialReservationStatus}`);
          console.log(`   preProductionReservedAmount:`, assignment.preProductionReservedAmount);
          console.log(`   Has preProductionReservedAmount: ${!!assignment.preProductionReservedAmount}`);
          console.log(`   Keys count: ${assignment.preProductionReservedAmount ? Object.keys(assignment.preProductionReservedAmount).length : 0}`);
          
          // Only process if this assignment hasn't already reserved materials
          if (assignment.materialReservationStatus !== 'reserved' && 
              assignment.preProductionReservedAmount && 
              Object.keys(assignment.preProductionReservedAmount).length > 0) {
            
            const reservationResults = [];
            const reservationErrors = [];
            
            console.log(`🔄 Starting material reservation for work package ${assignmentId}`);
            
            // ========================================================================
            // PHASE 1: PRE-FETCH ALL MATERIALS (Firestore transaction requirement)
            // ========================================================================
            console.log(`📖 PHASE 1: Pre-fetching all materials before writes...`);
            
            const materialDocs = new Map();
            for (const [materialCode, reservedQty] of Object.entries(assignment.preProductionReservedAmount)) {
              const materialRef = db.collection('materials').doc(materialCode);
              const materialDoc = await transaction.get(materialRef);
              materialDocs.set(materialCode, { ref: materialRef, doc: materialDoc, reservedQty });
            }
            
            console.log(`✅ READ PHASE COMPLETE: ${materialDocs.size} materials pre-fetched`);
            
            // ========================================================================
            // PHASE 2: PROCESS ALL MATERIALS (using pre-fetched data)
            // ========================================================================
            console.log(`✍️ PHASE 2: Processing material reservations...`);
            
            // Process each material using pre-fetched data
            for (const [materialCode, data] of materialDocs) {
              const { ref: materialRef, doc: materialDoc, reservedQty } = data;
              
              try {
                
                if (!materialDoc.exists) {
                  reservationErrors.push({
                    materialCode,
                    error: 'Material not found',
                    reservedQty
                  });
                  console.error(`❌ Material ${materialCode} not found`);
                  continue;
                }
                
                const materialData = materialDoc.data();
                const currentStock = parseFloat(materialData.stock) || 0;
                const currentWipReserved = parseFloat(materialData.wipReserved) || 0;
                
                // ========================================================================
                // SAFETY: Prevent negative stock
                // ========================================================================
                // If reserved quantity exceeds available stock, use available stock instead
                // This prevents stock from going negative
                let actualReservedQty = reservedQty;
                let stockWarning = null;
                
                // INVARIANT CHECK: actualReservedAmounts <= preProductionReservedAmount
                if (reservedQty < 0) {
                  throw new Error(`Reservation invariant violated: negative requested amount for ${materialCode}`);
                }
                
                // INVARIANT CHECK: actualReservedAmounts must not exceed preProductionReservedAmount
                // This check happens after actual reservation is recorded
                const preProductionAmount = assignment.preProductionReservedAmount?.[materialCode] || 0;
                if (reservedQty > preProductionAmount) {
                  throw new Error(
                    `Invariant violated: actualReserved ${reservedQty} > requestedAmount ${preProductionAmount} ` +
                    `for material ${materialCode} in assignment ${assignment.id}`
                  );
                }
                
                // INVARIANT CHECK: actualReservedAmounts <= material.stock (before reservation)
                if (currentStock < reservedQty) {
                  actualReservedQty = currentStock;
                  stockWarning = `Rehin miktarı (${reservedQty}) mevcut stoktan (${currentStock}) fazla. Stok miktarı kadar (${actualReservedQty}) rezerve edildi.`;
                  
                  // METRICS: Track reservation mismatches
                  metrics.increment('reservation_mismatch_count');
                  console.warn(`⚠️ ${materialCode}: ${stockWarning}`);
                  console.warn(`📊 Reservation mismatch for assignment ${assignmentId}, material ${materialCode}, requested: ${reservedQty}, actual: ${actualReservedQty}`);
                  console.warn(`📊 Partial reservation for ${materialCode}: requested ${reservedQty}, reserved ${actualReservedQty}`);
                  // TODO: Increment metric: reservation_mismatch_count
                }
                
                // Check if we have any stock to reserve
                if (actualReservedQty <= 0) {
                  reservationErrors.push({
                    materialCode,
                    error: 'No stock available',
                    required: reservedQty,
                    available: currentStock,
                    shortage: reservedQty
                  });
                  console.error(`❌ No stock available for ${materialCode}: required ${reservedQty}, available ${currentStock}`);
                  continue;
                }
                
                // Atomic update: deduct from stock, add to wipReserved
                const newStock = currentStock - actualReservedQty;
                const newWipReserved = currentWipReserved + actualReservedQty;
                
                // Double-check: ensure stock doesn't go negative
                if (newStock < 0) {
                  console.error(`❌ CRITICAL: Stock would go negative for ${materialCode}. This should not happen!`);
                  reservationErrors.push({
                    materialCode,
                    error: 'Stock calculation error',
                    required: reservedQty,
                    available: currentStock
                  });
                  continue;
                }
                
                transaction.update(materialRef, {
                  stock: newStock,
                  wipReserved: newWipReserved,
                  updatedAt: now,
                  updatedBy: actorEmail
                });
                
                reservationResults.push({
                  materialCode,
                  materialName: materialData.name,
                  requestedQty: reservedQty,              // Requested amount
                  actualReservedQty: actualReservedQty,   // Actually reserved amount
                  previousStock: currentStock,
                  newStock,
                  previousWipReserved: currentWipReserved,
                  newWipReserved,
                  unit: materialData.unit,
                  warning: stockWarning                   // Warning if partial reservation
                });
                
                // ========================================================================
                // STOCK MOVEMENTS: Record material transfer to WIP
                // ========================================================================
                const stockMovementRef = db.collection('stockMovements').doc();
                const movementNotes = stockWarning 
                  ? `Görev başlatıldı - Malzeme üretime alındı (UYARI: ${stockWarning})`
                  : `Görev başlatıldı - Malzeme üretime alındı`;
                
                transaction.set(stockMovementRef, {
                  materialId: materialCode,
                  materialCode: materialCode,
                  materialName: materialData.name || '',
                  type: 'out', // Stock'tan çıkış
                  subType: 'wip_reservation', // Üretim rezervasyonu
                  status: 'wip', // 🔵 WIP durumu - tamamlandığında 'consumption' olacak
                  quantity: actualReservedQty,           // Rezerve edilen miktar (tamamlamada güncellenecek)
                  reservedQuantity: actualReservedQty,   // Orjinal rezervasyon (sabit kalır)
                  requestedQuantity: reservedQty,        // Store requested for reference
                  partialReservation: actualReservedQty < reservedQty, // Flag if partial
                  unit: materialData.unit || 'Adet',
                  stockBefore: currentStock,
                  stockAfter: newStock,
                  wipReservedBefore: currentWipReserved,
                  wipReservedAfter: newWipReserved,
                  unitCost: materialData.costPrice || null,
                  totalCost: materialData.costPrice ? materialData.costPrice * actualReservedQty : null,
                  currency: 'TRY',
                  reference: assignmentId,
                  referenceType: 'mes_task_start',
                  relatedPlanId: planId,
                  relatedNodeId: nodeId,
                  warehouse: null,
                  location: 'WIP',
                  notes: movementNotes,
                  warning: stockWarning || null,         // Store warning if any
                  reason: 'MES görev başlatma - WIP rezervasyonu',
                  movementDate: now,
                  createdAt: now,
                  userId: actorEmail,
                  userName: actorName || actorEmail,
                  approved: true,
                  approvedBy: actorEmail,
                  approvedAt: now
                });
                
                const logMessage = stockWarning
                  ? `⚠️ Partially reserved ${actualReservedQty}/${reservedQty} ${materialData.unit} of ${materialCode}: stock ${currentStock} → ${newStock}, wipReserved ${currentWipReserved} → ${newWipReserved}`
                  : `✅ Reserved ${actualReservedQty} ${materialData.unit} of ${materialCode}: stock ${currentStock} → ${newStock}, wipReserved ${currentWipReserved} → ${newWipReserved}`;
                
                console.log(logMessage);
                
              } catch (err) {
                reservationErrors.push({
                  materialCode,
                  error: err.message,
                  reservedQty
                });
                console.error(`❌ Failed to reserve ${materialCode}:`, err);
              }
            }
            
            console.log(`✅ PHASE 2 COMPLETE: All material reservations processed`);
            
            // If any errors occurred, throw to rollback transaction
            if (reservationErrors.length > 0) {
              const e = new Error('Material reservation failed');
              e.status = 409;
              e.code = 'material_reservation_failed';
              e.errors = reservationErrors;
              e.details = reservationErrors.map(err => 
                `${err.materialCode}: ${err.error}${err.shortage ? ` (eksik: ${err.shortage})` : ''}`
              ).join(', ');
              throw e;
            }
            
            // Update assignment with reservation status
            updateData.materialReservationStatus = 'reserved';
            updateData.materialReservationTimestamp = now;
            updateData.materialReservationResults = reservationResults;
            
            // Store actual reserved amounts (may differ from preProductionReservedAmount if stock was insufficient)
            const actualReservedAmounts = {};
            reservationResults.forEach(result => {
              actualReservedAmounts[result.materialCode] = result.actualReservedQty;
            });
            updateData.actualReservedAmounts = actualReservedAmounts;
            
            materialReservationResult = {
              success: true,
              materialsReserved: reservationResults.length,
              details: reservationResults,
              hasWarnings: reservationResults.some(r => r.warning)
            };
            
            console.log(`✅ Material reservation completed for work package ${assignmentId}: ${reservationResults.length} material(s) reserved`);
            
            // Log any warnings
            const warnings = reservationResults.filter(r => r.warning);
            if (warnings.length > 0) {
              console.warn(`⚠️ Reservation warnings:`, warnings.map(w => `${w.materialCode}: ${w.warning}`));
            }
          }
          
          // ========================================================================
          // UPDATE ASSIGNMENT STATUS
          // ========================================================================
          
          updateData.status = 'in_progress';
          
          // Only set actualStart if it doesn't already exist (preserve on resume)
          if (!assignment.actualStart) {
            updateData.actualStart = now;
          }
          
          // ========================================================================
          // PAUSE DURATION TRACKING
          // ========================================================================
          // If resuming from pause, calculate and accumulate pause duration
          if (assignment.pausedAt && assignment.currentPauseStart) {
            const pauseStartTime = new Date(assignment.currentPauseStart);
            const pauseDuration = now - pauseStartTime; // milliseconds
            const previousPausedTime = assignment.totalPausedTime || 0;
            const newTotalPausedTime = previousPausedTime + pauseDuration;
            
            // INVARIANT CHECK: totalPausedTime must be monotonically increasing
            if (newTotalPausedTime < previousPausedTime) {
              throw new Error(`Pause time accounting invariant violated: new totalPausedTime (${newTotalPausedTime}) < previous (${previousPausedTime})`);
            }
            
            updateData.totalPausedTime = newTotalPausedTime;
            updateData.lastPauseDuration = pauseDuration;
            updateData.currentPauseStart = admin.firestore.FieldValue.delete();
            
            console.log(`⏱️ Pause duration: ${Math.round(pauseDuration / 60000)} minutes, Total paused: ${Math.round(newTotalPausedTime / 60000)} minutes`);
          }
          
          // INVARIANT CHECK: currentPauseStart must be null when not paused
          if (updateData.status !== 'paused') {
            // Ensure currentPauseStart is cleared
            if (!updateData.currentPauseStart || updateData.currentPauseStart === admin.firestore.FieldValue.delete()) {
              // Good - already cleared or being cleared
            } else {
              console.warn(`⚠️ Invariant warning: currentPauseStart should be null when status is not 'paused'`);
            }
          }
          
          // Clear pause metadata when starting/resuming
          updateData.pauseContext = admin.firestore.FieldValue.delete();
          updateData.pauseReason = admin.firestore.FieldValue.delete();
          updateData.pausedAt = admin.firestore.FieldValue.delete();
          
          // Set worker currentTask
          if (workerRef) {
            workerUpdate = {
              currentTask: {
                planId,
                nodeId,
                assignmentId,
                status: 'in_progress',
                startedAt: now
              },
              updatedAt: now
            };
          }
          
          // Set substation currentOperation (instead of station)
          // Track workload at substation level, not station level
          const substationId = assignment.substationId || null;
          if (substationId) {
            const substationRef = db.collection('mes-substations').doc(substationId);
            
            // Calculate expected end time based on planned duration
            const effectiveTime = assignment.effectiveTime || assignment.nominalTime || 60; // minutes
            const expectedEnd = new Date(now.getTime() + effectiveTime * 60000);
            
            stationUpdate = {
              currentOperation: nodeId,
              currentWorkPackageId: assignmentId, // WO-001-02 format
              currentPlanId: planId,
              currentExpectedEnd: expectedEnd.toISOString(),
              currentOperationUpdatedAt: now,
              updatedAt: now
            };
            // Update stationRef to point to substation
            stationRef = substationRef;
            console.log(`✅ Setting substation ${substationId} workload: operation=${nodeId}, workPackage=${assignmentId}, expectedEnd=${expectedEnd.toISOString()}`);
          } else {
            console.warn(`⚠️ No substationId in assignment ${assignmentId}, cannot track currentOperation`);
            stationRef = null; // Don't update any station
          }
          break;
          
        case 'pause':
          // ========================================================================
          // PAUSE: No material changes, only status update
          // ========================================================================
          
          // INVARIANT CHECK: currentPauseStart must be null before pausing
          if (assignment.currentPauseStart) {
            console.warn(`⚠️ Task ${assignmentId} already has currentPauseStart set: ${assignment.currentPauseStart}`);
          }
          
          updateData.status = 'paused';
          updateData.pausedAt = now;
          updateData.currentPauseStart = now; // Track when this pause started
          updateData.pausedBy = actorEmail;
          updateData.pausedByName = actorName;
          updateData.pauseContext = 'worker'; // Worker-level pause
          updateData.pauseReason = 'Worker paused the task';
          
          // Update worker currentTask status
          if (workerRef) {
            workerUpdate = {
              'currentTask.status': 'paused',
              updatedAt: now
            };
          }
          break;
          
        case 'station_error':
          // ========================================================================
          // STATION ERROR: Pause + create alert
          // ========================================================================
          updateData.status = 'paused';
          updateData.pausedAt = now;
          updateData.pausedBy = actorEmail;
          updateData.pausedByName = actorName;
          updateData.pauseContext = 'station_error'; // Station error pause
          updateData.pauseReason = stationNote || 'Station error reported';
          
          // Update worker currentTask status
          if (workerRef) {
            workerUpdate = {
              'currentTask.status': 'paused',
              updatedAt: now
            };
          }
          
          // Create alert in mes-alerts collection
          const alertRef = db.collection('mes-alerts').doc();
          transaction.set(alertRef, {
            id: alertRef.id,
            type: 'station_error',
            planId,
            nodeId,
            stationId,
            workerId,
            assignmentId,
            note: stationNote || 'İstasyon hatası',
            status: 'open',
            createdAt: now,
            createdBy: actorEmail,
            createdByName: actorName
          });
          alertCreated = true;
          break;
          
        case 'complete':
          // ========================================================================
          // COMPREHENSIVE MATERIAL CONSUMPTION & STOCK FINALIZATION
          // ========================================================================
          // This implements a complete material accounting cycle:
          // 1. Calculate actual consumption based on actual output + defects
          // 2. Release wipReserved and adjust stock for input materials
          // 3. Add good output to stock
          // 4. Record all material movements for audit trail
          // ========================================================================
          
          console.log(`📊 Starting comprehensive completion for work package ${assignmentId}`);
          
          updateData.status = 'completed';
          updateData.actualEnd = now;
          
          // Store actual output and defect quantities
          const actualOutput = parseFloat(actualOutputQuantity) || 0;
          const defects = parseFloat(defectQuantity) || 0;
          
          // DEBUG: Log received quantities
          console.log(`🔍 DEBUG - COMPLETE received parameters:`);
          console.log(`   actualOutputQuantity (raw): ${actualOutputQuantity}`);
          console.log(`   actualOutput (parsed): ${actualOutput}`);
          console.log(`   defectQuantity (raw): ${defectQuantity}`);
          console.log(`   defects (parsed): ${defects}`);
          console.log(`   scrapCounters:`, scrapCounters);
          
          updateData.actualOutputQuantity = actualOutput;
          updateData.defectQuantity = defects;
          
          // Store scrap counter details if provided
          if (scrapCounters) {
            updateData.scrapCountersSnapshot = scrapCounters;
            console.log(`📊 Storing scrap counter snapshot:`, scrapCounters);
          }
          
          // If completing a cancelled_pending_report task, stamp completionContext
          if (assignment.status === 'cancelled_pending_report' || assignment.finishContext === 'cancelled') {
            updateData.completionContext = 'cancelled';
          }
          
          // ========================================================================
          // PHASE 1: ALL READS (Firestore transaction requirement)
          // ========================================================================
          
          console.log(`📖 PHASE 1: Reading all documents before writes...`);
          
          // READ 1: Get plan and node information
          const planDoc = await transaction.get(db.collection('mes-production-plans').doc(planId));
          if (!planDoc.exists) {
            console.error(`Plan ${planId} not found`);
            throw new Error(`Production plan ${planId} not found`);
          }
          
          const planData = planDoc.data();
          const nodes = planData.nodes || [];
          const node = nodes.find(n => n.nodeId === nodeId);
          
          if (!node) {
            console.error(`Node ${nodeId} not found in plan nodes (searched ${nodes.length} nodes)`);
            throw new Error(`Task node ${nodeId} not found in production plan`);
          }
          
          const preProductionReservedAmount = assignment.preProductionReservedAmount || {};
          const actualReservedAmounts = assignment.actualReservedAmounts || preProductionReservedAmount;
          const plannedOutput = assignment.plannedOutput || {};
          const materialInputs = node.materialInputs || [];
          const outputCode = node.outputCode || Object.keys(plannedOutput)[0];
          const plannedOutputQty = node.outputQty || Object.values(plannedOutput)[0] || 0;
          
          // READ 2: Pre-fetch ALL input materials
          const inputMaterialDocs = new Map();
          for (const materialInput of materialInputs) {
            const inputCode = materialInput.materialCode || materialInput.code;
            if (!inputCode) continue;
            
            const materialRef = db.collection('materials').doc(inputCode);
            const materialDoc = await transaction.get(materialRef);
            inputMaterialDocs.set(inputCode, { ref: materialRef, doc: materialDoc });
          }
          
          // READ 3: Pre-fetch output material (CRITICAL: before any writes!)
          let outputMaterialSnapshot = null;
          if (outputCode) {
            const outputMaterialRef = db.collection('materials').doc(outputCode);
            outputMaterialSnapshot = await transaction.get(outputMaterialRef);
          }
          
          // READ 4: Pre-fetch WIP movements for all input materials
          const wipMovementDocs = new Map();
          for (const [inputCode, _] of inputMaterialDocs) {
            const wipMovementSnap = await db.collection('stockMovements')
              .where('reference', '==', assignmentId)
              .where('materialCode', '==', inputCode)
              .where('status', '==', 'wip')
              .limit(1)
              .get();
            
            if (!wipMovementSnap.empty) {
              wipMovementDocs.set(inputCode, wipMovementSnap.docs[0]);
            }
          }
          
          console.log(`✅ READ PHASE COMPLETE: ${inputMaterialDocs.size} input materials, ${outputMaterialSnapshot ? 1 : 0} output material, ${wipMovementDocs.size} WIP movements`);
          
          // ========================================================================
          // PHASE 2: CALCULATIONS (No Firestore operations)
          // ========================================================================
          
          console.log(`📦 Planned reserved materials:`, preProductionReservedAmount);
          console.log(`📦 Actually reserved materials:`, actualReservedAmounts);
          console.log(`🎯 Planned output:`, plannedOutput);
          console.log(`✅ Actual output: ${actualOutput}, ❌ Defects: ${defects}`);
          
          // Process scrap counters
          const inputScrapTotals = {};
          const productionScrapTotals = {};
          
          Object.keys(assignment).forEach(key => {
            if (key.startsWith('inputScrapCount_')) {
              const materialCode = key.replace('inputScrapCount_', '').replace(/_/g, '-');
              const quantity = assignment[key] || 0;
              if (quantity > 0) {
                inputScrapTotals[materialCode] = quantity;
              }
            } else if (key.startsWith('productionScrapCount_')) {
              const materialCode = key.replace('productionScrapCount_', '').replace(/_/g, '-');
              const quantity = assignment[key] || 0;
              if (quantity > 0) {
                productionScrapTotals[materialCode] = quantity;
              }
            }
          });
          
          console.log(`📊 Scrap Summary for assignment ${assignmentId}:`);
          console.log(`   Input scrap:`, inputScrapTotals);
          console.log(`   Production scrap:`, productionScrapTotals);
          console.log(`   Output defects: ${defects}`);
          
          // Reset scrap counters after reading (will be updated at end of transaction)
          counterResetFields = {}; // Initialize (already declared above)
          Object.keys(assignment).forEach(key => {
            if (key.startsWith('inputScrapCount_') || key.startsWith('productionScrapCount_')) {
              counterResetFields[key] = 0;
            }
          });
          
          console.log(`📋 Material inputs:`, materialInputs.map(m => `${m.materialCode || m.code}: ${m.requiredQuantity || 0}`));
          console.log(`📦 Output code: ${outputCode}, Planned: ${plannedOutputQty}`);
          
          // Calculate consumption for each material
          const totalConsumedOutput = actualOutput + defects;
          const consumptionResults = [];
          const stockAdjustmentResults = [];
          
          console.log(`🔢 Total consumed (output + defect): ${totalConsumedOutput}`);
          
          if (materialInputs.length > 0 && plannedOutputQty > 0) {
            
            for (const materialInput of materialInputs) {
              const inputCode = materialInput.materialCode || materialInput.code;
              const requiredInputQty = materialInput.requiredQuantity || 0;
              
              if (!inputCode || requiredInputQty <= 0) {
                console.warn(`⚠️ Skipping invalid material input:`, materialInput);
                continue;
              }
              
              // Calculate input-output ratio
              const inputOutputRatio = requiredInputQty / plannedOutputQty;
              
              // Calculate base consumption (for successful output + output defects)
              const baseConsumption = totalConsumedOutput * inputOutputRatio;
              
              // Add input scrap (direct 1:1, no ratio calculation)
              const inputScrap = inputScrapTotals[inputCode] || 0;
              
              // Add production scrap (direct 1:1, no ratio calculation)
              const productionScrap = productionScrapTotals[inputCode] || 0;
              
              // Total theoretical consumption
              const theoreticalConsumption = baseConsumption + inputScrap + productionScrap;
              
              // Get ACTUAL reserved amount (may differ from planned if stock was insufficient)
              const reservedAmount = actualReservedAmounts[inputCode] || 0;
              
              // INVARIANT CHECK: consumedAmount <= actualReservedAmounts
              const cappedConsumption = Math.min(theoreticalConsumption, reservedAmount);
              
              if (theoreticalConsumption > reservedAmount) {
                metrics.increment('consumption_capped_count');
                console.error(`❌ INVARIANT VIOLATION: Consumption exceeds reserved for ${inputCode}!`);
                console.error(`   Consumed: ${theoreticalConsumption}, Reserved: ${reservedAmount}`);
                console.error(`   Capping consumption at reserved amount.`);
                console.warn(`📊 Consumption capped for assignment ${assignmentId}, material ${inputCode}, theoretical: ${theoreticalConsumption.toFixed(2)}, capped: ${cappedConsumption.toFixed(2)}`);
                // This should not happen in normal operation
                // Log for monitoring/alerting
              }
              
              // Calculate stock adjustment (reserved - capped consumption)
              const stockAdjustment = reservedAmount - cappedConsumption;
              
              console.log(`
📊 Material: ${inputCode}
   Required per unit: ${requiredInputQty}
   Planned output: ${plannedOutputQty}
   Input-output ratio: ${inputOutputRatio.toFixed(4)}
   Actually reserved: ${reservedAmount}
   Base consumption (output-based): ${baseConsumption.toFixed(2)}
   Input scrap: ${inputScrap}
   Production scrap: ${productionScrap}
   Theoretical total: ${theoreticalConsumption.toFixed(2)}
   Capped consumption: ${cappedConsumption.toFixed(2)}
   Stock adjustment: ${stockAdjustment >= 0 ? '+' : ''}${stockAdjustment.toFixed(2)}
              `);
              
              consumptionResults.push({
                materialCode: inputCode,
                requiredInputQty,
                plannedOutputQty,
                inputOutputRatio,
                reservedAmount,
                baseConsumption,
                inputScrap,
                productionScrap,
                theoreticalConsumption,
                actualConsumption: cappedConsumption,
                stockAdjustment
              });
            }
          } else {
            console.warn(`⚠️ No material inputs found or planned output is zero. Skipping consumption calculation.`);
          }
          
          // ========================================================================
          // PHASE 3: ALL WRITES (After all reads complete)
          // ========================================================================
          
          console.log(`✍️ PHASE 3: Performing all writes...`);
          
          // WRITE 1: Update input materials stock
          console.log(`🔄 Processing stock adjustments for ${consumptionResults.length} input material(s)`);
          
          for (const consumption of consumptionResults) {
            const { materialCode, reservedAmount, actualConsumption, stockAdjustment } = consumption;
            
            try {
              const materialSnapshot = inputMaterialDocs.get(materialCode);
              if (!materialSnapshot || !materialSnapshot.doc.exists) {
                console.error(`❌ Material ${materialCode} not found`);
                continue;
              }
              
              const materialData = materialSnapshot.doc.data();
              const currentStock = parseFloat(materialData.stock) || 0;
              const currentWipReserved = parseFloat(materialData.wipReserved) || 0;
              
              // Release wipReserved
              const newWipReserved = Math.max(0, currentWipReserved - reservedAmount);
              
              // Adjust stock (add back unused or deduct extra used)
              const newStock = currentStock + stockAdjustment;
              
              if (newStock < 0) {
                console.warn(`⚠️ Warning: ${materialCode} stock would become negative (${newStock}). Setting to 0.`);
              }
              
              transaction.update(materialSnapshot.ref, {
                stock: Math.max(0, newStock),
                wipReserved: newWipReserved,
                updatedAt: now,
                updatedBy: actorEmail
              });
              
              stockAdjustmentResults.push({
                materialCode,
                materialName: materialData.name,
                reservedAmount,
                actualConsumption,
                stockAdjustment,
                previousStock: currentStock,
                newStock: Math.max(0, newStock),
                previousWipReserved: currentWipReserved,
                newWipReserved,
                unit: materialData.unit
              });
              
              // WRITE 2: Update or create WIP movement
              const wipMovementDoc = wipMovementDocs.get(materialCode);
              
              if (wipMovementDoc) {
                const wipMovementRef = db.collection('stockMovements').doc(wipMovementDoc.id);
                
                transaction.update(wipMovementRef, {
                  status: 'consumption', // 🔴 WIP → Consumption
                  quantity: actualConsumption, // Gerçek sarf miktarı
                  adjustedQuantity: stockAdjustment, // Fark (pozitif = geri döndü, negatif = fazla çekildi)
                  actualOutput: actualOutput,
                  defectQuantity: defects,
                  plannedOutput: plannedOutputQty,
                  stockAfterConsumption: Math.max(0, newStock),
                  wipReservedAfterRelease: newWipReserved,
                  totalCost: materialData.costPrice ? materialData.costPrice * actualConsumption : null,
                  location: 'Production Floor',
                  notes: `Görev tamamlandı - Gerçek sarfiyat: ${actualConsumption.toFixed(2)} ${materialData.unit} (Rezerve: ${reservedAmount}, Fark: ${stockAdjustment > 0 ? '+' : ''}${stockAdjustment.toFixed(2)}, Çıktı: ${actualOutput}, Fire: ${defects})`,
                  reason: 'MES görev tamamlama - Üretim sarfiyatı',
                  completedAt: now,
                  completedBy: actorEmail
                });
                
                console.log(`✅ Updated WIP movement ${wipMovementDoc.id} to consumption: ${materialCode} ${reservedAmount} → ${actualConsumption} (${stockAdjustment > 0 ? '+' : ''}${stockAdjustment})`);
              } else {
                // Fallback: WIP kaydı bulunamazsa yeni consumption kaydı oluştur
                console.warn(`⚠️ WIP movement not found for ${assignmentId}/${materialCode}, creating new consumption record`);
                const consumptionMovementRef = db.collection('stockMovements').doc();
                transaction.set(consumptionMovementRef, {
                  materialId: materialCode,
                  materialCode: materialCode,
                  materialName: materialData.name || '',
                  type: 'out',
                  subType: 'production_consumption',
                  status: 'consumption',
                  quantity: actualConsumption,
                  reservedQuantity: reservedAmount,
                  adjustedQuantity: stockAdjustment,
                  unit: materialData.unit || 'Adet',
                  stockBefore: currentStock,
                  stockAfter: Math.max(0, newStock),
                  actualOutput: actualOutput,
                  defectQuantity: defects,
                  plannedOutput: plannedOutputQty,
                  unitCost: materialData.costPrice || null,
                  totalCost: materialData.costPrice ? materialData.costPrice * actualConsumption : null,
                  currency: 'TRY',
                  reference: assignmentId,
                  referenceType: 'mes_task_complete',
                  relatedPlanId: planId,
                  relatedNodeId: nodeId,
                  warehouse: null,
                  location: 'Production Floor',
                  notes: `Görev tamamlandı - Gerçek sarfiyat: ${actualConsumption.toFixed(2)} ${materialData.unit} (Çıktı: ${actualOutput}, Fire: ${defects})`,
                  reason: 'MES görev tamamlama - Üretim sarfiyatı',
                  movementDate: now,
                  createdAt: now,
                  userId: actorEmail,
                  userName: actorName || actorEmail,
                  approved: true,
                  approvedBy: actorEmail,
                  approvedAt: now
                });
              }
              
              console.log(`✅ ${materialCode}: stock ${currentStock} → ${Math.max(0, newStock)} (${stockAdjustment >= 0 ? '+' : ''}${stockAdjustment.toFixed(2)}), wipReserved ${currentWipReserved} → ${newWipReserved} (-${reservedAmount})`);
              
            } catch (err) {
              console.error(`❌ Failed to adjust stock for ${materialCode}:`, err);
              // Continue with other materials
            }
          }
          
          // ========================================================================
          // WRITE 3: Stock Update for Output Material
          // ========================================================================
          
          let outputStockResult = null;
          
          if (outputCode && actualOutput > 0 && outputMaterialSnapshot) {
            console.log(`📦 Adding ${actualOutput} units of ${outputCode} to stock`);
            
            try {
              const outputMaterialRef = db.collection('materials').doc(outputCode);
              
              if (outputMaterialSnapshot.exists) {
                const outputMaterialData = outputMaterialSnapshot.data();
                const currentOutputStock = parseFloat(outputMaterialData.stock) || 0;
                const newOutputStock = currentOutputStock + actualOutput;
                
                transaction.update(outputMaterialRef, {
                  stock: newOutputStock,
                  updatedAt: now,
                  updatedBy: actorEmail
                });
                
                outputStockResult = {
                  materialCode: outputCode,
                  materialName: outputMaterialData.name,
                  addedQuantity: actualOutput,
                  previousStock: currentOutputStock,
                  newStock: newOutputStock,
                  unit: outputMaterialData.unit
                };
                
                // ========================================================================
                // STOCK MOVEMENTS: Record production output addition
                // ========================================================================
                const outputMovementRef = db.collection('stockMovements').doc();
                transaction.set(outputMovementRef, {
                  materialId: outputCode,
                  materialCode: outputCode,
                  materialName: outputMaterialData.name || '',
                  type: 'in', // Üretimden gelen stok girişi
                  subType: 'production_output',
                  status: 'production', // 🟢 Üretim durumu
                  quantity: actualOutput,
                  unit: outputMaterialData.unit || 'Adet',
                  stockBefore: currentOutputStock,
                  stockAfter: newOutputStock,
                  actualOutput: actualOutput,
                  defectQuantity: defects,
                  plannedOutput: plannedOutputQty,
                  unitCost: outputMaterialData.costPrice || null,
                  totalCost: outputMaterialData.costPrice ? outputMaterialData.costPrice * actualOutput : null,
                  currency: 'TRY',
                  reference: assignmentId,
                  referenceType: 'mes_task_complete',
                  relatedPlanId: planId,
                  relatedNodeId: nodeId,
                  warehouse: null,
                  location: 'Production Output',
                  notes: `Üretim tamamlandı - ${actualOutput} ${outputMaterialData.unit} üretildi${defects > 0 ? ` (Fire: ${defects})` : ''}`,
                  reason: 'MES görev tamamlama - Üretim çıktısı',
                  movementDate: now,
                  createdAt: now,
                  userId: actorEmail,
                  userName: actorName || actorEmail,
                  approved: true,
                  approvedBy: actorEmail,
                  approvedAt: now
                });
                
                console.log(`✅ Output ${outputCode}: stock ${currentOutputStock} → ${newOutputStock} (+${actualOutput})`);
                
              } else {
                console.warn(`⚠️ Output material ${outputCode} not found in database. Creating it...`);
                
                // Detect if this is a finished product (no other nodes use this as input)
                const isFinishedProduct = !planData.nodes.some(n => 
                  Array.isArray(n.predecessors) && n.predecessors.includes(nodeId)
                );
                
                const materialType = isFinishedProduct ? 'finished_product' : 'semi_finished';
                const materialCategory = isFinishedProduct ? 'FINISHED_PRODUCT' : 'SEMI_FINISHED';
                
                console.log(`🏭 Material type determination: ${materialType} (isFinishedProduct: ${isFinishedProduct})`);
                
                // Create output material if it doesn't exist (Semi-finished or Finished Product)
                transaction.set(outputMaterialRef, {
                  code: outputCode,
                  name: node.name || outputCode,
                  type: materialType,
                  category: materialCategory,
                  stock: actualOutput,
                  reserved: 0,
                  wipReserved: 0,
                  unit: 'adet',
                  status: 'Aktif',
                  isActive: true,
                  reorderPoint: 0,
                  createdAt: now,
                  updatedAt: now,
                  createdBy: actorEmail,
                  updatedBy: actorEmail,
                  productionHistory: [] // Initialize production history array
                });
                
                outputStockResult = {
                  materialCode: outputCode,
                  materialName: node.name || outputCode,
                  addedQuantity: actualOutput,
                  previousStock: 0,
                  newStock: actualOutput,
                  unit: 'adet',
                  created: true
                };
                
                // ========================================================================
                // STOCK MOVEMENTS: Record new material creation + production output
                // ========================================================================
                const newMaterialMovementRef = db.collection('stockMovements').doc();
                transaction.set(newMaterialMovementRef, {
                  materialId: outputCode,
                  materialCode: outputCode,
                  materialName: node.name || outputCode,
                  type: 'in',
                  subType: 'production_output_new_material',
                  status: 'production', // 🟢 Üretim durumu
                  quantity: actualOutput,
                  unit: 'adet',
                  stockBefore: 0,
                  stockAfter: actualOutput,
                  actualOutput: actualOutput,
                  defectQuantity: defects,
                  plannedOutput: plannedOutputQty,
                  unitCost: null,
                  totalCost: null,
                  currency: 'TRY',
                  reference: assignmentId,
                  referenceType: 'mes_task_complete',
                  relatedPlanId: planId,
                  relatedNodeId: nodeId,
                  warehouse: null,
                  location: 'Production Output',
                  notes: `Yeni ${materialType === 'finished_product' ? 'bitmiş ürün' : 'yarı mamül'} malzemesi oluşturuldu ve ${actualOutput} adet üretildi${defects > 0 ? ` (Fire: ${defects})` : ''}`,
                  reason: `MES görev tamamlama - Yeni ${materialType === 'finished_product' ? 'bitmiş ürün' : 'yarı mamül'} malzeme + Üretim çıktısı`,
                  movementDate: now,
                  createdAt: now,
                  userId: actorEmail,
                  userName: actorName || actorEmail,
                  approved: true,
                  approvedBy: actorEmail,
                  approvedAt: now
                });
                
                console.log(`✅ Created output material ${outputCode} with initial stock ${actualOutput}`);
              }
              
            } catch (err) {
              console.error(`❌ Failed to update output material ${outputCode}:`, err);
              throw err; // Critical error, rollback transaction
            }
          } else {
            console.log(`ℹ️ No output material to add to stock (outputCode: ${outputCode}, actualOutput: ${actualOutput})`);
          }
          
          console.log(`✅ PHASE 3 WRITE COMPLETE: All material updates successful`);
          
          // ========================================================================
          // STEP 5: Create Scrap/Hurda Material Records
          // ========================================================================
          // For each scrap counter (input damaged, production scrap, output defect),
          // create or update hurda material records in materials collection with
          // code format: M-001H, Be-001H (appending 'H' to original code)
          // ========================================================================
          
          const scrapRecordsCreated = [];
          
          // ========================================================================
          // Process Input Material Scraps (Consolidated)
          // ========================================================================
          // For each input material, calculate total scrap:
          // Total Input Scrap = inputScrapCounters + productionScrapCounters + (ratio × output defectQuantity)
          
          const outputDefectQty = (scrapCounters && scrapCounters.defectQuantity) || defects;
          const inputMaterialScrapTotals = {}; // { 'M-001': totalScrapQty }
          
          // Collect all input materials that had scraps
          const allInputMaterialCodes = new Set();
          
          // From inputScrapCounters
          if (scrapCounters && scrapCounters.inputScrapCounters) {
            Object.keys(scrapCounters.inputScrapCounters).forEach(code => allInputMaterialCodes.add(code));
          }
          
          // From productionScrapCounters
          if (scrapCounters && scrapCounters.productionScrapCounters) {
            Object.keys(scrapCounters.productionScrapCounters).forEach(code => allInputMaterialCodes.add(code));
          }
          
          // From materialInputs (for ratio calculation with output defects)
          materialInputs.forEach(input => {
            if (input.code || input.materialCode) {
              allInputMaterialCodes.add(input.code || input.materialCode);
            }
          });
          
          console.log(`📊 Processing scraps for ${allInputMaterialCodes.size} input material(s)`);
          
          // Calculate total scrap for each input material
          for (const materialCode of allInputMaterialCodes) {
            let totalScrap = 0;
            
            // 1. Input damaged (hasarlı gelen)
            const inputDamaged = (scrapCounters?.inputScrapCounters?.[materialCode]) || 0;
            totalScrap += inputDamaged;
            
            // 2. Production scrap (üretimde hurda)
            const productionScrap = (scrapCounters?.productionScrapCounters?.[materialCode]) || 0;
            totalScrap += productionScrap;
            
            // 3. Input scrap from output defects (output defect'i üretmek için kullanılan input)
            if (outputDefectQty > 0 && plannedOutputQty > 0) {
              const materialInput = materialInputs.find(m => (m.materialCode || m.code) === materialCode);
              if (materialInput) {
                const requiredInputQty = materialInput.requiredQuantity || 0;
                const inputOutputRatio = requiredInputQty / plannedOutputQty;
                const scrapFromDefects = outputDefectQty * inputOutputRatio;
                totalScrap += scrapFromDefects;
                
                console.log(`   ${materialCode}: ratio=${inputOutputRatio.toFixed(4)}, defects=${outputDefectQty}, scrapFromDefects=${scrapFromDefects.toFixed(2)}`);
              }
            }
            
            if (totalScrap > 0) {
              inputMaterialScrapTotals[materialCode] = totalScrap;
              console.log(`📊 ${materialCode} total scrap: inputDamaged=${inputDamaged}, productionScrap=${productionScrap}, total=${totalScrap.toFixed(2)}`);
            }
          }
          
          // Pre-fetch all material docs before any writes (Firestore transaction requirement)
          const materialDocsToFetch = new Set();
          
          // Collect all material codes we need to read
          Object.keys(inputMaterialScrapTotals).forEach(code => {
            materialDocsToFetch.add(code); // Original material
            materialDocsToFetch.add(`${code}H`); // Scrap material
          });
          
          if (outputCode && outputDefectQty > 0) {
            materialDocsToFetch.add(outputCode); // Original output material
            materialDocsToFetch.add(`${outputCode}H`); // Output scrap material
          }
          
          // Pre-fetch all materials in parallel (all reads before any writes)
          const materialCache = new Map();
          const fetchPromises = Array.from(materialDocsToFetch).map(async code => {
            try {
              const doc = await transaction.get(db.collection('materials').doc(code));
              materialCache.set(code, { exists: doc.exists, data: doc.exists ? doc.data() : null });
            } catch (err) {
              console.warn(`Failed to fetch material ${code}:`, err.message);
              materialCache.set(code, { exists: false, data: null });
            }
          });
          
          await Promise.all(fetchPromises);
          console.log(`✅ Pre-fetched ${materialCache.size} material documents`);
          
          // Helper function to get or create scrap material (uses pre-fetched data)
          async function getOrCreateScrapMaterial(originalCode, scrapQuantity, scrapType) {
            if (scrapQuantity <= 0) return null;
            
            const scrapCode = `${originalCode}H`;
            
            // Get from cache (already fetched)
            const scrapMaterialCached = materialCache.get(scrapCode) || { exists: false, data: null };
            const originalMaterialCached = materialCache.get(originalCode) || { exists: false, data: null };
            
            const scrapExists = scrapMaterialCached.exists;
            const originalMaterialData = originalMaterialCached.data;
            
            const originalName = originalMaterialData?.name || originalCode;
            const originalUnit = originalMaterialData?.unit || 'adet';
            
            const previousScrapStock = scrapExists ? (parseFloat(scrapMaterialCached.data.stock) || 0) : 0;
            const newScrapStock = previousScrapStock + scrapQuantity;
            
            // Create or update scrap material
            const scrapMaterialRef = db.collection('materials').doc(scrapCode);
            if (!scrapExists) {
              // Create new scrap material
              transaction.set(scrapMaterialRef, {
                code: scrapCode,
                name: `${originalName} HURDA`,
                type: 'scrap',
                category: 'scrap',
                originalMaterialCode: originalCode,
                stock: newScrapStock,
                reserved: 0,
                wipReserved: 0,
                unit: originalUnit,
                status: 'Aktif',
                isActive: true,
                reorderPoint: 0,
                createdAt: now,
                updatedAt: now,
                createdBy: actorEmail,
                updatedBy: actorEmail
              });
              
              console.log(`✅ Created scrap material ${scrapCode} with initial stock ${newScrapStock}`);
            } else {
              // Update existing scrap material stock
              transaction.update(scrapMaterialRef, {
                stock: newScrapStock,
                updatedAt: now,
                updatedBy: actorEmail
              });
              
              console.log(`✅ Updated scrap material ${scrapCode}: ${previousScrapStock} → ${newScrapStock} (+${scrapQuantity})`);
            }
            
            // Create stock movement for audit trail
            const scrapMovementRef = db.collection('stockMovements').doc();
            const scrapTypeLabels = {
              input_damaged: 'Hasarlı Gelen Malzeme',
              production_scrap: 'Üretimde Hurda',
              output_defect: 'Çıktı Hatası'
            };
            
            transaction.set(scrapMovementRef, {
              materialId: scrapCode,
              materialCode: scrapCode,
              materialName: `${originalName} HURDA`,
              type: 'in',
              subType: `scrap_${scrapType}`,
              quantity: scrapQuantity,
              unit: originalUnit,
              stockBefore: previousScrapStock,
              stockAfter: newScrapStock,
              unitCost: null,
              totalCost: null,
              currency: 'TRY',
              reference: assignmentId,
              referenceType: 'mes_task_complete_scrap',
              relatedPlanId: planId,
              relatedNodeId: nodeId,
              originalMaterialCode: originalCode,
              warehouse: null,
              location: 'Hurda Deposu',
              notes: `${scrapTypeLabels[scrapType] || scrapType} - ${scrapQuantity} ${originalUnit} hurda kaydı`,
              reason: `MES görev tamamlama - ${scrapTypeLabels[scrapType] || scrapType}`,
              movementDate: now,
              createdAt: now,
              userId: actorEmail,
              userName: actorName || actorEmail,
              approved: true,
              approvedBy: actorEmail,
              approvedAt: now
            });
            
            return {
              scrapCode,
              originalCode,
              scrapType,
              quantity: scrapQuantity,
              previousStock: previousScrapStock,
              newStock: newScrapStock,
              unit: originalUnit,
              created: !scrapExists
            };
          }
          
          // ========================================================================
          // Use the helper function to create scrap material records
          // ========================================================================
          
          // Create scrap material records for all input materials
          for (const [materialCode, totalScrapQty] of Object.entries(inputMaterialScrapTotals)) {
            try {
              const result = await getOrCreateScrapMaterial(materialCode, totalScrapQty, 'input_damaged');
              if (result) {
                scrapRecordsCreated.push(result);
                console.log(`📊 Input material scrap: ${materialCode} → ${result.scrapCode} (+${totalScrapQty.toFixed(2)})`);
              }
            } catch (err) {
              console.error(`❌ Failed to create input scrap for ${materialCode}:`, err);
            }
          }
          
          // Process Output Material Scrap (only output defects)
          if (outputCode && outputDefectQty > 0) {
            try {
              const result = await getOrCreateScrapMaterial(outputCode, outputDefectQty, 'output_defect');
              if (result) {
                scrapRecordsCreated.push(result);
                console.log(`📊 Output defect scrap: ${outputCode} → ${result.scrapCode} (+${outputDefectQty})`);
              }
            } catch (err) {
              console.error(`❌ Failed to create output defect scrap for ${outputCode}:`, err);
            }
          }
          
          console.log(`✅ Created/updated ${scrapRecordsCreated.length} scrap material record(s)`);
          
          // ========================================================================
          // STEP 6: Record Material Movements in Assignment
          // ========================================================================
          
          updateData.materialMovements = {
            inputConsumption: consumptionResults,
            inputStockAdjustments: stockAdjustmentResults,
            outputStockUpdate: outputStockResult,
            scrapRecordsCreated: scrapRecordsCreated,
            timestamp: now,
            completedBy: actorEmail
          };
          
          console.log(`✅ Comprehensive completion processing finished for ${assignmentId}`);
          console.log(`   - Input materials adjusted: ${stockAdjustmentResults.length}`);
          console.log(`   - Output material updated: ${outputStockResult ? 'Yes' : 'No'}`);
          console.log(`   - Scrap materials created/updated: ${scrapRecordsCreated.length}`);
          console.log(`   - Total output: ${actualOutput}, Defects: ${defects}`);
          
          // ========================================================================
          // STEP 7: Clear Worker & Station State
          // ========================================================================
          
          // Clear worker currentTask
          if (workerRef) {
            workerUpdate = {
              currentTask: null,
              updatedAt: now
            };
          }
          
          // Clear substation currentOperation (instead of station)
          const substationIdComplete = assignment.substationId || null;
          if (substationIdComplete) {
            const substationRef = db.collection('mes-substations').doc(substationIdComplete);
            stationUpdate = {
              currentOperation: null,
              currentWorkPackageId: null,
              currentPlanId: null,
              currentExpectedEnd: null,
              currentOperationUpdatedAt: now,
              updatedAt: now
            };
            stationRef = substationRef;
            console.log(`✅ Clearing substation ${substationIdComplete} workload (currentOperation, workPackageId, planId, expectedEnd)`);
          } else {
            console.warn(`⚠️ No substationId in assignment ${assignmentId} for clearing currentOperation`);
            stationRef = null;
          }
          break;
      }
      
      // Apply updates
      // For COMPLETE action: Add counter reset fields to updateData
      if (action === 'complete' && Object.keys(counterResetFields).length > 0) {
        Object.assign(updateData, counterResetFields);
        console.log(`🔄 Resetting ${Object.keys(counterResetFields).length} scrap counters to 0`);
      }
      
      transaction.update(assignmentRef, updateData);
      
      if (workerRef && workerUpdate) {
        transaction.update(workerRef, workerUpdate);
      }
      
      if (stationRef && stationUpdate) {
        // Use set with merge for substation updates (in case document structure is incomplete)
        transaction.set(stationRef, stationUpdate, { merge: true });
      }
      
      return {
        success: true,
        workPackageId: assignmentId,
        action,
        status: updateData.status,
        alertCreated,
        scrapAdjustment,
        materialReservation: materialReservationResult,
        materialMovements: updateData.materialMovements || null,
        updatedAt: now.toISOString()
      };
    });
    
    // ========================================================================
    // POST-TRANSACTION: Check if all work packages are completed
    // ========================================================================
    if (action === 'complete') {
      try {
        // If we don't have workOrderCode on assignment, try to derive it from the plan
        if (!workOrderCode && planId) {
          try {
            const planSnap = await db.collection('mes-production-plans').doc(planId).get();
            if (planSnap.exists) {
              const planData = planSnap.data();
              workOrderCode = planData.workOrderCode || planData.code || null;
            }
          } catch (err) {
            console.warn('Failed to derive workOrderCode from plan:', err.message || err);
          }
        }

        if (workOrderCode) {
          // Query all assignments for this work order
          const allAssignmentsSnapshot = await db.collection('mes-worker-assignments')
            .where('workOrderCode', '==', workOrderCode)
            .get();
          
          if (!allAssignmentsSnapshot.empty) {
            const allAssignments = allAssignmentsSnapshot.docs.map(doc => doc.data());
            
            // Check if all assignments are completed
            const allCompleted = allAssignments.every(a => a.status === 'completed');
            
            if (allCompleted) {
              console.log(`✅ All work packages completed for ${workOrderCode} - updating quote production state to "Üretim Tamamlandı"`);
              
              await updateApprovedQuoteProductionState(
                workOrderCode,
                'Üretim Tamamlandı',
                actorEmail
              );
            } else {
              const completedCount = allAssignments.filter(a => a.status === 'completed').length;
              console.log(`📊 Work order ${workOrderCode}: ${completedCount}/${allAssignments.length} packages completed`);
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error checking work order completion for ${workOrderCode}:`, error);
        // Don't throw - the work package was completed successfully
      }
    }
    
    return result;
  }, res);
});

// ============================================================================
// SCRAP MANAGEMENT ENDPOINTS
// ============================================================================

// POST /api/mes/work-packages/:id/scrap - Record scrap entry during task
router.post('/work-packages/:id/scrap', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id: assignmentId } = req.params;
    const { scrapType, entry } = req.body;
    
    // Validate scrap type
    const validTypes = ['input_damaged', 'production_scrap', 'output_scrap'];
    if (!validTypes.includes(scrapType)) {
      const e = new Error('Invalid scrap type');
      e.status = 400;
      throw e;
    }
    
    // Validate entry
    if (!entry || !entry.materialCode || !entry.quantity || entry.quantity <= 0) {
      const e = new Error('Invalid scrap entry');
      e.status = 400;
      throw e;
    }
    
    const db = getFirestore();
    const assignmentRef = db.collection('mes-worker-assignments').doc(assignmentId);
    
    // Get current assignment
    const assignmentDoc = await assignmentRef.get();
    if (!assignmentDoc.exists) {
      const e = new Error('Assignment not found');
      e.status = 404;
      throw e;
    }
    
    const assignment = assignmentDoc.data();
    
    // Check if task is in progress or just completed (allow scrap entry during completion modal)
    if (assignment.status !== 'in_progress' && assignment.status !== 'completed') {
      const e = new Error('Task must be in progress or completed to record scrap');
      e.status = 400;
      throw e;
    }
    
    // Generate counter field name (replace special chars for Firestore compatibility)
    const safeCode = entry.materialCode.replace(/[^a-zA-Z0-9]/g, '_');
    
    // Update appropriate counter using atomic increment
    const updateData = { updatedAt: new Date() };
    
    if (scrapType === 'input_damaged') {
      const counterField = `inputScrapCount_${safeCode}`;
      updateData[counterField] = admin.firestore.FieldValue.increment(entry.quantity);
      
    } else if (scrapType === 'production_scrap') {
      const counterField = `productionScrapCount_${safeCode}`;
      updateData[counterField] = admin.firestore.FieldValue.increment(entry.quantity);
      
    } else if (scrapType === 'output_scrap') {
      // For output scrap, just update the defectQuantity
      updateData.defectQuantity = admin.firestore.FieldValue.increment(entry.quantity);
    }
    
    // Save to database (atomic operation - no race condition)
    await assignmentRef.update(updateData);
    
    console.log(`✅ Scrap counter updated for assignment ${assignmentId}: ${scrapType}, +${entry.quantity} ${entry.materialCode}`);
    
    return {
      success: true,
      assignmentId,
      scrapType,
      materialCode: entry.materialCode,
      quantity: entry.quantity,
      operation: 'increment'
    };
    
  }, res);
});

// GET /api/mes/work-packages/:id/scrap - Get current scrap log
router.get('/work-packages/:id/scrap', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id: assignmentId } = req.params;
    
    const db = getFirestore();
    const assignmentDoc = await db.collection('mes-worker-assignments').doc(assignmentId).get();
    
    if (!assignmentDoc.exists) {
      const e = new Error('Assignment not found');
      e.status = 404;
      throw e;
    }
    
    const assignment = assignmentDoc.data();
    
    // Parse counter fields from assignment
    const inputScrapCounters = {};
    const productionScrapCounters = {};
    
    Object.keys(assignment).forEach(key => {
      if (key.startsWith('inputScrapCount_')) {
        const materialCode = key.replace('inputScrapCount_', '').replace(/_/g, '-');
        inputScrapCounters[materialCode] = assignment[key] || 0;
      } else if (key.startsWith('productionScrapCount_')) {
        const materialCode = key.replace('productionScrapCount_', '').replace(/_/g, '-');
        productionScrapCounters[materialCode] = assignment[key] || 0;
      }
    });
    
    return {
      assignmentId,
      inputScrapCounters,
      productionScrapCounters,
      defectQuantity: assignment.defectQuantity || 0,
      status: assignment.status
    };
    
  }, res);
});

// DELETE /api/mes/work-packages/:id/scrap/:scrapType/:materialCode/:quantity - Decrease scrap counter (undo)
router.delete('/work-packages/:id/scrap/:scrapType/:materialCode/:quantity', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id: assignmentId, scrapType, materialCode, quantity } = req.params;
    const decrementAmount = parseFloat(quantity);
    
    if (isNaN(decrementAmount) || decrementAmount <= 0) {
      const e = new Error('Invalid quantity');
      e.status = 400;
      throw e;
    }
    
    const validTypes = ['input_damaged', 'production_scrap', 'output_scrap'];
    if (!validTypes.includes(scrapType)) {
      const e = new Error('Invalid scrap type');
      e.status = 400;
      throw e;
    }
    
    const db = getFirestore();
    const assignmentRef = db.collection('mes-worker-assignments').doc(assignmentId);
    
    const assignmentDoc = await assignmentRef.get();
    if (!assignmentDoc.exists) {
      const e = new Error('Assignment not found');
      e.status = 404;
      throw e;
    }
    
    // Generate counter field name
    const safeCode = materialCode.replace(/[^a-zA-Z0-9]/g, '_');
    const updateData = { updatedAt: new Date() };
    
    if (scrapType === 'input_damaged') {
      const counterField = `inputScrapCount_${safeCode}`;
      updateData[counterField] = admin.firestore.FieldValue.increment(-decrementAmount);
      
    } else if (scrapType === 'production_scrap') {
      const counterField = `productionScrapCount_${safeCode}`;
      updateData[counterField] = admin.firestore.FieldValue.increment(-decrementAmount);
      
    } else if (scrapType === 'output_scrap') {
      updateData.defectQuantity = admin.firestore.FieldValue.increment(-decrementAmount);
    }
    
    // Save (atomic decrement)
    await assignmentRef.update(updateData);
    
    console.log(`✅ Scrap counter decreased for assignment ${assignmentId}: ${scrapType}, -${decrementAmount} ${materialCode}`);
    
    return {
      success: true,
      assignmentId,
      scrapType,
      materialCode,
      decrementAmount,
      operation: 'decrement'
    };
    
  }, res);
});

// ============================================================================
// ALERTS ROUTES
// ============================================================================

// GET /api/mes/alerts - Get alerts with optional filtering
router.get('/alerts', withAuth, async (req, res) => {
  try {
    const { type, status, limit } = req.query;
    
    const db = getFirestore();
    
    // Check if collection exists by attempting a simple query
    let query = db.collection('mes-alerts');
    
    // Apply filters
    if (type) {
      query = query.where('type', '==', type);
    }
    
    if (status) {
      query = query.where('status', '==', status);
    }
    
    // Order by most recent
    try {
      query = query.orderBy('createdAt', 'desc');
    } catch (err) {
      // If orderBy fails (e.g., missing index), skip ordering
      console.warn('Alert ordering failed, returning unordered results:', err.message);
    }
    
    // Apply limit
    if (limit) {
      const limitNum = parseInt(limit, 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        query = query.limit(limitNum);
      }
    }
    
    // Execute query with error handling
    let snapshot;
    try {
      snapshot = await query.get();
    } catch (err) {
      console.error('Failed to query alerts collection:', err);
      return res.status(500).json({ 
        code: 'alerts_load_failed', 
        message: `Failed to load alerts: ${err.message}`,
        alerts: [] // Return empty array as fallback
      });
    }
    
    // Handle empty collection
    if (snapshot.empty) {
      return res.status(200).json({ alerts: [] });
    }
    
    const alerts = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt
    }));
    
    return res.status(200).json({ alerts });
  } catch (err) {
    console.error('Unexpected error in alerts endpoint:', err);
    return res.status(500).json({ 
      code: 'alerts_load_failed', 
      message: `Unexpected error: ${err.message}`,
      alerts: []
    });
  }
});

// ============================================================================
// SUB-STATIONS ROUTES
// ============================================================================

// GET /api/mes/substations - Get substations with optional filtering
router.get('/substations', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { stationId } = req.query;
    
    const db = getFirestore();
    let query = db.collection('mes-substations');
    
    if (stationId) {
      query = query.where('stationId', '==', stationId);
    }
    
    const snapshot = await query.orderBy('code').get();
    const substations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return { substations };
  }, res);
});

// POST /api/mes/substations/reset-all - TEST ONLY: Reset all substation currentOperation fields
router.post('/substations/reset-all', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const db = getFirestore();
    const now = new Date();
    
    console.log('🔧 TEST: Comprehensive reset - clearing substations, workers, and resetting assignments...');
    
    // Step 1: Get all substations with current workload
    const substationsSnapshot = await db.collection('mes-substations').get();
    const busySubstationIds = [];
    
    substationsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.currentOperation || data.currentWorkPackageId || data.currentPlanId || data.currentExpectedEnd) {
        busySubstationIds.push(doc.id);
      }
    });
    
    console.log(`  Found ${busySubstationIds.length} busy substation(s) to reset`);
    
    // Step 2: Get all workers with currentTask
    const workersSnapshot = await db.collection('mes-workers').get();
    const busyWorkerIds = [];
    
    workersSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.currentTask) {
        busyWorkerIds.push(doc.id);
      }
    });
    
    console.log(`  Found ${busyWorkerIds.length} busy worker(s) to reset`);
    
    // Step 3: Get all in-progress assignments
    const assignmentsSnapshot = await db.collection('mes-worker-assignments')
      .where('status', 'in', ['in_progress', 'paused'])
      .get();
    
    console.log(`  Found ${assignmentsSnapshot.size} active assignment(s) to reset`);
    
    // Step 4: Perform batch updates
    const batch = db.batch();
    let substationsCleared = 0;
    let workersCleared = 0;
    let assignmentsReset = 0;
    
    // Clear substations
    substationsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.currentOperation || data.currentWorkPackageId || data.currentPlanId || data.currentExpectedEnd) {
        batch.update(doc.ref, {
          currentOperation: admin.firestore.FieldValue.delete(),
          currentWorkPackageId: admin.firestore.FieldValue.delete(),
          currentPlanId: admin.firestore.FieldValue.delete(),
          currentExpectedEnd: admin.firestore.FieldValue.delete(),
          currentOperationUpdatedAt: now,
          updatedAt: now
        });
        substationsCleared++;
        console.log(`  - Clearing substation ${doc.id} (workPackage: ${data.currentWorkPackageId})`);
      }
    });
    
    // Clear workers
    workersSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.currentTask) {
        batch.update(doc.ref, {
          currentTask: admin.firestore.FieldValue.delete(),
          updatedAt: now
        });
        workersCleared++;
        console.log(`  - Clearing worker ${doc.id} (task: ${data.currentTask?.nodeId})`);
      }
    });
    
    // Reset assignments to 'pending' status
    assignmentsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      batch.update(doc.ref, {
        status: 'pending',
        actualStart: admin.firestore.FieldValue.delete(),
        pausedAt: admin.firestore.FieldValue.delete(),
        pausedBy: admin.firestore.FieldValue.delete(),
        pausedByName: admin.firestore.FieldValue.delete(),
        pauseContext: admin.firestore.FieldValue.delete(),
        pauseReason: admin.firestore.FieldValue.delete(),
        materialReservationStatus: 'pending',
        materialReservationTimestamp: admin.firestore.FieldValue.delete(),
        materialReservationResults: admin.firestore.FieldValue.delete(),
        actualReservedAmounts: admin.firestore.FieldValue.delete(),
        updatedAt: now,
        resetAt: now,
        resetBy: req.user?.email || 'system',
        resetReason: 'TEST: Manual reset via substations reset button'
      });
      assignmentsReset++;
      console.log(`  - Resetting assignment ${doc.id} to pending (was: ${data.status})`);
    });
    
    // Commit all changes
    if (substationsCleared > 0 || workersCleared > 0 || assignmentsReset > 0) {
      await batch.commit();
      console.log(`✅ Reset complete:`);
      console.log(`   - ${substationsCleared} substation(s) cleared`);
      console.log(`   - ${workersCleared} worker(s) freed`);
      console.log(`   - ${assignmentsReset} assignment(s) reset to pending`);
    } else {
      console.log('ℹ️ Nothing to reset - all clean');
    }
    
    return {
      success: true,
      clearedCount: substationsCleared,
      workersCleared,
      assignmentsReset,
      message: `Test sıfırlama: ${substationsCleared} alt istasyon, ${workersCleared} işçi, ${assignmentsReset} görev sıfırlandı`
    };
  }, res);
});

// PATCH /api/mes/substations/:id - Update substation status
router.patch('/substations/:id', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const updates = req.body;
    
    const db = getFirestore();
    
    // Verify substation exists
    const substationDoc = await db.collection('mes-substations').doc(id).get();
    if (!substationDoc.exists) {
      throw new Error('Substation not found');
    }

    const now = new Date();
    const updatedBy = req.user?.email || 'system';
    
    await db.collection('mes-substations').doc(id).update({
      ...updates,
      updatedAt: now,
      updatedBy
    });

    return { success: true, id, updatedAt: now.toISOString() };
  }, res);
});

// GET /api/mes/substations/:id/details - Get detailed info about a substation
router.get('/substations/:id/details', withAuth, async (req, res) => {
  await handleFirestoreOperation(async () => {
    const { id } = req.params;
    const db = getFirestore();
    
    // Get substation data
    const substationDoc = await db.collection('mes-substations').doc(id).get();
    if (!substationDoc.exists) {
      throw new Error('Substation not found');
    }
    
    const substation = { id: substationDoc.id, ...substationDoc.data() };
    const now = new Date();
    
    // Get current active assignment (in_progress status)
    const activeAssignmentsQuery = await db.collection('mes-worker-assignments')
      .where('substationId', '==', id)
      .where('status', '==', 'in_progress')
      .limit(1)
      .get();
    
    let currentTask = null;
    if (!activeAssignmentsQuery.empty) {
      const assignmentData = activeAssignmentsQuery.docs[0].data();
      const assignmentId = activeAssignmentsQuery.docs[0].id;
      
      // Get worker name
      let workerName = assignmentData.workerName || 'Belirsiz';
      if (assignmentData.workerId && !assignmentData.workerName) {
        const workerDoc = await db.collection('mes-workers').doc(assignmentData.workerId).get();
        if (workerDoc.exists) {
          workerName = workerDoc.data().name || assignmentData.workerId;
        }
      }
      
      // Calculate remaining time
      let timeRemaining = null;
      let expectedEnd = null;
      if (assignmentData.plannedEnd) {
        const endTime = assignmentData.plannedEnd?.toDate ? assignmentData.plannedEnd.toDate() : new Date(assignmentData.plannedEnd);
        expectedEnd = endTime.toISOString();
        const diffMs = endTime - now;
        if (diffMs > 0) {
          timeRemaining = Math.round(diffMs / 60000); // minutes
        }
      }
      
      currentTask = {
        assignmentId,
        workPackageId: assignmentData.workPackageId || assignmentId,
        nodeId: assignmentData.nodeId,
        operationName: assignmentData.operationName || assignmentData.name || 'İsimsiz Operasyon',
        workerId: assignmentData.workerId,
        workerName,
        planId: assignmentData.planId,
        workOrderCode: assignmentData.workOrderCode,
        actualStart: assignmentData.actualStart?.toDate?.()?.toISOString() || assignmentData.actualStart,
        plannedEnd: expectedEnd,
        timeRemaining, // in minutes
        materialInputs: assignmentData.preProductionReservedAmount || assignmentData.materialInputs || {},
        materialOutputs: assignmentData.plannedOutput || {}
      };
    }
    
    // Get upcoming assignments (pending, ready, or paused status)
    // Note: Don't use orderBy with where('status', 'in', [...]) to avoid index issues
    const upcomingAssignmentsQuery = await db.collection('mes-worker-assignments')
      .where('substationId', '==', id)
      .where('status', 'in', ['pending', 'ready', 'paused'])
      .limit(20)
      .get();
    
    // Sort in memory by plannedStart
    const upcomingTasks = upcomingAssignmentsQuery.docs
      .map(doc => {
        const data = doc.data();
        return {
          assignmentId: doc.id,
          workPackageId: data.workPackageId || doc.id,
          nodeId: data.nodeId,
          operationName: data.operationName || data.name || 'İsimsiz Operasyon',
          workerId: data.workerId,
          workerName: data.workerName || 'Belirsiz',
          planId: data.planId,
          workOrderCode: data.workOrderCode,
          status: data.status,
          plannedStart: data.plannedStart?.toDate?.()?.toISOString() || data.plannedStart,
          plannedEnd: data.plannedEnd?.toDate?.()?.toISOString() || data.plannedEnd,
          estimatedTime: data.estimatedEffectiveTime || data.effectiveTime || null
        };
      })
      .sort((a, b) => {
        const dateA = a.plannedStart ? new Date(a.plannedStart) : new Date(0);
        const dateB = b.plannedStart ? new Date(b.plannedStart) : new Date(0);
        return dateA - dateB;
      })
      .slice(0, 10); // Take first 10 after sorting
    
    // Get completed tasks for performance metrics (last 30 days)
    // Note: Filtering by date in memory to avoid composite index requirement
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const completedAssignmentsQuery = await db.collection('mes-worker-assignments')
      .where('substationId', '==', id)
      .where('status', '==', 'completed')
      .limit(100) // Get last 100 completed tasks
      .get();
    
    // Filter by date in memory
    const completedDocs = completedAssignmentsQuery.docs.filter(doc => {
      const actualEnd = doc.data().actualEnd;
      if (!actualEnd) return false;
      const endDate = actualEnd?.toDate ? actualEnd.toDate() : new Date(actualEnd);
      return endDate >= thirtyDaysAgo;
    });
    
    // Calculate performance metrics
    let totalCompleted = completedDocs.length;
    let avgDuration = null;
    let totalOutputQuantity = 0;
    let totalDefects = 0;
    
    if (totalCompleted > 0) {
      let totalDurationMs = 0;
      let validDurationCount = 0;
      
      completedDocs.forEach(doc => {
        const data = doc.data();
        
        // Calculate duration
        if (data.actualStart && data.actualEnd) {
          const start = data.actualStart?.toDate ? data.actualStart.toDate() : new Date(data.actualStart);
          const end = data.actualEnd?.toDate ? data.actualEnd.toDate() : new Date(data.actualEnd);
          const durationMs = end - start;
          if (durationMs > 0) {
            totalDurationMs += durationMs;
            validDurationCount++;
          }
        }
        
        // Accumulate output and defects
        if (typeof data.actualOutputQuantity === 'number') {
          totalOutputQuantity += data.actualOutputQuantity;
        }
        if (typeof data.defectQuantity === 'number') {
          totalDefects += data.defectQuantity;
        }
      });
      
      if (validDurationCount > 0) {
        avgDuration = Math.round(totalDurationMs / validDurationCount / 60000); // minutes
      }
    }
    
    // Calculate quality rate
    let qualityRate = null;
    if (totalOutputQuantity > 0) {
      qualityRate = ((totalOutputQuantity - totalDefects) / totalOutputQuantity * 100).toFixed(1);
    }
    
    return {
      substation: {
        id: substation.id,
        code: substation.code,
        stationId: substation.stationId,
        status: substation.status,
        currentOperation: substation.currentOperation,
        currentWorkPackageId: substation.currentWorkPackageId,
        currentExpectedEnd: substation.currentExpectedEnd
      },
      currentTask,
      upcomingTasks,
      performance: {
        totalCompleted,
        avgDuration, // in minutes
        totalOutputQuantity,
        totalDefects,
        qualityRate, // percentage string
        period: 'Son 30 gün'
      }
    };
  }, res);
});

// ============================================================================
// PRODUCTION PLAN LAUNCH ENDPOINT
// ============================================================================

/**
 * POST /api/mes/production-plans/:planId/launch
 * Launch a production plan with auto-assignment engine
 * 
 * Input: { workOrderCode }
 * - Validates approved quote exists and plan is ready
 * - Runs auto-assignment engine for all nodes
 * - Creates worker assignments
 * - Updates plan and quote status
 */
router.post('/production-plans/:planId/launch', withAuth, async (req, res) => {
  const { planId } = req.params;
  const { workOrderCode } = req.body;
  
  try {
    const db = getFirestore();
    const userEmail = req.user?.email || 'system';
    
    // ========================================================================
    // 1. INPUT VALIDATION
    // ========================================================================
    
    if (!planId || !workOrderCode) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'planId and workOrderCode are required'
      });
    }
    
    // Fetch plan document
    const planRef = db.collection('mes-production-plans').doc(planId);
    const planSnap = await planRef.get();
    
    if (!planSnap.exists) {
      return res.status(404).json({
        error: 'plan_not_found',
        message: `Production plan ${planId} not found`
      });
    }
    
    let planData = planSnap.data();
    
    // Check if plan is already launched
    if (planData.launchStatus === 'launched') {
      return res.status(409).json({
        error: 'already_launched',
        message: 'This plan has already been launched',
        launchedAt: planData.launchedAt,
        launchedBy: planData.launchedBy
      });
    }
    
    // Check if plan is cancelled
    if (planData.status === 'cancelled') {
      return res.status(422).json({
        error: 'plan_cancelled',
        message: 'Cannot launch a cancelled plan'
      });
    }
    
    // Validate plan status is 'production'
    if (planData.status !== 'production') {
      return res.status(422).json({
        error: 'invalid_status',
        message: `Plan status must be 'production', got '${planData.status}'`
      });
    }
    
    // Fetch approved quote
    const quotesSnapshot = await db.collection('mes-approved-quotes')
      .where('workOrderCode', '==', workOrderCode)
      .limit(1)
      .get();
    
    if (quotesSnapshot.empty) {
      return res.status(404).json({
        error: 'approved_quote_not_found',
        message: `${workOrderCode} için onaylı teklif bulunamadı. Önce quote'u Approved Quotes listesine ekleyin.`,
        workOrderCode
      });
    }
    
    const quoteDoc = quotesSnapshot.docs[0];
    const quoteData = quoteDoc.data();
    
    // ========================================================================
    // 2. LOAD PLAN NODES AND BUILD EXECUTION GRAPH
    // ========================================================================
    
    const nodesToUse = planData.nodes || [];
    
    console.log(`📊 Total nodes to process: ${nodesToUse.length}`);
    if (nodesToUse.length > 0) {
      const sampleNode = nodesToUse[0];
      console.log(`📊 Sample node structure:`, {
        id: sampleNode.nodeId,
        hasNodeId: !!sampleNode.nodeId,
        hasMaterialInputs: !!(sampleNode.materialInputs && sampleNode.materialInputs.length > 0),
        hasOutputQty: !!sampleNode.outputQty,
        materialInputsCount: sampleNode.materialInputs ? sampleNode.materialInputs.length : 0
      });
    }
    
    if (nodesToUse.length === 0) {
      return res.status(422).json({
        error: 'empty_plan',
        message: 'Cannot launch plan with no operations'
      });
    }
    
    // Build execution order using topological sort
    const executionOrder = buildTopologicalOrder(nodesToUse);
    
    if (executionOrder.error) {
      return res.status(400).json({
        error: 'execution_graph_error',
        message: executionOrder.error,
        details: executionOrder.details
      });
    }
    
    // ========================================================================
    // 3. LOAD LIVE DATA FOR ASSIGNMENT ENGINE
    // ========================================================================
    
    // First, get all workers to check their status values
    const allWorkersSnapshot = await db.collection('mes-workers').get();
    const allWorkers = allWorkersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`📊 Total workers in DB: ${allWorkers.length}`);
    if (allWorkers.length > 0) {
      console.log(`📊 Sample worker statuses:`, allWorkers.slice(0, 3).map(w => ({ name: w.name, status: w.status })));
    }
    
    // Load all workers/stations/substations, but don't rely on a specific string value
    // for the worker status at query time (some records may use different conventions).
    const [workersSnapshot, stationsSnapshot, substationsSnapshot] = await Promise.all([
      db.collection('mes-workers').get(),
      db.collection('mes-stations').where('status', '==', 'active').get(),
      db.collection('mes-substations').where('status', '==', 'active').get()
    ]);

    const rawWorkers = workersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const stations = stationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const substations = substationsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Normalize worker status and filter out workers that cannot be auto-assigned.
    // New status enum: 'available', 'busy', 'break', 'inactive'
    const nowIso = new Date().toISOString();
    function isOnLeave(w) {
      // Support several possible field shapes for backwards compatibility
      const leaveStart = w.leaveStart || (w.leave && w.leave.start) || null;
      const leaveEnd = w.leaveEnd || (w.leave && w.leave.end) || null;
      if (!leaveStart || !leaveEnd) return false;
      try {
        const s = new Date(leaveStart).toISOString();
        const e = new Date(leaveEnd).toISOString();
        return s <= nowIso && nowIso <= e;
      } catch (err) {
        return false;
      }
    }

    const workers = rawWorkers.map(w => {
      const copy = { ...w };
      // Provide default status = 'available' for older records
      copy.status = (copy.status || copy.availability || 'available').toString();
      // Normalize some common legacy values
      if (/active/i.test(copy.status)) copy.status = 'available';
      if (/enabled|on/i.test(copy.status)) copy.status = 'available';
      if (/off|inactive|removed/i.test(copy.status)) copy.status = 'inactive';
      if (/break|paused|rest/i.test(copy.status)) copy.status = 'break';
      if (/busy|working/i.test(copy.status)) copy.status = 'busy';
      // Attach computed onLeave flag
      copy.onLeave = isOnLeave(copy);
      return copy;
    });

    // Only workers with status 'available' or 'busy' and not on leave are eligible for auto-assignment
    const eligibleWorkers = workers.filter(w => (w.status === 'available' || w.status === 'busy') && !w.onLeave);

    console.log(`✅ Total workers in DB: ${rawWorkers.length}`);
    console.log(`✅ Eligible workers for assignment: ${eligibleWorkers.length}`);

    if (eligibleWorkers.length === 0) {
      // Provide helpful debug info in the response to aid troubleshooting
      return res.status(422).json({
        error: 'no_workers',
        message: 'No eligible workers available for assignment. Check worker.status and leave windows.',
        totalWorkers: rawWorkers.length,
        sample: workers.slice(0, 10).map(w => ({ id: w.id, name: w.name, status: w.status, onLeave: w.onLeave }))
      });
    }
    
    if (stations.length === 0) {
      return res.status(422).json({
        error: 'no_stations',
        message: 'No active stations available for assignment'
      });
    }
    
    // ========================================================================
    // 4. MATERIAL VALIDATION (NON-BLOCKING - WARNINGS ONLY)
    // ========================================================================
    
    const planQuantity = planData.quantity || 1;
    const materialValidation = await validateMaterialAvailabilityForLaunch(
      planData,
      planQuantity,
      db
    );
    
    // Material shortages are now warnings, not errors
    // Store warnings in response but continue with launch
    const materialWarnings = materialValidation.warnings || [];
    
    if (materialWarnings.length > 0) {
      console.warn(`⚠️ Material shortages detected (${materialWarnings.length} items) - proceeding with launch`);
    }
    
    // ========================================================================
    // 5. RUN AUTO-ASSIGNMENT ENGINE FOR EACH NODE
    // ========================================================================
    
    const assignments = [];
    const assignmentErrors = [];
    const assignmentWarnings = [];
    
    // Track assignments in this run to avoid conflicts
    const workerSchedule = new Map(); // workerId -> [{ start, end }]
    const substationSchedule = new Map(); // substationId -> [{ start, end }]
    const nodeEndTimes = new Map(); // nodeId -> plannedEnd timestamp (for dependency tracking)
    
    // Process nodes in topological order
    for (const nodeId of executionOrder.order) {
      const node = nodesToUse.find(n => n.nodeId === nodeId);
      if (!node) {
        assignmentErrors.push({
          nodeId,
          error: 'node_not_found',
          message: `Node ${nodeId} referenced in execution order but not found in plan`
        });
        continue;
      }
      
      try {
        const assignment = await assignNodeResources(
          node,
          eligibleWorkers,
          stations,
          substations,
          workerSchedule,
          substationSchedule,
          planData,
          nodeEndTimes, // Pass predecessor tracking map
          db // Pass db for fetching operations
        );
        
        if (assignment.error) {
          assignmentErrors.push({
            nodeId: node.nodeId,
            nodeName: node.name,
            error: assignment.error,
            message: assignment.message,
            details: assignment.details
          });
        } else {
          assignments.push(assignment);
          
          // Track node end time for successor dependencies
          nodeEndTimes.set(node.nodeId, new Date(assignment.plannedEnd));
          
          // Track warnings
          if (assignment.warnings && assignment.warnings.length > 0) {
            assignmentWarnings.push({
              nodeId: node.nodeId,
              nodeName: node.name,
              warnings: assignment.warnings
            });
          }
          
          // Update schedules to avoid conflicts
          const workerId = assignment.workerId;
          const substationId = assignment.substationId; // Use substation ID, not station ID
          
          if (!workerSchedule.has(workerId)) {
            workerSchedule.set(workerId, []);
          }
          workerSchedule.get(workerId).push({
            start: new Date(assignment.plannedStart),
            end: new Date(assignment.plannedEnd)
          });
          
          // CRITICAL FIX: Track substation schedule, not station schedule
          // This allows multiple substations of the same station to work in parallel
          if (substationId) {
            if (!substationSchedule.has(substationId)) {
              substationSchedule.set(substationId, []);
            }
            substationSchedule.get(substationId).push({
              start: new Date(assignment.plannedStart),
              end: new Date(assignment.plannedEnd)
            });
          }
        }
      } catch (error) {
        assignmentErrors.push({
          nodeId: node.nodeId,
          nodeName: node.name,
          error: 'assignment_exception',
          message: error.message
        });
      }
    }
    
    // If any node failed assignment, abort
    if (assignmentErrors.length > 0) {
      return res.status(422).json({
        error: 'assignment_failed',
        message: `Failed to assign resources for ${assignmentErrors.length} operation(s)`,
        errors: assignmentErrors,
        warnings: assignmentWarnings
      });
    }
    
    // ========================================================================
    // 6. CREATE WORKER ASSIGNMENTS IN BATCH
    // ========================================================================
    
    const batch = db.batch();
    const now = new Date();
    
    // Delete any stray assignments for this plan/WO (cleanup)
    const existingAssignments = await db.collection('mes-worker-assignments')
      .where('planId', '==', planId)
      .where('workOrderCode', '==', workOrderCode)
      .get();
    
    existingAssignments.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Generate all work package IDs at once (simple sequential numbering)
    const assignmentIds = generateWorkPackageIds(workOrderCode, assignments.length);
    
    // Create new assignments with work order-based IDs
    for (let i = 0; i < assignments.length; i++) {
      const assignment = assignments[i];
      const workPackageId = assignmentIds[i];
      const assignmentRef = db.collection('mes-worker-assignments').doc(workPackageId);
      
      // Prepare complete assignment document with required fields
      const completeAssignment = {
        ...assignment,
        id: workPackageId,
        workPackageId: workPackageId,  // ✅ Add explicit workPackageId field
        planId,
        workOrderCode,
        nodeId: assignment.nodeId,  // Direct access - no normalization needed
        substationId: assignment.substationId || null,  // ✅ Explicit null
        
        // ✅ PROMPT 11: FIFO scheduling fields (replace priorityIndex)
        expectedStart: assignment.plannedStart,  // Rename plannedStart → expectedStart
        priority: 2,  // Default: Normal priority (1=Low, 2=Normal, 3=High)
        optimizedIndex: null,  // Not optimized yet
        optimizedStart: null,  // No optimization result
        schedulingMode: 'fifo',  // Default scheduling mode
        
        isUrgent: false,  // ✅ Default to normal priority
        createdAt: now,
        createdBy: userEmail,
        updatedAt: now
      };
      
      // Validate assignment schema (now with id and planId)
      if (!validateAssignment(completeAssignment)) {
        const errors = validateAssignment.errors || [];
        console.error(`❌ Invalid assignment schema for ${workPackageId}:`, errors);
        
        // Check for critical errors
        const criticalErrors = errors.filter(err => 
          err.keyword === 'required' || err.keyword === 'type'
        );
        
        if (criticalErrors.length > 0) {
          throw new Error(
            `Schema validation failed for ${workPackageId}: ${
              criticalErrors.map(e => `${e.instancePath} ${e.message}`).join(', ')
            }`
          );
        }
        // Continue anyway for non-critical errors but log for monitoring
      }
      
      // DEBUG: Log assignment data being saved
      console.log(`🔍 DEBUG - Creating assignment ${workPackageId}:`);
      console.log(`   nodeId:`, completeAssignment.nodeId);
      console.log(`   substationId:`, completeAssignment.substationId);
      console.log(`   expectedStart:`, completeAssignment.expectedStart);
      console.log(`   priority:`, completeAssignment.priority);
      console.log(`   optimizedIndex:`, completeAssignment.optimizedIndex);
      console.log(`   schedulingMode:`, completeAssignment.schedulingMode);
      console.log(`   isUrgent:`, completeAssignment.isUrgent);
      console.log(`   preProductionReservedAmount:`, assignment.preProductionReservedAmount);
      console.log(`   plannedOutput:`, assignment.plannedOutput);
      console.log(`   materialReservationStatus:`, assignment.materialReservationStatus);
      
      batch.set(assignmentRef, completeAssignment);
    }
    
    // Update plan document with launch status
    batch.update(planRef, {
      launchStatus: 'launched',
      launchedAt: now,
      launchedBy: userEmail,
      assignmentCount: assignments.length,
      lastLaunchShortage: admin.firestore.FieldValue.delete(), // Clear any previous shortage
      updatedAt: now
    });
    
    // Update approved quote production state
    batch.update(quoteDoc.ref, {
      productionState: 'Üretiliyor',
      productionStateUpdatedAt: now,
      productionStateUpdatedBy: userEmail
    });
    
    // Commit all changes atomically
    await batch.commit();
    
    // ========================================================================
    // 7. EMIT EVENT FOR FRONTEND REFRESH
    // ========================================================================
    
    // Note: In a production setup, you would use Server-Sent Events, WebSocket,
    // or a pub/sub mechanism. For now, frontend will poll or check on navigation.
    console.log(`✓ Plan ${planId} launched with ${assignments.length} assignments`);
    
    // ========================================================================
    // 8. RETURN SUCCESS RESPONSE (with material warnings if any)
    // ========================================================================
    
    const response = {
      success: true,
      planId,
      workOrderCode,
      assignmentCount: assignments.length,
      assignmentIds,
      warnings: assignmentWarnings.length > 0 ? assignmentWarnings : undefined,
      launchedAt: now.toISOString(),
      launchedBy: userEmail,
      message: `Plan launched successfully with ${assignments.length} assignments`
    };
    
    // Add material warnings to response if any
    if (materialWarnings.length > 0) {
      response.warnings = {
        materialShortages: materialWarnings,
        assignmentWarnings: assignmentWarnings.length > 0 ? assignmentWarnings : undefined
      };
    }
    
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('Launch plan error:', error);
    
    // Check for specific error types
    if (error.status) {
      return res.status(error.status).json({
        error: error.code || 'launch_error',
        message: error.message
      });
    }
    
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to launch production plan',
      details: error.message
    });
  }
});

// ============================================================================
// PROMPT 5: URGENT PRIORITY ENDPOINT
// ============================================================================

/**
 * Set Urgent Priority
 * POST /api/mes/set-urgent-priority
 * 
 * Toggles isUrgent flag for a work order across:
 * - Production plans
 * - Worker assignments
 * - Approved quotes
 */
router.post('/set-urgent-priority', withAuth, async (req, res) => {
  try {
    const { workOrderCode, urgent } = req.body;
    
    // Validation
    if (!workOrderCode || typeof urgent !== 'boolean') {
      return res.status(400).json({ 
        error: 'validation_error',
        message: 'workOrderCode (string) and urgent (boolean) are required' 
      });
    }
    
    console.log(`⚡ Setting isUrgent=${urgent} for ${workOrderCode}`);
    
    const db = getFirestore();
    const batch = db.batch();
    let updateCount = 0;
    
    // 1. Update Production Plan (try both workOrderCode and orderCode)
    let planSnap = await db.collection('mes-production-plans')
      .where('workOrderCode', '==', workOrderCode)
      .where('status', 'in', ['production', 'in-progress'])
      .limit(1)
      .get();
    
    // Fallback to orderCode if workOrderCode not found
    if (planSnap.empty) {
      planSnap = await db.collection('mes-production-plans')
        .where('orderCode', '==', workOrderCode)
        .where('status', 'in', ['production', 'in-progress'])
        .limit(1)
        .get();
    }
    
    if (!planSnap.empty) {
      batch.update(planSnap.docs[0].ref, { 
        isUrgent: urgent,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      updateCount++;
      console.log(`  ✅ Updated plan: ${planSnap.docs[0].id}`);
    } else {
      console.warn(`  ⚠️ No active production plan found for ${workOrderCode}`);
    }
    
    // 2. Update Worker Assignments
    const assignmentSnap = await db.collection('mes-worker-assignments')
      .where('workOrderCode', '==', workOrderCode)
      .where('status', 'in', ['pending', 'in-progress'])
      .get();
    
    if (!assignmentSnap.empty) {
      assignmentSnap.docs.forEach(doc => {
        batch.update(doc.ref, { 
          isUrgent: urgent,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        updateCount++;
      });
      console.log(`  ✅ Updated ${assignmentSnap.size} worker assignment(s)`);
    } else {
      console.warn(`  ⚠️ No active assignments found for ${workOrderCode}`);
    }
    
    // 3. Update Approved Quote
    const quoteSnap = await db.collection('mes-approved-quotes')
      .where('workOrderCode', '==', workOrderCode)
      .limit(1)
      .get();
    
    if (!quoteSnap.empty) {
      batch.update(quoteSnap.docs[0].ref, { 
        isUrgent: urgent,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      updateCount++;
      console.log(`  ✅ Updated approved quote: ${quoteSnap.docs[0].id}`);
    } else {
      console.warn(`  ⚠️ No approved quote found for ${workOrderCode}`);
    }
    
    // Check if anything was updated
    if (updateCount === 0) {
      return res.status(404).json({
        error: 'not_found',
        message: `No active production data found for ${workOrderCode}`
      });
    }
    
    // Commit all updates
    await batch.commit();
    
    console.log(`✅ Successfully set isUrgent=${urgent} for ${workOrderCode} (${updateCount} document(s) updated)`);
    
    res.json({
      success: true,
      message: `Üretim planı ${urgent ? 'acil' : 'normal'} önceliğe alındı`,
      workOrderCode,
      updateCount,
      isUrgent: urgent
    });
    
  } catch (error) {
    console.error('❌ Set urgent priority error:', error);
    res.status(500).json({ 
      error: 'internal_error',
      message: 'Failed to set urgent priority',
      details: error.message 
    });
  }
});

// ============================================================================
// HELPER FUNCTIONS FOR LAUNCH ENDPOINT
// ============================================================================

/**
 * Build topological order from node predecessors
 * Detects cycles and validates prerequisites
 * Expects canonical schema: node.nodeId (not node.id)
 */
function buildTopologicalOrder(nodes) {
  // Use nodeId directly - no normalization needed
  const normalizedNodes = nodes.map(n => ({
    ...n,
    _id: n.nodeId
  }));
  
  const nodeMap = new Map(normalizedNodes.map(n => [n._id, n]));
  const inDegree = new Map();
  const adjacencyList = new Map();
  
  // Initialize
  normalizedNodes.forEach(node => {
    inDegree.set(node._id, 0);
    adjacencyList.set(node._id, []);
  });
  
  // Build graph
  normalizedNodes.forEach(node => {
    const predecessors = node.predecessors || [];
    
    // Validate all predecessors exist
    for (const predId of predecessors) {
      if (!nodeMap.has(predId)) {
        return {
          error: `Invalid predecessor: Node ${node._id} references non-existent predecessor ${predId}`,
          details: { nodeId: node._id, missingPredecessor: predId }
        };
      }
      
      // Add edge from predecessor to this node
      adjacencyList.get(predId).push(node._id);
      inDegree.set(node._id, inDegree.get(node._id) + 1);
    }
  });
  
  // Kahn's algorithm for topological sort
  const queue = [];
  const order = [];
  
  // Start with nodes that have no predecessors
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) {
      queue.push(nodeId);
    }
  });
  
  while (queue.length > 0) {
    const nodeId = queue.shift();
    order.push(nodeId);
    
    // Process successors
    const successors = adjacencyList.get(nodeId) || [];
    for (const successorId of successors) {
      const newDegree = inDegree.get(successorId) - 1;
      inDegree.set(successorId, newDegree);
      
      if (newDegree === 0) {
        queue.push(successorId);
      }
    }
  }
  
  // Check for cycles
  if (order.length !== normalizedNodes.length) {
    const remaining = normalizedNodes.filter(n => !order.includes(n._id)).map(n => n._id);
    return {
      error: 'Cycle detected in execution graph',
      details: { remainingNodes: remaining }
    };
  }
  
  return { order, success: true };
}

/**
 * Validate material availability for plan launch - NON-BLOCKING
 * Only checks materials for:
 * 1. Start nodes (nodes with no predecessors)
 * 2. Raw materials with codes starting with M-00 (regardless of node position)
 * Returns warnings array instead of throwing errors
 */
async function validateMaterialAvailabilityForLaunch(planData, planQuantity, db) {
  const nodes = planData.nodes || [];
  const materialSummary = planData.materialSummary || {};
  const materialInputs = materialSummary.materialInputs || [];
  
  if (materialInputs.length === 0 || nodes.length === 0) {
    return { warnings: [] };
  }
  
  // Build predecessor map to identify start nodes
  const predecessorMap = new Map();
  nodes.forEach(node => {
    predecessorMap.set(node.nodeId, node.predecessors || []);
  });
  
  // Identify start nodes (no predecessors)
  const startNodeIds = new Set(
    nodes.filter(node => !node.predecessors || node.predecessors.length === 0).map(n => n.id)
  );
  
  // Filter materials to check:
  // 1. Materials from start nodes
  // 2. Materials with code starting with M-00 (critical raw materials)
  const materialsToCheck = new Map();
  
  materialInputs.forEach(mat => {
    if (mat.isDerived) return; // Skip WIP materials
    
    const shouldCheck = 
      (mat.nodeId && startNodeIds.has(mat.nodeId)) || // From start node
      (mat.materialCode && mat.materialCode.startsWith('M-00')); // Critical raw material
    
    if (shouldCheck) {
      const key = mat.materialCode;
      const existing = materialsToCheck.get(key) || { 
        ...mat, 
        requiredQuantity: 0,
        nodeNames: new Set()
      };
      existing.requiredQuantity += (mat.requiredQuantity || 0) * planQuantity;
      if (mat.nodeName) existing.nodeNames.add(mat.nodeName);
      materialsToCheck.set(key, existing);
    }
  });
  
  if (materialsToCheck.size === 0) {
    return { warnings: [] };
  }
  
  // Fetch materials from database
  const materialCodes = Array.from(materialsToCheck.keys());
  const materialDocsPromises = materialCodes.map(code => 
    db.collection('materials').doc(code).get()
  );
  
  const materialDocs = await Promise.all(materialDocsPromises);
  
  // Build lookup map
  const materialMap = new Map();
  materialDocs.forEach((doc, index) => {
    const code = materialCodes[index];
    if (doc.exists) {
      materialMap.set(code, doc.data());
    }
  });
  
  // Check for shortages and build warnings array
  const warnings = [];
  
  for (const [code, mat] of materialsToCheck) {
    const materialData = materialMap.get(code);
    const available = materialData 
      ? parseFloat(materialData.stock || materialData.available) || 0
      : 0;
    
    // ✅ DOĞRU ALAN + FALLBACK
    const required = mat.requiredQuantity || mat.required || 0;
    
    if (required <= 0) {
      console.warn(`⚠️  Material ${code} has invalid required quantity:`, mat);
      continue;
    }
    
    if (available < required) {
      const nodeNamesList = Array.from(mat.nodeNames).join(', ');
      const shortage = Math.max(required - available, 0);
      
      warnings.push({
        nodeName: nodeNamesList || 'Unknown',
        materialCode: code,
        materialName: mat.name || code,
        required: parseFloat(required.toFixed(2)),
        available: parseFloat(available.toFixed(2)),
        shortage: parseFloat(shortage.toFixed(2)),
        unit: mat.unit || 'adet'
      });
    }
  }
  
  return { warnings };
}

/**
 * Validate material availability for plan launch
 * NOTE: Uses unified 'materials' collection (mes-materials has been removed)
 * DEPRECATED: Use validateMaterialAvailabilityForLaunch instead (non-blocking)
 */
async function validateMaterialAvailability(planData, planQuantity, db) {
  const materialSummary = planData.materialSummary || {};
  const materialInputs = materialSummary.materialInputs || [];
  
  if (materialInputs.length === 0) {
    return { allAvailable: true, shortages: [], details: [] };
  }
  
  // Aggregate materials by code to avoid duplicate lookups
  const aggregated = new Map();
  
  materialInputs.forEach(mat => {
    if (!mat.materialCode || mat.isDerived) return; // Skip WIP materials (they're produced in the plan)
    
    const key = mat.materialCode;
    const existing = aggregated.get(key) || { ...mat, requiredQuantity: 0 };
    existing.requiredQuantity += (mat.requiredQuantity || 0) * planQuantity;
    aggregated.set(key, existing);
  });
  
  // Fetch all materials in one batch to avoid multiple network calls
  const materialCodes = Array.from(aggregated.keys());
  const materialDocsPromises = materialCodes.map(code => 
    db.collection('materials').doc(code).get()
  );
  
  const materialDocs = await Promise.all(materialDocsPromises);
  
  // Build lookup map from fetched materials
  const materialMap = new Map();
  materialDocs.forEach((doc, index) => {
    const code = materialCodes[index];
    if (doc.exists) {
      materialMap.set(code, doc.data());
    }
  });
  
  // If primary lookup from 'materials' fails, optionally check legacy 'mes-materials' as fallback
  // This provides backward compatibility for any lingering legacy docs
  const missingCodes = materialCodes.filter(code => !materialMap.has(code));
  if (missingCodes.length > 0) {
    console.warn(`Materials not found in primary collection, checking legacy mes-materials: ${missingCodes.join(', ')}`);
    const legacyDocsPromises = missingCodes.map(code =>
      db.collection('mes-materials').doc(code).get().catch(() => null)
    );
    const legacyDocs = await Promise.all(legacyDocsPromises);
    
    legacyDocs.forEach((doc, index) => {
      if (doc && doc.exists) {
        const code = missingCodes[index];
        materialMap.set(code, doc.data());
        console.log(`✓ Found material ${code} in legacy mes-materials collection`);
      }
    });
  }
  
  // Check availability against fetched materials
  const shortages = [];
  const details = [];
  
  for (const [code, mat] of aggregated) {
    try {
      const materialData = materialMap.get(code);
      
      if (!materialData) {
        shortages.push({
          code,
          name: mat.name || code,
          required: mat.required,
          unit: mat.unit || '',
          available: 0,
          shortage: mat.required,
          message: 'Material not found in inventory'
        });
        continue;
      }
      
      // Use 'stock' field for availability (standard in materials collection)
      // Also check 'available' field for backward compatibility
      const available = parseFloat(materialData.stock || materialData.available) || 0;
      
      // ✅ DOĞRU ALAN + FALLBACK
      const required = mat.requiredQuantity || mat.required || 0;
      
      // Use material data from DB as source of truth for name/unit
      const materialName = materialData.name || mat.name || code;
      const materialUnit = materialData.unit || mat.unit || '';
      
      details.push({
        code,
        name: materialName,
        required,
        available,
        unit: materialUnit,
        isOk: available >= required
      });
      
      if (available < required) {
        shortages.push({
          code,
          name: materialName,
          required,
          available,
          shortage: required - available,
          unit: materialUnit
        });
      }
    } catch (error) {
      console.error(`Error checking material ${code}:`, error);
      shortages.push({
        code,
        name: mat.name || code,
        required: mat.required,
        unit: mat.unit || '',
        available: 0,
        shortage: mat.required,
        message: `Error checking availability: ${error.message}`
      });
    }
  }
  
  return {
    allAvailable: shortages.length === 0,
    shortages,
    details
  };
}

/**
 * Helper function: Adjust start time to next valid work block
 * If startTime falls within a break or outside schedule, move it to next work block
 * 
 * @param {Date} startTime - Proposed start time
 * @param {Array} scheduleBlocks - Array of { type: 'work'|'break', start: 'HH:MM', end: 'HH:MM' }
 * @returns {Date} - Adjusted start time
 */
function adjustStartTimeForSchedule(startTime, scheduleBlocks) {
  if (!scheduleBlocks || scheduleBlocks.length === 0) {
    return startTime; // No schedule constraints
  }
  
  const hour = startTime.getHours();
  const minute = startTime.getMinutes();
  const timeInMinutes = hour * 60 + minute;
  
  // Find if current time is within a work block
  for (const block of scheduleBlocks) {
    if (block.type !== 'work' || !block.start || !block.end) continue;
    
    const [startHour, startMin] = block.start.split(':').map(Number);
    const [endHour, endMin] = block.end.split(':').map(Number);
    const blockStart = startHour * 60 + startMin;
    const blockEnd = endHour * 60 + endMin;
    
    // If within work block, use as-is
    if (timeInMinutes >= blockStart && timeInMinutes < blockEnd) {
      return startTime;
    }
  }
  
  // Not in a work block - find next work block
  const workBlocks = scheduleBlocks
    .filter(b => b.type === 'work' && b.start && b.end)
    .map(b => {
      const [startHour, startMin] = b.start.split(':').map(Number);
      return {
        startMinutes: startHour * 60 + startMin,
        startHour,
        startMin
      };
    })
    .sort((a, b) => a.startMinutes - b.startMinutes);
  
  // Find first work block after current time
  for (const wb of workBlocks) {
    if (wb.startMinutes > timeInMinutes) {
      const adjusted = new Date(startTime);
      adjusted.setHours(wb.startHour, wb.startMin, 0, 0);
      return adjusted;
    }
  }
  
  // All work blocks are before current time - move to next day's first work block
  if (workBlocks.length > 0) {
    const nextDay = new Date(startTime);
    nextDay.setDate(nextDay.getDate() + 1);
    nextDay.setHours(workBlocks[0].startHour, workBlocks[0].startMin, 0, 0);
    return nextDay;
  }
  
  // No work blocks defined - return original time
  return startTime;
}

/**
 * Helper function: Calculate end time considering breaks and work schedule
 * Skips break periods and non-work hours when calculating task duration
 * 
 * @param {Date} startTime - Task start time (must be in a work block)
 * @param {number} durationInMinutes - Net work time required
 * @param {Array} scheduleBlocks - Array of { type: 'work'|'break', start: 'HH:MM', end: 'HH:MM' }
 * @returns {Date} - Actual end time considering breaks
 */
function calculateEndTimeWithBreaks(startTime, durationInMinutes, scheduleBlocks) {
  if (!scheduleBlocks || scheduleBlocks.length === 0) {
    // No schedule constraints - simple addition
    return new Date(startTime.getTime() + durationInMinutes * 60000);
  }
  
  let remainingDuration = durationInMinutes;
  let currentTime = new Date(startTime);
  
  // Get work blocks sorted by start time
  const workBlocks = scheduleBlocks
    .filter(b => b.type === 'work' && b.start && b.end)
    .map(b => {
      const [startHour, startMin] = b.start.split(':').map(Number);
      const [endHour, endMin] = b.end.split(':').map(Number);
      return {
        startHour,
        startMin,
        endHour,
        endMin,
        startMinutes: startHour * 60 + startMin,
        endMinutes: endHour * 60 + endMin
      };
    })
    .sort((a, b) => a.startMinutes - b.startMinutes);
  
  if (workBlocks.length === 0) {
    // No work blocks - simple addition
    return new Date(startTime.getTime() + durationInMinutes * 60000);
  }
  
  // Iterate through work blocks until duration is consumed
  while (remainingDuration > 0) {
    const hour = currentTime.getHours();
    const minute = currentTime.getMinutes();
    const currentMinutes = hour * 60 + minute;
    
    // Find current or next work block
    let currentBlock = null;
    let nextBlock = null;
    
    for (const wb of workBlocks) {
      if (currentMinutes >= wb.startMinutes && currentMinutes < wb.endMinutes) {
        currentBlock = wb;
        break;
      } else if (currentMinutes < wb.startMinutes) {
        nextBlock = wb;
        break;
      }
    }
    
    if (currentBlock) {
      // We're in a work block - calculate how much time we can work here
      const blockEndMinutes = currentBlock.endMinutes;
      const workableMinutes = blockEndMinutes - currentMinutes;
      
      if (remainingDuration <= workableMinutes) {
        // Task finishes in this block
        currentTime = new Date(currentTime.getTime() + remainingDuration * 60000);
        remainingDuration = 0;
      } else {
        // Task continues beyond this block
        remainingDuration -= workableMinutes;
        // Move to end of this block
        currentTime.setHours(currentBlock.endHour, currentBlock.endMin, 0, 0);
        
        // Find next work block
        const nextBlockIndex = workBlocks.findIndex(wb => wb.startMinutes > currentBlock.endMinutes);
        if (nextBlockIndex === -1) {
          // No more work blocks today - move to next day's first block
          currentTime.setDate(currentTime.getDate() + 1);
          currentTime.setHours(workBlocks[0].startHour, workBlocks[0].startMin, 0, 0);
        } else {
          // Move to next work block
          const nextWb = workBlocks[nextBlockIndex];
          currentTime.setHours(nextWb.startHour, nextWb.startMin, 0, 0);
        }
      }
    } else if (nextBlock) {
      // We're in a break or before schedule - jump to next work block
      currentTime.setHours(nextBlock.startHour, nextBlock.startMin, 0, 0);
    } else {
      // Past all work blocks today - move to next day's first block
      currentTime.setDate(currentTime.getDate() + 1);
      currentTime.setHours(workBlocks[0].startHour, workBlocks[0].startMin, 0, 0);
    }
  }
  
  return currentTime;
}

/**
 * Assign worker, station, and substation to a node using auto-assignment rules
 * Now respects predecessor dependencies for scheduling
 */
async function assignNodeResources(
  node,
  workers,
  stations,
  substations,
  workerSchedule,
  substationSchedule,
  planData,
  nodeEndTimes = new Map(), // Track when predecessor nodes finish
  db = null // Database instance for fetching operations
) {
  // CANONICAL: Support multiple field names for backward compatibility
  // Canonical: requiredSkills, Legacy: skills
  const requiredSkills = node.requiredSkills || node.skills || [];
  
  // CANONICAL: effectiveTime (computed with efficiency) or nominalTime
  const effectiveTime = node.effectiveTime 
    ? parseFloat(node.effectiveTime)
    : parseFloat(node.nominalTime || 60);
  
  const nominalTime = parseFloat(node.nominalTime || 60);
  
  // ========================================================================
  // STATION & SUBSTATION SELECTION (Priority-based with smart allocation)
  // ========================================================================
  
  let selectedStation = null;
  let selectedSubstation = null;
  
  // Get assigned stations array (priority order)
  const assignedStations = Array.isArray(node.assignedStations) ? node.assignedStations : [];
  
  if (assignedStations.length > 0) {
    // Sort by priority (1 = highest priority)
    const sortedStations = [...assignedStations].sort((a, b) => a.priority - b.priority);
    
    console.log(`Node ${node.nodeId}: Checking ${sortedStations.length} stations in priority order`);
    
    // Try each station in priority order
    for (const stationInfo of sortedStations) {
      // SCHEMA: Support both stationId (new) and id (legacy)
      const stationId = stationInfo.stationId || stationInfo.id;
      const station = stations.find(s => s.id === stationId);
      if (!station) {
        console.warn(`Station ${stationId} not found, skipping`);
        continue;
      }
      
      // Get substations for this station
      const stationSubstations = substations.filter(ss => ss.stationId === station.id);
      
      if (stationSubstations.length === 0) {
        console.warn(`Station ${station.id} has no substations, skipping`);
        continue;
      }
      
      // Check for available substation (currentOperation == null)
      const availableSubstation = stationSubstations.find(ss => !ss.currentOperation);
      
      if (availableSubstation) {
        // Found available substation!
        selectedStation = station;
        selectedSubstation = availableSubstation;
        console.log(`✅ Selected available substation: ${availableSubstation.code} at station ${station.name} (priority ${stationInfo.priority})`);
        break;
      }
    }
    
    // If no available substations found, queue to earliest finishing substation
    if (!selectedStation || !selectedSubstation) {
      console.log(`All substations busy, finding earliest available...`);
      
      let earliestSubstation = null;
      let earliestEnd = null;
      
      for (const stationInfo of sortedStations) {
        // SCHEMA: Support both stationId (new) and id (legacy)
        const stationId = stationInfo.stationId || stationInfo.id;
        const station = stations.find(s => s.id === stationId);
        if (!station) continue;
        
        const stationSubstations = substations.filter(ss => ss.stationId === station.id);
        
        for (const ss of stationSubstations) {
          // Calculate the last end time considering both current operation and queued tasks
          let lastEndTime = new Date();
          
          // Check physical current operation
          if (ss.currentExpectedEnd) {
            const currentEnd = new Date(ss.currentExpectedEnd);
            if (currentEnd > lastEndTime) {
              lastEndTime = currentEnd;
            }
          }
          
          // Check queued tasks in substationSchedule for this substation
          const substationQueue = substationSchedule.get(ss.id) || [];
          if (substationQueue.length > 0) {
            const lastQueued = substationQueue[substationQueue.length - 1];
            if (lastQueued.end > lastEndTime) {
              lastEndTime = lastQueued.end;
            }
          }
          
          if (!earliestEnd || lastEndTime < earliestEnd) {
            earliestEnd = lastEndTime;
            earliestSubstation = ss;
            selectedStation = station;
          }
        }
      }
      
      if (earliestSubstation) {
        selectedSubstation = earliestSubstation;
        console.log(`⏳ Queued to substation ${earliestSubstation.code} at station ${selectedStation.name} (earliest finish: ${earliestEnd?.toISOString()})`);
      } else {
        console.warn(`No substations with expected end times found, using first substation of first station`);
        const firstStation = stations.find(s => s.id === sortedStations[0].id);
        if (firstStation) {
          selectedStation = firstStation;
          const firstSubstation = substations.find(ss => ss.stationId === firstStation.id);
          if (firstSubstation) {
            selectedSubstation = firstSubstation;
          }
        }
      }
    }
  } else {
    // No stations assigned - use fallback logic
    console.warn(`Node ${node.nodeId} has no assignedStations, using fallback logic`);
    
    // Fallback: Pick station with least load
    if (!selectedStation) {
      const stationsWithLoad = stations.map(s => ({
        station: s,
        load: 0  // ⚠️ Fallback doesn't have substation info, set load to 0
      }));
      
      stationsWithLoad.sort((a, b) => a.load - b.load);
      selectedStation = stationsWithLoad[0]?.station;
      
      if (selectedStation) {
        console.log(`Auto-selected station by least load: ${selectedStation.name} (${selectedStation.id})`);
      }
    }
  }
  
  if (!selectedStation) {
    const compatibleStations = assignedStations.map(s => s.stationId || s.id).join(', ');
    const stationDetails = assignedStations.map(s => {
      const stId = s.stationId || s.id;
      const st = stations.find(st => st.id === stId);
      const subs = substations.filter(ss => ss.stationId === stId);
      return `${stId} (${subs.length} substations)`;
    }).join(', ');
    
    return {
      error: 'no_station_available',
      message: `No station available for node '${node.name || node.nodeId}'. All compatible stations [${stationDetails}] are fully booked or have no available substations.`,
      details: {
        assignedStations: assignedStations.map(s => s.stationId || s.id),
        totalStations: stations.length,
        totalSubstations: substations.length
      }
    };
  }
  
  // If no substation selected yet and using legacy assignment, try to get one
  if (!selectedSubstation) {
    const assignedSubstations = Array.isArray(node.assignedSubstations) ? node.assignedSubstations : [];
    
    if (assignedSubstations.length > 0) {
      // Use first assigned substation (legacy behavior)
      for (const substationId of assignedSubstations) {
        const sub = substations.find(s => s.id === substationId && s.stationId === selectedStation.id);
        if (sub) {
          selectedSubstation = sub;
          console.log(`Using legacy assigned substation: ${sub.code} (${sub.id})`);
          break;
        }
      }
    }
  }
  
  // ========================================================================
  // WORKER SELECTION
  // ========================================================================
  // WORKER SELECTION
  // ========================================================================
  
  let selectedWorker = null;
  const assignmentMode = node.assignmentMode || 'auto'; // Schema-compliant field
  const manualWorkerId = node.assignedWorkerId;
  
  if (assignmentMode === 'manual' && manualWorkerId) {
    // Manual allocation with worker ID from plan design
    selectedWorker = workers.find(w => w.id === manualWorkerId);
    
    if (!selectedWorker) {
      // Fallback to auto if assigned worker not found
      console.warn(`Assigned worker ${manualWorkerId} not found, falling back to auto`);
    }
  }
  
  if (!selectedWorker && requiredSkills.length > 0) {
    // Auto selection: find workers with matching skills
    const candidates = workers.filter(w => {
      const workerSkills = w.skills || [];
      return requiredSkills.every(skill => workerSkills.includes(skill));
    });
    
    if (candidates.length === 0) {
      // Gather available worker skills for debugging
      const availableSkills = new Set();
      workers.forEach(w => {
        const skills = w.skills || [];
        skills.forEach(skill => availableSkills.add(skill));
      });
      
      return {
        error: 'no_qualified_workers',
        message: `No eligible workers found for node '${node.name || node.nodeId}'. Reason: Required skills [${requiredSkills.join(', ')}] not found in any available worker.`,
        details: { 
          requiredSkills,
          availableSkills: Array.from(availableSkills),
          totalWorkers: workers.length
        }
      };
    }
    
    // Sort by skill count (least skills first), workload, then efficiency
    const candidatesWithLoad = candidates.map(w => ({
      worker: w,
      skillCount: (w.skills || []).length,
      load: (workerSchedule.get(w.id) || []).length,
      efficiency: w.efficiency || 1.0
    }));
    
    candidatesWithLoad.sort((a, b) => {
      // 1. Prefer workers with fewer total skills (avoid wasting versatile workers)
      if (a.skillCount !== b.skillCount) return a.skillCount - b.skillCount;
      // 2. Prefer less loaded workers
      if (a.load !== b.load) return a.load - b.load;
      // 3. Then prefer higher efficiency
      return b.efficiency - a.efficiency;
    });
    
    selectedWorker = candidatesWithLoad[0].worker;
  } else if (!selectedWorker) {
    // No skills required, pick any worker
    const candidatesWithLoad = workers.map(w => ({
      worker: w,
      load: (workerSchedule.get(w.id) || []).length
    }));
    
    candidatesWithLoad.sort((a, b) => a.load - b.load);
    selectedWorker = candidatesWithLoad[0]?.worker;
  }
  
  if (!selectedWorker) {
    return {
      error: 'no_worker_available',
      message: 'No worker available for assignment'
    };
  }
  
  // ========================================================================
  // TIME CALCULATION WITH DEPENDENCY TRACKING
  // ========================================================================
  
  // CANONICAL: Use effectiveTime from node (already efficiency-adjusted) for scheduling
  // Only apply worker/station efficiency if effectiveTime not already computed
  let schedulingTime = effectiveTime; // Use the effectiveTime computed at top of function
  
  if (!node.effectiveTime) {
    // Fallback: If node doesn't have pre-computed effectiveTime, apply efficiencies now
    const workerEfficiency = selectedWorker.efficiency || 1.0;
    const stationEfficiency = selectedStation.efficiency || 1.0;
    const combinedEfficiency = workerEfficiency * stationEfficiency;
    schedulingTime = combinedEfficiency > 0 ? nominalTime / combinedEfficiency : nominalTime;
  }
  
  // Find next available time slot for this worker
  const workerAssignments = workerSchedule.get(selectedWorker.id) || [];
  // CRITICAL FIX: Use substation ID instead of station ID for scheduling
  // This allows multiple substations of the same station to work in parallel
  const substationAssignments = selectedSubstation 
    ? (substationSchedule.get(selectedSubstation.id) || [])
    : [];
  const now = new Date();
  
  // Calculate earliest start time based on multiple constraints:
  // 1. Worker availability (after their last assignment)
  // 2. Substation availability (after substation's last assignment)
  // 3. Predecessor dependencies (after all predecessors finish)
  
  let earliestWorkerStart = now;
  if (workerAssignments.length > 0) {
    const lastWorkerEnd = workerAssignments[workerAssignments.length - 1].end;
    if (lastWorkerEnd > earliestWorkerStart) {
      earliestWorkerStart = lastWorkerEnd;
    }
  }
  
  let earliestSubstationStart = now;
  if (substationAssignments.length > 0) {
    const lastSubstationEnd = substationAssignments[substationAssignments.length - 1].end;
    if (lastSubstationEnd > earliestSubstationStart) {
      earliestSubstationStart = lastSubstationEnd;
    }
  }
  
  // Check predecessor dependencies
  let earliestPredecessorEnd = now;
  const predecessors = node.predecessors || [];
  if (predecessors.length > 0) {
    for (const predId of predecessors) {
      const predEnd = nodeEndTimes.get(predId);
      if (predEnd && predEnd > earliestPredecessorEnd) {
        earliestPredecessorEnd = predEnd;
      }
    }
  }
  
  // Start time is the maximum of all constraints
  let startTime = new Date(Math.max(
    earliestWorkerStart.getTime(),
    earliestSubstationStart.getTime(),
    earliestPredecessorEnd.getTime()
  ));
  
  // ========================================================================
  // ADJUST START TIME FOR WORKER SCHEDULE (Madde 6)
  // ========================================================================
  
  // Get worker's schedule blocks for the start day
  let scheduleBlocks = [];
  if (selectedWorker.personalSchedule && selectedWorker.personalSchedule.blocks) {
    const dayName = startTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    scheduleBlocks = selectedWorker.personalSchedule.blocks[dayName] || [];
  }
  
  // Adjust start time to next valid work block if needed
  if (scheduleBlocks.length > 0) {
    const adjustedStart = adjustStartTimeForSchedule(startTime, scheduleBlocks);
    if (adjustedStart.getTime() !== startTime.getTime()) {
      console.log(`⏰ Adjusted start time from ${startTime.toISOString()} to ${adjustedStart.toISOString()} to fit worker schedule`);
      startTime = adjustedStart;
    }
  }
  
  // ========================================================================
  // CALCULATE END TIME WITH BREAKS (Madde 6)
  // ========================================================================
  
  // CANONICAL: Use schedulingTime (effectiveTime from node or computed with efficiency)
  let endTime;
  if (scheduleBlocks.length > 0) {
    endTime = calculateEndTimeWithBreaks(startTime, schedulingTime, scheduleBlocks);
    console.log(`⏰ Calculated end time with breaks: ${endTime.toISOString()} (scheduling time: ${schedulingTime} min)`);
  } else {
    // No schedule constraints - simple addition
    endTime = new Date(startTime.getTime() + schedulingTime * 60000);
  }
  
  // ========================================================================
  // BUILD ASSIGNMENT
  // ========================================================================
  
  const warnings = [];
  
  // Note: We no longer need the old schedule validation since we've adjusted times
  // But we can add a warning if the task spans multiple days due to breaks
  if (scheduleBlocks.length > 0) {
    const daysDiff = Math.floor((endTime.getTime() - startTime.getTime()) / (24 * 60 * 60 * 1000));
    if (daysDiff > 0) {
      warnings.push(`Task spans ${daysDiff + 1} days due to work schedule constraints`);
    }
  }
  
  // ========================================================================
  // MATERIAL RESERVATION CALCULATIONS
  // ========================================================================
  
  // Fetch operation to get expectedDefectRate if db is available
  let expectedDefectRate = 0;
  if (db && node.operationId) {
    try {
      const operationDoc = await db.collection('mes-operations').doc(node.operationId).get();
      if (operationDoc.exists) {
        const operationData = operationDoc.data();
        expectedDefectRate = operationData.expectedDefectRate || 0;
      }
    } catch (err) {
      console.warn(`Failed to fetch operation ${node.operationId}:`, err.message);
    }
  }
  
  // Calculate pre-production reserved amounts (rehin miktarı)
  const planQuantity = planData.quantity || 1;
  
  const normalizedNodeId = node.nodeId;
  
  console.log(`🔍 DEBUG - assignNodeResources for node ${normalizedNodeId}:`);
  console.log(`   node.materialInputs:`, node.materialInputs);
  
  const preProductionReservedAmount = calculatePreProductionReservedAmount(
    node,
    expectedDefectRate,
    planQuantity
  );
  
  console.log(`   preProductionReservedAmount:`, preProductionReservedAmount);
  
  // Calculate planned output
  const plannedOutput = calculatePlannedOutput(node, planQuantity);
  
  // DEBUG: Log calculated values
  console.log(`🔍 DEBUG - Final assignment values for node ${normalizedNodeId}:`);
  console.log(`   Node structure: nodeId=${normalizedNodeId}`);
  console.log(`   Expected Defect Rate: ${expectedDefectRate}%`);
  console.log(`   Plan Quantity: ${planQuantity}`);
  console.log(`   Material Inputs Count: ${node.materialInputs ? node.materialInputs.length : 0}`);
  console.log(`   Output Qty: ${node.outputQty}`);
  console.log(`   preProductionReservedAmount:`, preProductionReservedAmount);
  console.log(`   plannedOutput:`, plannedOutput);
  
  return {
    nodeId: normalizedNodeId,
    nodeName: node.name,
    operationId: node.operationId,
    workerId: selectedWorker.id,
    workerName: selectedWorker.name,
    stationId: selectedStation.id,
    stationName: selectedStation.name,
    substationId: selectedSubstation ? selectedSubstation.id : null,
    substationCode: selectedSubstation ? selectedSubstation.code : null,
    plannedStart: startTime.toISOString(),
    plannedEnd: endTime.toISOString(),
    nominalTime, // CANONICAL: nominalTime (base time without efficiency)
    effectiveTime: schedulingTime, // CANONICAL: effectiveTime (efficiency-adjusted time)
    status: 'pending',
    // Material reservation fields
    preProductionReservedAmount: Object.keys(preProductionReservedAmount).length > 0 
      ? preProductionReservedAmount 
      : null,
    plannedOutput: Object.keys(plannedOutput).length > 0 
      ? plannedOutput 
      : null,
    materialReservationStatus: 'pending', // pending, reserved, consumed
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

// ============================================================================
// PRODUCTION PLAN CONTROL ENDPOINTS (PAUSE/RESUME/CANCEL)
// ============================================================================

/**
 * POST /api/mes/production-plans/:planId/pause
 * Pause all assignments for a production plan
 * - Sets all assignment statuses to 'paused'
 * - Preserves actualStart for in-progress tasks
 * - Clears worker.currentTask and station.currentOperation
 */
router.post('/production-plans/:planId/pause', withAuth, async (req, res) => {
  const { planId } = req.params;
  
  try {
    const db = getFirestore();
    const userEmail = req.user?.email || 'system';
    const now = new Date();
    
    // Fetch plan
    const planRef = db.collection('mes-production-plans').doc(planId);
    const planSnap = await planRef.get();
    
    if (!planSnap.exists) {
      return res.status(404).json({
        error: 'plan_not_found',
        message: `Production plan ${planId} not found`
      });
    }
    
    const planData = planSnap.data();
    
    // Check if plan is launched
    if (planData.launchStatus !== 'launched') {
      return res.status(422).json({
        error: 'not_launched',
        message: 'Cannot pause a plan that has not been launched'
      });
    }
    
    // Check if already paused
    if (planData.launchStatus === 'paused') {
      return res.status(409).json({
        error: 'already_paused',
        message: 'Plan is already paused'
      });
    }
    
    // Fetch all assignments for this plan
    const assignmentsSnapshot = await db.collection('mes-worker-assignments')
      .where('planId', '==', planId)
      .get();
    
    if (assignmentsSnapshot.empty) {
      return res.status(404).json({
        error: 'no_assignments',
        message: 'No assignments found for this plan'
      });
    }
    
    // Collect unique workers, stations, and substations to update
    const workersToUpdate = new Set();
    const stationsToUpdate = new Set();
    const substationsToUpdate = new Set();
    
    const batch = db.batch();
    let pausedCount = 0;
    let alreadyCompleteCount = 0;
    
    // Update all assignments
    assignmentsSnapshot.docs.forEach(doc => {
      const assignment = doc.data();
      
      // Skip if already completed or cancelled
      if (assignment.status === 'completed' || assignment.status === 'cancelled') {
        alreadyCompleteCount++;
        return;
      }
      
      // Pause the assignment, preserve actualStart if it exists
      // Set pauseContext='plan' to distinguish admin pause from worker pause
      batch.update(doc.ref, {
        status: 'paused',
        pausedAt: now,
        pausedBy: userEmail,
        pausedByName: req.user?.displayName || userEmail,
        pauseContext: 'plan', // Admin-level pause
        pauseReason: 'Admin paused the production plan',
        updatedAt: now
      });
      
      pausedCount++;
      
      // Track resources to update (workers, stations, substations)
      if (assignment.workerId) workersToUpdate.add(assignment.workerId);
      if (assignment.stationId) stationsToUpdate.add(assignment.stationId);
      if (assignment.substationId) substationsToUpdate.add(assignment.substationId);
    });
    
    // Update worker currentTask status (keep assignment, just pause status)
    for (const workerId of workersToUpdate) {
      const workerRef = db.collection('mes-workers').doc(workerId);
      batch.update(workerRef, {
        'currentTask.status': 'paused',
        updatedAt: now
      });
    }
    
    // Update station currentOperation status (keep assignment, just pause status)
    for (const stationId of stationsToUpdate) {
      const stationRef = db.collection('mes-stations').doc(stationId);
      batch.update(stationRef, {
        'currentOperation.status': 'paused',
        updatedAt: now
      });
    }
    
    // Update substation currentOperation status
    for (const substationId of substationsToUpdate) {
      const substationRef = db.collection('mes-substations').doc(substationId);
      batch.update(substationRef, {
        'currentOperation.status': 'paused',
        updatedAt: now
      });
    }
    
    // Update plan status
    batch.update(planRef, {
      launchStatus: 'paused',
      pausedAt: now,
      pausedBy: userEmail,
      updatedAt: now
    });
    
    // Commit all changes
    await batch.commit();
    
    console.log(`✅ Paused production plan ${planId}`);
    console.log(`   Paused: ${pausedCount} assignments, Already complete: ${alreadyCompleteCount}`);
    console.log(`   Updated: ${workersToUpdate.size} workers, ${stationsToUpdate.size} stations, ${substationsToUpdate.size} substations`);
    
    // Update approved quote productionState to 'Üretim Durduruldu'
    if (planData.orderCode) {
      await updateApprovedQuoteProductionState(
        planData.orderCode,
        'Üretim Durduruldu',
        userEmail
      );
    }
    
    return res.status(200).json({
      success: true,
      planId,
      pausedCount,
      alreadyCompleteCount,
      workersCleared: workersToUpdate.size,
      stationsCleared: stationsToUpdate.size,
      pausedAt: now.toISOString(),
      pausedBy: userEmail,
      message: `Plan paused: ${pausedCount} assignment(s) paused, ${alreadyCompleteCount} already complete`
    });
    
  } catch (error) {
    console.error('Pause plan error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to pause production plan',
      details: error.message
    });
  }
});

/**
 * POST /api/mes/production-plans/:planId/resume
 * Resume all paused assignments for a production plan
 * - Sets paused assignments back to 'ready' or 'pending'
 * - If actualStart exists, set to 'in-progress'
 * - Does NOT automatically assign to workers/stations (worker portal handles that)
 */
router.post('/production-plans/:planId/resume', withAuth, async (req, res) => {
  const { planId } = req.params;
  
  try {
    const db = getFirestore();
    const userEmail = req.user?.email || 'system';
    const now = new Date();
    
    // Fetch plan
    const planRef = db.collection('mes-production-plans').doc(planId);
    const planSnap = await planRef.get();
    
    if (!planSnap.exists) {
      return res.status(404).json({
        error: 'plan_not_found',
        message: `Production plan ${planId} not found`
      });
    }
    
    const planData = planSnap.data();
    
    // Check if plan is paused
    if (planData.launchStatus !== 'paused') {
      return res.status(422).json({
        error: 'not_paused',
        message: 'Cannot resume a plan that is not paused'
      });
    }
    
    // Fetch all paused assignments for this plan
    const assignmentsSnapshot = await db.collection('mes-worker-assignments')
      .where('planId', '==', planId)
      .where('status', '==', 'paused')
      .get();
    
    const batch = db.batch();
    let resumedCount = 0;
    let skippedWorkerPauseCount = 0;
    
    // Update paused assignments (only those paused by admin)
    assignmentsSnapshot.docs.forEach(doc => {
      const assignment = doc.data();
      
      // Skip assignments paused by worker or station error (not admin plan pause)
      if (assignment.pauseContext && assignment.pauseContext !== 'plan') {
        skippedWorkerPauseCount++;
        return;
      }
      
      // Determine new status based on whether task was started
      let newStatus = 'pending'; // Default: not yet started
      
      if (assignment.actualStart) {
        // Was in progress when paused
        newStatus = 'in-progress';
      }
      
      batch.update(doc.ref, {
        status: newStatus,
        resumedAt: now,
        resumedBy: userEmail,
        updatedAt: now,
        // Clear pause metadata
        pauseContext: admin.firestore.FieldValue.delete(),
        pauseReason: admin.firestore.FieldValue.delete(),
        pausedAt: admin.firestore.FieldValue.delete(),
        pausedBy: admin.firestore.FieldValue.delete(),
        pausedByName: admin.firestore.FieldValue.delete()
      });
      
      resumedCount++;
    });
    
    // Update plan status back to launched
    batch.update(planRef, {
      launchStatus: 'launched',
      resumedAt: now,
      resumedBy: userEmail,
      updatedAt: now
    });
    
    // Commit all changes
    await batch.commit();
    
    // Update approved quote productionState to 'Üretiliyor'
    if (planData.orderCode) {
      await updateApprovedQuoteProductionState(
        planData.orderCode,
        'Üretiliyor',
        userEmail
      );
    }
    
    return res.status(200).json({
      success: true,
      planId,
      resumedCount,
      skippedWorkerPauseCount,
      resumedAt: now.toISOString(),
      resumedBy: userEmail,
      message: `Plan resumed: ${resumedCount} assignment(s) resumed, ${skippedWorkerPauseCount} worker-paused assignment(s) skipped`
    });
    
  } catch (error) {
    console.error('Resume plan error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to resume production plan',
      details: error.message
    });
  }
});

/**
 * POST /api/mes/production-plans/:planId/cancel
 * Cancel all assignments for a production plan
 * - Sets all non-completed assignments to 'cancelled'
 * - Marks plan launchStatus as 'cancelled'
 * - Clears worker.currentTask and station.currentOperation
 * - Updates approved quote productionState to 'İptal Edildi'
 */
router.post('/production-plans/:planId/cancel', withAuth, async (req, res) => {
  const { planId } = req.params;
  
  try {
    const db = getFirestore();
    const userEmail = req.user?.email || 'system';
    const now = new Date();
    
    // Fetch plan
    const planRef = db.collection('mes-production-plans').doc(planId);
    const planSnap = await planRef.get();
    
    if (!planSnap.exists) {
      return res.status(404).json({
        error: 'plan_not_found',
        message: `Production plan ${planId} not found`
      });
    }
    
    const planData = planSnap.data();
    const workOrderCode = planData.orderCode;
    
    // Check if plan is already cancelled
    if (planData.launchStatus === 'cancelled') {
      return res.status(409).json({
        error: 'already_cancelled',
        message: 'Plan is already cancelled'
      });
    }
    
    // Fetch all assignments for this plan
    const assignmentsSnapshot = await db.collection('mes-worker-assignments')
      .where('planId', '==', planId)
      .get();
    
    // Collect unique workers and stations to update
    const workersToUpdate = new Set();
    const stationsToUpdate = new Set();
    
    const batch = db.batch();
    let cancelledCount = 0;
    let pendingReportCount = 0;
    let alreadyCompleteCount = 0;
    
    // Cancel all non-completed assignments
    assignmentsSnapshot.docs.forEach(doc => {
      const assignment = doc.data();
      
      // Skip if already completed
      if (assignment.status === 'completed') {
        alreadyCompleteCount++;
        return;
      }
      
      // Check if task has started (has actualStart or is in_progress)
      const hasStarted = assignment.actualStart || assignment.status === 'in_progress';
      
      if (hasStarted) {
        // Set to cancelled_pending_report to allow scrap reporting
        // Also set actualEnd to record when cancellation happened
        batch.update(doc.ref, {
          status: 'cancelled_pending_report',
          finishContext: 'cancelled',
          cancelledAt: now,
          actualEnd: now, // Record cancellation as end time
          cancelledBy: userEmail,
          updatedAt: now
        });
        pendingReportCount++;
      } else {
        // Never started - set to cancelled immediately
        batch.update(doc.ref, {
          status: 'cancelled',
          cancelledAt: now,
          cancelledBy: userEmail,
          updatedAt: now
        });
        cancelledCount++;
      }
      
      // Track resources to clear (only for tasks that weren't started)
      if (!hasStarted) {
        if (assignment.workerId) workersToUpdate.add(assignment.workerId);
        if (assignment.stationId) stationsToUpdate.add(assignment.stationId);
      }
    });
    
    // Clear worker currentTask for affected workers
    for (const workerId of workersToUpdate) {
      const workerRef = db.collection('mes-workers').doc(workerId);
      batch.update(workerRef, {
        currentTask: null,
        currentTaskUpdatedAt: now
      });
    }
    
    // Clear station currentOperation for affected stations
    for (const stationId of stationsToUpdate) {
      const stationRef = db.collection('mes-stations').doc(stationId);
      batch.update(stationRef, {
        currentOperation: null,
        currentOperationUpdatedAt: now
      });
    }
    
    // Update plan status
    batch.update(planRef, {
      launchStatus: 'cancelled',
      cancelledAt: now,
      cancelledBy: userEmail,
      updatedAt: now
    });
    
    // Update approved quote productionState if workOrderCode exists
    if (workOrderCode) {
      const quotesSnapshot = await db.collection('mes-approved-quotes')
        .where('workOrderCode', '==', workOrderCode)
        .limit(1)
        .get();
      
      if (!quotesSnapshot.empty) {
        const quoteDoc = quotesSnapshot.docs[0];
        batch.update(quoteDoc.ref, {
          productionState: 'İptal Edildi',
          productionStateUpdatedAt: now,
          productionStateUpdatedBy: userEmail
        });
      }
    }
    
    // Commit all changes
    await batch.commit();
    
    return res.status(200).json({
      success: true,
      planId,
      cancelledCount,
      pendingReportCount,
      alreadyCompleteCount,
      workersCleared: workersToUpdate.size,
      stationsCleared: stationsToUpdate.size,
      cancelledAt: now.toISOString(),
      cancelledBy: userEmail,
      message: `Plan cancelled: ${cancelledCount} assignment(s) cancelled immediately, ${pendingReportCount} pending scrap report, ${alreadyCompleteCount} already complete`
    });
    
  } catch (error) {
    console.error('Cancel plan error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to cancel production plan',
      details: error.message
    });
  }
});

/**
 * POST /api/mes/production-plans/:planId/cancel-with-progress
 * Cancel production plan with material accounting for partial completion
 * 
 * This endpoint handles "early completion" when cancelling a production plan.
 * Unlike regular cancel, this properly accounts for materials that were:
 * - Reserved at start (wipReserved)
 * - Actually consumed during production
 * - Produced as good output
 * - Lost as defects
 * 
 * Request body:
 * - actualOutputQuantity: Total good units produced so far
 * - defectQuantity: Total defective/scrap units produced so far
 * 
 * Process (all in single atomic transaction):
 * 1. Aggregate preProductionReservedAmount from all work packages
 * 2. Calculate actual consumption based on total output + defects
 * 3. Release wipReserved and adjust stock for all input materials
 * 4. Add actualOutputQuantity to output material stock
 * 5. Mark plan and all assignments as cancelled
 */
router.post('/production-plans/:planId/cancel-with-progress', withAuth, async (req, res) => {
  const { planId } = req.params;
  const { actualOutputQuantity, defectQuantity } = req.body;
  
  try {
    const db = getFirestore();
    const userEmail = req.user?.email || 'system';
    const userName = req.user?.name || req.user?.userName || null;
    const now = new Date();
    
    console.log(`🔄 Starting cancel-with-progress for plan ${planId}`);
    console.log(`   Actual output: ${actualOutputQuantity}, Defects: ${defectQuantity}`);
    
    // Validate input
    const actualOutput = parseFloat(actualOutputQuantity) || 0;
    const defects = parseFloat(defectQuantity) || 0;
    
    if (actualOutput < 0 || defects < 0) {
      return res.status(400).json({
        error: 'invalid_input',
        message: 'Output and defect quantities cannot be negative'
      });
    }
    
    // Execute everything in a single transaction
    const result = await db.runTransaction(async (transaction) => {
      // ========================================================================
      // STEP 1: Fetch Plan and Validate
      // ========================================================================
      
      const planRef = db.collection('mes-production-plans').doc(planId);
      const planDoc = await transaction.get(planRef);
      
      if (!planDoc.exists) {
        throw new Error(`Production plan ${planId} not found`);
      }
      
      const planData = planDoc.data();
      const workOrderCode = planData.orderCode;
      
      if (planData.launchStatus === 'cancelled') {
        throw new Error('Plan is already cancelled');
      }
      
      // ========================================================================
      // STEP 2: Fetch All Assignments and Aggregate Reserved Materials
      // ========================================================================
      
      const assignmentsQuery = db.collection('mes-worker-assignments')
        .where('planId', '==', planId);
      const assignmentsSnapshot = await transaction.get(assignmentsQuery);
      
      if (assignmentsSnapshot.empty) {
        throw new Error('No assignments found for this plan');
      }
      
      // Aggregate all reserved materials from all work packages
      const totalReservedMaterials = {}; // { materialCode: totalReservedQty }
      const totalPlannedOutput = {}; // { outputCode: totalPlannedQty }
      const assignments = [];
      
      assignmentsSnapshot.docs.forEach(doc => {
        const assignment = doc.data();
        assignments.push({ id: doc.id, ref: doc.ref, data: assignment });
        
        // Aggregate reserved materials
        if (assignment.preProductionReservedAmount) {
          Object.entries(assignment.preProductionReservedAmount).forEach(([materialCode, qty]) => {
            totalReservedMaterials[materialCode] = 
              (totalReservedMaterials[materialCode] || 0) + (parseFloat(qty) || 0);
          });
        }
        
        // Aggregate planned output
        if (assignment.plannedOutput) {
          Object.entries(assignment.plannedOutput).forEach(([outputCode, qty]) => {
            totalPlannedOutput[outputCode] = 
              (totalPlannedOutput[outputCode] || 0) + (parseFloat(qty) || 0);
          });
        }
      });
      
      console.log(`📦 Total reserved materials:`, totalReservedMaterials);
      console.log(`🎯 Total planned output:`, totalPlannedOutput);
      
      // ========================================================================
      // STEP 3: Calculate Material Consumption
      // ========================================================================
      
      // Get material inputs and outputs from first node (assuming all nodes produce same output)
      const nodes = planData?.nodes || [];
      const firstNode = nodes.length > 0 ? nodes[0] : null;
      const materialInputs = firstNode?.materialInputs || [];
      const outputCode = firstNode?.outputCode || Object.keys(totalPlannedOutput)[0];
      const totalPlannedOutputQty = Object.values(totalPlannedOutput)[0] || 0;
      
      const totalConsumedOutput = actualOutput + defects;
      const consumptionResults = [];
      const stockAdjustmentResults = [];
      
      console.log(`🔢 Total consumed (output + defect): ${totalConsumedOutput}`);
      console.log(`📋 Material inputs:`, materialInputs.map(m => `${m.code}: ${m.qty}`));
      
      if (materialInputs.length > 0 && totalPlannedOutputQty > 0) {
        
        for (const materialInput of materialInputs) {
          const inputCode = materialInput.code;
          const requiredInputQtyPerUnit = materialInput.qty || materialInput.required || 0;
          
          if (!inputCode || requiredInputQtyPerUnit <= 0) continue;
          
          // Calculate total required input for the plan
          const totalRequiredInput = requiredInputQtyPerUnit * (totalPlannedOutputQty / (firstNode?.outputQty || 1));
          
          // Calculate input-output ratio
          const inputOutputRatio = totalRequiredInput / totalPlannedOutputQty;
          
          // Calculate actual consumption
          const actualConsumption = totalConsumedOutput * inputOutputRatio;
          
          // Get total reserved amount
          const totalReserved = totalReservedMaterials[inputCode] || 0;
          
          // Calculate stock adjustment
          const stockAdjustment = totalReserved - actualConsumption;
          
          console.log(`
📊 Material: ${inputCode}
   Required per unit: ${requiredInputQtyPerUnit}
   Total planned output: ${totalPlannedOutputQty}
   Input-output ratio: ${inputOutputRatio.toFixed(4)}
   Total reserved: ${totalReserved}
   Actual consumption: ${actualConsumption.toFixed(2)}
   Stock adjustment: ${stockAdjustment >= 0 ? '+' : ''}${stockAdjustment.toFixed(2)}
          `);
          
          consumptionResults.push({
            materialCode: inputCode,
            totalRequiredInput,
            totalPlannedOutputQty,
            inputOutputRatio,
            totalReserved,
            actualConsumption,
            stockAdjustment
          });
        }
        
        // ========================================================================
        // STEP 4: Stock Adjustment for Input Materials
        // ========================================================================
        
        console.log(`🔄 Processing stock adjustments for ${consumptionResults.length} input material(s)`);
        
        for (const consumption of consumptionResults) {
          const { materialCode, totalReserved, actualConsumption, stockAdjustment } = consumption;
          
          try {
            const materialRef = db.collection('materials').doc(materialCode);
            const materialDoc = await transaction.get(materialRef);
            
            if (!materialDoc.exists) {
              console.error(`❌ Material ${materialCode} not found`);
              continue;
            }
            
            const materialData = materialDoc.data();
            const currentStock = parseFloat(materialData.stock) || 0;
            const currentWipReserved = parseFloat(materialData.wipReserved) || 0;
            
            // Release wipReserved
            const newWipReserved = Math.max(0, currentWipReserved - totalReserved);
            
            // Adjust stock
            const newStock = currentStock + stockAdjustment;
            
            transaction.update(materialRef, {
              stock: Math.max(0, newStock),
              wipReserved: newWipReserved,
              updatedAt: now,
              updatedBy: userEmail
            });
            
            stockAdjustmentResults.push({
              materialCode,
              materialName: materialData.name,
              totalReserved,
              actualConsumption,
              stockAdjustment,
              previousStock: currentStock,
              newStock: Math.max(0, newStock),
              previousWipReserved: currentWipReserved,
              newWipReserved,
              unit: materialData.unit
            });
            
            console.log(`✅ ${materialCode}: stock ${currentStock} → ${Math.max(0, newStock)}, wipReserved ${currentWipReserved} → ${newWipReserved}`);
            
          } catch (err) {
            console.error(`❌ Failed to adjust stock for ${materialCode}:`, err);
          }
        }
      }
      
      // ========================================================================
      // STEP 5: Stock Update for Output Material
      // ========================================================================
      
      let outputStockResult = null;
      
      if (outputCode && actualOutput > 0) {
        console.log(`📦 Adding ${actualOutput} units of ${outputCode} to stock`);
        
        try {
          const outputMaterialRef = db.collection('materials').doc(outputCode);
          const outputMaterialDoc = await transaction.get(outputMaterialRef);
          
          if (outputMaterialDoc.exists) {
            const outputMaterialData = outputMaterialDoc.data();
            const currentOutputStock = parseFloat(outputMaterialData.stock) || 0;
            const newOutputStock = currentOutputStock + actualOutput;
            
            transaction.update(outputMaterialRef, {
              stock: newOutputStock,
              updatedAt: now,
              updatedBy: userEmail
            });
            
            outputStockResult = {
              materialCode: outputCode,
              materialName: outputMaterialData.name,
              addedQuantity: actualOutput,
              previousStock: currentOutputStock,
              newStock: newOutputStock,
              unit: outputMaterialData.unit
            };
            
            console.log(`✅ Output ${outputCode}: stock ${currentOutputStock} → ${newOutputStock}`);
          }
        } catch (err) {
          console.error(`❌ Failed to update output material:`, err);
        }
      }
      
      // ========================================================================
      // STEP 6: Cancel All Assignments
      // ========================================================================
      
      const workersToUpdate = new Set();
      const stationsToUpdate = new Set();
      let cancelledCount = 0;
      
      assignments.forEach(({ ref, data: assignment }) => {
        // Mark all assignments as cancelled
        transaction.update(ref, {
          status: 'cancelled',
          cancelledAt: now,
          cancelledBy: userEmail,
          cancelledByName: userName,
          cancelledWithProgress: true,
          actualOutputQuantity: actualOutput,
          defectQuantity: defects,
          updatedAt: now
        });
        
        cancelledCount++;
        
        if (assignment.workerId) workersToUpdate.add(assignment.workerId);
        if (assignment.stationId) stationsToUpdate.add(assignment.stationId);
      });
      
      // Clear worker currentTask
      for (const workerId of workersToUpdate) {
        const workerRef = db.collection('mes-workers').doc(workerId);
        const workerDoc = await transaction.get(workerRef);
        if (workerDoc.exists) {
          transaction.update(workerRef, {
            currentTask: null,
            updatedAt: now
          });
        }
      }
      
      // Clear station currentOperation
      for (const stationId of stationsToUpdate) {
        const stationRef = db.collection('mes-stations').doc(stationId);
        const stationDoc = await transaction.get(stationRef);
        if (stationDoc.exists) {
          transaction.update(stationRef, {
            currentOperation: null,
            updatedAt: now
          });
        }
      }
      
      // ========================================================================
      // STEP 7: Update Plan Status
      // ========================================================================
      
      transaction.update(planRef, {
        launchStatus: 'cancelled',
        cancelledAt: now,
        cancelledBy: userEmail,
        cancelledByName: userName,
        cancelledWithProgress: true,
        cancellationSummary: {
          actualOutputQuantity: actualOutput,
          defectQuantity: defects,
          totalConsumedOutput,
          inputMaterialsAdjusted: stockAdjustmentResults.length,
          outputMaterialUpdated: outputStockResult !== null
        },
        updatedAt: now
      });
      
      // Update approved quote if exists
      if (workOrderCode) {
        const quotesQuery = db.collection('mes-approved-quotes')
          .where('workOrderCode', '==', workOrderCode)
          .limit(1);
        const quotesSnapshot = await transaction.get(quotesQuery);
        
        if (!quotesSnapshot.empty) {
          const quoteDoc = quotesSnapshot.docs[0];
          transaction.update(quoteDoc.ref, {
            productionState: 'İptal Edildi',
            productionStateUpdatedAt: now,
            productionStateUpdatedBy: userEmail
          });
        }
      }
      
      return {
        success: true,
        planId,
        cancelledCount,
        actualOutputQuantity: actualOutput,
        defectQuantity: defects,
        totalConsumedOutput,
        materialAdjustments: {
          inputMaterials: stockAdjustmentResults,
          outputMaterial: outputStockResult
        },
        workersCleared: workersToUpdate.size,
        stationsCleared: stationsToUpdate.size,
        cancelledAt: now.toISOString(),
        cancelledBy: userEmail
      };
    });
    
    console.log(`✅ Cancel-with-progress completed for plan ${planId}`);
    return res.status(200).json(result);
    
  } catch (error) {
    console.error('Cancel-with-progress error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to cancel production plan with progress',
      details: error.message
    });
  }
});

// ============================================================================
// WORK PACKAGES ENDPOINT (GLOBAL TASK AGGREGATION)
// ============================================================================

/**
 * GET /api/mes/work-packages
 * Returns all active assignments across all launched production plans
 * Joins with plans, quotes, workers, stations for dashboard display
 * 
 * Query params:
 * - status: filter by assignment status (pending, in-progress, paused, etc.)
 * - workerId: filter by specific worker
 * - stationId: filter by specific station
 * - limit: max results (default 100, max 500)
 */
router.get('/work-packages', withAuth, async (req, res) => {
  try {
    const db = getFirestore();
    const { status, workerId, stationId, limit } = req.query;
    const maxResults = Math.min(parseInt(limit) || 100, 500);
    
    // Fetch all assignments for launched plans
    let assignmentsQuery = db.collection('mes-worker-assignments');
    
    // Apply status filter if specified
    if (status) {
      assignmentsQuery = assignmentsQuery.where('status', '==', status);
    }
    // No default filtering - return all statuses including completed/cancelled
    // Frontend handles visibility via hideCompleted toggle
    
    if (workerId) {
      assignmentsQuery = assignmentsQuery.where('workerId', '==', workerId);
    }
    
    if (stationId) {
      assignmentsQuery = assignmentsQuery.where('stationId', '==', stationId);
    }
    
    assignmentsQuery = assignmentsQuery.limit(maxResults);
    
    const assignmentsSnapshot = await assignmentsQuery.get();
    
    console.log(`📦 Work Packages Query: Found ${assignmentsSnapshot.size} assignments (limit: ${maxResults})`);
    
    if (assignmentsSnapshot.empty) {
      return res.status(200).json({
        workPackages: [],
        total: 0,
        message: 'No active work packages found'
      });
    }
    
    // Collect unique IDs for batch fetching
    const planIds = new Set();
    const workerIds = new Set();
    const stationIds = new Set();
    const workOrderCodes = new Set();
    
    const assignments = assignmentsSnapshot.docs.map(doc => {
      const data = doc.data();
      if (data.planId) planIds.add(data.planId);
      if (data.workerId) workerIds.add(data.workerId);
      if (data.stationId) stationIds.add(data.stationId);
      if (data.workOrderCode) workOrderCodes.add(data.workOrderCode);
      return { id: doc.id, ...data };
    });
    
    // Batch fetch related data
    const [plansMap, workersMap, stationsMap, quotesMap] = await Promise.all([
      fetchPlansMap(db, Array.from(planIds)),
      fetchWorkersMap(db, Array.from(workerIds)),
      fetchStationsMap(db, Array.from(stationIds)),
      fetchQuotesMap(db, Array.from(workOrderCodes))
    ]);
    
    // Enrich assignments with related data
    const workPackages = assignments.map(assignment => {
      const plan = plansMap.get(assignment.planId) || {};
      const worker = workersMap.get(assignment.workerId) || {};
      const station = stationsMap.get(assignment.stationId) || {};
      const quote = quotesMap.get(assignment.workOrderCode) || {};
      
      // Determine material status (simplified for now)
      let materialStatus = 'unknown';
      if (plan.materialSummary) {
        const hasShortages = plan.materialCheckResult && plan.materialCheckResult.hasShortages;
        materialStatus = hasShortages ? 'short' : 'ok';
      }
      
      return {
        // Assignment core data
        id: assignment.id,
        assignmentId: assignment.id, // For compatibility with frontend code
        workPackageId: assignment.workPackageId || assignment.id, // Work package ID
        nodeId: assignment.nodeId,
        nodeName: assignment.nodeName,
        operationName: assignment.nodeName, // For compatibility
        operationId: assignment.operationId,
        status: assignment.status,
        priority: assignment.priority || 2, // PROMPT 11: 1=Low, 2=Normal, 3=High
        expectedStart: assignment.expectedStart || assignment.plannedStart || null,
        optimizedStart: assignment.optimizedStart || null,
        isUrgent: assignment.isUrgent || false,
        
        // Work order data
        workOrderCode: assignment.workOrderCode,
        customer: quote.customer || quote.name || '',
        company: quote.company || '',
        
        // Plan data
        planId: assignment.planId,
        planName: plan.name || '',
        planStatus: plan.status || '',
        launchStatus: plan.launchStatus || '',
        
        // Worker data
        workerId: assignment.workerId,
        workerName: assignment.workerName || worker.name || '',
        workerSkills: worker.skills || [],
        
        // Station data
        stationId: assignment.stationId,
        stationName: assignment.stationName || station.name || '',
        subStationCode: assignment.subStationCode || assignment.substationCode || null,
        substationId: assignment.substationId || null,
        substationCode: assignment.substationCode || assignment.subStationCode || null,
        
        // Material data - ADDED
        preProductionReservedAmount: assignment.preProductionReservedAmount || {},
        materialInputs: assignment.materialInputs || {},
        plannedOutput: assignment.plannedOutput || {},
        outputCode: assignment.outputCode || null,
        actualReservedAmounts: assignment.actualReservedAmounts || {},
        materialReservationStatus: assignment.materialReservationStatus || null,
        
        // Timing data
        plannedStart: assignment.plannedStart ? (assignment.plannedStart.toDate ? assignment.plannedStart.toDate().toISOString() : assignment.plannedStart) : null,
        plannedEnd: assignment.plannedEnd ? (assignment.plannedEnd.toDate ? assignment.plannedEnd.toDate().toISOString() : assignment.plannedEnd) : null,
        actualStart: assignment.actualStart ? (assignment.actualStart.toDate ? assignment.actualStart.toDate().toISOString() : assignment.actualStart) : null,
        actualEnd: assignment.actualEnd ? (assignment.actualEnd.toDate ? assignment.actualEnd.toDate().toISOString() : assignment.actualEnd) : null,
        nominalTime: assignment.nominalTime || 0,
        effectiveTime: assignment.effectiveTime || 0,
        
        // Status flags
        materialStatus,
        isPaused: assignment.status === 'paused',
        isBlocked: assignment.preconditions && assignment.preconditions.some(p => !p.met),
        
        // Metadata
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt
      };
    });
    
    // Sort by expectedStart (FIFO mode) or optimizedStart (optimized mode)
    workPackages.sort((a, b) => {
      // Use optimizedStart if available (optimization module), otherwise expectedStart (FIFO)
      const aStart = a.optimizedStart || a.expectedStart || a.plannedStart;
      const bStart = b.optimizedStart || b.expectedStart || b.plannedStart;
      
      if (aStart && bStart) {
        return new Date(aStart) - new Date(bStart);
      }
      return 0;
    });
    
    return res.status(200).json({
      workPackages,
      total: workPackages.length,
      filters: { status, workerId, stationId },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Work packages fetch error:', error);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Failed to fetch work packages',
      details: error.message
    });
  }
});

// Helper functions for batch fetching
async function fetchPlansMap(db, planIds) {
  if (planIds.length === 0) return new Map();
  
  const plansMap = new Map();
  const chunks = chunkArray(planIds, 10); // Firestore 'in' limit is 10
  
  for (const chunk of chunks) {
    const snapshot = await db.collection('mes-production-plans')
      .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
      .get();
    
    snapshot.docs.forEach(doc => {
      plansMap.set(doc.id, { id: doc.id, ...doc.data() });
    });
  }
  
  return plansMap;
}

async function fetchWorkersMap(db, workerIds) {
  if (workerIds.length === 0) return new Map();
  
  const workersMap = new Map();
  const chunks = chunkArray(workerIds, 10);
  
  for (const chunk of chunks) {
    const snapshot = await db.collection('mes-workers')
      .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
      .get();
    
    snapshot.docs.forEach(doc => {
      workersMap.set(doc.id, { id: doc.id, ...doc.data() });
    });
  }
  
  return workersMap;
}

async function fetchStationsMap(db, stationIds) {
  if (stationIds.length === 0) return new Map();
  
  const stationsMap = new Map();
  const chunks = chunkArray(stationIds, 10);
  
  for (const chunk of chunks) {
    const snapshot = await db.collection('mes-stations')
      .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
      .get();
    
    snapshot.docs.forEach(doc => {
      stationsMap.set(doc.id, { id: doc.id, ...doc.data() });
    });
  }
  
  return stationsMap;
}

async function fetchQuotesMap(db, workOrderCodes) {
  if (workOrderCodes.length === 0) return new Map();
  
  const quotesMap = new Map();
  const chunks = chunkArray(workOrderCodes, 10);
  
  for (const chunk of chunks) {
    const snapshot = await db.collection('approved-quotes')
      .where('workOrderCode', 'in', chunk)
      .get();
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.workOrderCode) {
        quotesMap.set(data.workOrderCode, { id: doc.id, ...data });
      }
    });
  }
  
  return quotesMap;
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ============================================================================
// SEMI-FINISHED CODE REGISTRY (Firestore-backed)
// ============================================================================

// Helper: normalize materials for signature building
function normalizeMaterialsForSignature(mats = []) {
  const arr = Array.isArray(mats) ? mats : [];
  return arr
    .filter(m => !!m && !!m.id)
    .map(m => ({ 
      id: String(m.id), 
      qty: (m.qty == null || m.qty === '') ? null : Number(m.qty), 
      unit: m.unit || '' 
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// Helper: build signature matching frontend logic
// Unique factors: station + operation + materials (types & quantities) + output quantity
// CRITICAL: Uses ratio normalization - 40kg→80pcs and 30kg→60pcs produce same signature
function buildSemiCodeSignature(operationId, operationCode, stationId, materials, outputQty = '', outputUnit = '') {
  const mats = normalizeMaterialsForSignature(materials);
  
  // Normalize to ratios using GCD (Greatest Common Divisor)
  const quantities = mats.map(m => m.qty).filter(q => q != null && q > 0);
  const parsedOutputQty = parseFloat(outputQty);
  
  if (quantities.length > 0 && parsedOutputQty > 0) {
    // GCD calculation for ratio normalization
    const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
    const allValues = [...quantities, parsedOutputQty];
    let commonDivisor = allValues[0];
    for (let i = 1; i < allValues.length; i++) {
      commonDivisor = gcd(commonDivisor, allValues[i]);
    }
    
    console.log('🔢 GCD Normalization:', {
      materials: mats.map(m => `${m.id}:${m.qty}${m.unit}`),
      outputQty: parsedOutputQty,
      outputUnit,
      gcd: commonDivisor,
      normalizedMaterials: mats.map(m => `${m.id}:${(m.qty / commonDivisor).toFixed(3)}${m.unit}`),
      normalizedOutput: (parsedOutputQty / commonDivisor).toFixed(3)
    });
    
    // Build ratio-based signature
    const matsRatio = mats.map(m => {
      const normalizedQty = m.qty != null && m.qty > 0 ? (m.qty / commonDivisor).toFixed(3) : '';
      return `${m.id}:${normalizedQty}${m.unit || ''}`;
    }).join(',');
    
    const outRatio = (parsedOutputQty / commonDivisor).toFixed(3);
    const outStr = `${outRatio}${outputUnit}`;
    
    const signature = `op:${operationId || ''}|code:${operationCode || ''}|st:${stationId || ''}|mats:${matsRatio}|out:${outStr}`;
    console.log('✅ Generated signature:', signature);
    return signature;
  } else {
    // Fallback to absolute values
    const matsStr = mats.map(m => `${m.id}:${m.qty != null ? m.qty : ''}${m.unit || ''}`).join(',');
    const outStr = `${outputQty}${outputUnit}`;
    const signature = `op:${operationId || ''}|code:${operationCode || ''}|st:${stationId || ''}|mats:${matsStr}|out:${outStr}`;
    console.log('⚠️  Fallback signature (no GCD):', signature);
    return signature;
  }
}

// Helper: generate prefix from operation code (matches frontend logic)
function generatePrefix(operationCode) {
  if (!operationCode) return 'S';
  const raw = String(operationCode).trim();
  const letters = raw.replace(/[^A-Za-z]/g, '');
  if (!letters) return 'S';
  return (letters[0].toUpperCase() + (letters[1] ? letters[1].toLowerCase() : '')).slice(0, 2);
}

// Helper: pad counter to 3 digits
function pad3(n) { 
  return String(n).padStart(3, '0'); 
}

// POST /api/mes/output-codes/preview
// Preview what code would be assigned without committing
router.post('/output-codes/preview', withAuth, async (req, res) => {
  console.log('📋 Semi-code preview request:', { operationId: req.body?.operationId, stationId: req.body?.stationId });
  try {
    const { operationId, operationCode, stationId, materials, outputQty, outputUnit } = req.body;
    
    // Validation
    if (!operationId) {
      return res.status(400).json({ error: 'operationId required' });
    }
    if (!stationId) {
      return res.status(400).json({ error: 'stationId required' });
    }
    if (!Array.isArray(materials) || materials.length === 0) {
      return res.status(400).json({ error: 'materials array required with at least one item' });
    }
    
    // Ensure all materials have quantities
    const allQtyKnown = materials.every(m => m.qty != null && Number.isFinite(Number(m.qty)));
    if (!allQtyKnown) {
      return res.json({ code: null, reserved: false, message: 'incomplete_materials' });
    }
    
    const db = getFirestore();
    const prefix = generatePrefix(operationCode);
    const signature = buildSemiCodeSignature(operationId, operationCode, stationId, materials, outputQty, outputUnit);
    
    // Get all codes from index (no WHERE clause to avoid index requirements)
    // Filter in memory - this is fine for small datasets
    const allSnapshot = await db.collection('mes-outputCodes-index').get();
    
    // Check if signature already exists and find max counter for this prefix
    let existingCode = null;
    let maxCounter = 0;
    
    allSnapshot.forEach(doc => {
      const data = doc.data();
      
      // Only process docs with matching prefix
      if (data.prefix !== prefix) return;
      
      // Check for exact signature match
      if (data.signature === signature) {
        existingCode = data;
      }
      
      // Track highest counter for this prefix
      if (data.counter > maxCounter) {
        maxCounter = data.counter;
      }
    });
    
    // If signature already exists, return existing code
    if (existingCode) {
      return res.json({ 
        code: existingCode.code, 
        reserved: true,
        existingEntry: existingCode
      });
    }
    
    // Generate next code
    const nextCounter = maxCounter + 1;
    const previewCode = `${prefix}-${pad3(nextCounter)}`;
    
    res.json({ 
      code: previewCode, 
      reserved: false,
      nextCounter
    });
  } catch (error) {
    console.error('Output code preview error:', error);
    res.status(500).json({ error: 'output_code_preview_failed', message: error.message });
  }
});

// GET /api/mes/output-codes/list
// List available output codes for template selection
router.get('/output-codes/list', withAuth, async (req, res) => {
  try {
    const { operationId } = req.query;
    
    if (!operationId) {
      return res.status(400).json({ error: 'operationId required' });
    }
    
    const db = getFirestore();
    
    // Query index collection (queryable by operationId)
    // Note: Using single orderBy to avoid composite index requirement
    const snapshot = await db.collection('mes-outputCodes-index')
      .where('operationId', '==', operationId)
      .get();
    
    const codes = [];
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      codes.push({
        code: data.code,
        prefix: data.prefix,
        counter: data.counter,
        signature: data.signature,
        operationId: data.operationId,
        stationId: data.stationId,
        materials: data.materials || [],
        outputRatio: data.outputRatio,
        outputUnit: data.outputUnit,
        createdAt: data.createdAt,
        lastUsed: data.lastUsed || null,
        usageCount: data.usageCount || 0
      });
    }
    
    // Sort in memory (no index needed)
    codes.sort((a, b) => {
      // Sort by usageCount desc, then createdAt desc
      if (b.usageCount !== a.usageCount) {
        return b.usageCount - a.usageCount;
      }
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
    
    res.json({ codes });
  } catch (error) {
    console.error('Output codes list error:', error);
    res.status(500).json({ error: 'output_codes_list_failed', message: error.message });
  }
});

// Helper: Decode signature to extract template data
function decodeSignatureForTemplate(signature, code) {
  const result = {
    operationId: null,
    operationCode: null,
    stationId: null,
    materials: [],
    outputRatio: null,
    outputUnit: null
  };
  
  try {
    // Signature format: "op:{id}|code:{code}|st:{stationId}|mats:{materialCode}:{ratio}{unit},...|out:{ratio}{unit}"
    const parts = signature.split('|');
    
    for (const part of parts) {
      if (part.startsWith('op:')) {
        result.operationId = part.substring(3);
      } else if (part.startsWith('code:')) {
        result.operationCode = part.substring(5);
      } else if (part.startsWith('st:')) {
        result.stationId = part.substring(3);
      } else if (part.startsWith('mats:')) {
        const matsStr = part.substring(5);
        const matParts = matsStr.split(',');
        
        for (const matPart of matParts) {
          // Format: "M-001:1.000kg"
          const match = matPart.match(/^([^:]+):([0-9.]+)([a-zA-Z]+)$/);
          if (match) {
            result.materials.push({
              materialCode: match[1],
              ratio: parseFloat(match[2]),
              unit: match[3]
            });
          }
        }
      } else if (part.startsWith('out:')) {
        const outStr = part.substring(4);
        // Format: "2.000adet"
        const match = outStr.match(/^([0-9.]+)([a-zA-Z]+)$/);
        if (match) {
          result.outputRatio = parseFloat(match[1]);
          result.outputUnit = match[2];
        }
      }
    }
  } catch (error) {
    console.error('Error decoding signature:', signature, error);
  }
  
  return result;
}

// POST /api/mes/output-codes/commit
// Commit codes when plan/template is saved
router.post('/output-codes/commit', withAuth, async (req, res) => {
  try {
    const { assignments } = req.body;
    
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ error: 'assignments array required' });
    }
    
    const db = getFirestore();
    let committed = 0;
    let skipped = 0;
    const errors = [];
    
    // Process each assignment
    for (const assignment of assignments) {
      const { prefix, signature, code, operationId, stationId, materialsHash } = assignment;
      
      if (!prefix || !signature || !code) {
        errors.push({ assignment, error: 'missing_required_fields' });
        continue;
      }
      
      try {
        const docRef = db.collection('mes-outputCodes-index').doc(code);
        const doc = await docRef.get();
        
        // Skip if already exists
        if (doc.exists) {
          console.log(`⏭️  Code ${code} already exists, skipping`);
          skipped++;
          continue;
        }
        
        // Decode signature for template metadata
        const decoded = decodeSignatureForTemplate(signature, code);
        
        // Extract counter from code
        const counterMatch = code.match(/-(\d+)$/);
        const counter = counterMatch ? parseInt(counterMatch[1], 10) : 0;
        
        // Write to index collection using CODE as document ID
        await docRef.set({
          code,
          signature,
          prefix,
          counter,
          
          // Queryable fields
          operationId: decoded.operationId || operationId || null,
          operationCode: decoded.operationCode || null,
          stationId: decoded.stationId || stationId || null,
          
          // Template metadata
          materials: decoded.materials || [],
          outputRatio: decoded.outputRatio || 0,
          outputUnit: decoded.outputUnit || 'adet',
          
          // Timestamps
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUsed: null,
          usageCount: 0,
          
          // Legacy compatibility
          materialsHash: materialsHash || null
        });
        
        console.log(`✅ Code committed: ${code} to mes-outputCodes-index`);
        committed++;
        
      } catch (error) {
        console.error(`❌ Failed to commit ${code}:`, error.message);
        errors.push({ code, error: error.message });
      }
    }
    
    res.json({ 
      committed, 
      skipped, 
      errors: errors.length > 0 ? errors : undefined 
    });
  } catch (error) {
    console.error('Output code commit error:', error);
    res.status(500).json({ error: 'output_code_commit_failed', message: error.message });
  }
});

// ============================================================================
// METRICS ENDPOINT
// ============================================================================

// GET /api/mes/metrics - Get current metrics
router.get('/metrics', withAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      metrics: metrics.getAll(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Metrics retrieval error:', error);
    res.status(500).json({ error: 'metrics_retrieval_failed', message: error.message });
  }
});

// POST /api/mes/metrics/reset - Reset all metrics (for testing)
router.post('/metrics/reset', withAuth, async (req, res) => {
  try {
    metrics.reset();
    res.json({
      success: true,
      message: 'Metrics reset successfully',
      metrics: metrics.getAll()
    });
  } catch (error) {
    console.error('Metrics reset error:', error);
    res.status(500).json({ error: 'metrics_reset_failed', message: error.message });
  }
});

export default router;

