/**
 * Assignment Service
 * Handles worker assignment lifecycle: start, complete, pause, resume
 * Integrates with lot tracking, material reservations, and FIFO scheduling
 */

import db from '#db/connection';
import { logOperation } from '#server/utils/logger';
import {
  getWorkerNextTask,
  getWorkerTaskQueue as fifoGetWorkerTaskQueue,
  getWorkerTaskStats,
  startTask,
  completeTask,
  hasTasksInQueue,
  checkPredecessorsCompleted
} from '#server/utils/fifoScheduler';
import {
  getLotConsumptionPreview
} from '#server/utils/lotConsumption';
import { recordStatusChange } from '#server/utils/statusHistory';

/**
 * Get all worker assignments with optional filtering
 */
export async function getWorkerAssignments(filters = {}) {
  const { workerId, status, limit = 100 } = filters;

  let query = db('mes.worker_assignments')
    .select('*')
    .orderBy('createdAt', 'desc')
    .limit(Math.min(limit, 500));

  if (workerId) {
    query = query.where('workerId', workerId);
  }

  if (status) {
    query = query.where('status', status);
  }

  return query;
}

/**
 * Get assignments for a specific worker
 */
export async function getAssignmentsByWorkerId(workerId) {
  return db('mes.worker_assignments')
    .select('*')
    .where('workerId', workerId)
    .orderBy('createdAt', 'desc');
}

/**
 * Get lot consumption preview for an assignment
 */
export async function getLotPreview(assignmentId) {
  console.log(`📦 [LOT-PREVIEW] Fetching lot preview for assignment ${assignmentId}`);

  // Get assignment details with operation name
  const assignment = await db('mes.worker_assignments as wa')
    .select(
      'wa.id',
      'wa.nodeId',
      'wa.planId',
      'op.name as operationName',
      'n.name as nodeName'
    )
    .leftJoin('mes.operations as op', 'op.id', 'wa.operationId')
    .leftJoin('mes.production_plan_nodes as n', function () {
      this.on('n.id', '=', db.raw('wa."nodeId"::integer'));
    })
    .where('wa.id', assignmentId)
    .first();

  if (!assignment) {
    return { success: false, error: 'Assignment not found' };
  }

  // Get VARCHAR nodeId from production_plan_nodes
  const node = await db('mes.production_plan_nodes')
    .where('id', assignment.nodeId)
    .first();

  if (!node) {
    console.warn(`⚠️  [LOT-PREVIEW] Node ${assignment.nodeId} not found`);
    return { success: false, error: 'Production node not found' };
  }

  // Get material requirements using VARCHAR nodeId
  const materialRequirements = await db('mes.node_material_inputs as nmi')
    .select(
      'nmi.materialCode as materialCode',
      'nmi.requiredQuantity as requiredQty'
    )
    .where('nmi.nodeId', node.nodeId);

  console.log(`📋 [LOT-PREVIEW] Found ${materialRequirements.length} material requirement(s) for node ${node.nodeId}`);

  // Get lot consumption preview (no reservation)
  const preview = await getLotConsumptionPreview(materialRequirements);

  return {
    success: true,
    assignmentId,
    taskName: assignment.operationName || assignment.nodeName || 'Task',
    materials: preview.materials
  };
}

/**
 * Start a task with integrated lot consumption
 */
export async function startAssignment(assignmentId, workerId) {
  if (!workerId) {
    return { success: false, error: 'workerId is required' };
  }

  // Start task with integrated lot consumption
  const result = await startTask(assignmentId, workerId);

  if (!result.success) {
    return result;
  }

  // Get output info from plannedOutput
  const assignment = result.assignment || {};
  const plannedOutput = assignment.plannedOutput || {};
  const outputCode = Object.keys(plannedOutput)[0] || '-';
  const outputQty = plannedOutput[outputCode] || 0;

  // Get input materials from preProductionReservedAmount (what was reserved at plan creation)
  const preReserved = assignment.preProductionReservedAmount || {};
  const inputCodes = Object.keys(preReserved);
  const inputStr = inputCodes.length > 0
    ? inputCodes.map(code => `${code} × ${preReserved[code]}`).join(', ')
    : '-';

  // Fetch worker name from DB
  const worker = await db('mes.workers').where('id', workerId).select('name').first();
  const workerName = worker?.name || 'N/A';

  logOperation({
    type: 'success',
    action: 'TASK START',
    details: {
      assignment: assignmentId,
      worker: `${workerId} (${workerName})`,
      'rezerv': inputStr,
      output: `${outputCode} × ${outputQty}`
    }
  });

  // Log material consumption details
  if (result.materialReservation && result.materialReservation.reservations.length > 0) {
    console.log(`📦 [FIFO] Reserved ${result.materialReservation.reservations.length} material(s) with FIFO lot consumption`);

    result.materialReservation.reservations.forEach(r => {
      console.log(`   - ${r.materialCode}: ${r.totalReserved} from ${r.lotsConsumed.length} lot(s)`);
    });
  }

  return {
    ...result,
    message: result.materialReservation?.warnings?.length > 0
      ? 'Task started with warnings (partial material reservations)'
      : 'Task started successfully'
  };
}

