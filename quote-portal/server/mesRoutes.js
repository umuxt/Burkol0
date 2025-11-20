import express from 'express';
// ✅ MIGRATED TO SQL - STEP 1: Firebase imports removed
// import { getFirestore } from 'firebase-admin/firestore';
// import admin from 'firebase-admin';
import db from '../db/connection.js';
import { getSession } from './auth.js'
// jsondb removed from static imports - use dynamic import where needed
// import jsondb from '../src/lib/jsondb.js'
import { adjustMaterialStock, consumeMaterials } from './materialsRoutes.js'
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { createRequire } from 'module';
import { 
  reserveMaterialsWithLotTracking, 
  getLotConsumptionPreview,
  releaseMaterialReservations,
  markMaterialsConsumed 
} from './utils/lotConsumption.js';
import {
  getWorkerNextTask,
  getWorkerTaskQueue,
  getWorkerTaskStats,
  startTask,
  completeTask,
  hasTasksInQueue
} from './utils/fifoScheduler.js';
import {
  createSSEStream,
  createWorkerFilter,
  createPlanFilter
} from './utils/sseStream.js';

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
// CANONICAL SCHEMA ENFORCEMENT
// ============================================================================
// Backend expects: node.nodeId, node.nominalTime, node.successor
// Frontend sanitizes before sending (see planDesigner.js sanitizeNodesForBackend)

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
      
      // Scheduling timing
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
// ✅ MIGRATED TO SQL - STEP 1
router.get('/operations', withAuth, async (req, res) => {
  try {
    const result = await db('mes.operations')
      .select('id', 'name', 'type', 'semi_output_code', 'nominal_time', 'created_at')
      .orderBy('name');
    res.json(result);
  } catch (error) {
    console.error('Error fetching operations:', error);
    res.status(500).json({ error: 'Failed to fetch operations' });
  }
});

// POST /api/mes/operations - Create a single operation
// ✅ MIGRATED TO SQL - STEP 1
router.post('/operations', withAuth, async (req, res) => {
  const { name, type, semi_output_code, nominal_time } = req.body;
  
  try {
    // Generate simple sequential ID (OP-001, OP-002, etc.)
    const countResult = await db('mes.operations').count('id as count').first();
    const nextNum = parseInt(countResult.count) + 1;
    const id = 'OP-' + String(nextNum).padStart(3, '0');
    
    const result = await db('mes.operations')
      .insert({
        id,
        name,
        type: type || 'standard',
        semi_output_code,
        nominal_time: nominal_time || 0,
        created_at: db.fn.now()
      })
      .returning(['id', 'name', 'type', 'semi_output_code', 'nominal_time', 'created_at']);
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error creating operation:', error);
    res.status(500).json({ error: 'Failed to create operation' });
  }
});

// ============================================================================
// WORKERS ROUTES
// ============================================================================

// GET /api/mes/workers - Get all workers
// ✅ MIGRATED TO SQL - STEP 2
router.get('/workers', withAuth, async (req, res) => {
  try {
    const result = await db('mes.workers')
      .select(
        'id',
        'name',
        'skills',
        'personal_schedule',
        'is_active',
        'current_task_plan_id',
        'current_task_node_id',
        'current_task_assignment_id',
        'created_at',
        'updated_at'
      )
      .where('is_active', true)
      .orderBy('name');
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching workers:', error);
    res.status(500).json({ error: 'Failed to fetch workers' });
  }
});

// POST /api/mes/workers - Create/Update worker
// ✅ MIGRATED TO SQL - STEP 2
router.post('/workers', withAuth, async (req, res) => {
  const { name, skills, personalSchedule } = req.body;
  
  // Validation
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (!Array.isArray(skills) || skills.length === 0) {
    return res.status(400).json({ error: 'At least one skill is required' });
  }
  
  try {
    // Generate worker ID (WK-001 format) - this is the only ID needed
    const [{ max_id }] = await db('mes.workers')
      .max('id as max_id');
    const nextNum = max_id ? parseInt(max_id.split('-')[1]) + 1 : 1;
    const newId = `WK-${nextNum.toString().padStart(3, '0')}`;
    
    // Insert worker
    const result = await db('mes.workers')
      .insert({
        id: newId,
        name,
        skills: JSON.stringify(skills),
        personal_schedule: personalSchedule ? JSON.stringify(personalSchedule) : null,
        is_active: true,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      })
      .returning([
        'id',
        'name',
        'skills',
        'personal_schedule',
        'is_active',
        'created_at'
      ]);
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error creating worker:', error);
    res.status(500).json({ error: 'Failed to create worker' });
  }
});

// LEGACY FIREBASE CODE REMOVED - kept for reference if needed
/*
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
*/

// GET /api/mes/workers/:id/stations - Get stations where this worker can work
router.get('/workers/:id/stations', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get worker's skills
    const worker = await db('mes.workers')
      .select('id', 'name', 'skills')
      .where('id', id)
      .first();
    
    if (!worker) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    
    const workerSkills = Array.isArray(worker.skills) ? worker.skills : [];
    
    // Get all stations with their required skills
    const stations = await db('mes.stations')
      .select(
        'id',
        'name',
        'type',
        'description',
        'capabilities'
      )
      .where('is_active', true);
    
    // Simple compatibility: return all active stations
    // (Complex skill matching can be added later if needed)
    const compatibleStations = stations.map(station => ({
      id: station.id,
      name: station.name,
      type: station.type,
      description: station.description,
      capabilities: station.capabilities
    }));
    
    res.json({
      workerId: id,
      workerName: worker.name,
      workerSkills: workerSkills,
      compatibleStations: compatibleStations
    });
  } catch (error) {
    console.error('Error fetching worker stations:', error);
    res.status(500).json({ error: 'Failed to fetch worker stations' });
  }
});

// DELETE /api/mes/workers/:id - Soft delete worker
router.delete('/workers/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await db('mes.workers')
      .update({
        is_active: false,
        updated_at: db.fn.now()
      })
      .where('id', id)
      .returning(['id', 'name']);
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Worker not found' });
    }
    
    res.json({ success: true, id: result[0].id, name: result[0].name });
  } catch (error) {
    console.error('Error deleting worker:', error);
    res.status(500).json({ error: 'Failed to delete worker' });
  }
});

// ============================================================================
// STATIONS ROUTES
// ============================================================================

// GET /api/mes/stations - Get all stations
router.get('/stations', withAuth, async (req, res) => {
  try {
    const result = await db('mes.stations')
      .select(
        'id',
        'name',
        'type',
        'description',
        'capabilities',
        'substations',
        'is_active',
        'created_at',
        'updated_at'
      )
      .where('is_active', true)
      .orderBy('name');
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching stations:', error);
    res.status(500).json({ error: 'Failed to fetch stations' });
  }
});

// POST /api/mes/stations - Create a new station
router.post('/stations', withAuth, async (req, res) => {
  const { name, type, description, capabilities } = req.body;
  
  try {
    // Generate ST-xxx ID
    const [{ max_id }] = await db('mes.stations').max('id as max_id');
    const nextNum = max_id ? parseInt(max_id.split('-')[1]) + 1 : 1;
    const newId = `ST-${nextNum.toString().padStart(3, '0')}`;
    
    // Insert new station
    const result = await db('mes.stations')
      .insert({
        id: newId,
        name,
        type,
        description,
        capabilities: capabilities ? JSON.stringify(capabilities) : null,
        is_active: true,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      })
      .returning(['id', 'name', 'type', 'description', 'capabilities', 'is_active', 'created_at', 'updated_at']);
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error creating station:', error);
    res.status(500).json({ error: 'Failed to create station' });
  }
});

// GET /api/mes/stations/:id/workers - Get workers that can work at this station
router.get('/stations/:id/workers', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Check if station exists
    const station = await db('mes.stations')
      .where({ id })
      .first();
    
    if (!station) {
      return res.status(404).json({ error: 'Station not found' });
    }
    
    // For now, return empty array (worker-station assignments not yet implemented)
    // TODO: Implement worker-station assignment logic when needed
    res.json([]);
  } catch (error) {
    console.error('Error fetching station workers:', error);
    res.status(500).json({ error: 'Failed to fetch station workers' });
  }
});

// DELETE /api/mes/stations/:id - Soft delete a station
router.delete('/stations/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Soft delete (set is_active = false)
    const result = await db('mes.stations')
      .where({ id })
      .update({
        is_active: false,
        updated_at: db.fn.now()
      })
      .returning('id');
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Station not found' });
    }
    
    res.json({ success: true, id: result[0].id });
  } catch (error) {
    console.error('Error deleting station:', error);
    res.status(500).json({ error: 'Failed to delete station' });
  }
});

// ============================================================================
// SKILLS ROUTES (Master Data)
// ============================================================================

// GET /api/mes/skills - Get all skills
router.get('/skills', withAuth, async (req, res) => {
  try {
    const skills = await db('mes.skills')
      .select('id', 'name', 'description', 'is_active', 'created_at', 'updated_at')
      .where('is_active', true)
      .orderBy('name');
    
    res.json(skills);
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// POST /api/mes/skills - Create new skill
router.post('/skills', withAuth, async (req, res) => {
  const { name, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Skill name is required' });
  }
  
  try {
    // Generate skill-xxx ID
    const [{ max_id }] = await db('mes.skills').max('id as max_id');
    const nextNum = max_id ? parseInt(max_id.split('-')[1]) + 1 : 1;
    const newId = `skill-${nextNum.toString().padStart(3, '0')}`;
    
    const result = await db('mes.skills')
      .insert({
        id: newId,
        name,
        description,
        is_active: true,
        created_at: db.fn.now(),
        updated_at: db.fn.now(),
        created_by: req.user?.email || 'system'
      })
      .returning(['id', 'name', 'description', 'is_active', 'created_at']);
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error creating skill:', error);
    res.status(500).json({ error: 'Failed to create skill' });
  }
});

// PUT /api/mes/skills/:id - Update skill
router.put('/skills/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  
  try {
    const result = await db('mes.skills')
      .where({ id })
      .update({
        name,
        description,
        updated_at: db.fn.now(),
        updated_by: req.user?.email || 'system'
      })
      .returning(['id', 'name', 'description', 'is_active', 'updated_at']);
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating skill:', error);
    res.status(500).json({ error: 'Failed to update skill' });
  }
});

// DELETE /api/mes/skills/:id - Soft delete skill
router.delete('/skills/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Check if skill is in use
    const [workersCount] = await db('mes.workers')
      .whereRaw('skills::jsonb @> ?', [JSON.stringify([id])])
      .count('* as count');
    
    const [stationsCount] = await db('mes.stations')
      .whereRaw('capabilities::jsonb @> ?', [JSON.stringify([id])])
      .count('* as count');
    
    const [operationsCount] = await db('mes.operations')
      .whereRaw('skills::jsonb @> ?', [JSON.stringify([id])])
      .count('* as count');
    
    const totalUsage = parseInt(workersCount.count) + parseInt(stationsCount.count) + parseInt(operationsCount.count);
    
    if (totalUsage > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete skill in use',
        usage: {
          workers: parseInt(workersCount.count),
          stations: parseInt(stationsCount.count),
          operations: parseInt(operationsCount.count)
        }
      });
    }
    
    // Soft delete
    const result = await db('mes.skills')
      .where({ id })
      .update({
        is_active: false,
        updated_at: db.fn.now(),
        updated_by: req.user?.email || 'system'
      })
      .returning('id');
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }
    
    res.json({ success: true, id: result[0].id });
  } catch (error) {
    console.error('Error deleting skill:', error);
    res.status(500).json({ error: 'Failed to delete skill' });
  }
});

// ============================================================================
// WORK ORDERS ROUTES
// ============================================================================

// GET /api/mes/work-orders - Get all work orders
router.get('/work-orders', withAuth, async (req, res) => {
  try {
    // NOTE: mes.work_orders = production work orders (WO-001 format)
    // NOT materials.orders (supplier orders ORD-2025-0001 format)
    const workOrders = await db('mes.work_orders')
      .select(
        'id',
        'code',
        'quote_id',
        'status',
        'data',
        'created_at',
        'updated_at'
      )
      .orderBy('created_at', 'desc');
    
    res.json({ workOrders });
  } catch (error) {
    console.error('Error fetching work orders:', error);
    res.status(500).json({ error: 'Failed to fetch work orders' });
  }
});

// POST /api/mes/work-orders - Create work order
router.post('/work-orders', withAuth, async (req, res) => {
  const { quote_id, status, data } = req.body;
  
  try {
    // Generate WO code (WO-001, WO-002, WO-003...)
    const [{ max_code }] = await db('mes.work_orders')
      .max('code as max_code');
    
    let nextNum = 1;
    if (max_code) {
      const match = max_code.match(/WO-(\d+)/);
      if (match) {
        nextNum = parseInt(match[1]) + 1;
      }
    }
    
    const code = `WO-${nextNum.toString().padStart(3, '0')}`;
    
    // Create work order (production work order, not materials.orders!)
    const [workOrder] = await db('mes.work_orders')
      .insert({
        id: code,  // Use code as ID
        code,
        quote_id,
        status: status || 'pending',
        data: data ? JSON.stringify(data) : null,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      })
      .returning(['id', 'code', 'quote_id', 'status', 'data', 'created_at', 'updated_at']);
    
    res.json({ success: true, ...workOrder });
  } catch (error) {
    console.error('Error creating work order:', error);
    res.status(500).json({ error: 'Failed to create work order' });
  }
});

// PUT /api/mes/work-orders/:id - Update work order
router.put('/work-orders/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  const { quote_id, status, data } = req.body;
  
  try {
    const updateData = {
      updated_at: db.fn.now()
    };
    
    // Only update provided fields
    if (quote_id !== undefined) updateData.quote_id = quote_id;
    if (status !== undefined) updateData.status = status;
    if (data !== undefined) updateData.data = JSON.stringify(data);
    
    const [workOrder] = await db('mes.work_orders')
      .where({ id })
      .update(updateData)
      .returning(['id', 'code', 'quote_id', 'status', 'data', 'updated_at']);
    
    if (!workOrder) {
      return res.status(404).json({ error: 'Work order not found' });
    }
    
    res.json({ success: true, ...workOrder });
  } catch (error) {
    console.error('Error updating work order:', error);
    res.status(500).json({ error: 'Failed to update work order' });
  }
});

// DELETE /api/mes/work-orders/:id - Delete work order
router.delete('/work-orders/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    const [deleted] = await db('mes.work_orders')
      .where({ id })
      .delete()
      .returning('id');
    
    if (!deleted) {
      return res.status(404).json({ error: 'Work order not found' });
    }
    
    res.json({ success: true, id: deleted.id });
  } catch (error) {
    console.error('Error deleting work order:', error);
    res.status(500).json({ error: 'Failed to delete work order' });
  }
});

// POST /api/mes/work-orders/next-id - Get next available work order code
router.post('/work-orders/next-id', withAuth, async (req, res) => {
  try {
    const [{ max_code }] = await db('mes.work_orders')
      .max('code as max_code');
    
    let nextNum = 1;
    if (max_code) {
      const match = max_code.match(/WO-(\\d+)/);
      if (match) {
        nextNum = parseInt(match[1]) + 1;
      }
    }
    
    const nextCode = `WO-${nextNum.toString().padStart(3, '0')}`;
    
    res.json({ nextCode });
  } catch (error) {
    console.error('Error generating next work order code:', error);
    res.status(500).json({ error: 'Failed to generate next code' });
  }
});

// ============================================================================
// APPROVED QUOTES ROUTES (Read-only listing for Production Planning)
// ============================================================================

// GET /api/mes/approved-quotes - List approved quotes copied from Quotes as Work Orders
// GET /api/mes/approved-quotes - Get all approved quotes (SQL)
router.get('/approved-quotes', withAuth, async (req, res) => {
  try {
    const approvedQuotes = await db('mes.approved_quotes')
      .select(
        'id',
        'work_order_code',
        'production_state',
        'production_state_updated_at',
        'production_state_updated_by',
        'created_at'
      )
      .orderBy('created_at', 'desc');
    
    res.json({ approvedQuotes });
  } catch (error) {
    console.error('Error fetching approved quotes:', error);
    res.status(500).json({ error: 'Failed to fetch approved quotes' });
  }
});

