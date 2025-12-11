import db from '#db/connection';
import { getPlanWithNodes } from '../utils/planHelper.js';
import { launchProductionPlan as executeLaunch } from './launchService.js';

// Re-export launch function
export const launchProductionPlan = executeLaunch;

/**
 * Get all production plans (excludes templates)
 * @returns {Promise<Array>} List of production plans with node counts
 */
export const getProductionPlans = async () => {
  const plans = await db('mes.production_plans as p')
    .select(
      'p.id',
      'p.planName as name',
      'p.description',
      'p.workOrderCode',
      'p.quoteId',
      'p.status',
      'p.launchStatus',  // ← Frontend needs this!
      'p.createdAt',
      'p.launchedAt',
      'p.timingSummary',
      'p.materialSummary',
      db.raw('count(n.id)::integer as "nodeCount"')
    )
    .leftJoin('mes.production_plan_nodes as n', 'n.planId', 'p.id')
    .where('p.status', '!=', 'template')
    .groupBy('p.id')
    .orderBy('p.createdAt', 'desc');

  // Parse JSONB fields
  return plans.map(p => ({
    ...p,
    timingSummary: typeof p.timingSummary === 'string' ? JSON.parse(p.timingSummary) : p.timingSummary,
    materialSummary: typeof p.materialSummary === 'string' ? JSON.parse(p.materialSummary) : p.materialSummary
  }));
};

/**
 * Get a single production plan with nodes
 * @param {string} id - Plan ID
 * @returns {Promise<Object|null>} Plan with nodes or null
 */
export const getProductionPlanById = async (id) => {
  return getPlanWithNodes(id);
};

/**
 * Create a new production plan
 * @param {Object} data - Plan data
 * @returns {Promise<Object>} Created plan with nodes
 */
export const createProductionPlan = async (data) => {
  const { name, description, workOrderCode, orderCode, quoteId, nodes, quantity, timingSummary, materialSummary } = data;

  const finalOrderCode = workOrderCode || orderCode;

  if (!finalOrderCode) {
    const error = new Error('Work order code is required for production plans');
    error.code = 'MISSING_ORDER_CODE';
    throw error;
  }

  if (!nodes || !Array.isArray(nodes)) {
    const error = new Error('Missing required field: nodes');
    error.code = 'MISSING_NODES';
    throw error;
  }

  const trx = await db.transaction();

  try {
    // Generate plan ID
    const result = await trx('mes.production_plans')
      .max('id as maxId')
      .first();

    const maxId = result?.maxId;
    let nextNum = 1;

    if (maxId && typeof maxId === 'string' && maxId.includes('-')) {
      const parts = maxId.split('-');
      const numPart = parts[parts.length - 1];
      const parsed = parseInt(numPart, 10);
      if (!isNaN(parsed)) {
        nextNum = parsed + 1;
      }
    }

    const planId = `PLAN-${nextNum.toString().padStart(3, '0')}`;

    console.log(`📋 Creating production plan: ${planId} (${name || 'Unnamed'}) for WO: ${finalOrderCode}`);

    // Create plan header
    await trx('mes.production_plans').insert({
      id: planId,
      planName: name || null,
      description: description || null,
      workOrderCode: finalOrderCode,
      quoteId: quoteId || null,
      quantity: quantity || 1,
      timingSummary: timingSummary ? JSON.stringify(timingSummary) : null,
      materialSummary: materialSummary ? JSON.stringify(materialSummary) : null,
      status: 'production',
      createdAt: trx.fn.now()
    });

    // Build frontend ID to backend nodeId mapping
    const idMapping = {};
    nodes.forEach((node, index) => {
      const frontendId = node.id || node.nodeId;
      const numericPart = node.sequenceOrder || parseInt(String(frontendId).replace(/\D/g, '')) || (index + 1);
      const backendNodeId = `${planId}-node-${numericPart}`;
      idMapping[frontendId] = backendNodeId;
    });

    // Insert all nodes first
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
      const node = nodes[nodeIndex];
      const frontendId = node.id || node.nodeId;
      const numericPart = node.sequenceOrder || parseInt(String(frontendId).replace(/\D/g, '')) || (nodeIndex + 1);
      const stringNodeId = `${planId}-node-${numericPart}`;

      await trx('mes.production_plan_nodes')
        .insert({
          planId: planId,
          nodeId: stringNodeId,
          workOrderCode: finalOrderCode,
          name: node.name,
          operationId: node.operationId,
          outputCode: node.outputCode,
          outputQty: node.outputQty,
          outputUnit: node.outputUnit,
          nominalTime: node.nominalTime || 0,
          efficiency: node.efficiency !== undefined ? parseFloat(node.efficiency) : 1.0,
          effectiveTime: Math.round((node.nominalTime || 0) / (node.efficiency !== undefined ? parseFloat(node.efficiency) : 1.0)),
          sequenceOrder: numericPart,
          assignmentMode: 'auto',
          x: node.x || 80,
          y: node.y || 80,
          createdAt: trx.fn.now()
        });

      // Insert material inputs
      if (node.materialInputs && node.materialInputs.length > 0) {
        const materialInputs = node.materialInputs.map(m => ({
          nodeId: stringNodeId,
          materialCode: m.materialCode,
          requiredQuantity: m.requiredQuantity,
          unitRatio: m.unitRatio || 1.0,
          isDerived: m.isDerived || false,
          createdAt: trx.fn.now()
        }));

        await trx('mes.node_material_inputs').insert(materialInputs);
      }

      // Insert station assignments
      if (node.stationIds && node.stationIds.length > 0) {
        const stationAssignments = node.stationIds.map((stId, idx) => ({
          nodeId: stringNodeId,
          stationId: stId,
          priority: idx + 1,
          createdAt: trx.fn.now()
        }));

        await trx('mes.node_stations').insert(stationAssignments);
      }
    }

    // Insert all predecessors AFTER all nodes exist
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
      const node = nodes[nodeIndex];
      const frontendId = node.id || node.nodeId;
      const numericPart = node.sequenceOrder || parseInt(String(frontendId).replace(/\D/g, '')) || (nodeIndex + 1);
      const stringNodeId = `${planId}-node-${numericPart}`;

      if (node.predecessors && Array.isArray(node.predecessors) && node.predecessors.length > 0) {
        const predecessorRecords = node.predecessors
          .map(predId => {
            const backendPredId = idMapping[predId] || predId;
            return {
              nodeId: stringNodeId,
              predecessorNodeId: backendPredId,
              createdAt: trx.fn.now()
            };
          });

        await trx('mes.node_predecessors').insert(predecessorRecords);
      }
    }

    await trx.commit();

    console.log(`✅ Production plan created: ${planId} with ${nodes.length} nodes`);

    return getPlanWithNodes(planId);

  } catch (error) {
    await trx.rollback();
    throw error;
  }
};