/**
 * Complete a task with actual material consumption
 */
export async function completeAssignment(assignmentId, workerId, data = {}) {
  if (!workerId) {
    return { success: false, error: 'workerId is required' };
  }

  const { quantityProduced, defectQuantity, inputScrapCounters, productionScrapCounters, notes } = data;

  // Complete task with integrated material consumption
  const result = await completeTask(assignmentId, workerId, {
    quantityProduced,
    defectQuantity,
    inputScrapCounters,
    productionScrapCounters,
    notes
  });

  if (!result.success) {
    return result;
  }

  // Get details from result
  const assignment = result.assignment || {};
  const plannedOutput = assignment.plannedOutput || {};
  const outputCode = Object.keys(plannedOutput)[0] || '-';

  // Build per-material scrap strings
  const inputScrapStr = inputScrapCounters && Object.keys(inputScrapCounters).length > 0
    ? Object.entries(inputScrapCounters)
      .filter(([_, v]) => parseInt(v) > 0)
      .map(([code, qty]) => `${code} × ${qty}`)
      .join(', ') || '-'
    : '-';

  const prodScrapStr = productionScrapCounters && Object.keys(productionScrapCounters).length > 0
    ? Object.entries(productionScrapCounters)
      .filter(([_, v]) => parseInt(v) > 0)
      .map(([code, qty]) => `${code} × ${qty}`)
      .join(', ') || '-'
    : '-';

  // Get pre-reserved amounts
  const preReserved = assignment.preProductionReservedAmount || {};
  const preReservedStr = Object.keys(preReserved).length > 0
    ? Object.entries(preReserved).map(([code, qty]) => `${code} × ${qty}`).join(', ')
    : '-';

  // Build material consumption summary from adjustments
  const adjustments = result.adjustments || [];

  // If adjustments are empty, query DB for consumed amounts
  let consumedStr = '-';

  if (adjustments.length > 0) {
    // Group by materialCode and sum up
    const adjByMaterial = {};
    adjustments.forEach(adj => {
      if (!adjByMaterial[adj.materialCode]) {
        adjByMaterial[adj.materialCode] = { reserved: 0, consumed: 0, delta: 0 };
      }
      adjByMaterial[adj.materialCode].reserved += adj.reserved || 0;
      adjByMaterial[adj.materialCode].consumed += adj.consumed || 0;
      adjByMaterial[adj.materialCode].delta += adj.delta || 0;
    });

    consumedStr = Object.entries(adjByMaterial).map(([code, data]) => {
      if (data.delta === 0) {
        return `${code}: ${data.consumed.toFixed(0)}`;
      } else if (data.delta > 0) {
        return `${code}: ${data.consumed.toFixed(0)} (+${data.delta.toFixed(0)} iade)`;
      } else {
        return `${code}: ${data.consumed.toFixed(0)} (${data.delta.toFixed(0)} extra)`;
      }
    }).join(', ');
  } else {
    // Query DB for consumed amounts from assignment_material_reservations
    const reservations = await db('mes.assignment_material_reservations')
      .where('assignmentId', assignmentId)
      .select('materialCode', 'consumedQty');

    if (reservations.length > 0) {
      // Group by material and sum consumed
      const consumedByMaterial = {};
      reservations.forEach(res => {
        if (!consumedByMaterial[res.materialCode]) {
          consumedByMaterial[res.materialCode] = 0;
        }
        consumedByMaterial[res.materialCode] += parseFloat(res.consumedQty) || 0;
      });

      consumedStr = Object.entries(consumedByMaterial)
        .filter(([_, qty]) => qty > 0)
        .map(([code, qty]) => `${code}: ${qty.toFixed(0)}`)
        .join(', ') || '-';
    } else {
      // No DB records - calculate from scrap + production
      // This happens when no stock was reserved
      const consumedByMaterial = {};

      // Add input scrap
      Object.entries(inputScrapCounters || {}).forEach(([code, qty]) => {
        consumedByMaterial[code] = (consumedByMaterial[code] || 0) + parseInt(qty || 0);
      });

      // Add production scrap
      Object.entries(productionScrapCounters || {}).forEach(([code, qty]) => {
        consumedByMaterial[code] = (consumedByMaterial[code] || 0) + parseInt(qty || 0);
      });

      // Add production consumption (quantityProduced + defectQuantity) * ratio
      // Get preReserved materials as they indicate what materials this task needs
      const preReserved = assignment.preProductionReservedAmount || {};
      Object.keys(preReserved).forEach(code => {
        // Assume 1:1 ratio if we don't have exact ratio
        // For accurate ratio, we'd need to query node_material_inputs
        const productionConsumption = (quantityProduced || 0) + (defectQuantity || 0);
        consumedByMaterial[code] = (consumedByMaterial[code] || 0) + productionConsumption;
      });

      consumedStr = Object.entries(consumedByMaterial)
        .filter(([_, qty]) => qty > 0)
        .map(([code, qty]) => `${code}: ${qty}`)
        .join(', ') || '-';
    }
  }

  // Fetch worker name from DB
  const worker = await db('mes.workers').where('id', workerId).select('name').first();
  const workerName = worker?.name || 'N/A';

  logOperation({
    type: 'success',
    action: 'TASK COMPLETE',
    details: {
      assignment: assignmentId,
      worker: `${workerId} (${workerName})`,
      'rezerv': preReservedStr,
      'kullanılan': consumedStr,
      output: `${outputCode} × ${quantityProduced || 0}`,
      'hasarlı-gelen': inputScrapStr,
      'üretim-fire': prodScrapStr,
      'çıktı-hata': defectQuantity || 0
    }
  });

  // Log material consumption and adjustments
  if (result.materialsConsumed > 0) {
    console.log(`📦 [FIFO] Processed ${result.materialsConsumed} material consumption(s)`);
  }

  if (result.adjustments && result.adjustments.length > 0) {
    console.log(`📊 [FIFO] Stock adjustments:`);
    result.adjustments.forEach(adj => {
      console.log(`  ${adj.materialCode}: Reserved=${adj.reserved}, Consumed=${adj.consumed}, Delta=${adj.delta > 0 ? '+' : ''}${adj.delta}`);
    });
  }

  return {
    ...result,
    message: `Task completed successfully${result.materialsConsumed > 0 ? ` (${result.materialsConsumed} materials consumed)` : ''}`
  };
}