// POST /api/mes/approved-quotes/ensure - Ensure an approved quote is copied as WO (SQL)
router.post('/approved-quotes/ensure', withAuth, async (req, res) => {
  const trx = await db.transaction();
  
  try {
    const { quoteId } = req.body || {};
    console.log(`🔍 [ENSURE] Starting WO creation for quote: ${quoteId}`);
    
    if (!quoteId) {
      await trx.rollback();
      console.log('❌ [ENSURE] No quoteId provided');
      return res.status(400).json({ success: false, error: 'quoteId_required' });
    }

    // Check if WO already exists
    console.log(`🔍 [ENSURE] Checking if WO already exists for quote: ${quoteId}`);
    const [existing] = await trx('mes.approved_quotes')
      .where({ quote_id: quoteId })
      .select('work_order_code')
      .limit(1);
    
    if (existing) {
      await trx.rollback();
      console.log(`ℹ️ [ENSURE] WO already exists: ${existing.work_order_code}`);
      return res.json({ 
        success: true, 
        ensured: true, 
        workOrderCode: existing.work_order_code 
      });
    }

    // Load quote from jsondb
    console.log(`🔍 [ENSURE] Loading quote from jsondb: ${quoteId}`);
    const { default: jsondb } = await import('../src/lib/jsondb.js');
    const quote = jsondb.getQuote(quoteId);
    
    if (!quote) {
      await trx.rollback();
      console.log(`❌ [ENSURE] Quote not found in jsondb: ${quoteId}`);
      return res.status(404).json({ success: false, error: 'quote_not_found' });
    }
    
    console.log(`✅ [ENSURE] Quote loaded: ${quote.id} | Status: ${quote.status}`);
    
    // Validate quote status
    const st = String(quote.status || '').toLowerCase();
    if (!(st === 'approved' || st === 'onaylandı' || st === 'onaylandi')) {
      await trx.rollback();
      console.log(`❌ [ENSURE] Quote not approved. Status: ${quote.status}`);
      return res.status(400).json({ 
        success: false, 
        error: 'quote_not_approved', 
        status: quote.status || null 
      });
    }

    // Validate delivery date
    if (!quote.deliveryDate || String(quote.deliveryDate).trim() === '') {
      await trx.rollback();
      console.log(`❌ [ENSURE] Delivery date missing`);
      return res.status(400).json({ success: false, error: 'delivery_date_required' });
    }
    console.log(`✅ [ENSURE] Delivery date: ${quote.deliveryDate}`);

    // Generate next WO code using mes.work_orders counter
    const [{ max_code }] = await trx('mes.work_orders')
      .max('code as max_code');
    
    const nextNum = max_code ? parseInt(max_code.split('-')[1]) + 1 : 1;
    const code = `WO-${nextNum.toString().padStart(3, '0')}`;
    
    console.log(`✅ [ENSURE] Generated WO code: ${code}`);

    // Insert into approved_quotes
    await trx('mes.approved_quotes').insert({
      id: code,
      work_order_code: code,
      quote_id: quoteId,
      production_state: 'Üretim Onayı Bekliyor',
      customer: quote.name || quote.customer || null,
      company: quote.company || null,
      email: quote.email || null,
      phone: quote.phone || null,
      delivery_date: quote.deliveryDate || null,
      price: quote.price ?? quote.calculatedPrice ?? null,
      quote_snapshot: quote,
      created_at: trx.fn.now()
    });

    await trx.commit();
    
    console.log(`✅ [ENSURE] WO successfully created: ${code} for quote ${quoteId}`);
    
    res.json({ success: true, ensured: true, workOrderCode: code });
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ [ENSURE] Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to ensure approved quote',
      details: error.message 
    });
  }
});

// ============================================================================
// MASTER DATA ROUTES
// ============================================================================

// GET /api/mes/master-data - Get available skills and operation types
// ✅ MIGRATED TO SQL - HOTFIX
router.get('/master-data', withAuth, async (req, res) => {
  try {
    const result = await db('mes.settings')
      .where({ key: 'master-data' })
      .first();
    
    if (!result) {
      // Return defaults if no master data exists
      return res.json({
        availableSkills: ['Kaynak', 'Tornalama', 'Freze', 'Montaj'],
        availableOperationTypes: ['İmalat', 'Kontrol', 'Montaj', 'Paketleme'],
        stationEfficiency: 1.0,
        workerEfficiency: 1.0,
        timeSettings: {
          workType: 'fixed',
          laneCount: 1,
          fixedBlocks: {},
          shiftBlocks: {}
        }
      });
    }

    const data = result.value || {};
    // Map legacy field names if present
    if (!data.availableSkills && Array.isArray(data.skills)) {
      data.availableSkills = data.skills;
    }
    if (!data.availableOperationTypes && Array.isArray(data.operationTypes)) {
      data.availableOperationTypes = data.operationTypes;
    }
    // Ensure efficiency defaults
    data.stationEfficiency = data.stationEfficiency ?? 1.0;
    data.workerEfficiency = data.workerEfficiency ?? 1.0;
    // Ensure timeSettings exists with safe defaults
    data.timeSettings = data.timeSettings || { 
      workType: 'fixed', 
      laneCount: 1, 
      fixedBlocks: {}, 
      shiftBlocks: {} 
    };
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching master data:', error);
    res.status(500).json({ error: 'Failed to fetch master data' });
  }
});

// POST /api/mes/master-data - Update master data
// ✅ MIGRATED TO SQL - HOTFIX
router.post('/master-data', withAuth, async (req, res) => {
  try {
    const { availableSkills, availableOperationTypes, timeSettings, stationEfficiency, workerEfficiency } = req.body || {};
    
    console.log('POST /api/mes/master-data - Received:', { 
      availableSkills, 
      availableOperationTypes, 
      timeSettings,
      stationEfficiency,
      workerEfficiency
    });
    
    const payload = {
      ...(availableSkills ? { availableSkills } : {}),
      ...(availableOperationTypes ? { availableOperationTypes } : {}),
      ...(timeSettings ? { timeSettings } : {}),
      ...(stationEfficiency !== undefined ? { stationEfficiency: parseFloat(stationEfficiency) || 1.0 } : {}),
      ...(workerEfficiency !== undefined ? { workerEfficiency: parseFloat(workerEfficiency) || 1.0 } : {})
    };
    
    console.log('SQL payload to save:', payload);
    
    // Upsert using INSERT ... ON CONFLICT
    await db.raw(`
      INSERT INTO mes.settings (id, key, value, updated_at, updated_by)
      VALUES (?, ?, ?::jsonb, NOW(), ?)
      ON CONFLICT (key) 
      DO UPDATE SET 
        value = EXCLUDED.value,
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
    `, ['master-data', 'master-data', JSON.stringify(payload), req.user?.email || 'system']);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating master data:', error);
    res.status(500).json({ error: 'Failed to update master data' });
  }
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

// ============================================================================
// FIREBASE LEGACY ROUTES - DEPRECATED (Keeping for reference during migration)
// ============================================================================
// OLD Firebase GET /production-plans - MIGRATED TO SQL (see line ~9812)
// Removed: Use new SQL endpoint below

// OLD Firebase POST /production-plans - MIGRATED TO SQL (see line ~9873)
// Removed: Use new SQL endpoint below

// OLD Firebase PUT /production-plans/:id - MIGRATED TO SQL (see line ~9999)
// Removed: Use new SQL endpoint below
// (Large Firebase update logic with material consumption removed)

// OLD Firebase DELETE /production-plans/:id - MIGRATED TO SQL (see line ~10033)
// Removed: Use new SQL endpoint below

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
// TEMPLATES ROUTES - ✅ MIGRATED TO SQL (STEP 10)
// ============================================================================
// NOTE: Templates are production plans with status='template'
// They use the same mes.production_plans table, just filtered by status

// GET /api/mes/templates - Get all templates (SQL)
router.get('/templates', withAuth, async (req, res) => {
  try {
    const templates = await db('mes.production_plans as p')
      .select(
        'p.id',
        'p.work_order_code',
        'p.quote_id',
        'p.status',
        'p.created_at',
        db.raw('count(n.id)::integer as node_count')
      )
      .leftJoin('mes.production_plan_nodes as n', 'n.plan_id', 'p.id')
      .where('p.status', 'template')
      .groupBy('p.id')
      .orderBy('p.created_at', 'desc');
    
    console.log(`📋 Templates: Found ${templates.length} templates`);
    
    res.json({ templates });
  } catch (error) {
    console.error('❌ Error fetching templates:', error);
    res.status(500).json({ 
      error: 'Failed to fetch templates',
      details: error.message 
    });
  }
});

// POST /api/mes/templates - Create template (SQL)
// Templates are just production plans with status='template'
// They can be copied to create real production plans
router.post('/templates', withAuth, async (req, res) => {
  const { workOrderCode, quoteId, nodes } = req.body;
  
  if (!workOrderCode) {
    return res.status(400).json({ error: 'Work order code is required' });
  }
  
  const trx = await db.transaction();
  
  try {
    // 1. Generate plan ID (same ID system as production plans)
    const [{ max_id }] = await trx('mes.production_plans')
      .max('id as max_id');
    const nextNum = max_id ? parseInt(max_id.split('-')[1]) + 1 : 1;
    const planId = `PLAN-${nextNum.toString().padStart(3, '0')}`;
    
    console.log(`📋 Creating template: ${planId}`);
    
    // 2. Create template header - just a plan with status='template'
    await trx('mes.production_plans').insert({
      id: planId,
      work_order_code: workOrderCode,
      quote_id: quoteId || null,
      status: 'template', // Only difference from regular plans
      created_at: trx.fn.now()
    });
    
    // 2. Insert nodes if provided (templates can have pre-defined workflows)
    if (nodes && Array.isArray(nodes) && nodes.length > 0) {
      // Apply output code suffixes for finished products
      const processedNodes = applyOutputCodeSuffixes(nodes);
      
      for (const node of processedNodes) {
        // Insert node
        const [nodeRecord] = await trx('mes.production_plan_nodes')
          .insert({
            plan_id: planId,
            node_id: `${planId}-node-${node.sequenceOrder || node.nodeId}`,
            work_order_code: workOrderCode,
            name: node.name,
            operation_id: node.operationId,
            output_code: node.outputCode,
            output_qty: node.outputQty || 1,
            output_unit: node.outputUnit || 'adet',
            nominal_time: node.nominalTime || 0,
            efficiency: node.efficiency || 0.85,
            effective_time: node.effectiveTime || Math.ceil((node.nominalTime || 0) / (node.efficiency || 0.85)),
            sequence_order: node.sequenceOrder || node.nodeId,
            assignment_mode: node.assignmentMode || 'auto',
            created_at: trx.fn.now()
          })
          .returning('id');
        
        const nodeId = nodeRecord.id;
        
        // Insert material inputs if any
        if (node.materialInputs && node.materialInputs.length > 0) {
          const materialInputs = node.materialInputs.map(m => ({
            node_id: nodeId,
            material_code: m.materialCode,
            required_quantity: m.requiredQuantity,
            unit_ratio: m.unitRatio || 1.0,
            is_derived: m.isDerived || false,
            created_at: trx.fn.now()
          }));
          
          await trx('mes.node_material_inputs').insert(materialInputs);
        }
        
        // Insert station assignments if any
        if (node.stationIds && node.stationIds.length > 0) {
          const stationAssignments = node.stationIds.map((stId, idx) => ({
            node_id: nodeId,
            station_id: stId,
            priority: idx + 1,
            created_at: trx.fn.now()
          }));
          
          await trx('mes.node_stations').insert(stationAssignments);
        }
      }
    }
    
    await trx.commit();
    
    console.log(`✅ Template created: ${planId}${nodes ? ` with ${nodes.length} nodes` : ''}`);
    
    res.json({ 
      success: true, 
      id: planId,
      nodeCount: nodes ? nodes.length : 0,
      message: `Template ${planId} created successfully`
    });
    
  } catch (error) {
    await trx.rollback();
    
    // Handle duplicate key error
    if (error.code === '23505') { // PostgreSQL unique violation
      return res.status(409).json({ 
        error: 'Template with this work order code already exists',
        workOrderCode
      });
    }
    
    console.error('❌ Error creating template:', error);
    res.status(500).json({ 
      error: 'Failed to create template',
      details: error.message 
    });
  }
});

// DELETE /api/mes/templates/:id - Delete template (SQL)
router.delete('/templates/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Verify it's a template before deleting
    const [template] = await db('mes.production_plans')
      .where({ id, status: 'template' })
      .select('id');
    
    if (!template) {
      return res.status(404).json({ 
        error: 'Template not found or not a template' 
      });
    }
    
    // Delete template (CASCADE will delete related nodes)
    await db('mes.production_plans')
      .where({ id })
      .delete();
    
    console.log(`✅ Template deleted: ${id}`);
    
    res.json({ 
      success: true, 
      id,
      message: `Template ${id} deleted successfully`
    });
    
  } catch (error) {
    console.error('❌ Error deleting template:', error);
    res.status(500).json({ 
      error: 'Failed to delete template',
      details: error.message 
    });
  }
});

// ============================================================================
// MATERIALS ROUTES
// ============================================================================
// NOTE: The 'mes-materials' collection has been removed from the codebase.
// All materials are now stored in the unified 'materials' collection.
// If you have legacy data in 'mes-materials', it should be migrated to 'materials'
// before running this code.

// GET /api/mes/materials - Get all materials from unified materials collection
router.get('/materials', withAuth, async (req, res) => {
  try {
    const materials = await db('materials.materials')
      .select('*')
      .orderBy('name');
    
    res.json({ materials });
  } catch (error) {
    console.error('❌ Materials GET Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch materials',
      details: error.message 
    });
  }
});