/**
 * Update a production plan
 * @param {string} id - Plan ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated plan with nodes
 */
export const updateProductionPlan = async (id, data) => {
  const {
    name,
    description,
    workOrderCode,
    orderCode,
    quoteId,
    status,
    nodes,
    quantity,
    // scheduleType - not in DB schema, ignored
    materialSummary,
    timingSummary
  } = data;

  const finalOrderCode = workOrderCode || orderCode;

  const plan = await db('mes.production_plans').where('id', id).first();
  if (!plan) {
    const error = new Error('Plan not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const updateFields = {};

  if (name !== undefined) updateFields.planName = name;
  if (description !== undefined) updateFields.description = description;
  if (finalOrderCode !== undefined) updateFields.workOrderCode = finalOrderCode;
  if (quoteId !== undefined) updateFields.quoteId = quoteId;
  if (status !== undefined) updateFields.status = status;
  if (quantity !== undefined) updateFields.quantity = quantity;
  // scheduleType removed - column does not exist in mes.production_plans
  if (materialSummary !== undefined) updateFields.materialSummary = JSON.stringify(materialSummary);
  if (timingSummary !== undefined) updateFields.timingSummary = JSON.stringify(timingSummary);

  updateFields.updatedAt = db.fn.now();

  const trx = await db.transaction();

  try {
    // Update plan header
    await trx('mes.production_plans').where('id', id).update(updateFields);

    // If nodes provided, update them
    if (nodes && Array.isArray(nodes) && nodes.length > 0) {
      // Delete existing related data
      const existingNodeIds = await trx('mes.production_plan_nodes')
        .where('planId', id)
        .pluck('nodeId');

      if (existingNodeIds.length > 0) {
        await trx('mes.node_material_inputs').whereIn('nodeId', existingNodeIds).del();
        await trx('mes.node_stations').whereIn('nodeId', existingNodeIds).del();
        await trx('mes.node_predecessors').whereIn('nodeId', existingNodeIds).del();
      }
      await trx('mes.production_plan_nodes').where('planId', id).del();

      // Build mapping
      const idMapping = {};
      nodes.forEach((node, index) => {
        const frontendId = node.id || node.nodeId;
        const numericPart = node.sequenceOrder || parseInt(String(frontendId).replace(/\D/g, '')) || (index + 1);
        const backendNodeId = `${id}-node-${numericPart}`;
        idMapping[frontendId] = backendNodeId;
      });

      // Insert new nodes
      for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
        const node = nodes[nodeIndex];
        const frontendId = node.id || node.nodeId;
        const numericPart = node.sequenceOrder || parseInt(String(frontendId).replace(/\D/g, '')) || (nodeIndex + 1);
        const stringNodeId = `${id}-node-${numericPart}`;

        await trx('mes.production_plan_nodes').insert({
          planId: id,
          nodeId: stringNodeId,
          workOrderCode: finalOrderCode || plan.workOrderCode,
          name: node.name,
          operationId: node.operationId,
          outputCode: node.outputCode,
          outputQty: node.outputQty,
          outputUnit: node.outputUnit,
          nominalTime: node.nominalTime || 0,
          efficiency: node.efficiency !== undefined ? parseFloat(node.efficiency) : 1.0,
          effectiveTime: Math.round((node.nominalTime || 0) / (node.efficiency !== undefined ? parseFloat(node.efficiency) : 1.0)),
          sequenceOrder: numericPart,
          assignmentMode: node.assignmentMode || 'auto',
          assignedWorkerId: node.assignedWorkerId || null,
          x: node.x || 80,
          y: node.y || 80,
          createdAt: trx.fn.now()
        });

        // Insert material inputs
        if (node.materialInputs && node.materialInputs.length > 0) {
          const materialInputs = node.materialInputs.map(m => ({
            nodeId: stringNodeId,
            materialCode: m.materialCode,
            requiredQuantity: m.requiredQuantity,
            unitRatio: m.unitRatio || 1.0,
            isDerived: m.isDerived || false,
            createdAt: trx.fn.now()
          }));

          await trx('mes.node_material_inputs').insert(materialInputs);
        }

        // Insert station assignments
        const stationIds = node.stationIds || (node.assignedStations && node.assignedStations.map(s => s.stationId));
        if (stationIds && stationIds.length > 0) {
          const stationAssignments = stationIds.map((stId, idx) => ({
            nodeId: stringNodeId,
            stationId: stId,
            priority: idx + 1,
            createdAt: trx.fn.now()
          }));

          await trx('mes.node_stations').insert(stationAssignments);
        }
      }

      // Insert predecessors
      for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
        const node = nodes[nodeIndex];
        const frontendId = node.id || node.nodeId;
        const numericPart = node.sequenceOrder || parseInt(String(frontendId).replace(/\D/g, '')) || (nodeIndex + 1);
        const stringNodeId = `${id}-node-${numericPart}`;

        if (node.predecessors && Array.isArray(node.predecessors) && node.predecessors.length > 0) {
          const predecessorRecords = node.predecessors.map(predId => {
            const backendPredId = idMapping[predId] || predId;
            return {
              nodeId: stringNodeId,
              predecessorNodeId: backendPredId,
              createdAt: trx.fn.now()
            };
          });

          await trx('mes.node_predecessors').insert(predecessorRecords);
        }
      }
    }

    await trx.commit();

    return getPlanWithNodes(id);

  } catch (error) {
    await trx.rollback();
    throw error;
  }
};