/**
 * Pause a task
 */
export async function pauseAssignment(assignmentId, workerId) {
  if (!workerId) {
    return { success: false, error: 'workerId is required' };
  }

  // Verify worker owns this task
  const assignment = await db('mes.worker_assignments')
    .where('id', assignmentId)
    .where('workerId', workerId)
    .first();

  if (!assignment) {
    return { success: false, error: 'Assignment not found or does not belong to worker' };
  }

  if (assignment.status !== 'in_progress') {
    return { success: false, error: `Cannot pause task with status ${assignment.status}` };
  }

  // Update to paused
  const [updated] = await db('mes.worker_assignments')
    .where('id', assignmentId)
    .update({
      status: 'paused'
    })
    .returning('*');

  // Record status change in history
  await recordStatusChange(assignmentId, 'in_progress', 'paused', workerId);

  console.log(`⏸️  Task ${assignmentId} paused by worker ${workerId}`);

  return {
    success: true,
    assignment: updated
  };
}

/**
 * Resume a paused task
 */
export async function resumeAssignment(assignmentId, workerId) {
  if (!workerId) {
    return { success: false, error: 'workerId is required' };
  }

  // Verify worker owns this task
  const assignment = await db('mes.worker_assignments')
    .where('id', assignmentId)
    .where('workerId', workerId)
    .first();

  if (!assignment) {
    return { success: false, error: 'Assignment not found or does not belong to worker' };
  }

  if (assignment.status !== 'paused') {
    return { success: false, error: `Cannot resume task with status ${assignment.status}` };
  }

  // Update to in_progress
  const [updated] = await db('mes.worker_assignments')
    .where('id', assignmentId)
    .update({
      status: 'in_progress'
    })
    .returning('*');

  // Record status change in history
  await recordStatusChange(assignmentId, 'paused', 'in_progress', workerId);

  console.log(`▶️  Task ${assignmentId} resumed by worker ${workerId}`);

  return {
    success: true,
    assignment: updated
  };
}

/**
 * Get next task for a worker using FIFO scheduling
 */
export async function getNextTask(workerId) {
  const nextTask = await getWorkerNextTask(workerId);

  if (!nextTask) {
    return {
      success: true,
      task: null,
      message: 'No tasks available in queue'
    };
  }

  return {
    success: true,
    task: nextTask
  };
}