// POST /api/mes/materials/check-availability - Check material availability for production plan
router.post('/materials/check-availability', withAuth, async (req, res) => {
  try {
    const { materials: requiredMaterials } = req.body;
    
    if (!Array.isArray(requiredMaterials)) {
      return res.status(400).json({ error: 'Required materials must be an array' });
    }

    // Fetch all materials from PostgreSQL
    const allMaterials = await db('materials.materials').select('*');
    
    // Build lookup map by code, id (auto-increment), and name
    const materialStockMap = new Map();
    
    allMaterials.forEach(mat => {
      const stock = parseFloat(mat.stock) || 0;
      const reserved = parseFloat(mat.reserved) || 0;
      const wipReserved = parseFloat(mat.wip_reserved) || 0;
      const available = stock - reserved - wipReserved;
      const code = mat.code;
      
      // Add to map with multiple keys for flexible lookup
      if (code) materialStockMap.set(code.toLowerCase(), { ...mat, code, stock: available });
      if (mat.id) materialStockMap.set(mat.id.toString().toLowerCase(), { ...mat, code, stock: available });
      if (mat.name) materialStockMap.set(mat.name.toLowerCase(), { ...mat, code, stock: available });
    });

    // Check each required material
    const materialChecks = requiredMaterials.map(required => {
      const requiredQty = parseFloat(required.required) || 0;
      
      // Try to find material by code, then id, then name
      let material = null;
      const searchKeys = [
        required.code?.toLowerCase(),
        required.id?.toString().toLowerCase(),
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
        canReserve
      };
    });

    const allAvailable = materialChecks.every(check => check.isAvailable);
    const shortages = materialChecks.filter(check => !check.isAvailable);
    const canReserveAll = materialChecks.every(check => check.canReserve);

    console.log(`🔍 Materials Availability: ${materialChecks.length} checked, ${shortages.length} shortages`);

    res.json({
      allAvailable,
      canReserveAll,
      materials: materialChecks,
      shortages,
      totalShortageItems: shortages.length,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Materials Check-Availability Error:', error);
    res.status(500).json({ 
      error: 'Failed to check material availability',
      details: error.message 
    });
  }
});

// ============================================================================
// ORDERS ROUTES - REMOVED (STEP 14)
// ============================================================================
// ❌ GET /orders endpoint REMOVED
// Reason: MES uses mes.work_orders, not mes-orders
// mes-orders collection was never used in production
// Materials orders are in materials.orders (supplier orders)
// This endpoint served no purpose and caused confusion

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

// PATCH /api/mes/approved-quotes/:workOrderCode/production-state - Update production state (SQL)
router.patch('/approved-quotes/:workOrderCode/production-state', withAuth, async (req, res) => {
  try {
    const { workOrderCode } = req.params;
    const { productionState } = req.body || {};
    
    if (!workOrderCode) {
      return res.status(400).json({ error: 'workOrderCode_required' });
    }
    
    if (!productionState) {
      return res.status(400).json({ error: 'productionState_required' });
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
      return res.status(400).json({ error: 'invalid_production_state' });
    }
    
    // Find and update approved quote
    const [approvedQuote] = await db('mes.approved_quotes')
      .where({ work_order_code: workOrderCode })
      .select('id', 'production_state', 'production_state_history');
    
    if (!approvedQuote) {
      return res.status(404).json({ 
        error: `${workOrderCode} için onaylı teklif bulunamadı. Quotes ekranından bu work order'ı oluşturup tekrar deneyin.`,
        code: 'approved_quote_not_found'
      });
    }
    
    // Build history entry
    const historyEntry = {
      state: productionState,
      timestamp: new Date().toISOString(),
      updatedBy: req.user?.email || 'system'
    };
    
    // Append to history array (PostgreSQL jsonb append)
    const currentHistory = approvedQuote.production_state_history || [];
    const updatedHistory = [...currentHistory, historyEntry];
    
    // Update production state
    await db('mes.approved_quotes')
      .where({ work_order_code: workOrderCode })
      .update({
        production_state: productionState,
        production_state_updated_at: db.fn.now(),
        production_state_updated_by: req.user?.email || 'system',
        production_state_history: JSON.stringify(updatedHistory),
        updated_at: db.fn.now()
      });
    
    console.log(`✅ Production state updated: ${workOrderCode} → ${productionState}`);
    
    res.json({
      success: true,
      workOrderCode,
      productionState,
      updatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error updating production state:', error);
    res.status(500).json({ 
      error: 'Failed to update production state',
      details: error.message 
    });
  }
});

// ============================================================================
// WORKER ASSIGNMENTS ROUTES - ✅ MIGRATED TO SQL (STEP 8)
// ============================================================================
// NOTE: Assignments are created by production-plans/:planId/launch endpoint
// These endpoints manage existing assignments (view, start, complete)

// GET /api/mes/worker-assignments - Get all active assignments (supervisor dashboard)
// ✅ MIGRATED TO SQL - STEP 8
router.get('/worker-assignments', withAuth, async (req, res) => {
  try {
    const result = await db('mes.worker_assignments as wa')
      .select(
        'wa.*',
        'w.name as worker_name',
        's.name as substation_name',
        'o.name as operation_name',
        'p.id as plan_id',
        'pn.name as node_name'
      )
      .join('mes.workers as w', 'w.id', 'wa.worker_id')
      .join('mes.substations as s', 's.id', 'wa.substation_id')
      .join('mes.operations as o', 'o.id', 'wa.operation_id')
      .join('mes.production_plans as p', 'p.id', 'wa.plan_id')
      .join('mes.production_plan_nodes as pn', 'pn.id', 'wa.node_id')
      .whereIn('wa.status', ['pending', 'in_progress', 'queued'])
      .orderBy('wa.estimated_start_time', 'asc');
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching worker assignments:', error);
    res.status(500).json({ error: 'Failed to fetch worker assignments' });
  }
});

// GET /api/mes/worker-assignments/:workerId - Get assignments for specific worker
// ✅ MIGRATED TO SQL - STEP 8
router.get('/worker-assignments/:workerId', withAuth, async (req, res) => {
  const { workerId } = req.params;
  
  try {
    const result = await db('mes.worker_assignments as wa')
      .select(
        'wa.*',
        's.name as substation_name',
        'o.name as operation_name',
        'p.id as plan_id',
        'pn.name as node_name',
        'pn.output_code',
        'pn.output_qty as node_quantity'
      )
      .join('mes.substations as s', 's.id', 'wa.substation_id')
      .join('mes.operations as o', 'o.id', 'wa.operation_id')
      .join('mes.production_plans as p', 'p.id', 'wa.plan_id')
      .join('mes.production_plan_nodes as pn', 'pn.id', 'wa.node_id')
      .where('wa.worker_id', workerId)
      .whereIn('wa.status', ['pending', 'in_progress', 'queued'])
      .orderBy('wa.sequence_number', 'asc');
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching worker assignments:', error);
    res.status(500).json({ error: 'Failed to fetch worker assignments' });
  }
});

// POST /api/mes/worker-assignments/:id/start - Worker starts a task
// ✅ MIGRATED TO SQL - STEP 8
router.post('/worker-assignments/:id/start', withAuth, async (req, res) => {
  const { id } = req.params;
  
  const trx = await db.transaction();
  try {
    // Get assignment details
    const [assignment] = await trx('mes.worker_assignments')
      .where({ id })
      .select('*');
    
    if (!assignment) {
      await trx.rollback();
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Verify status is pending
    if (assignment.status !== 'pending') {
      await trx.rollback();
      return res.status(400).json({ 
        error: `Cannot start assignment with status ${assignment.status}` 
      });
    }
    
    // Update assignment to in_progress
    await trx('mes.worker_assignments')
      .where({ id })
      .update({
        status: 'in_progress',
        started_at: trx.fn.now()
      });
    
    // Update substation status
    await trx('mes.substations')
      .where({ id: assignment.substation_id })
      .update({
        status: 'in_use',
        current_assignment_id: id,
        updated_at: trx.fn.now()
      });
    
    // Update node status
    await trx('mes.production_plan_nodes')
      .where({ id: assignment.node_id })
      .update({
        status: 'in_progress',
        started_at: trx.fn.now()
      });
    
    // TODO: Reserve materials (FIFO deduction)
    // This will be implemented in materials management phase
    
    await trx.commit();
    
    res.json({ 
      success: true, 
      id,
      status: 'in_progress',
      startedAt: new Date()
    });
  } catch (error) {
    await trx.rollback();
    console.error('Error starting assignment:', error);
    res.status(500).json({ error: 'Failed to start assignment' });
  }
});

// POST /api/mes/worker-assignments/:id/complete - Worker completes a task
// ✅ MIGRATED TO SQL - STEP 8
router.post('/worker-assignments/:id/complete', withAuth, async (req, res) => {
  const { id } = req.params;
  const { actualQuantity, notes } = req.body;
  
  const trx = await db.transaction();
  try {
    // Get assignment details
    const [assignment] = await trx('mes.worker_assignments')
      .where({ id })
      .select('*');
    
    if (!assignment) {
      await trx.rollback();
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Verify status is in_progress
    if (assignment.status !== 'in_progress') {
      await trx.rollback();
      return res.status(400).json({ 
        error: `Cannot complete assignment with status ${assignment.status}` 
      });
    }
    
    // Update assignment to completed
    await trx('mes.worker_assignments')
      .where({ id })
      .update({
        status: 'completed',
        completed_at: trx.fn.now(),
        actual_quantity: actualQuantity,
        notes: notes
      });
    
    // Free substation
    await trx('mes.substations')
      .where({ id: assignment.substation_id })
      .update({
        status: 'available',
        current_assignment_id: null,
        updated_at: trx.fn.now()
      });
    
    // Update node status
    await trx('mes.production_plan_nodes')
      .where({ id: assignment.node_id })
      .update({
        status: 'completed',
        completed_at: trx.fn.now(),
        actual_quantity: actualQuantity
      });
    
    // Activate next queued task for this worker (if any)
    const [nextQueued] = await trx('mes.worker_assignments')
      .where({
        worker_id: assignment.worker_id,
        status: 'queued'
      })
      .orderBy('sequence_number', 'asc')
      .limit(1);
    
    if (nextQueued) {
      await trx('mes.worker_assignments')
        .where({ id: nextQueued.id })
        .update({
          status: 'pending'
        });
    }
    
    // TODO: Create WIP output record (lot tracking)
    // This will be implemented in materials management phase
    
    await trx.commit();
    
    res.json({ 
      success: true, 
      id,
      status: 'completed',
      completedAt: new Date()
    });
  } catch (error) {
    await trx.rollback();
    console.error('Error completing assignment:', error);
    res.status(500).json({ error: 'Failed to complete assignment' });
  }
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
        
        // Priority system (PROMPT 2-4, 11)
        priority: assignment.priority || 2, // 1=Low, 2=Normal, 3=High
        expectedStart: assignment.expectedStart || assignment.plannedStart || null,
        optimizedIndex: assignment.optimizedIndex || null,
        optimizedStart: assignment.optimizedStart || null,
        schedulingMode: assignment.schedulingMode || 'fifo',
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
    
    // ✅ Initialize canStart=false for all tasks
    allTasks.forEach(task => {
      task.canStart = false;
    });
    
    // ✅ canStart logic: WORKER-LEVEL FIFO (not per work order)
    // Filter active tasks (pending/ready/in-progress) across ALL work orders
    const activeTasks = allTasks.filter(t => 
      t.status === 'pending' || t.status === 'in-progress' || t.status === 'in_progress' || t.status === 'ready'
    );
    
    // Already sorted by expectedStart above
    
    // Find first pending/ready task
    const firstPendingIndex = activeTasks.findIndex(t => t.status === 'pending' || t.status === 'ready');
    
    // Set canStart: isUrgent=true -> all can start, otherwise only first pending
    activeTasks.forEach((task, index) => {
      if (task.status === 'in-progress' || task.status === 'in_progress') {
        task.canStart = false; // Already started
      } else {
        // ✅ Worker can start: urgent tasks OR first pending task (FIFO)
        task.canStart = task.isUrgent || (index === firstPendingIndex);
      }
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
            console.log(`   Assignment Status: ${assignment.status}`);
            console.log(`   Execution State Status: ${currentTask.status}`);
            console.log(`   Prerequisites:`, currentTask.prerequisites);
            console.log(`   Node ID: ${currentTask.nodeId}`);
            console.log(`   Predecessors:`, currentTask.predecessors);
            
            // Check if task status is ready, pending, or paused (use ASSIGNMENT status, not execution state)
            if (assignment.status === 'paused' && assignment.pauseContext === 'plan') {
              const e = new Error('Task cannot be started: paused by admin');
              e.status = 400;
              e.code = 'precondition_failed';
              throw e;
            }
            
            if (assignment.status !== 'ready' && assignment.status !== 'pending' && assignment.status !== 'paused') {
              console.error(`❌ Task ${assignmentId} has invalid status for starting: ${assignment.status}`);
              const e = new Error(`Task cannot be started: current status is ${assignment.status}`);
              e.status = 400;
              e.code = 'precondition_failed';
              throw e;
            }
            
            // Check prerequisites (skip predecessor check if urgent)
            const prereqs = currentTask.prerequisites || {};
            const failedPrereqs = [];
            
            // ✅ URGENT tasks can bypass predecessor check
            if (!assignment.isUrgent && !prereqs.predecessorsDone) {
              failedPrereqs.push('Önceki görevler tamamlanmadı');
            }
            if (!prereqs.workerAvailable) failedPrereqs.push('İşçi meşgul');
            if (!prereqs.substationAvailable) failedPrereqs.push('Alt istasyon meşgul');
            if (!prereqs.materialsReady) failedPrereqs.push('Malzeme eksik');
            
            if (failedPrereqs.length > 0) {
              console.error(`❌ Prerequisites failed for ${assignmentId}:`, failedPrereqs);
              const e = new Error(`Preconditions not met: ${failedPrereqs.join(', ')}`);
              e.status = 400;
              e.code = 'precondition_failed';
              e.details = failedPrereqs;
              throw e;
            }
            
            console.log(`✅ Prerequisites passed for ${assignmentId} (isUrgent: ${assignment.isUrgent})`);
            
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

// POST /api/mes/work-packages/:id/scrap - Record scrap entry during task (SQL)
router.post('/work-packages/:id/scrap', withAuth, async (req, res) => {
  const { id: assignmentId } = req.params;
  const { scrapType, entry } = req.body;
  
  // Validate scrap type
  const validTypes = ['input_damaged', 'production_scrap', 'output_scrap'];
  if (!validTypes.includes(scrapType)) {
    return res.status(400).json({ error: 'Invalid scrap type' });
  }
  
  // Validate entry
  if (!entry || !entry.materialCode || !entry.quantity || entry.quantity <= 0) {
    return res.status(400).json({ error: 'Invalid scrap entry' });
  }
  
  try {
    // Get current assignment
    const [assignment] = await db('mes.worker_assignments')
      .where({ id: assignmentId })
      .select('status', 'input_scrap_count', 'production_scrap_count', 'defect_quantity');
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // Check if task is in progress or just completed
    if (assignment.status !== 'in_progress' && assignment.status !== 'completed') {
      return res.status(400).json({ 
        error: 'Task must be in progress or completed to record scrap' 
      });
    }
    
    // Update appropriate counter (JSONB)
    const updateData = {};
    
    if (scrapType === 'input_damaged') {
      const current = assignment.input_scrap_count || {};
      current[entry.materialCode] = (current[entry.materialCode] || 0) + entry.quantity;
      updateData.input_scrap_count = current;
      
    } else if (scrapType === 'production_scrap') {
      const current = assignment.production_scrap_count || {};
      current[entry.materialCode] = (current[entry.materialCode] || 0) + entry.quantity;
      updateData.production_scrap_count = current;
      
    } else if (scrapType === 'output_scrap') {
      updateData.defect_quantity = (assignment.defect_quantity || 0) + entry.quantity;
    }
    
    await db('mes.worker_assignments')
      .where({ id: assignmentId })
      .update(updateData);
    
    console.log(`✅ Scrap counter updated for assignment ${assignmentId}: ${scrapType}, +${entry.quantity} ${entry.materialCode}`);
    
    res.json({
      success: true,
      assignmentId,
      scrapType,
      materialCode: entry.materialCode,
      quantity: entry.quantity,
      operation: 'increment'
    });
    
  } catch (error) {
    console.error('Error recording scrap:', error);
    res.status(500).json({ error: 'Failed to record scrap' });
  }
});

// GET /api/mes/work-packages/:id/scrap - Get current scrap log (SQL)
router.get('/work-packages/:id/scrap', withAuth, async (req, res) => {
  const { id: assignmentId } = req.params;
  
  try {
    const [assignment] = await db('mes.worker_assignments')
      .where({ id: assignmentId })
      .select('input_scrap_count', 'production_scrap_count', 'defect_quantity', 'status');
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    res.json({
      assignmentId,
      inputScrapCounters: assignment.input_scrap_count || {},
      productionScrapCounters: assignment.production_scrap_count || {},
      defectQuantity: assignment.defect_quantity || 0,
      status: assignment.status
    });
    
  } catch (error) {
    console.error('Error fetching scrap:', error);
    res.status(500).json({ error: 'Failed to fetch scrap counters' });
  }
});

// DELETE /api/mes/work-packages/:id/scrap/:scrapType/:materialCode/:quantity - Decrease scrap counter (SQL)
router.delete('/work-packages/:id/scrap/:scrapType/:materialCode/:quantity', withAuth, async (req, res) => {
  const { id: assignmentId, scrapType, materialCode, quantity } = req.params;
  const decrementAmount = parseFloat(quantity);
  
  if (isNaN(decrementAmount) || decrementAmount <= 0) {
    return res.status(400).json({ error: 'Invalid quantity' });
  }
  
  const validTypes = ['input_damaged', 'production_scrap', 'output_scrap'];
  if (!validTypes.includes(scrapType)) {
    return res.status(400).json({ error: 'Invalid scrap type' });
  }
  
  try {
    const [assignment] = await db('mes.worker_assignments')
      .where({ id: assignmentId })
      .select('input_scrap_count', 'production_scrap_count', 'defect_quantity');
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    const updateData = {};
    
    if (scrapType === 'input_damaged') {
      const current = assignment.input_scrap_count || {};
      current[materialCode] = Math.max(0, (current[materialCode] || 0) - decrementAmount);
      updateData.input_scrap_count = current;
      
    } else if (scrapType === 'production_scrap') {
      const current = assignment.production_scrap_count || {};
      current[materialCode] = Math.max(0, (current[materialCode] || 0) - decrementAmount);
      updateData.production_scrap_count = current;
      
    } else if (scrapType === 'output_scrap') {
      updateData.defect_quantity = Math.max(0, (assignment.defect_quantity || 0) - decrementAmount);
    }
    
    await db('mes.worker_assignments')
      .where({ id: assignmentId })
      .update(updateData);
    
    console.log(`✅ Scrap counter decreased for assignment ${assignmentId}: ${scrapType}, -${decrementAmount} ${materialCode}`);
    
    res.json({
      success: true,
      assignmentId,
      scrapType,
      materialCode,
      decrementAmount,
      operation: 'decrement'
    });
    
  } catch (error) {
    console.error('Error decreasing scrap:', error);
    res.status(500).json({ error: 'Failed to decrease scrap counter' });
  }
});

// ============================================================================
// ALERTS ROUTES
// ============================================================================

// ============================================================================
// ALERTS ROUTES (SQL MIGRATION - STEP 11)
// ============================================================================

// GET /api/mes/alerts - Get alerts with optional filtering (SQL)
router.get('/alerts', withAuth, async (req, res) => {
  try {
    const { type, status, limit } = req.query;
    
    let query = db('mes.alerts')
      .select(
        'id',
        'type',
        'severity',
        'title',
        'message',
        'metadata',
        'is_read',
        'is_resolved',
        'created_at',
        'resolved_at',
        'resolved_by'
      );
    
    // Apply filters
    if (type) {
      query = query.where('type', type);
    }
    
    if (status) {
      // Map status to is_resolved/is_read flags
      if (status === 'active') {
        query = query.where('is_resolved', false);
      } else if (status === 'resolved') {
        query = query.where('is_resolved', true);
      }
    }
    
    // Order by most recent
    query = query.orderBy('created_at', 'desc');
    
    // Apply limit
    if (limit) {
      const limitNum = parseInt(limit, 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        query = query.limit(limitNum);
      }
    }
    
    const alerts = await query;
    
    console.log(`📢 Alerts: Found ${alerts.length} alerts`);
    
    res.json({ alerts });
  } catch (error) {
    console.error('❌ Error fetching alerts:', error);
    res.status(500).json({ 
      error: 'Failed to fetch alerts',
      details: error.message,
      alerts: [] // Return empty array as fallback
    });
  }
});

// ============================================================================
// SUB-STATIONS ROUTES (SQL MIGRATION - STEP 4)
// ============================================================================

// GET /api/mes/substations - Get all substations (SQL)
router.get('/substations', withAuth, async (req, res) => {
  try {
    const { stationId } = req.query;
    
    let query = db('mes.substations')
      .select(
        'id',
        'name',
        'station_id',
        'description',
        'is_active',
        'created_at',
        'updated_at'
      )
      .where('is_active', true);
    
    // Optional filter by station
    if (stationId) {
      query = query.where('station_id', stationId);
    }
    
    const substations = await query.orderBy('id');
    
    res.json(substations);
  } catch (error) {
    console.error('Error fetching substations:', error);
    res.status(500).json({ error: 'Failed to fetch substations' });
  }
});

// POST /api/mes/substations - Create new substation (SQL)
// ID Format: ST-XXX-XXX-XX (örn: ST-Ar-001-01, ST-Ka-002-01)
router.post('/substations', withAuth, async (req, res) => {
  const { name, station_id, description } = req.body;
  
  if (!name || !station_id) {
    return res.status(400).json({ error: 'Name and station_id are required' });
  }
  
  try {
    // Get station info for code prefix
    const station = await db('mes.stations')
      .select('id', 'substations')
      .where('id', station_id)
      .first();
    
    if (!station) {
      return res.status(404).json({ error: 'Station not found' });
    }
    
    // Parse station code (ST-Ar-001 → Ar-001)
    const stationCode = station_id.replace('ST-', '');
    
    // Count existing substations for this station
    const existingCount = await db('mes.substations')
      .where('station_id', station_id)
      .count('* as count');
    
    const nextNum = parseInt(existingCount[0].count) + 1;
    const newId = `ST-${stationCode}-${nextNum.toString().padStart(2, '0')}`;
    
    // Insert substation
    const result = await db('mes.substations')
      .insert({
        id: newId,
        name,
        station_id,
        description,
        is_active: true,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      })
      .returning('*');
    
    // Update station's substations array
    const currentSubstations = station.substations || [];
    await db('mes.stations')
      .where('id', station_id)
      .update({
        substations: JSON.stringify([...currentSubstations, newId]),
        updated_at: db.fn.now()
      });
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error creating substation:', error);
    res.status(500).json({ error: 'Failed to create substation', details: error.message });
  }
});

// POST /api/mes/substations/reset-all - Reset all substations (SQL - simplified for Phase 1)
router.post('/substations/reset-all', withAuth, async (req, res) => {
  try {
    console.log('🔧 Resetting all substations to active state...');
    
    // Simple reset: ensure all substations are active
    // Note: Worker assignments and task tracking will be implemented in Phase 2
    const result = await db('mes.substations')
      .update({
        is_active: true,
        updated_at: db.fn.now()
      })
      .returning('id');
    
    const resetCount = result.length;
    
    console.log(`✅ Reset complete: ${resetCount} substation(s) set to active`);
    
    res.json({
      success: true,
      resetCount,
      message: `${resetCount} alt istasyon sıfırlandı`
    });
  } catch (error) {
    console.error('Error resetting substations:', error);
    res.status(500).json({ error: 'Failed to reset substations' });
  }
});

// PATCH /api/mes/substations/:id - Update substation (SQL)
// Soft delete (is_active=false) also removes from station's substations array
router.patch('/substations/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  const { name, description, station_id, is_active } = req.body;
  
  try {
    // Get current substation to know which station it belongs to
    const currentSubstation = await db('mes.substations')
      .select('station_id', 'is_active')
      .where({ id })
      .first();
    
    if (!currentSubstation) {
      return res.status(404).json({ error: 'Substation not found' });
    }
    
    const updateData = {
      updated_at: db.fn.now()
    };
    
    // Only update provided fields
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (station_id !== undefined) updateData.station_id = station_id;
    if (is_active !== undefined) updateData.is_active = is_active;
    
    const result = await db('mes.substations')
      .where({ id })
      .update(updateData)
      .returning('*');
    
    // If soft deleting (is_active=false), remove from station's substations array
    if (is_active === false && currentSubstation.is_active === true) {
      const station = await db('mes.stations')
        .select('substations')
        .where('id', currentSubstation.station_id)
        .first();
      
      if (station && station.substations) {
        const updatedSubstations = (station.substations || []).filter(subId => subId !== id);
        await db('mes.stations')
          .where('id', currentSubstation.station_id)
          .update({
            substations: JSON.stringify(updatedSubstations),
            updated_at: db.fn.now()
          });
      }
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error('Error updating substation:', error);
    res.status(500).json({ error: 'Failed to update substation' });
  }
});

// GET /api/mes/substations/:id/details - Get detailed info about a substation (SQL)
router.get('/substations/:id/details', withAuth, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get substation with station info
    const substation = await db('mes.substations as s')
      .select(
        's.id',
        's.name',
        's.station_id',
        's.description',
        's.is_active',
        's.created_at',
        's.updated_at',
        'st.name as station_name'
      )
      .leftJoin('mes.stations as st', 's.station_id', 'st.id')
      .where('s.id', id)
      .first();
    
    if (!substation) {
      return res.status(404).json({ error: 'Substation not found' });
    }
    
    // Note: Active assignments and task tracking will be implemented in Phase 2
    // For now, return basic substation info with station details
    res.json({
      ...substation,
      currentTask: null,
      upcomingTasks: []
    });
  } catch (error) {
    console.error('Error fetching substation details:', error);
    res.status(500).json({ error: 'Failed to fetch substation details' });
  }
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
 * 
 * DEPRECATED: Firebase version - MIGRATED TO SQL (see line ~9536)
 * Disabled to prevent conflict with new SQL endpoint
 */
/* DISABLED - OLD FIREBASE LAUNCH
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
        
        // FIFO scheduling fields
        expectedStart: assignment.plannedStart,
        priority: 2,  // Default: Normal priority (1=Low, 2=Normal, 3=High)
        optimizedIndex: null,  // Not optimized yet
        optimizedStart: null,  // No optimization result
        schedulingMode: 'fifo',  // Default scheduling mode
        
        isUrgent: false,  // Default to normal priority
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
// URGENT PRIORITY MANAGEMENT
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
 * Get default work schedule for a given day
 * Used when worker has no personalSchedule or personalSchedule.blocks is empty
 * 
 * @param {string} dayName - Day name (lowercase: monday, tuesday, etc.)
 * @returns {Array} - Array of schedule blocks: [{ type: 'work'|'break', start: 'HH:MM', end: 'HH:MM' }]
 */
function getDefaultWorkSchedule(dayName) {
  const defaultSchedules = {
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
    saturday: [],  // Hafta sonu çalışmıyor
    sunday: []     // Hafta sonu çalışmıyor
  };
  
  return defaultSchedules[dayName.toLowerCase()] || [];
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
  const dayName = startTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  
  // Use personal schedule if exists and has blocks, otherwise use default
  if (selectedWorker.personalSchedule && selectedWorker.personalSchedule.blocks) {
    const dayBlocks = selectedWorker.personalSchedule.blocks[dayName];
    if (Array.isArray(dayBlocks) && dayBlocks.length > 0) {
      scheduleBlocks = dayBlocks;
    } else {
      // Personal schedule exists but this day is empty, use default
      scheduleBlocks = getDefaultWorkSchedule(dayName);
      console.log(`⏰ Worker ${selectedWorker.id} has no blocks for ${dayName}, using default schedule`);
    }
  } else {
    // No personal schedule, use default
    scheduleBlocks = getDefaultWorkSchedule(dayName);
    console.log(`⏰ Worker ${selectedWorker.id} has no personalSchedule, using default schedule`);
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
 * OLD Firebase POST /production-plans/:planId/pause - MIGRATED TO SQL (see line ~10249)
 * Removed: Use new SQL endpoint below
 */
/* REMOVED - OLD FIREBASE ROUTE
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
 * OLD Firebase POST /production-plans/:planId/resume - MIGRATED TO SQL (see line ~10281)
 * Removed: Use new SQL endpoint below
 */
/* REMOVED - OLD FIREBASE ROUTE
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
// GET /api/mes/work-packages - Dashboard view with full joins (SQL)
router.get('/work-packages', withAuth, async (req, res) => {
  try {
    const { status, workerId, stationId, limit } = req.query;
    const maxResults = Math.min(parseInt(limit) || 100, 500);
    
    // Build query with filters
    let query = db('mes.worker_assignments as wa')
      .select(
        // Assignment core
        'wa.id',
        'wa.node_id',
        'wa.operation_id',
        'wa.status',
        'wa.priority',
        'wa.is_urgent',
        'wa.sequence_number',
        
        // Worker data
        'wa.worker_id',
        'w.name as worker_name',
        'w.skills as worker_skills',
        
        // Station/Substation data
        'wa.station_id',
        'st.name as station_name',
        'wa.substation_id',
        's.name as substation_name',
        
        // Operation data
        'o.name as operation_name',
        
        // Plan data
        'wa.plan_id',
        'pn.name as node_name',
        'pn.output_code',
        'pn.output_qty as node_quantity',
        
        // Work order data
        'wa.work_order_code',
        'qq.customer_name as customer',
        db.raw('NULL as product_name'), // TODO: Get from quote_items or form_data
        
        // Timing
        'wa.estimated_start_time as expected_start',
        'wa.estimated_end_time as planned_end',
        'wa.started_at as actual_start',
        'wa.completed_at as actual_end',
        
        // Material data
        'wa.materials as material_inputs',
        'wa.pre_production_reserved_amount',
        'wa.actual_reserved_amounts',
        'wa.material_reservation_status',
        
        // Scrap tracking
        'wa.input_scrap_count',
        'wa.production_scrap_count',
        'wa.defect_quantity',
        
        // Metadata
        'wa.created_at',
        'wa.actual_quantity',
        'wa.notes'
      )
      .leftJoin('mes.workers as w', 'w.id', 'wa.worker_id')
      .leftJoin('mes.stations as st', 'st.id', 'wa.station_id')
      .leftJoin('mes.substations as s', 's.id', 'wa.substation_id')
      .leftJoin('mes.operations as o', 'o.id', 'wa.operation_id')
      .leftJoin('mes.production_plan_nodes as pn', 'pn.id', 'wa.node_id')
      .leftJoin('mes.approved_quotes as aq', 'aq.work_order_code', 'wa.work_order_code')
      .leftJoin('quotes.quotes as qq', 'qq.work_order_code', 'aq.work_order_code')
      .orderBy('wa.estimated_start_time', 'asc')
      .limit(maxResults);
    
    // Apply filters
    if (status) {
      query = query.where('wa.status', status);
    }
    if (workerId) {
      query = query.where('wa.worker_id', workerId);
    }
    if (stationId) {
      query = query.where('wa.station_id', stationId);
    }
    
    const workPackages = await query;
    
    console.log(`📦 Work Packages Query: Found ${workPackages.length} assignments (limit: ${maxResults})`);
    
    // Transform to frontend format
    const transformed = workPackages.map(wp => ({
      id: wp.id,
      assignmentId: wp.id,
      workPackageId: wp.id,
      nodeId: wp.node_id,
      nodeName: wp.node_name,
      operationName: wp.operation_name,
      operationId: wp.operation_id,
      status: wp.status,
      priority: wp.priority || 2,
      isUrgent: wp.is_urgent || false,
      
      // Work order
      workOrderCode: wp.work_order_code,
      customer: wp.customer || '',
      productName: wp.product_name || '',
      
      // Worker
      workerId: wp.worker_id,
      workerName: wp.worker_name,
      workerSkills: wp.worker_skills || [],
      
      // Station
      stationId: wp.station_id,
      stationName: wp.station_name,
      substationId: wp.substation_id,
      substationCode: wp.substation_name,
      
      // Material
      materialInputs: wp.material_inputs || {},
      preProductionReservedAmount: wp.pre_production_reserved_amount || {},
      actualReservedAmounts: wp.actual_reserved_amounts || {},
      materialReservationStatus: wp.material_reservation_status,
      outputCode: wp.output_code,
      
      // Timing
      expectedStart: wp.expected_start,
      plannedEnd: wp.planned_end,
      actualStart: wp.actual_start,
      actualEnd: wp.actual_end,
      
      // Scrap
      inputScrapCount: wp.input_scrap_count || {},
      productionScrapCount: wp.production_scrap_count || {},
      defectQuantity: wp.defect_quantity || 0,
      
      // Status flags
      isPaused: wp.status === 'paused',
      materialStatus: wp.material_reservation_status === 'reserved' ? 'ok' : 'pending',
      
      // Metadata
      createdAt: wp.created_at,
      actualQuantity: wp.actual_quantity,
      notes: wp.notes
    }));
    
    res.json({
      workPackages: transformed,
      total: transformed.length,
      filters: { status, workerId, stationId },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Work packages fetch error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to fetch work packages',
      details: error.message
    });
  }
});

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

// ============================================================================
// LOT TRACKING ENDPOINTS (Phase 2)
// ============================================================================

/**
 * POST /api/mes/assignments/:assignmentId/start
 * Start a production task with FIFO lot consumption
 * 
 * Request body:
 * {
 *   materialRequirements: [
 *     { materialCode: 'M-00-001', requiredQty: 100 },
 *     { materialCode: 'M-00-002', requiredQty: 50 }
 *   ]
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   assignmentId: 'WO-001-001',
 *   startTime: '2025-11-20T10:30:00Z',
 *   lotsConsumed: [
 *     {
 *       materialCode: 'M-00-001',
 *       lotsUsed: [
 *         { lotNumber: 'LOT-M-00-001-001', qty: 50 },
 *         { lotNumber: 'LOT-M-00-001-002', qty: 50 }
 *       ]
 *     }
 *   ],
 *   warnings: []
 * }
 */
router.post('/assignments/:assignmentId/start', withAuth, async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { materialRequirements = [] } = req.body;
    
    console.log(`🚀 [MES] Starting task: ${assignmentId}`);
    console.log(`📋 [MES] Material requirements:`, JSON.stringify(materialRequirements, null, 2));
    
    // Validate assignment exists (in Firebase for now)
    const db = getFirestore();
    const assignmentRef = db.collection('mes-worker-assignments').doc(assignmentId);
    const assignmentDoc = await assignmentRef.get();
    
    if (!assignmentDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'Assignment not found' 
      });
    }
    
    const assignmentData = assignmentDoc.data();
    
    // Check if already started
    if (assignmentData.status === 'in_progress' || assignmentData.status === 'completed') {
      return res.status(400).json({ 
        success: false,
        error: `Assignment already ${assignmentData.status}` 
      });
    }
    
    // Reserve materials with FIFO lot tracking
    let lotResult = { success: true, reservations: [], warnings: [] };
    
    if (materialRequirements.length > 0) {
      lotResult = await reserveMaterialsWithLotTracking(
        assignmentId,
        materialRequirements
      );
      
      if (!lotResult.success) {
        console.error(`❌ [MES] Material reservation failed for ${assignmentId}:`, lotResult.error);
        return res.status(500).json({
          success: false,
          error: 'Material reservation failed',
          details: lotResult.error
        });
      }
      
      if (lotResult.warnings.length > 0) {
        console.warn(`⚠️  [MES] Warnings during material reservation:`, lotResult.warnings);
      }
    }
    
    // Update assignment status
    const startTime = new Date();
    await assignmentRef.update({
      status: 'in_progress',
      actual_start: startTime,
      material_reservation_status: materialRequirements.length > 0 ? 'reserved' : 'not_required',
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_by: req.user?.email || 'system'
    });
    
    // Update worker's current task (if worker assigned)
    if (assignmentData.workerId) {
      await db.collection('mes-workers').doc(assignmentData.workerId).update({
        current_task_assignment_id: assignmentId,
        status: 'working',
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    console.log(`✅ [MES] Task started successfully: ${assignmentId}`);
    
    // Format response with lot consumption details
    const lotsConsumed = lotResult.reservations.map(res => ({
      materialCode: res.materialCode,
      lotsUsed: res.lotsConsumed.map(lot => ({
        lotNumber: lot.lotNumber,
        qty: lot.qty,
        lotDate: lot.lotDate
      })),
      totalReserved: res.totalReserved,
      partialReservation: res.partialReservation
    }));
    
    res.json({
      success: true,
      assignmentId,
      startTime: startTime.toISOString(),
      lotsConsumed,
      warnings: lotResult.warnings,
      message: lotResult.warnings.length > 0 
        ? 'Task started with warnings (partial reservations)'
        : 'Task started successfully'
    });
    
  } catch (error) {
    console.error('❌ [MES] Error starting assignment:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to start assignment',
      details: error.message 
    });
  }
});

/**
 * GET /api/mes/assignments/:assignmentId/lot-preview
 * Preview which lots will be consumed (without actually reserving)
 * 
 * STEP 7 ENHANCEMENT: Automatically fetches material requirements from node
 * 
 * Query params:
 * - materialRequirements: JSON string (optional - if not provided, fetched from node)
 * 
 * Response:
 * {
 *   success: true,
 *   assignmentId: 'WO-001-001',
 *   materials: [
 *     {
 *       materialCode: 'M-00-001',
 *       materialName: 'Çelik Sac',
 *       requiredQty: 100,
 *       lotsToConsume: [
 *         { lotNumber: 'LOT-M-00-001-001', lotDate: '2025-11-01', qty: 50 },
 *         { lotNumber: 'LOT-M-00-001-002', lotDate: '2025-11-15', qty: 50 }
 *       ],
 *       totalAvailable: 250,
 *       sufficient: true
 *     }
 *   ]
 * }
 */
router.get('/assignments/:assignmentId/lot-preview', async (req, res) => {
  try {
    const { assignmentId } = req.params;
    
    console.log(`🔍 [FIFO] Lot preview for assignment: ${assignmentId}`);
    
    // Get assignment details to fetch node_id and plan_id
    const assignment = await db('mes.worker_assignments')
      .select('node_id', 'plan_id')
      .where('id', assignmentId)
      .first();
    
    if (!assignment) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found'
      });
    }
    
    // Get material requirements from node (or use provided ones)
    let materialRequirements = [];
    
    if (req.query.materialRequirements) {
      // Use provided material requirements
      try {
        materialRequirements = JSON.parse(req.query.materialRequirements);
      } catch (e) {
        return res.status(400).json({ 
          success: false,
          error: 'Invalid materialRequirements format' 
        });
      }
    } else {
      // Fetch from node_material_inputs
      materialRequirements = await db('mes.node_material_inputs')
        .select(
          'material_code as materialCode',
          'quantity as requiredQty'
        )
        .where('node_id', parseInt(assignment.node_id))
        .where('plan_id', assignment.plan_id);
    }
    
    console.log(`📋 [FIFO] Found ${materialRequirements.length} material requirement(s) for preview`);
    
    // Get lot consumption preview (read-only, no reservation)
    const preview = await getLotConsumptionPreview(materialRequirements);
    
    res.json({
      success: true,
      assignmentId,
      ...preview
    });
    
  } catch (error) {
    console.error('❌ [FIFO] Error generating lot preview:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate lot preview',
      details: error.message 
    });
  }
});

/**
 * POST /api/mes/assignments/:assignmentId/cancel
 * Cancel a task and release reserved materials
 */
router.post('/assignments/:assignmentId/cancel', withAuth, async (req, res) => {
  try {
    const { assignmentId } = req.params;
    
    console.log(`🚫 [MES] Cancelling assignment: ${assignmentId}`);
    
    // Release material reservations
    const releaseResult = await releaseMaterialReservations(assignmentId);
    
    if (!releaseResult.success) {
      console.error(`❌ [MES] Failed to release reservations:`, releaseResult.error);
    }
    
    // Update assignment status
    const db = getFirestore();
    await db.collection('mes-worker-assignments').doc(assignmentId).update({
      status: 'cancelled',
      material_reservation_status: 'released',
      cancelled_at: admin.firestore.FieldValue.serverTimestamp(),
      cancelled_by: req.user?.email || 'system'
    });
    
    console.log(`✅ [MES] Assignment cancelled: ${assignmentId}`);
    
    res.json({
      success: true,
      assignmentId,
      message: releaseResult.message || 'Assignment cancelled successfully'
    });
    
  } catch (error) {
    console.error('❌ [MES] Error cancelling assignment:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to cancel assignment',
      details: error.message 
    });
  }
});

/**
 * POST /api/mes/assignments/:assignmentId/complete
 * Complete a task and mark materials as consumed
 */
router.post('/assignments/:assignmentId/complete', withAuth, async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { outputQuantity, defectQuantity = 0, notes } = req.body;
    
    console.log(`✅ [MES] Completing assignment: ${assignmentId}`);
    
    // Mark materials as consumed
    const consumeResult = await markMaterialsConsumed(assignmentId);
    
    if (!consumeResult.success) {
      console.error(`❌ [MES] Failed to mark materials consumed:`, consumeResult.error);
    }
    
    // Update assignment status
    const db = getFirestore();
    const endTime = new Date();
    await db.collection('mes-worker-assignments').doc(assignmentId).update({
      status: 'completed',
      actual_end: endTime,
      material_reservation_status: 'consumed',
      output_quantity: outputQuantity || null,
      defect_quantity: defectQuantity || 0,
      completion_notes: notes || null,
      completed_at: admin.firestore.FieldValue.serverTimestamp(),
      completed_by: req.user?.email || 'system'
    });
    
    console.log(`✅ [MES] Assignment completed: ${assignmentId}`);
    
    res.json({
      success: true,
      assignmentId,
      endTime: endTime.toISOString(),
      materialsConsumed: consumeResult.updated || 0,
      message: 'Assignment completed successfully'
    });
    
  } catch (error) {
    console.error('❌ [MES] Error completing assignment:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to complete assignment',
      details: error.message 
    });
  }
});

// ============================================================================
// FIFO TASK SCHEDULING ENDPOINTS
// ============================================================================

/**
 * GET /api/mes/workers/:workerId/tasks/next
 * Get the next task for a worker using FIFO scheduling
 * 
 * Response: Single task object or null
 * Performance: < 5ms (uses idx_fifo_queue)
 */
router.get('/workers/:workerId/tasks/next', async (req, res) => {
  try {
    const { workerId } = req.params;
    
    const nextTask = await getWorkerNextTask(workerId);
    
    if (!nextTask) {
      return res.json({
        success: true,
        task: null,
        message: 'No tasks available in queue'
      });
    }
    
    res.json({
      success: true,
      task: nextTask
    });
    
  } catch (error) {
    console.error('❌ Error getting next task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get next task',
      details: error.message
    });
  }
});

/**
 * GET /api/mes/workers/:workerId/tasks/queue
 * Get full task queue for a worker in FIFO order
 * 
 * Query params:
 * - limit: Max tasks to return (default: 10)
 * 
 * Response: Array of tasks with FIFO positions
 */
router.get('/workers/:workerId/tasks/queue', async (req, res) => {
  try {
    const { workerId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    
    const queue = await getWorkerTaskQueue(workerId, limit);
    const stats = await getWorkerTaskStats(workerId);
    
    res.json({
      success: true,
      workerId,
      queue,
      stats,
      queueLength: queue.length
    });
    
  } catch (error) {
    console.error('❌ Error getting task queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get task queue',
      details: error.message
    });
  }
});

/**
 * GET /api/mes/workers/:workerId/tasks/stats
 * Get task statistics for a worker
 * 
 * Response: Task counts, workload estimates, etc.
 */
router.get('/workers/:workerId/tasks/stats', async (req, res) => {
  try {
    const { workerId } = req.params;
    
    const stats = await getWorkerTaskStats(workerId);
    
    res.json({
      success: true,
      workerId,
      stats
    });
    
  } catch (error) {
    console.error('❌ Error getting task stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get task stats',
      details: error.message
    });
  }
});