/**
 * Delete a production plan
 * @param {string} id - Plan ID
 * @returns {Promise<boolean>} Success status
 */
export const deleteProductionPlan = async (id) => {
  const plan = await db('mes.production_plans').where('id', id).first();

  if (!plan) {
    const error = new Error('Plan not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  // Check if plan has active assignments
  const activeAssignments = await db('mes.worker_assignments')
    .where('planId', id)
    .whereIn('status', ['pending', 'queued', 'in_progress', 'paused'])
    .count('* as count')
    .first();

  if (parseInt(activeAssignments.count) > 0) {
    const error = new Error('Cannot delete plan with active assignments');
    error.code = 'HAS_ACTIVE_ASSIGNMENTS';
    throw error;
  }

  const trx = await db.transaction();

  try {
    // Get node IDs
    const nodeIds = await trx('mes.production_plan_nodes')
      .where('planId', id)
      .pluck('nodeId');

    // Delete related data
    if (nodeIds.length > 0) {
      await trx('mes.node_material_inputs').whereIn('nodeId', nodeIds).del();
      await trx('mes.node_stations').whereIn('nodeId', nodeIds).del();
      await trx('mes.node_predecessors').whereIn('nodeId', nodeIds).del();
    }

    // Delete worker assignments
    await trx('mes.worker_assignments').where('planId', id).del();

    // Delete nodes
    await trx('mes.production_plan_nodes').where('planId', id).del();

    // Delete plan
    await trx('mes.production_plans').where('id', id).del();

    await trx.commit();

    console.log(`🗑️  Production plan deleted: ${id}`);
    return true;

  } catch (error) {
    await trx.rollback();
    throw error;
  }
};

/**
 * Pause a production plan
 * @param {string} id - Plan ID
 * @returns {Promise<Object>} Updated plan
 */
export const pauseProductionPlan = async (id) => {
  const plan = await db('mes.production_plans').where('id', id).first();

  if (!plan) {
    const error = new Error('Plan not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  if (plan.status !== 'active') {  // ← Fix: check 'active' not 'in_progress'
    const error = new Error(`Cannot pause plan with status ${plan.status}`);
    error.code = 'INVALID_STATUS';
    throw error;
  }

  // Check if any tasks are in progress
  const inProgressCount = await db('mes.worker_assignments')
    .where('planId', id)
    .where('status', 'in_progress')
    .count('* as count')
    .first();

  if (parseInt(inProgressCount.count) > 0) {
    const error = new Error('Cannot pause - some tasks are in progress. Please wait for workers to complete or use Force Pause feature.');
    error.code = 'HAS_IN_PROGRESS_TASKS';
    throw error;
  }

  await db('mes.production_plans')
    .where('id', id)
    .update({
      status: 'active',  // ← Keep status as 'active'
      launchStatus: 'paused',  // ← Set launchStatus for frontend
      pausedAt: db.fn.now(),
      updatedAt: db.fn.now()
    });

  // Get assignment details before pausing
  const pausedAssignments = await db('mes.worker_assignments as wa')
    .select(
      'wa.id as assignmentId',
      'wa.workerId',
      'wa.substationId',
      'w.name as workerName',
      's.name as stationName'
    )
    .leftJoin('mes.workers as w', 'wa.workerId', 'w.id')
    .leftJoin('mes.substations as s', 'wa.substationId', 's.id')
    .where('wa.planId', id)
    .whereIn('wa.status', ['pending', 'queued']);

  // Pause all pending/queued assignments
  const pausedCount = await db('mes.worker_assignments')
    .where('planId', id)
    .whereIn('status', ['pending', 'queued'])
    .update({
      status: 'paused'
    });

  console.log(`⏸️  Production plan paused: ${id}`);

  // Return updated plan with counts and assignment details
  return {
    ...await getPlanWithNodes(id),
    pausedCount: pausedCount || 0,
    pausedAssignments: pausedAssignments,  // Detailed list
    workersCleared: 0,
    stationsCleared: 0
  };
};

/**
 * Resume a paused production plan
 * @param {string} id - Plan ID
 * @returns {Promise<Object>} Updated plan
 */
export const resumeProductionPlan = async (id) => {
  const plan = await db('mes.production_plans').where('id', id).first();

  if (!plan) {
    const error = new Error('Plan not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  if (plan.launchStatus !== 'paused') {  // ← Fix: check launchStatus
    const error = new Error(`Cannot resume plan with launchStatus ${plan.launchStatus}`);
    error.code = 'INVALID_STATUS';
    throw error;
  }

  await db('mes.production_plans')
    .where('id', id)
    .update({
      status: 'active',  // ← Set back to 'active'
      launchStatus: 'launched',  // ← Resume = launched again
      resumedAt: db.fn.now(),
      updatedAt: db.fn.now()
    });

  // Resume paused assignments back to pending
  const resumedCount = await db('mes.worker_assignments')
    .where('planId', id)
    .where('status', 'paused')
    .update({
      status: 'pending'
    });

  console.log(`▶️  Production plan resumed: ${id}`);

  return {
    ...await getPlanWithNodes(id),
    resumedCount: resumedCount || 0
  };
};