/**
 * Get task queue for a worker
 */
export async function getTaskQueue(workerId) {
  // Canonical SQL-LAUNCH query - get full task data with all relationships
  const tasks = await db('mes.worker_assignments as wa')
    .select(
      // Assignment core fields
      'wa.id as assignmentId',
      'wa.status',
      'wa.isUrgent',
      'wa.priority',
      'wa.sequenceNumber',

      // IDs for relationships
      'wa.workerId',
      'wa.planId',
      'wa.nodeId',
      'wa.operationId',
      'wa.stationId',
      'wa.substationId',
      'wa.workOrderCode',

      // Timing fields
      'wa.estimatedStartTime',
      'wa.estimatedEndTime',
      'wa.startedAt',
      'wa.completedAt',
      'wa.nominalTime',
      'wa.effectiveTime',

      // Material & output fields (JSONB)
      'wa.preProductionReservedAmount',
      'wa.plannedOutput',
      'wa.actualReservedAmounts',
      'wa.materialReservationStatus',
      'wa.inputScrapCount',
      'wa.productionScrapCount',
      'wa.defectQuantity',
      'wa.actualQuantity',

      // Metadata
      'wa.notes',
      'wa.createdAt',

      // Worker info
      'w.name as workerName',
      'w.skills as workerSkills',

      // Node info
      'n.name as nodeName',
      'n.nodeId as nodeIdString',
      'n.outputCode',
      'n.outputQty',

      // Operation info
      'op.name as operationName',

      // Station info
      'st.name as stationName',

      // Substation info  
      'sub.id as substationCode',

      // Plan info
      'p.planName as planName'
    )
    .leftJoin('mes.workers as w', 'w.id', 'wa.workerId')
    .leftJoin('mes.production_plan_nodes as n', function () {
      this.on('n.id', '=', db.raw('wa."nodeId"::integer'));
    })
    .leftJoin('mes.operations as op', 'op.id', 'wa.operationId')
    .leftJoin('mes.stations as st', 'st.id', 'wa.stationId')
    .leftJoin('mes.substations as sub', 'sub.id', 'wa.substationId')
    .leftJoin('mes.production_plans as p', 'p.id', 'wa.planId')
    .where('wa.workerId', workerId)
    .whereIn('wa.status', ['pending', 'queued', 'ready', 'in_progress', 'paused'])
    .orderBy([
      { column: 'wa.isUrgent', order: 'desc' },
      { column: 'wa.estimatedStartTime', order: 'asc' },
      { column: 'wa.createdAt', order: 'asc' }
    ]);

  // Get material inputs for each task
  const nodeIds = [...new Set(tasks.map(t => t.nodeIdString).filter(Boolean))];
  const materialInputs = nodeIds.length > 0
    ? await db('mes.node_material_inputs as nmi')
      .leftJoin('materials.materials as m', 'm.code', 'nmi.materialCode')
      .whereIn('nmi.nodeId', nodeIds)
      .select('nmi.nodeId', 'nmi.materialCode', 'nmi.requiredQuantity', 'm.name as materialName', 'm.unit as materialUnit')
    : [];

  // Group materials by nodeId with name and unit
  const materialsByNode = materialInputs.reduce((acc, m) => {
    if (!acc[m.nodeId]) acc[m.nodeId] = {};
    acc[m.nodeId][m.materialCode] = {
      qty: m.requiredQuantity,
      name: m.materialName,
      unit: m.materialUnit
    };
    return acc;
  }, {});

  // Get stock availability for material inputs
  const allMaterialCodes = [...new Set(materialInputs.map(m => m.materialCode))];
  const stockData = allMaterialCodes.length > 0
    ? await db('materials.materials')
      .whereIn('code', allMaterialCodes)
      .select('code', 'stock')
    : [];
  const stockAvailability = stockData.reduce((acc, s) => {
    acc[s.code] = parseFloat(s.stock) || 0;
    return acc;
  }, {});

  // Get next task ID (first ready/pending task)
  const nextTask = tasks.find(t => ['ready', 'pending'].includes(t.status));
  const nextTaskId = nextTask?.assignmentId || null;

  return {
    tasks,
    materialsByNode,
    stockAvailability,
    nextTaskId,
    queueLength: tasks.length
  };
}

/**
 * Get task statistics for a worker
 */
export async function getTaskStats(workerId) {
  return getWorkerTaskStats(workerId);
}

/**
 * Check if worker has tasks in queue
 */
export async function hasWorkerTasks(workerId) {
  const hasTasks = await hasTasksInQueue(workerId);
  return {
    success: true,
    workerId,
    hasTasks
  };
}