/**
 * POST /api/mes/assignments/:assignmentId/start
 * Start a task (pending/ready → in_progress)
 * 
 * STEP 7 INTEGRATION: Now includes FIFO lot-based material consumption!
 * 
 * Body:
 * - workerId: Worker ID (for verification)
 * 
 * Side effects:
 * - Gets material requirements from production plan node
 * - Reserves materials with FIFO lot consumption
 * - Creates stock_movements (type='out') for consumed lots
 * - Creates assignment_material_reservations records
 * - Updates materials.stock and wip_reserved aggregates
 * - Updates status to in_progress
 * - Sets actual_start timestamp
 * - Triggers real-time notification
 * 
 * Response:
 * {
 *   success: true,
 *   assignment: { ... updated assignment ... },
 *   materialReservation: {
 *     success: true,
 *     reservations: [
 *       {
 *         materialCode: 'M-00-001',
 *         lotsConsumed: [
 *           { lotNumber: 'LOT-M-00-001-001', lotDate: '2025-11-01', qty: 50 },
 *           { lotNumber: 'LOT-M-00-001-002', lotDate: '2025-11-15', qty: 50 }
 *         ],
 *         totalReserved: 100,
 *         partialReservation: false
 *       }
 *     ],
 *     warnings: []
 *   }
 * }
 */
router.post('/assignments/:assignmentId/start', async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { workerId } = req.body;
    
    if (!workerId) {
      return res.status(400).json({
        success: false,
        error: 'workerId is required'
      });
    }
    
    console.log(`🚀 [FIFO] Starting task ${assignmentId} for worker ${workerId}`);
    
    // Start task with integrated lot consumption
    const result = await startTask(assignmentId, workerId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    // Log material consumption details
    if (result.materialReservation && result.materialReservation.reservations.length > 0) {
      console.log(`📦 [FIFO] Reserved ${result.materialReservation.reservations.length} material(s) with FIFO lot consumption`);
      
      result.materialReservation.reservations.forEach(r => {
        console.log(`   - ${r.materialCode}: ${r.totalReserved} from ${r.lotsConsumed.length} lot(s)`);
      });
      
      if (result.materialReservation.warnings.length > 0) {
        console.warn(`⚠️  [FIFO] Warnings:`, result.materialReservation.warnings);
      }
    }
    
    res.json({
      ...result,
      message: result.materialReservation.warnings.length > 0
        ? 'Task started with warnings (partial material reservations)'
        : 'Task started successfully'
    });
    
  } catch (error) {
    console.error('❌ [FIFO] Error starting task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start task',
      details: error.message
    });
  }
});

/**
 * POST /api/mes/assignments/:assignmentId/complete
 * Complete a task (in_progress → completed)
 * 
 * STEP 7 INTEGRATION: Now marks materials as consumed!
 * 
 * Body:
 * - workerId: Worker ID (for verification)
 * - quantityProduced: Number (optional)
 * - defectQuantity: Number (optional)
 * - qualityOk: Boolean (optional, default: true)
 * - notes: String (optional)
 * 
 * Side effects:
 * - Marks reserved materials as 'consumed'
 * - Updates consumed_qty in assignment_material_reservations
 * - Updates status to completed
 * - Sets actual_end timestamp
 * - Records completion data
 * - Triggers real-time notification
 * 
 * Response:
 * {
 *   success: true,
 *   assignment: { ... updated assignment ... },
 *   materialsConsumed: 3  // Number of material reservations marked as consumed
 * }
 */
router.post('/assignments/:assignmentId/complete', async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { workerId, quantityProduced, defectQuantity, qualityOk, notes } = req.body;
    
    if (!workerId) {
      return res.status(400).json({
        success: false,
        error: 'workerId is required'
      });
    }
    
    console.log(`✅ [FIFO] Completing task ${assignmentId} for worker ${workerId}`);
    
    // Complete task with integrated material consumption
    const result = await completeTask(assignmentId, workerId, {
      quantityProduced,
      defectQuantity,
      qualityOk,
      notes
    });
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    // Log material consumption
    if (result.materialsConsumed > 0) {
      console.log(`📦 [FIFO] Marked ${result.materialsConsumed} material reservation(s) as consumed`);
    }
    
    res.json({
      ...result,
      message: `Task completed successfully${result.materialsConsumed > 0 ? ` (${result.materialsConsumed} materials consumed)` : ''}`
    });
    
  } catch (error) {
    console.error('❌ [FIFO] Error completing task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete task',
      details: error.message
    });
  }
});

/**
 * GET /api/mes/workers/:workerId/has-tasks
 * Quick check if worker has any tasks in queue
 * 
 * Response: { hasTasks: boolean }
 * Use case: Dashboard widgets, availability indicators
 */
router.get('/workers/:workerId/has-tasks', async (req, res) => {
  try {
    const { workerId } = req.params;
    
    const hasTasks = await hasTasksInQueue(workerId);
    
    res.json({
      success: true,
      workerId,
      hasTasks
    });
    
  } catch (error) {
    console.error('❌ Error checking task queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check task queue',
      details: error.message
    });
  }
});

// ============================================================================
// STEP 8: REAL-TIME SSE ENDPOINTS
// ============================================================================

/**
 * GET /api/mes/stream/assignments
 * Real-time stream of worker assignment changes
 * 
 * Server-Sent Events (SSE) endpoint that streams PostgreSQL notifications
 * for assignment table changes (INSERT, UPDATE, DELETE).
 * 
 * Query params:
 * - workerId: Filter events for specific worker (optional)
 * 
 * Event format:
 * event: message
 * data: {
 *   "operation": "UPDATE",
 *   "table": "worker_assignments",
 *   "id": "assignment-id",
 *   "planId": "plan-id",
 *   "nodeId": "node-id",
 *   "workerId": "worker-id",
 *   "status": "in_progress",
 *   "timestamp": 1700000000
 * }
 * 
 * Frontend usage:
 * ```javascript
 * const eventSource = new EventSource('/api/mes/stream/assignments?workerId=W-001');
 * eventSource.addEventListener('message', (e) => {
 *   const data = JSON.parse(e.data);
 *   console.log('Assignment updated:', data);
 * });
 * ```
 */
router.get('/stream/assignments', (req, res) => {
  const { workerId } = req.query;

  console.log(`🌊 [SSE] New assignment stream connection${workerId ? ` for worker ${workerId}` : ''}`);

  // Create filter if workerId provided
  const filter = workerId ? createWorkerFilter(workerId) : null;

  // Create SSE stream
  const stream = createSSEStream(res, 'mes_assignment_updates', { filter });

  // Start streaming
  stream.start();
});

/**
 * GET /api/mes/stream/plans
 * Real-time stream of production plan changes
 * 
 * Streams notifications when production plans are created, updated, or deleted.
 * 
 * Query params:
 * - planId: Filter events for specific plan (optional)
 * 
 * Event format:
 * event: message
 * data: {
 *   "operation": "UPDATE",
 *   "table": "production_plans",
 *   "id": "plan-id",
 *   "planId": "plan-id",
 *   "status": "in_progress",
 *   "orderCode": "WO-001",
 *   "timestamp": 1700000000
 * }
 * 
 * Frontend usage:
 * ```javascript
 * const eventSource = new EventSource('/api/mes/stream/plans');
 * eventSource.addEventListener('message', (e) => {
 *   const data = JSON.parse(e.data);
 *   if (data.operation === 'UPDATE') {
 *     updatePlanStatus(data.planId, data.status);
 *   }
 * });
 * ```
 */
router.get('/stream/plans', (req, res) => {
  const { planId } = req.query;

  console.log(`🌊 [SSE] New plan stream connection${planId ? ` for plan ${planId}` : ''}`);

  // Create filter if planId provided
  const filter = planId ? createPlanFilter(planId) : null;

  // Create SSE stream
  const stream = createSSEStream(res, 'mes_plan_updates', { filter });

  // Start streaming
  stream.start();
});

/**
 * GET /api/mes/stream/workers
 * Real-time stream of worker status changes
 * 
 * Streams notifications when worker status, availability, or current task changes.
 * 
 * Query params:
 * - workerId: Filter events for specific worker (optional)
 * 
 * Event format:
 * event: message
 * data: {
 *   "operation": "UPDATE",
 *   "table": "workers",
 *   "id": "worker-id",
 *   "workerId": "worker-id",
 *   "status": "active",
 *   "currentTaskPlanId": "plan-id",
 *   "currentTaskNodeId": "node-id",
 *   "timestamp": 1700000000
 * }
 * 
 * Use cases:
 * - Worker portal: Show current task and availability
 * - Production monitoring: Track worker utilization
 * - Real-time dashboard: Worker status indicators
 * 
 * Frontend usage:
 * ```javascript
 * const eventSource = new EventSource('/api/mes/stream/workers?workerId=W-001');
 * eventSource.addEventListener('message', (e) => {
 *   const data = JSON.parse(e.data);
 *   updateWorkerStatus(data.workerId, data.status);
 * });
 * 
 * // Handle connection events
 * eventSource.addEventListener('connected', (e) => {
 *   console.log('SSE connected:', e.data);
 * });
 * 
 * eventSource.addEventListener('error', (e) => {
 *   console.error('SSE error:', e);
 *   // Will auto-reconnect
 * });
 * ```
 */
router.get('/stream/workers', (req, res) => {
  const { workerId } = req.query;

  console.log(`🌊 [SSE] New worker stream connection${workerId ? ` for worker ${workerId}` : ''}`);

  // Create filter if workerId provided
  const filter = workerId ? createWorkerFilter(workerId) : null;

  // Create SSE stream
  const stream = createSSEStream(res, 'mes_worker_updates', { filter });

  // Start streaming
  stream.start();
});

/**
 * GET /api/mes/stream/test
 * Test SSE endpoint for development
 * 
 * Sends a test event every 5 seconds with incrementing counter.
 * Useful for testing SSE connection without database triggers.
 * 
 * Frontend usage:
 * ```javascript
 * const eventSource = new EventSource('/api/mes/stream/test');
 * eventSource.onmessage = (e) => {
 *   console.log('Test event:', JSON.parse(e.data));
 * };
 * ```
 */
router.get('/stream/test', (req, res) => {
  console.log('🧪 [SSE] Test stream connection');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let counter = 0;
  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ 
      counter: ++counter, 
      timestamp: Date.now(),
      message: 'Test event from SSE stream'
    })}\n\n`);
  }, 5000);

  res.on('close', () => {
    clearInterval(interval);
    console.log('🧪 [SSE] Test stream closed');
  });
});

// ============================================================================
// STEP 10: POLYMORPHIC ENTITY RELATIONS API
// ============================================================================
// Generic API for querying entity relationships (replaces 6 junction tables)
// Supports: worker→station, worker→operation, station→operation,
//           node→station, node→substation, node→predecessor

/**
 * GET /api/mes/entity-relations
 * Query polymorphic entity relations
 * 
 * Query params:
 * - sourceType: 'worker' | 'station' | 'node'
 * - sourceId: ID of source entity
 * - relationType: 'station' | 'operation' | 'substation' | 'material' | 'predecessor'
 * - targetId: (optional) Filter by specific target
 * 
 * Examples:
 * - GET /api/mes/entity-relations?sourceType=node&sourceId=node-123&relationType=station
 *   Returns all stations assigned to node-123 (with priority field)
 * 
 * - GET /api/mes/entity-relations?sourceType=worker&sourceId=W-001&relationType=station
 *   Returns all stations worker W-001 can work at
 * 
 * - GET /api/mes/entity-relations?sourceType=station&sourceId=ST-001&relationType=operation
 *   Returns all operations available on station ST-001
 */
router.get('/entity-relations', withAuth, async (req, res) => {
  try {
    const { sourceType, sourceId, relationType, targetId } = req.query;

    // Validation
    if (!sourceType || !sourceId || !relationType) {
      return res.status(400).json({
        error: 'Missing required parameters: sourceType, sourceId, relationType'
      });
    }

    const validSourceTypes = ['worker', 'station', 'node'];
    const validRelationTypes = ['station', 'operation', 'substation', 'material', 'predecessor'];

    if (!validSourceTypes.includes(sourceType)) {
      return res.status(400).json({
        error: `Invalid sourceType. Must be one of: ${validSourceTypes.join(', ')}`
      });
    }

    if (!validRelationTypes.includes(relationType)) {
      return res.status(400).json({
        error: `Invalid relationType. Must be one of: ${validRelationTypes.join(', ')}`
      });
    }

    // Build query
    let query = db('mes_entity_relations')
      .where({
        source_type: sourceType,
        source_id: sourceId,
        relation_type: relationType
      })
      .select(
        'id',
        'source_type',
        'source_id',
        'relation_type',
        'target_id',
        'priority',
        'quantity',
        'unit_ratio',
        'is_derived',
        'created_at',
        'updated_at'
      );

    // Optional target filter
    if (targetId) {
      query = query.where('target_id', targetId);
    }

    // Order by priority (if applicable)
    query = query.orderBy('priority', 'asc').orderBy('created_at', 'asc');

    const relations = await query;

    // Join with target entity to get names
    const enrichedRelations = await Promise.all(
      relations.map(async (relation) => {
        let targetName = null;
        let targetDetails = null;

        try {
          // Get target entity details based on relation type
          if (relation.relation_type === 'station') {
            const station = await db('mes_stations')
              .where('id', relation.target_id)
              .first('id', 'name', 'code', 'type');
            if (station) {
              targetName = station.name;
              targetDetails = station;
            }
          } else if (relation.relation_type === 'operation') {
            const operation = await db('mes_operations')
              .where('id', relation.target_id)
              .first('id', 'name', 'code', 'type');
            if (operation) {
              targetName = operation.name;
              targetDetails = operation;
            }
          } else if (relation.relation_type === 'substation') {
            const substation = await db('mes_substations')
              .where('id', relation.target_id)
              .first('id', 'name', 'code', 'station_id');
            if (substation) {
              targetName = substation.name;
              targetDetails = substation;
            }
          } else if (relation.relation_type === 'predecessor') {
            const node = await db('mes_production_plan_nodes')
              .where('id', relation.target_id)
              .first('id', 'name', 'operation_id');
            if (node) {
              targetName = node.name;
              targetDetails = node;
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch target details for ${relation.relation_type} ${relation.target_id}:`, err.message);
        }

        return {
          id: relation.id,
          sourceType: relation.source_type,
          sourceId: relation.source_id,
          relationType: relation.relation_type,
          targetId: relation.target_id,
          targetName,
          targetDetails,
          priority: relation.priority,
          quantity: relation.quantity,
          unitRatio: relation.unit_ratio,
          isDerived: relation.is_derived,
          createdAt: relation.created_at,
          updatedAt: relation.updated_at
        };
      })
    );

    res.json({
      success: true,
      count: enrichedRelations.length,
      relations: enrichedRelations
    });

  } catch (err) {
    console.error('❌ [API] Failed to fetch entity relations:', err);
    res.status(500).json({
      error: 'Failed to fetch entity relations',
      details: err.message
    });
  }
});

/**
 * POST /api/mes/entity-relations
 * Create a new entity relation
 * 
 * Body:
 * {
 *   sourceType: 'node',
 *   sourceId: 'node-123',
 *   relationType: 'station',
 *   targetId: 'ST-001',
 *   priority: 1,  // Optional
 *   quantity: 100,  // Optional (for materials)
 *   unitRatio: 1.5  // Optional (for material conversions)
 * }
 */
router.post('/entity-relations', withAuth, async (req, res) => {
  try {
    const {
      sourceType,
      sourceId,
      relationType,
      targetId,
      priority,
      quantity,
      unitRatio,
      isDerived
    } = req.body;

    // Validation
    if (!sourceType || !sourceId || !relationType || !targetId) {
      return res.status(400).json({
        error: 'Missing required fields: sourceType, sourceId, relationType, targetId'
      });
    }

    // Insert relation
    const [relation] = await db('mes_entity_relations')
      .insert({
        source_type: sourceType,
        source_id: sourceId,
        relation_type: relationType,
        target_id: targetId,
        priority: priority || null,
        quantity: quantity || null,
        unit_ratio: unitRatio || null,
        is_derived: isDerived || false,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning('*');

    res.status(201).json({
      success: true,
      relation: {
        id: relation.id,
        sourceType: relation.source_type,
        sourceId: relation.source_id,
        relationType: relation.relation_type,
        targetId: relation.target_id,
        priority: relation.priority,
        quantity: relation.quantity,
        unitRatio: relation.unit_ratio,
        isDerived: relation.is_derived,
        createdAt: relation.created_at,
        updatedAt: relation.updated_at
      }
    });

  } catch (err) {
    console.error('❌ [API] Failed to create entity relation:', err);
    
    // Handle UNIQUE constraint violation
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'This relation already exists',
        details: err.message
      });
    }

    res.status(500).json({
      error: 'Failed to create entity relation',
      details: err.message
    });
  }
});

/**
 * PUT /api/mes/entity-relations/:id
 * Update an entity relation (primarily for priority changes)
 * 
 * Body:
 * {
 *   priority: 2  // Update priority
 * }
 */
router.put('/entity-relations/:id', withAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { priority, quantity, unitRatio } = req.body;

    const updateData = {
      updated_at: new Date()
    };

    if (priority !== undefined) updateData.priority = priority;
    if (quantity !== undefined) updateData.quantity = quantity;
    if (unitRatio !== undefined) updateData.unit_ratio = unitRatio;

    const [updatedRelation] = await db('mes_entity_relations')
      .where('id', id)
      .update(updateData)
      .returning('*');

    if (!updatedRelation) {
      return res.status(404).json({
        error: 'Entity relation not found'
      });
    }

    res.json({
      success: true,
      relation: {
        id: updatedRelation.id,
        sourceType: updatedRelation.source_type,
        sourceId: updatedRelation.source_id,
        relationType: updatedRelation.relation_type,
        targetId: updatedRelation.target_id,
        priority: updatedRelation.priority,
        quantity: updatedRelation.quantity,
        unitRatio: updatedRelation.unit_ratio,
        updatedAt: updatedRelation.updated_at
      }
    });

  } catch (err) {
    console.error('❌ [API] Failed to update entity relation:', err);
    res.status(500).json({
      error: 'Failed to update entity relation',
      details: err.message
    });
  }
});

/**
 * DELETE /api/mes/entity-relations/:id
 * Delete an entity relation
 */
router.delete('/entity-relations/:id', withAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await db('mes_entity_relations')
      .where('id', id)
      .del();

    if (deleted === 0) {
      return res.status(404).json({
        error: 'Entity relation not found'
      });
    }

    res.json({
      success: true,
      message: 'Entity relation deleted successfully'
    });

  } catch (err) {
    console.error('❌ [API] Failed to delete entity relation:', err);
    res.status(500).json({
      error: 'Failed to delete entity relation',
      details: err.message
    });
  }
});

/**
 * POST /api/mes/entity-relations/batch
 * Create or update multiple relations at once
 * Used for drag-drop priority reordering
 * 
 * Body:
 * {
 *   relations: [
 *     { id: 1, priority: 1 },
 *     { id: 2, priority: 2 },
 *     { id: 3, priority: 3 }
 *   ]
 * }
 */
router.post('/entity-relations/batch', withAuth, async (req, res) => {
  try {
    const { relations } = req.body;

    if (!relations || !Array.isArray(relations)) {
      return res.status(400).json({
        error: 'Missing or invalid relations array'
      });
    }

    // Update all relations in a transaction
    await db.transaction(async (trx) => {
      for (const relation of relations) {
        if (relation.id && relation.priority !== undefined) {
          await trx('mes_entity_relations')
            .where('id', relation.id)
            .update({
              priority: relation.priority,
              updated_at: new Date()
            });
        }
      }
    });

    res.json({
      success: true,
      message: `${relations.length} relations updated successfully`
    });

  } catch (err) {
    console.error('❌ [API] Failed to batch update relations:', err);
    res.status(500).json({
      error: 'Failed to batch update relations',
      details: err.message
    });
  }
});

// ============================================================================
// PRODUCTION PLANS API - STEP 7
// ============================================================================
// Lifecycle: Design → Launch → Execute
// - Design: Create plan with nodes (draft status)
// - Launch: Assign workers and substations (active status)
// - Execute: Workers complete tasks
// ============================================================================

/**
 * Helper: Get plan with all nodes and related data
 */
async function getPlanWithNodes(planId) {
  const plan = await db('mes.production_plans')
    .where('id', planId)
    .first();
  
  if (!plan) return null;
  
  // Get nodes with aggregated materials and stations
  const nodes = await db('mes.production_plan_nodes as n')
    .select('n.*')
    .where('n.plan_id', planId)
    .orderBy('n.sequence_order');
  
  // For each node, fetch materials and stations separately
  for (const node of nodes) {
    // Get material inputs
    const materialInputs = await db('mes.node_material_inputs')
      .where('node_id', node.id)
      .select('material_code as materialCode', 'required_quantity as requiredQuantity', 
              'unit_ratio as unitRatio', 'is_derived as isDerived');
    
    node.material_inputs = materialInputs;
    
    // Get assigned stations
    const stations = await db('mes.node_stations')
      .where('node_id', node.id)
      .select('station_id as stationId', 'priority')
      .orderBy('priority');
    
    node.assigned_stations = stations;
  }
  
  return { ...plan, nodes };
}

/**
 * Helper: Find worker with required skills for a station
 */
async function findAvailableWorkerWithSkills(trx, requiredSkills, stationId) {
  if (!requiredSkills || requiredSkills.length === 0) {
    // No skills required, get any available worker
    return await trx('mes.workers')
      .where('is_active', true)
      .first();
  }
  
  // Find workers with matching skills
  const workers = await trx('mes.workers')
    .where('is_active', true)
    .whereRaw('skills::jsonb ?| ?', [requiredSkills]);
  
  if (workers.length === 0) return null;
  
  // Prefer workers already assigned to this station
  const stationWorkers = await trx('mes_entity_relations')
    .where('source_type', 'worker')
    .where('relation_type', 'station')
    .where('target_id', stationId)
    .pluck('source_id');
  
  const preferredWorker = workers.find(w => 
    stationWorkers.includes(w.id)
  );
  
  return preferredWorker || workers[0] || null;
}

/**
 * GET /api/mes/production-plans
 * List all production plans with summary info
 * Excludes templates (status='template')
 */
router.get('/production-plans', withAuth, async (req, res) => {
  try {
    const plans = await db('mes.production_plans as p')
      .select(
        'p.id',
        'p.work_order_code',
        'p.quote_id',
        'p.status',
        'p.created_at',
        'p.launched_at',
        db.raw('count(n.id)::integer as node_count')
      )
      .leftJoin('mes.production_plan_nodes as n', 'n.plan_id', 'p.id')
      .where('p.status', '!=', 'template') // Exclude templates
      .groupBy('p.id')
      .orderBy('p.created_at', 'desc');
    
    res.json(plans);
  } catch (error) {
    console.error('❌ Error fetching production plans:', error);
    res.status(500).json({ 
      error: 'Failed to fetch production plans',
      details: error.message 
    });
  }
});

/**
 * POST /api/mes/production-plans
 * Create production plan with nodes, materials, and stations
 * 
 * Body:
 * {
 *   workOrderCode: "WO-001",
 *   quoteId: "Q-2025-001",
 *   nodes: [
 *     {
 *       name: "Kesim",
 *       operationId: "OP-001",
 *       outputCode: "WIP-Kesim-M12",
 *       outputQty: 1000,
 *       outputUnit: "adet",
 *       nominalTime: 120,
 *       efficiency: 0.85,
 *       sequenceOrder: 1,
 *       stationIds: ["ST-Kesim-001", "ST-Kesim-002"],
 *       materialInputs: [
 *         {
 *           materialCode: "M-001",
 *           requiredQuantity: 100,
 *           unitRatio: 1.0,
 *           isDerived: false
 *         }
 *       ]
 *     }
 *   ]
 * }
 */
router.post('/production-plans', withAuth, async (req, res) => {
  const { workOrderCode, quoteId, nodes } = req.body;
  
  // Validation
  if (!workOrderCode || !quoteId || !nodes || !Array.isArray(nodes)) {
    return res.status(400).json({ 
      error: 'Missing required fields: workOrderCode, quoteId, nodes' 
    });
  }
  
  const trx = await db.transaction();
  
  try {
    // 1. Generate plan ID
    const [{ max_id }] = await trx('mes.production_plans')
      .max('id as max_id');
    const nextNum = max_id ? parseInt(max_id.split('-')[1]) + 1 : 1;
    const planId = `PLAN-${nextNum.toString().padStart(3, '0')}`;
    
    console.log(`📋 Creating production plan: ${planId}`);
    
    // 2. Create plan header
    await trx('mes.production_plans').insert({
      id: planId,
      work_order_code: workOrderCode,
      quote_id: quoteId,
      status: 'draft',
      created_at: trx.fn.now()
    });
    
    // 3. Insert nodes with materials and stations
    for (const node of nodes) {
      // 3a. Insert node
      const [nodeRecord] = await trx('mes.production_plan_nodes')
        .insert({
          plan_id: planId,
          node_id: `${planId}-node-${node.sequenceOrder}`,
          work_order_code: workOrderCode, // Add work_order_code for easy access
          name: node.name,
          operation_id: node.operationId,
          output_code: node.outputCode,
          output_qty: node.outputQty,
          output_unit: node.outputUnit,
          nominal_time: node.nominalTime,
          efficiency: node.efficiency || 0.85,
          effective_time: Math.ceil(node.nominalTime / (node.efficiency || 0.85)),
          sequence_order: node.sequenceOrder,
          assignment_mode: 'auto',
          created_at: trx.fn.now()
        })
        .returning('id');
      
      const nodeId = nodeRecord.id;
      
      // 3b. Insert material inputs
      if (node.materialInputs && node.materialInputs.length > 0) {
        const materialInputs = node.materialInputs.map(m => ({
          node_id: nodeId,
          material_code: m.materialCode,
          required_quantity: m.requiredQuantity,
          unit_ratio: m.unitRatio || 1.0,
          is_derived: m.isDerived || false,
          created_at: trx.fn.now()
        }));
        
        await trx('mes.node_material_inputs').insert(materialInputs);
      }
      
      // 3c. Insert station assignments
      if (node.stationIds && node.stationIds.length > 0) {
        const stationAssignments = node.stationIds.map((stId, idx) => ({
          node_id: nodeId,
          station_id: stId,
          priority: idx + 1,
          created_at: trx.fn.now()
        }));
        
        await trx('mes.node_stations').insert(stationAssignments);
      }
    }
    
    await trx.commit();
    
    console.log(`✅ Production plan created: ${planId} with ${nodes.length} nodes`);
    
    // 4. Fetch and return complete plan
    const plan = await getPlanWithNodes(planId);
    res.json(plan);
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Error creating production plan:', error);
    res.status(500).json({ 
      error: 'Failed to create production plan',
      details: error.message 
    });
  }
});

/**
 * GET /api/mes/production-plans/:id
 * Get plan details with all nodes
 */
router.get('/production-plans/:id', withAuth, async (req, res) => {
  try {
    const plan = await getPlanWithNodes(req.params.id);
    
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    res.json(plan);
  } catch (error) {
    console.error('❌ Error fetching plan:', error);
    res.status(500).json({ 
      error: 'Failed to fetch plan',
      details: error.message 
    });
  }
});

/**
 * PUT /api/mes/production-plans/:id
 * Update plan header (not nodes)
 * 
 * Body: { workOrderCode?, quoteId?, status? }
 */
router.put('/production-plans/:id', withAuth, async (req, res) => {
  const { id } = req.params;
  const { workOrderCode, quoteId, status } = req.body;
  
  try {
    const [updated] = await db('mes.production_plans')
      .where('id', id)
      .update({
        work_order_code: workOrderCode,
        quote_id: quoteId,
        status,
        updated_at: db.fn.now()
      })
      .returning('*');
    
    if (!updated) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    console.log(`✅ Updated production plan: ${id}`);
    res.json(updated);
  } catch (error) {
    console.error('❌ Error updating plan:', error);
    res.status(500).json({ 
      error: 'Failed to update plan',
      details: error.message 
    });
  }
});

/**
 * DELETE /api/mes/production-plans/:id
 * Delete plan and all related data (CASCADE)
 */
router.delete('/production-plans/:id', withAuth, async (req, res) => {
  const trx = await db.transaction();
  
  try {
    // Check if plan exists and get launch status
    const [plan] = await trx('mes.production_plans')
      .where('id', req.params.id)
      .select('id', 'status', 'launched_at');
    
    if (!plan) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    // Prevent deletion of launched plans
    if (plan.launched_at) {
      await trx.rollback();
      return res.status(400).json({ 
        error: 'Cannot delete launched plan',
        details: 'Plan has been launched and cannot be deleted'
      });
    }
    
    // Get node IDs first
    const nodes = await trx('mes.production_plan_nodes')
      .where('plan_id', req.params.id)
      .select('id');
    
    const nodeIds = nodes.map(n => n.id);
    
    // Delete in correct order (FK constraints)
    if (nodeIds.length > 0) {
      await trx('mes.node_stations')
        .whereIn('node_id', nodeIds)
        .delete();
      
      await trx('mes.node_material_inputs')
        .whereIn('node_id', nodeIds)
        .delete();
    }
    
    await trx('mes.production_plan_nodes')
      .where('plan_id', req.params.id)
      .delete();
    
    await trx('mes.production_plans')
      .where('id', req.params.id)
      .delete();
    
    await trx.commit();
    
    console.log(`✅ Deleted production plan: ${req.params.id}`);
    res.json({ success: true, id: req.params.id });
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Error deleting plan:', error);
    res.status(500).json({ 
      error: 'Failed to delete plan',
      details: error.message 
    });
  }
});

// ============================================================================
// PHASE 2: NODE MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * POST /api/mes/production-plans/:planId/nodes
 * Add new node to existing plan
 */
router.post('/production-plans/:planId/nodes', withAuth, async (req, res) => {
  const { planId } = req.params;
  const { name, operationId, outputCode, outputQty, outputUnit, nominalTime, efficiency, sequenceOrder, stationIds, materialInputs } = req.body;
  
  const trx = await db.transaction();
  
  try {
    // Verify plan exists and is draft
    const plan = await trx('mes.production_plans')
      .where('id', planId)
      .where('status', 'draft')
      .first();
    
    if (!plan) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found or not in draft status' });
    }
    
    // Insert node
    const [nodeRecord] = await trx('mes.production_plan_nodes')
      .insert({
        plan_id: planId,
        node_id: `${planId}-node-${sequenceOrder}`,
        work_order_code: plan.work_order_code,
        name,
        operation_id: operationId,
        output_code: outputCode,
        output_qty: outputQty,
        output_unit: outputUnit,
        nominal_time: nominalTime,
        efficiency: efficiency || 1.0,
        effective_time: Math.ceil(nominalTime / (efficiency || 1.0)),
        sequence_order: sequenceOrder,
        assignment_mode: 'auto',
        created_at: trx.fn.now()
      })
      .returning('*');
    
    // Insert material inputs
    if (materialInputs && materialInputs.length > 0) {
      const materials = materialInputs.map(m => ({
        node_id: nodeRecord.id,
        material_code: m.materialCode,
        required_quantity: m.requiredQuantity,
        unit_ratio: m.unitRatio || 1.0,
        is_derived: m.isDerived || false,
        created_at: trx.fn.now()
      }));
      await trx('mes.node_material_inputs').insert(materials);
    }
    
    // Insert station assignments
    if (stationIds && stationIds.length > 0) {
      const stations = stationIds.map((stId, idx) => ({
        node_id: nodeRecord.id,
        station_id: stId,
        priority: idx + 1,
        created_at: trx.fn.now()
      }));
      await trx('mes.node_stations').insert(stations);
    }
    
    await trx.commit();
    
    console.log(`✅ Node added to plan ${planId}: ${name}`);
    res.json(nodeRecord);
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Error adding node:', error);
    res.status(500).json({ error: 'Failed to add node', details: error.message });
  }
});

/**
 * PUT /api/mes/production-plans/:planId/nodes/:nodeId
 * Update existing node
 */
router.put('/production-plans/:planId/nodes/:nodeId', withAuth, async (req, res) => {
  const { planId, nodeId } = req.params;
  const { name, nominalTime, efficiency, outputQty, stationIds, materialInputs } = req.body;
  
  const trx = await db.transaction();
  
  try {
    // Verify plan is draft
    const plan = await trx('mes.production_plans')
      .where('id', planId)
      .where('status', 'draft')
      .first();
    
    if (!plan) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found or not in draft status' });
    }
    
    // Update node
    const updateData = {
      updated_at: trx.fn.now()
    };
    
    if (name) updateData.name = name;
    if (nominalTime) {
      updateData.nominal_time = nominalTime;
      updateData.effective_time = Math.ceil(nominalTime / (efficiency || 1.0));
    }
    if (efficiency) {
      updateData.efficiency = efficiency;
      updateData.effective_time = Math.ceil(updateData.nominal_time / efficiency);
    }
    if (outputQty) updateData.output_qty = outputQty;
    
    const [updated] = await trx('mes.production_plan_nodes')
      .where('id', nodeId)
      .where('plan_id', planId)
      .update(updateData)
      .returning('*');
    
    if (!updated) {
      await trx.rollback();
      return res.status(404).json({ error: 'Node not found' });
    }
    
    // Update stations if provided
    if (stationIds) {
      await trx('mes.node_stations').where('node_id', nodeId).delete();
      
      if (stationIds.length > 0) {
        const stations = stationIds.map((stId, idx) => ({
          node_id: nodeId,
          station_id: stId,
          priority: idx + 1,
          created_at: trx.fn.now()
        }));
        await trx('mes.node_stations').insert(stations);
      }
    }
    
    // Update materials if provided
    if (materialInputs) {
      await trx('mes.node_material_inputs').where('node_id', nodeId).delete();
      
      if (materialInputs.length > 0) {
        const materials = materialInputs.map(m => ({
          node_id: nodeId,
          material_code: m.materialCode,
          required_quantity: m.requiredQuantity,
          unit_ratio: m.unitRatio || 1.0,
          is_derived: m.isDerived || false,
          created_at: trx.fn.now()
        }));
        await trx('mes.node_material_inputs').insert(materials);
      }
    }
    
    await trx.commit();
    
    console.log(`✅ Node updated: ${updated.name}`);
    res.json(updated);
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Error updating node:', error);
    res.status(500).json({ error: 'Failed to update node', details: error.message });
  }
});

/**
 * DELETE /api/mes/production-plans/:planId/nodes/:nodeId
 * Delete node from plan
 */
router.delete('/production-plans/:planId/nodes/:nodeId', withAuth, async (req, res) => {
  const { planId, nodeId } = req.params;
  
  const trx = await db.transaction();
  
  try {
    // Verify plan is draft
    const plan = await trx('mes.production_plans')
      .where('id', planId)
      .where('status', 'draft')
      .first();
    
    if (!plan) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found or not in draft status' });
    }
    
    // Delete node (cascade will handle materials and stations)
    const deleted = await trx('mes.production_plan_nodes')
      .where('id', nodeId)
      .where('plan_id', planId)
      .delete();
    
    if (!deleted) {
      await trx.rollback();
      return res.status(404).json({ error: 'Node not found' });
    }
    
    await trx.commit();
    
    console.log(`✅ Node deleted from plan ${planId}`);
    res.json({ success: true, nodeId });
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Error deleting node:', error);
    res.status(500).json({ error: 'Failed to delete node', details: error.message });
  }
});

// ============================================================================
// PHASE 3: ENHANCED LAUNCH ALGORITHM - HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate earliest available slot in a schedule
 */
function calculateEarliestSlot(schedule, afterTime) {
  if (schedule.length === 0) return afterTime;
  
  const sorted = schedule.sort((a, b) => b.end - a.end);
  const lastEnd = sorted[0].end;
  
  return lastEnd > afterTime ? lastEnd : afterTime;
}

/**
 * Find earliest available substation from station options
 */
async function findEarliestSubstation(trx, stationOptions, scheduleMap, afterTime) {
  let bestSubstation = null;
  let earliestTime = null;
  
  for (const stOpt of stationOptions) {
    const substations = await trx('mes.substations')
      .where('station_id', stOpt.station_id)
      .where('is_active', true);
    
    for (const sub of substations) {
      const schedule = scheduleMap.get(sub.id) || [];
      const availableAt = calculateEarliestSlot(schedule, afterTime);
      
      if (!earliestTime || availableAt < earliestTime) {
        bestSubstation = sub;
        earliestTime = availableAt;
      }
    }
  }
  
  return { 
    substation: bestSubstation, 
    availableAt: earliestTime || afterTime 
  };
}

/**
 * Get shift blocks for specific day from personal_schedule
 */
function getShiftBlocksForDay(schedule, dayOfWeek) {
  if (!schedule) return [];
  
  // Standard model: shifts: [{ id: '1', blocks: { monday: [...] } }]
  if (Array.isArray(schedule.shifts)) {
    const shift = schedule.shifts.find(s => s.id === '1');
    return shift?.blocks?.[dayOfWeek] || [];
  }
  
  // Aggregated model: shiftBlocks: { 'shift-monday': [...] }
  const aggregated = schedule.shiftBlocks?.[`shift-${dayOfWeek}`];
  if (Array.isArray(aggregated)) return aggregated;
  
  // Split-by-lane: shiftByLane: { '1': { monday: [...] } }
  const byLane = schedule.shiftByLane?.['1']?.[dayOfWeek];
  if (Array.isArray(byLane)) return byLane;
  
  return [];
}

/**
 * Check if time slot falls within shift blocks
 */
function isWithinShiftBlocks(startTime, durationMinutes, shiftBlocks) {
  if (shiftBlocks.length === 0) return true; // No restrictions
  
  const startHour = startTime.getHours() + startTime.getMinutes() / 60;
  const endHour = startHour + durationMinutes / 60;
  
  for (const block of shiftBlocks) {
    if (!block.start || !block.end) continue;
    
    const [blockStartH, blockStartM] = block.start.split(':').map(Number);
    const [blockEndH, blockEndM] = block.end.split(':').map(Number);
    
    const blockStart = blockStartH + blockStartM / 60;
    const blockEnd = blockEndH + blockEndM / 60;
    
    // Task must fit entirely within one shift block
    if (startHour >= blockStart && endHour <= blockEnd) {
      return true;
    }
  }
  
  return false;
}

/**
 * Find worker with skill check and shift availability
 */
async function findWorkerWithShiftCheck(trx, requiredSkills, stationId, startTime, duration) {
  const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][startTime.getDay()];
  
  // Get workers with matching skills (or all if no skills required)
  let query = trx('mes.workers').where('is_active', true);
  
  if (requiredSkills && requiredSkills.length > 0) {
    query = query.whereRaw('skills::jsonb ?| ?', [requiredSkills]);
  }
  
  const workers = await query;
  
  // Filter by shift availability
  for (const worker of workers) {
    const schedule = worker.personal_schedule;
    const shiftBlocks = getShiftBlocksForDay(schedule, dayOfWeek);
    
    if (isWithinShiftBlocks(startTime, duration, shiftBlocks)) {
      return worker;
    }
  }
  
  // If no shift match, return first available worker (fallback)
  return workers[0] || null;
}

/**
 * Topological sort for parallel execution
 */
function topologicalSort(nodes, predecessors) {
  const graph = new Map();
  const inDegree = new Map();
  
  nodes.forEach(n => {
    graph.set(n.id, []);
    inDegree.set(n.id, 0);
  });
  
  predecessors.forEach(p => {
    graph.get(p.predecessor_node_id).push(p.node_id);
    inDegree.set(p.node_id, inDegree.get(p.node_id) + 1);
  });
  
  const queue = nodes.filter(n => inDegree.get(n.id) === 0).map(n => n.id);
  const order = [];
  
  while (queue.length > 0) {
    const nodeId = queue.shift();
    order.push(nodeId);
    
    for (const neighbor of graph.get(nodeId)) {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }
  
  return order;
}

/**
 * Calculate number of parallel execution paths
 */
function calculateParallelPaths(executionOrder, predecessors) {
  const levels = new Map();
  let maxLevel = 0;
  
  for (const nodeId of executionOrder) {
    const preds = predecessors.filter(p => p.node_id === nodeId);
    
    if (preds.length === 0) {
      levels.set(nodeId, 0);
    } else {
      const predLevels = preds.map(p => levels.get(p.predecessor_node_id) || 0);
      const level = Math.max(...predLevels) + 1;
      levels.set(nodeId, level);
      maxLevel = Math.max(maxLevel, level);
    }
  }
  
  return maxLevel + 1;
}

// ============================================================================
// PHASE 3: ENHANCED LAUNCH ENDPOINT
// ============================================================================

/**
 * POST /api/mes/production-plans/:id/launch
 * Launch plan with enhanced algorithm:
 * - Shift-aware worker scheduling
 * - Queue management
 * - Parallel node execution
 * - Skill-based matching
 * - Summary response
 */
router.post('/production-plans/:id/launch', withAuth, async (req, res) => {
  const { id } = req.params;
  const trx = await db.transaction();
  
  try {
    // 🔒 CRITICAL: Lock tables to prevent concurrent launches
    // Only ONE launch can run at a time across entire system
    await trx.raw('LOCK TABLE mes.worker_assignments IN EXCLUSIVE MODE');
    await trx.raw('LOCK TABLE mes.substations IN EXCLUSIVE MODE');
    
    console.log(`🔒 Acquired exclusive locks for launch of ${id}`);
    
    // 1. Validate plan
    const plan = await trx('mes.production_plans')
      .where('id', id)
      .where('status', 'draft')
      .first();
    
    if (!plan) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found or already launched' });
    }
    
    console.log(`🚀 Launching production plan: ${id}`);
    
    // 2. Load nodes and dependency graph
    const nodes = await trx('mes.production_plan_nodes')
      .where('plan_id', id)
      .orderBy('sequence_order');
    
    const predecessors = await trx('mes.node_predecessors')
      .whereIn('node_id', nodes.map(n => n.id));
    
    // 3. Topological sort for execution order
    const executionOrder = topologicalSort(nodes, predecessors);
    
    // 4. Initialize tracking maps
    const workerSchedule = new Map();      // workerId → [{ start, end, seq }]
    const substationSchedule = new Map();  // substationId → [{ start, end }]
    const nodeCompletionTimes = new Map(); // nodeId → estimatedEnd
    const assignments = [];
    let queuedCount = 0;
    
    // 5. Process nodes in topological order
    for (const nodeId of executionOrder) {
      const node = nodes.find(n => n.id === nodeId);
      
      // 5a. Calculate earliest start (wait for predecessors)
      const predecessorIds = predecessors
        .filter(p => p.node_id === nodeId)
        .map(p => p.predecessor_node_id);
      
      let earliestStart = new Date();
      for (const predId of predecessorIds) {
        const predEnd = nodeCompletionTimes.get(predId);
        if (predEnd && predEnd > earliestStart) {
          earliestStart = predEnd;
        }
      }
      
      // 5b. Get station options
      const stationOptions = await trx('mes.node_stations')
        .where('node_id', node.id)
        .orderBy('priority');
      
      // 5c. Find earliest available substation
      const { substation, availableAt } = await findEarliestSubstation(
        trx,
        stationOptions,
        substationSchedule,
        earliestStart
      );
      
      if (!substation) {
        throw new Error(`No substation for node ${node.name}`);
      }
      
      // 5d. Get operation skills
      const operation = await trx('mes.operations')
        .where('id', node.operation_id)
        .first();
      
      const requiredSkills = operation?.skills || [];
      
      // 5e. Find worker with shift check
      const worker = await findWorkerWithShiftCheck(
        trx,
        requiredSkills,
        substation.station_id,
        availableAt,
        node.effective_time
      );
      
      if (!worker) {
        throw new Error(`No worker for ${node.name} at ${availableAt}`);
      }
      
      // 5f. Calculate worker queue position
      const workerQueue = workerSchedule.get(worker.id) || [];
      const sequenceNumber = workerQueue.length + 1;
      
      // 5g. Determine actual start (max of worker and substation)
      const workerAvailableAt = workerQueue.length > 0
        ? workerQueue[workerQueue.length - 1].end
        : availableAt;
      
      const actualStart = new Date(Math.max(
        workerAvailableAt.getTime(),
        availableAt.getTime()
      ));
      
      const actualEnd = new Date(
        actualStart.getTime() + node.effective_time * 60000
      );
      
      const isQueued = sequenceNumber > 1;
      if (isQueued) queuedCount++;
      
      // 5h. Create worker assignment (now uses INTEGER foreign key)
      await trx('mes.worker_assignments').insert({
        plan_id: id,
        work_order_code: plan.work_order_code,
        node_id: node.id, // INTEGER foreign key to production_plan_nodes.id
        worker_id: worker.id,
        substation_id: substation.id,
        operation_id: node.operation_id,
        status: isQueued ? 'queued' : 'pending',
        estimated_start_time: actualStart,
        estimated_end_time: actualEnd,
        sequence_number: sequenceNumber,
        created_at: trx.fn.now()
      });
      
      // 5i. Update node
      await trx('mes.production_plan_nodes')
        .where('id', node.id)
        .update({
          assigned_worker_id: worker.id,
          estimated_start_time: actualStart,
          estimated_end_time: actualEnd,
          updated_at: trx.fn.now()
        });
      
      // 5j. Update schedules
      workerQueue.push({ start: actualStart, end: actualEnd, sequenceNumber });
      workerSchedule.set(worker.id, workerQueue);
      
      const subSchedule = substationSchedule.get(substation.id) || [];
      subSchedule.push({ start: actualStart, end: actualEnd });
      substationSchedule.set(substation.id, subSchedule);
      
      nodeCompletionTimes.set(node.id, actualEnd);
      
      // 5k. Reserve substation
      await trx('mes.substations')
        .where('id', substation.id)
        .update({
          status: 'reserved',
          current_assignment_id: node.id,
          assigned_worker_id: worker.id,
          current_operation: node.operation_id,
          reserved_at: trx.fn.now(),
          updated_at: trx.fn.now()
        });
      
      // 5l. Track for response
      assignments.push({
        nodeId: node.node_id,
        nodeName: node.name,
        workerId: worker.id,
        workerName: worker.name,
        substationId: substation.id,
        substationName: substation.name,
        estimatedStart: actualStart,
        estimatedEnd: actualEnd,
        sequenceNumber,
        isQueued
      });
      
      console.log(`   ✓ ${node.name}: ${worker.name} @ ${substation.name} (seq ${sequenceNumber})`);
    }
    
    // 6. Update plan status
    await trx('mes.production_plans')
      .where('id', id)
      .update({
        status: 'active',
        launched_at: trx.fn.now()
      });
    
    await trx.commit();
    
    console.log(`✅ Plan launched: ${id} with ${nodes.length} nodes`);
    
    // 7. Build summary response
    const allStarts = assignments.map(a => a.estimatedStart);
    const allEnds = assignments.map(a => a.estimatedEnd);
    const minStart = new Date(Math.min(...allStarts.map(d => d.getTime())));
    const maxEnd = new Date(Math.max(...allEnds.map(d => d.getTime())));
    
    res.json({
      planId: id,
      status: 'active',
      launchedAt: new Date(),
      summary: {
        totalNodes: nodes.length,
        assignedNodes: assignments.length,
        totalWorkers: workerSchedule.size,
        totalSubstations: substationSchedule.size,
        estimatedStartTime: minStart,
        estimatedEndTime: maxEnd,
        estimatedDuration: Math.ceil((maxEnd - minStart) / 60000),
        parallelPaths: calculateParallelPaths(executionOrder, predecessors)
      },
      assignments,
      queuedTasks: queuedCount,
      warnings: []
    });
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Error launching plan:', error);
    res.status(500).json({ 
      error: 'Failed to launch plan',
      details: error.message 
    });
  }
});

/**
 * POST /api/mes/production-plans/:id/pause
 * Pause active plan
 */
router.post('/production-plans/:id/pause', withAuth, async (req, res) => {
  try {
    const [updated] = await db('mes.production_plans')
      .where('id', req.params.id)
      .where('status', 'active')
      .update({ 
        status: 'paused',
        paused_at: db.fn.now() 
      })
      .returning('*');
    
    if (!updated) {
      return res.status(400).json({ 
        error: 'Plan not found or not active' 
      });
    }
    
    console.log(`⏸️  Paused production plan: ${req.params.id}`);
    res.json(updated);
  } catch (error) {
    console.error('❌ Error pausing plan:', error);
    res.status(500).json({ 
      error: 'Failed to pause plan',
      details: error.message 
    });
  }
});

/**
 * POST /api/mes/production-plans/:id/resume
 * Resume paused plan
 */
router.post('/production-plans/:id/resume', withAuth, async (req, res) => {
  try {
    const [updated] = await db('mes.production_plans')
      .where('id', req.params.id)
      .where('status', 'paused')
      .update({ 
        status: 'active',
        resumed_at: db.fn.now() 
      })
      .returning('*');
    
    if (!updated) {
      return res.status(400).json({ 
        error: 'Plan not found or not paused' 
      });
    }
    
    console.log(`▶️  Resumed production plan: ${req.params.id}`);
    res.json(updated);
  } catch (error) {
    console.error('❌ Error resuming plan:', error);
    res.status(500).json({ 
      error: 'Failed to resume plan',
      details: error.message 
    });
  }
});

// ============================================================================
// PHASE 2: NODE DESIGN - Node Management Endpoints
// ============================================================================

/**
 * GET /api/mes/production-plans/:planId/nodes
 * List all nodes for a production plan with materials and stations
 */
router.get('/production-plans/:planId/nodes', withAuth, async (req, res) => {
  try {
    const { planId } = req.params;
    
    // Check plan exists
    const plan = await db('mes.production_plans')
      .where('id', planId)
      .first();
    
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    // Get nodes with materials and stations
    const nodes = await db('mes.production_plan_nodes as n')
      .where('n.plan_id', planId)
      .leftJoin('mes.operations as op', 'n.operation_id', 'op.id')
      .select(
        'n.*',
        'op.name as operation_name'
      )
      .orderBy('n.sequence_order');
    
    // Get materials for each node
    const materials = await db('mes.node_material_inputs')
      .whereIn('node_id', nodes.map(n => n.id));
    
    // Get stations for each node
    const stations = await db('mes.node_stations as ns')
      .whereIn('ns.node_id', nodes.map(n => n.id))
      .leftJoin('mes.stations as s', 'ns.station_id', 's.id')
      .select(
        'ns.node_id',
        'ns.station_id',
        'ns.priority',
        's.name as station_name'
      )
      .orderBy('ns.priority');
    
    // Assemble response
    const nodesWithDetails = nodes.map(node => ({
      ...node,
      material_inputs: materials
        .filter(m => m.node_id === node.id)
        .map(m => ({
          materialCode: m.material_code,
          requiredQuantity: m.required_quantity,
          unitRatio: m.unit_ratio,
          isDerived: m.is_derived
        })),
      assigned_stations: stations
        .filter(s => s.node_id === node.id)
        .map(s => ({
          stationId: s.station_id,
          stationName: s.station_name,
          priority: s.priority
        }))
    }));
    
    console.log(`✅ Fetched ${nodesWithDetails.length} nodes for plan: ${planId}`);
    res.json(nodesWithDetails);
    
  } catch (error) {
    console.error('❌ Error fetching nodes:', error);
    res.status(500).json({ 
      error: 'Failed to fetch nodes',
      details: error.message 
    });
  }
});

/**
 * POST /api/mes/production-plans/:planId/nodes
 * Add a new node to an existing plan (only if status = draft)
 */
router.post('/production-plans/:planId/nodes', withAuth, async (req, res) => {
  const trx = await db.transaction();
  
  try {
    const { planId } = req.params;
    const nodeData = req.body;
    
    // Check plan exists and is in draft
    const plan = await trx('mes.production_plans')
      .where('id', planId)
      .first();
    
    if (!plan) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    if (plan.status !== 'draft') {
      await trx.rollback();
      return res.status(400).json({ 
        error: 'Can only add nodes to draft plans',
        currentStatus: plan.status 
      });
    }
    
    // Calculate next sequence order
    const lastNode = await trx('mes.production_plan_nodes')
      .where('plan_id', planId)
      .orderBy('sequence_order', 'desc')
      .first();
    
    const sequenceOrder = nodeData.sequence_order || (lastNode ? lastNode.sequence_order + 1 : 1);
    
    // Calculate effective time
    const effectiveTime = nodeData.nominal_time / (nodeData.efficiency || 0.85);
    
    // Insert node
    const [node] = await trx('mes.production_plan_nodes')
      .insert({
        plan_id: planId,
        node_id: nodeData.node_id || `${planId}-node-${sequenceOrder}`,
        name: nodeData.name,
        operation_id: nodeData.operation_id,
        nominal_time: nodeData.nominal_time,
        efficiency: nodeData.efficiency || 0.85,
        effective_time: effectiveTime,
        assignment_mode: nodeData.assignment_mode || 'auto',
        output_code: nodeData.output_code,
        output_qty: nodeData.output_qty,
        output_unit: nodeData.output_unit,
        sequence_order: sequenceOrder,
        work_order_code: plan.work_order_code
      })
      .returning('*');
    
    // Insert material inputs
    if (nodeData.materialInputs && nodeData.materialInputs.length > 0) {
      const materialInserts = nodeData.materialInputs.map(mat => ({
        node_id: node.id,
        material_code: mat.materialCode,
        required_quantity: mat.requiredQuantity,
        unit_ratio: mat.unitRatio || 1.0,
        is_derived: mat.isDerived || false
      }));
      
      await trx('mes.node_material_inputs').insert(materialInserts);
    }
    
    // Insert station assignments
    if (nodeData.stationIds && nodeData.stationIds.length > 0) {
      const stationInserts = nodeData.stationIds.map((stationId, idx) => ({
        node_id: node.id,
        station_id: stationId,
        priority: idx + 1
      }));
      
      await trx('mes.node_stations').insert(stationInserts);
    }
    
    await trx.commit();
    
    console.log(`✅ Added node: ${node.name} to plan ${planId}`);
    
    // Return node with details
    const nodeWithDetails = await getPlanWithNodes(planId);
    const addedNode = nodeWithDetails.nodes.find(n => n.id === node.id);
    
    res.json(addedNode);
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Error adding node:', error);
    res.status(500).json({ 
      error: 'Failed to add node',
      details: error.message 
    });
  }
});

/**
 * GET /api/mes/production-plans/:planId/nodes/:nodeId
 * Get single node with full details
 */
router.get('/production-plans/:planId/nodes/:nodeId', withAuth, async (req, res) => {
  try {
    const { planId, nodeId } = req.params;
    
    // Get node (nodeId can be numeric id or node_id string)
    const node = await db('mes.production_plan_nodes as n')
      .where('n.plan_id', planId)
      .where(function() {
        this.where('n.id', nodeId).orWhere('n.node_id', nodeId);
      })
      .leftJoin('mes.operations as op', 'n.operation_id', 'op.id')
      .select(
        'n.*',
        'op.name as operation_name',
        'op.skills as operation_skills'
      )
      .first();
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    // Get material inputs
    const materials = await db('mes.node_material_inputs')
      .where('node_id', node.id)
      .select('*');
    
    // Get assigned stations
    const stations = await db('mes.node_stations as ns')
      .where('ns.node_id', node.id)
      .leftJoin('mes.stations as s', 'ns.station_id', 's.id')
      .select(
        'ns.station_id',
        'ns.priority',
        's.name as station_name',
        's.description as station_description'
      )
      .orderBy('ns.priority');
    
    // Assemble response
    const nodeDetails = {
      ...node,
      material_inputs: materials.map(m => ({
        materialCode: m.material_code,
        requiredQuantity: m.required_quantity,
        unitRatio: m.unit_ratio,
        isDerived: m.is_derived
      })),
      assigned_stations: stations.map(s => ({
        stationId: s.station_id,
        stationName: s.station_name,
        stationDescription: s.station_description,
        priority: s.priority
      }))
    };
    
    res.json(nodeDetails);
    
  } catch (error) {
    console.error('❌ Error fetching node:', error);
    res.status(500).json({ 
      error: 'Failed to fetch node',
      details: error.message 
    });
  }
});

/**
 * PUT /api/mes/production-plans/:planId/nodes/:nodeId
 * Update node (only if plan status = draft)
 */
router.put('/production-plans/:planId/nodes/:nodeId', withAuth, async (req, res) => {
  const trx = await db.transaction();
  
  try {
    const { planId, nodeId } = req.params;
    const updates = req.body;
    
    // Check plan is in draft
    const plan = await trx('mes.production_plans')
      .where('id', planId)
      .first();
    
    if (!plan) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    if (plan.status !== 'draft') {
      await trx.rollback();
      return res.status(400).json({ 
        error: 'Can only update nodes in draft plans',
        currentStatus: plan.status 
      });
    }
    
    // Get node
    const node = await trx('mes.production_plan_nodes')
      .where('plan_id', planId)
      .where(function() {
        this.where('id', nodeId).orWhere('node_id', nodeId);
      })
      .first();
    
    if (!node) {
      await trx.rollback();
      return res.status(404).json({ error: 'Node not found' });
    }
    
    // Prepare update data
    const updateData = {};
    if (updates.name) updateData.name = updates.name;
    if (updates.operation_id) updateData.operation_id = updates.operation_id;
    if (updates.nominal_time) {
      updateData.nominal_time = updates.nominal_time;
      updateData.effective_time = updates.nominal_time / (updates.efficiency || node.efficiency || 0.85);
    }
    if (updates.efficiency) {
      updateData.efficiency = updates.efficiency;
      updateData.effective_time = (updates.nominal_time || node.nominal_time) / updates.efficiency;
    }
    if (updates.output_code) updateData.output_code = updates.output_code;
    if (updates.output_qty) updateData.output_qty = updates.output_qty;
    if (updates.output_unit) updateData.output_unit = updates.output_unit;
    if (updates.sequence_order) updateData.sequence_order = updates.sequence_order;
    if (updates.assignment_mode) updateData.assignment_mode = updates.assignment_mode;
    
    updateData.updated_at = trx.fn.now();
    
    // Update node
    await trx('mes.production_plan_nodes')
      .where('id', node.id)
      .update(updateData);
    
    // Update materials if provided
    if (updates.materialInputs) {
      await trx('mes.node_material_inputs')
        .where('node_id', node.id)
        .delete();
      
      if (updates.materialInputs.length > 0) {
        const materialInserts = updates.materialInputs.map(mat => ({
          node_id: node.id,
          material_code: mat.materialCode,
          required_quantity: mat.requiredQuantity,
          unit_ratio: mat.unitRatio || 1.0,
          is_derived: mat.isDerived || false
        }));
        
        await trx('mes.node_material_inputs').insert(materialInserts);
      }
    }
    
    // Update stations if provided
    if (updates.stationIds) {
      await trx('mes.node_stations')
        .where('node_id', node.id)
        .delete();
      
      if (updates.stationIds.length > 0) {
        const stationInserts = updates.stationIds.map((stationId, idx) => ({
          node_id: node.id,
          station_id: stationId,
          priority: idx + 1
        }));
        
        await trx('mes.node_stations').insert(stationInserts);
      }
    }
    
    await trx.commit();
    
    console.log(`✅ Updated node: ${nodeId} in plan ${planId}`);
    
    // Return updated node
    const updatedNode = await db('mes.production_plan_nodes')
      .where('id', node.id)
      .first();
    
    res.json(updatedNode);
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Error updating node:', error);
    res.status(500).json({ 
      error: 'Failed to update node',
      details: error.message 
    });
  }
});

/**
 * DELETE /api/mes/production-plans/:planId/nodes/:nodeId
 * Delete node (only if plan status = draft)
 */
router.delete('/production-plans/:planId/nodes/:nodeId', withAuth, async (req, res) => {
  const trx = await db.transaction();
  
  try {
    const { planId, nodeId } = req.params;
    
    // Check plan is in draft
    const plan = await trx('mes.production_plans')
      .where('id', planId)
      .first();
    
    if (!plan) {
      await trx.rollback();
      return res.status(404).json({ error: 'Plan not found' });
    }
    
    if (plan.status !== 'draft') {
      await trx.rollback();
      return res.status(400).json({ 
        error: 'Can only delete nodes from draft plans',
        currentStatus: plan.status 
      });
    }
    
    // Get node
    const node = await trx('mes.production_plan_nodes')
      .where('plan_id', planId)
      .where(function() {
        this.where('id', nodeId).orWhere('node_id', nodeId);
      })
      .first();
    
    if (!node) {
      await trx.rollback();
      return res.status(404).json({ error: 'Node not found' });
    }
    
    // Delete related data (CASCADE handles most, but explicit for clarity)
    await trx('mes.node_stations')
      .where('node_id', node.id)
      .delete();
    
    await trx('mes.node_material_inputs')
      .where('node_id', node.id)
      .delete();
    
    // Delete node
    await trx('mes.production_plan_nodes')
      .where('id', node.id)
      .delete();
    
    await trx.commit();
    
    console.log(`🗑️  Deleted node: ${nodeId} from plan ${planId}`);
    res.json({ 
      success: true,
      message: 'Node deleted successfully',
      nodeId: nodeId
    });
    
  } catch (error) {
    await trx.rollback();
    console.error('❌ Error deleting node:', error);
    res.status(500).json({ 
      error: 'Failed to delete node',
      details: error.message 
    });
  }
});

/**
 * POST /api/mes/nodes/:nodeId/materials
 * Add material input to a node
 */
router.post('/nodes/:nodeId/materials', withAuth, async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { materialCode, requiredQuantity, unitRatio, isDerived } = req.body;
    
    // Get node and verify plan is draft
    const node = await db('mes.production_plan_nodes as n')
      .join('mes.production_plans as p', 'n.plan_id', 'p.id')
      .where('n.id', nodeId)
      .select('n.*', 'p.status as plan_status', 'p.work_order_code')
      .first();
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    if (node.plan_status !== 'draft') {
      return res.status(400).json({ 
        error: 'Can only modify materials in draft plans' 
      });
    }
    
    // Check if material already exists
    const existing = await db('mes.node_material_inputs')
      .where('node_id', nodeId)
      .where('material_code', materialCode)
      .first();
    
    if (existing) {
      return res.status(400).json({ 
        error: 'Material already added to this node' 
      });
    }
    
    // Insert material
    const [material] = await db('mes.node_material_inputs')
      .insert({
        node_id: nodeId,
        material_code: materialCode,
        required_quantity: requiredQuantity,
        unit_ratio: unitRatio || 1.0,
        is_derived: isDerived || false
      })
      .returning('*');
    
    console.log(`✅ Added material ${materialCode} to node ${nodeId}`);
    res.json(material);
    
  } catch (error) {
    console.error('❌ Error adding material:', error);
    res.status(500).json({ 
      error: 'Failed to add material',
      details: error.message 
    });
  }
});

/**
 * DELETE /api/mes/nodes/:nodeId/materials/:materialCode
 * Remove material input from a node
 */
router.delete('/nodes/:nodeId/materials/:materialCode', withAuth, async (req, res) => {
  try {
    const { nodeId, materialCode } = req.params;
    
    // Verify plan is draft
    const node = await db('mes.production_plan_nodes as n')
      .join('mes.production_plans as p', 'n.plan_id', 'p.id')
      .where('n.id', nodeId)
      .select('p.status as plan_status')
      .first();
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    if (node.plan_status !== 'draft') {
      return res.status(400).json({ 
        error: 'Can only modify materials in draft plans' 
      });
    }
    
    // Delete material
    const deleted = await db('mes.node_material_inputs')
      .where('node_id', nodeId)
      .where('material_code', materialCode)
      .delete();
    
    if (deleted === 0) {
      return res.status(404).json({ error: 'Material not found in node' });
    }
    
    console.log(`🗑️  Removed material ${materialCode} from node ${nodeId}`);
    res.json({ 
      success: true,
      message: 'Material removed successfully' 
    });
    
  } catch (error) {
    console.error('❌ Error removing material:', error);
    res.status(500).json({ 
      error: 'Failed to remove material',
      details: error.message 
    });
  }
});

/**
 * POST /api/mes/nodes/:nodeId/stations
 * Assign station option to a node
 */
router.post('/nodes/:nodeId/stations', withAuth, async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { stationId, priority } = req.body;
    
    // Get node and verify plan is draft
    const node = await db('mes.production_plan_nodes as n')
      .join('mes.production_plans as p', 'n.plan_id', 'p.id')
      .where('n.id', nodeId)
      .select('p.status as plan_status')
      .first();
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    if (node.plan_status !== 'draft') {
      return res.status(400).json({ 
        error: 'Can only modify stations in draft plans' 
      });
    }
    
    // Check if station already assigned
    const existing = await db('mes.node_stations')
      .where('node_id', nodeId)
      .where('station_id', stationId)
      .first();
    
    if (existing) {
      return res.status(400).json({ 
        error: 'Station already assigned to this node' 
      });
    }
    
    // Calculate priority if not provided
    let stationPriority = priority;
    if (!stationPriority) {
      const lastStation = await db('mes.node_stations')
        .where('node_id', nodeId)
        .orderBy('priority', 'desc')
        .first();
      
      stationPriority = lastStation ? lastStation.priority + 1 : 1;
    }
    
    // Insert station assignment
    const [station] = await db('mes.node_stations')
      .insert({
        node_id: nodeId,
        station_id: stationId,
        priority: stationPriority
      })
      .returning('*');
    
    console.log(`✅ Assigned station ${stationId} to node ${nodeId}`);
    res.json(station);
    
  } catch (error) {
    console.error('❌ Error assigning station:', error);
    res.status(500).json({ 
      error: 'Failed to assign station',
      details: error.message 
    });
  }
});

/**
 * DELETE /api/mes/nodes/:nodeId/stations/:stationId
 * Remove station option from a node
 */
router.delete('/nodes/:nodeId/stations/:stationId', withAuth, async (req, res) => {
  try {
    const { nodeId, stationId } = req.params;
    
    // Verify plan is draft
    const node = await db('mes.production_plan_nodes as n')
      .join('mes.production_plans as p', 'n.plan_id', 'p.id')
      .where('n.id', nodeId)
      .select('p.status as plan_status')
      .first();
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    if (node.plan_status !== 'draft') {
      return res.status(400).json({ 
        error: 'Can only modify stations in draft plans' 
      });
    }
    
    // Delete station assignment
    const deleted = await db('mes.node_stations')
      .where('node_id', nodeId)
      .where('station_id', stationId)
      .delete();
    
    if (deleted === 0) {
      return res.status(404).json({ error: 'Station not found in node' });
    }
    
    console.log(`🗑️  Removed station ${stationId} from node ${nodeId}`);
    res.json({ 
      success: true,
      message: 'Station removed successfully' 
    });
    
  } catch (error) {
    console.error('❌ Error removing station:', error);
    res.status(500).json({ 
      error: 'Failed to remove station',
      details: error.message 
    });
  }
});

export default router;

