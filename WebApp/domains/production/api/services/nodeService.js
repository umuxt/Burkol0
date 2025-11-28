/**
 * Node Service
 * Manages production plan nodes, materials, and stations
 */

import db from '#db/connection';

/**
 * Get all nodes for a production plan
 */
export async function getNodesByPlanId(planId) {
  // Check plan exists
  const plan = await db('mes.production_plans')
    .where('id', planId)
    .first();
  
  if (!plan) {
    return null;
  }
  
  // Get nodes with materials and stations
  const nodes = await db('mes.production_plan_nodes as n')
    .where('n.planId', planId)
    .leftJoin('mes.operations as op', 'n.operationId', 'op.id')
    .select(
      'n.*',
      'op.name as operationName'
    )
    .orderBy('n.sequenceOrder');
  
  // Get materials for each node
  const materials = await db('mes.node_material_inputs')
    .whereIn('nodeId', nodes.map(n => n.nodeId));
  
  // Get stations for each node
  const stations = await db('mes.node_stations as ns')
    .whereIn('ns.nodeId', nodes.map(n => n.nodeId))
    .leftJoin('mes.stations as s', 'ns.stationId', 's.id')
    .select(
      'ns.nodeId',
      'ns.stationId',
      'ns.priority',
      's.name as stationName'
    )
    .orderBy('ns.priority');
  
  // Assemble response
  return nodes.map(node => ({
    ...node,
    materialInputs: materials
      .filter(m => m.nodeId === node.nodeId)
      .map(m => ({
        materialCode: m.materialCode,
        requiredQuantity: m.requiredQuantity,
        unitRatio: m.unitRatio,
        isDerived: m.isDerived
      })),
    assignedStations: stations
      .filter(s => s.nodeId === node.nodeId)
      .map(s => ({
        stationId: s.stationId,
        stationName: s.stationName,
        priority: s.priority
      }))
  }));
}

/**
 * Get single node with full details
 */
export async function getNodeById(planId, nodeId) {
  const node = await db('mes.production_plan_nodes as n')
    .where('n.planId', planId)
    .where(function() {
      this.where('n.id', nodeId).orWhere('n.nodeId', nodeId);
    })
    .leftJoin('mes.operations as op', 'n.operationId', 'op.id')
    .select(
      'n.*',
      'op.name as operationName',
      'op.skills as operationSkills'
    )
    .first();
  
  if (!node) {
    return null;
  }
  
  // Get material inputs
  const materials = await db('mes.node_material_inputs')
    .where('nodeId', node.nodeId);
  
  // Get assigned stations
  const stations = await db('mes.node_stations as ns')
    .where('ns.nodeId', node.nodeId)
    .leftJoin('mes.stations as s', 'ns.stationId', 's.id')
    .select(
      'ns.stationId',
      'ns.priority',
      's.name as stationName',
      's.description as stationDescription'
    )
    .orderBy('ns.priority');
  
  return {
    ...node,
    materialInputs: materials.map(m => ({
      materialCode: m.materialCode,
      requiredQuantity: m.requiredQuantity,
      unitRatio: m.unitRatio,
      isDerived: m.isDerived
    })),
    assignedStations: stations.map(s => ({
      stationId: s.stationId,
      stationName: s.stationName,
      stationDescription: s.stationDescription,
      priority: s.priority
    }))
  };
}

/**
 * Add a new node to an existing plan
 */
export async function createNode(planId, nodeData) {
  const trx = await db.transaction();
  
  try {
    // Check plan exists and is in draft/production
    const plan = await trx('mes.production_plans')
      .where('id', planId)
      .first();
    
    if (!plan) {
      await trx.rollback();
      return { error: 'Plan not found' };
    }
    
    if (!['draft', 'production'].includes(plan.status)) {
      await trx.rollback();
      return { error: 'Can only add nodes to draft or production plans', currentStatus: plan.status };
    }
    
    // Calculate next sequence order
    const lastNode = await trx('mes.production_plan_nodes')
      .where('planId', planId)
      .orderBy('sequenceOrder', 'desc')
      .first();
    
    const sequenceOrder = nodeData.sequenceOrder || (lastNode ? lastNode.sequenceOrder + 1 : 1);
    
    // Calculate effective time
    const effectiveTime = nodeData.nominalTime / (nodeData.efficiency || 0.85);
    
    // Insert node
    const [node] = await trx('mes.production_plan_nodes')
      .insert({
        planId: planId,
        nodeId: nodeData.nodeId || `${planId}-node-${sequenceOrder}`,
        name: nodeData.name,
        operationId: nodeData.operationId,
        nominalTime: nodeData.nominalTime,
        efficiency: nodeData.efficiency || 0.85,
        effectiveTime: effectiveTime,
        assignmentMode: nodeData.assignmentMode || 'auto',
        outputCode: nodeData.outputCode,
        outputQty: nodeData.outputQty,
        outputUnit: nodeData.outputUnit,
        sequenceOrder: sequenceOrder,
        workOrderCode: plan.workOrderCode,
        x: nodeData.x || 80,
        y: nodeData.y || 80
      })
      .returning('*');
    
    // Insert material inputs
    if (nodeData.materialInputs && nodeData.materialInputs.length > 0) {
      const materialInserts = nodeData.materialInputs.map(mat => ({
        nodeId: node.nodeId,
        materialCode: mat.materialCode,
        requiredQuantity: mat.requiredQuantity,
        unitRatio: mat.unitRatio || 1.0,
        isDerived: mat.isDerived || false
      }));
      
      await trx('mes.node_material_inputs').insert(materialInserts);
    }
    
    // Insert station assignments
    if (nodeData.stationIds && nodeData.stationIds.length > 0) {
      const stationInserts = nodeData.stationIds.map((stationId, idx) => ({
        nodeId: node.nodeId,
        stationId: stationId,
        priority: idx + 1
      }));
      
      await trx('mes.node_stations').insert(stationInserts);
    }
    
    await trx.commit();
    
    console.log(`✅ Added node: ${node.name} to plan ${planId}`);
    return { success: true, node };
    
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}

/**
 * Update node
 */
export async function updateNode(planId, nodeId, updates) {
  const trx = await db.transaction();
  
  try {
    // Check plan is in draft/production
    const plan = await trx('mes.production_plans')
      .where('id', planId)
      .first();
    
    if (!plan) {
      await trx.rollback();
      return { error: 'Plan not found' };
    }
    
    if (!['draft', 'production'].includes(plan.status)) {
      await trx.rollback();
      return { error: 'Can only update nodes in draft or production plans', currentStatus: plan.status };
    }
    
    // Get node
    const node = await trx('mes.production_plan_nodes')
      .where('planId', planId)
      .where(function() {
        this.where('id', nodeId).orWhere('nodeId', nodeId);
      })
      .first();
    
    if (!node) {
      await trx.rollback();
      return { error: 'Node not found' };
    }
    
    // Prepare update data
    const updateData = {};
    if (updates.name) updateData.name = updates.name;
    if (updates.operationId) updateData.operationId = updates.operationId;
    if (updates.nominalTime) {
      updateData.nominalTime = updates.nominalTime;
      updateData.effectiveTime = updates.nominalTime / (updates.efficiency || node.efficiency || 0.85);
    }
    if (updates.efficiency) {
      updateData.efficiency = updates.efficiency;
      updateData.effectiveTime = (updates.nominalTime || node.nominalTime) / updates.efficiency;
    }
    if (updates.outputCode) updateData.outputCode = updates.outputCode;
    if (updates.outputQty) updateData.outputQty = updates.outputQty;
    if (updates.outputUnit) updateData.outputUnit = updates.outputUnit;
    if (updates.sequenceOrder) updateData.sequenceOrder = updates.sequenceOrder;
    if (updates.assignmentMode) updateData.assignmentMode = updates.assignmentMode;
    if (updates.x !== undefined) updateData.x = updates.x;
    if (updates.y !== undefined) updateData.y = updates.y;
    
    updateData.updatedAt = trx.fn.now();
    
    // Update node
    const [updatedNode] = await trx('mes.production_plan_nodes')
      .where('id', node.id)
      .update(updateData)
      .returning('*');
    
    // Update materials if provided
    if (updates.materialInputs) {
      await trx('mes.node_material_inputs')
        .where('nodeId', node.nodeId)
        .delete();
      
      if (updates.materialInputs.length > 0) {
        const materialInserts = updates.materialInputs.map(mat => ({
          nodeId: node.nodeId,
          materialCode: mat.materialCode,
          requiredQuantity: mat.requiredQuantity,
          unitRatio: mat.unitRatio || 1.0,
          isDerived: mat.isDerived || false
        }));
        
        await trx('mes.node_material_inputs').insert(materialInserts);
      }
    }
    
    // Update stations if provided
    if (updates.stationIds) {
      await trx('mes.node_stations')
        .where('nodeId', node.nodeId)
        .delete();
      
      if (updates.stationIds.length > 0) {
        const stationInserts = updates.stationIds.map((stationId, idx) => ({
          nodeId: node.nodeId,
          stationId: stationId,
          priority: idx + 1
        }));
        
        await trx('mes.node_stations').insert(stationInserts);
      }
    }
    
    await trx.commit();
    
    console.log(`✅ Updated node: ${nodeId} in plan ${planId}`);
    return { success: true, node: updatedNode };
    
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}

/**
 * Delete node
 */
export async function deleteNode(planId, nodeId) {
  const trx = await db.transaction();
  
  try {
    // Check plan is in draft
    const plan = await trx('mes.production_plans')
      .where('id', planId)
      .first();
    
    if (!plan) {
      await trx.rollback();
      return { error: 'Plan not found' };
    }
    
    if (plan.status !== 'draft') {
      await trx.rollback();
      return { error: 'Can only delete nodes from draft plans', currentStatus: plan.status };
    }
    
    // Get node
    const node = await trx('mes.production_plan_nodes')
      .where('planId', planId)
      .where(function() {
        this.where('id', nodeId).orWhere('nodeId', nodeId);
      })
      .first();
    
    if (!node) {
      await trx.rollback();
      return { error: 'Node not found' };
    }
    
    // Delete related data
    await trx('mes.node_stations')
      .where('nodeId', node.nodeId)
      .delete();
    
    await trx('mes.node_material_inputs')
      .where('nodeId', node.nodeId)
      .delete();
    
    // Delete node
    await trx('mes.production_plan_nodes')
      .where('id', node.id)
      .delete();
    
    await trx.commit();
    
    console.log(`🗑️  Deleted node: ${nodeId} from plan ${planId}`);
    return { success: true };
    
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}

/**
 * Add material input to a node
 */
export async function addMaterial(nodeId, materialData) {
  const { materialCode, requiredQuantity, unitRatio, isDerived } = materialData;
  
  // Get node and verify plan is draft/production
  const node = await db('mes.production_plan_nodes as n')
    .join('mes.production_plans as p', 'n.planId', 'p.id')
    .where('n.id', nodeId)
    .orWhere('n.nodeId', nodeId)
    .select('n.*', 'p.status as planStatus')
    .first();
  
  if (!node) {
    return { error: 'Node not found' };
  }
  
  if (!['draft', 'production'].includes(node.planStatus)) {
    return { error: 'Can only modify materials in draft or production plans' };
  }
  
  // Check if material already exists
  const existing = await db('mes.node_material_inputs')
    .where('nodeId', node.nodeId)
    .where('materialCode', materialCode)
    .first();
  
  if (existing) {
    return { error: 'Material already added to this node' };
  }
  
  // Insert material
  const [material] = await db('mes.node_material_inputs')
    .insert({
      nodeId: node.nodeId,
      materialCode: materialCode,
      requiredQuantity: requiredQuantity,
      unitRatio: unitRatio || 1.0,
      isDerived: isDerived || false
    })
    .returning('*');
  
  console.log(`✅ Added material ${materialCode} to node ${nodeId}`);
  return { success: true, material };
}

/**
 * Remove material input from a node
 */
export async function removeMaterial(nodeId, materialCode) {
  // Verify plan is draft/production
  const node = await db('mes.production_plan_nodes as n')
    .join('mes.production_plans as p', 'n.planId', 'p.id')
    .where('n.id', nodeId)
    .orWhere('n.nodeId', nodeId)
    .select('n.nodeId', 'p.status as planStatus')
    .first();
  
  if (!node) {
    return { error: 'Node not found' };
  }
  
  if (!['draft', 'production'].includes(node.planStatus)) {
    return { error: 'Can only modify materials in draft or production plans' };
  }
  
  // Delete material
  const deleted = await db('mes.node_material_inputs')
    .where('nodeId', node.nodeId)
    .where('materialCode', materialCode)
    .delete();
  
  if (deleted === 0) {
    return { error: 'Material not found in node' };
  }
  
  console.log(`🗑️  Removed material ${materialCode} from node ${nodeId}`);
  return { success: true };
}

/**
 * Assign station to a node
 */
export async function addStation(nodeId, stationData) {
  const { stationId, priority } = stationData;
  
  // Get node and verify plan is draft/production
  const node = await db('mes.production_plan_nodes as n')
    .join('mes.production_plans as p', 'n.planId', 'p.id')
    .where('n.id', nodeId)
    .orWhere('n.nodeId', nodeId)
    .select('n.nodeId', 'p.status as planStatus')
    .first();
  
  if (!node) {
    return { error: 'Node not found' };
  }
  
  if (!['draft', 'production'].includes(node.planStatus)) {
    return { error: 'Can only modify stations in draft or production plans' };
  }
  
  // Check if station already assigned
  const existing = await db('mes.node_stations')
    .where('nodeId', node.nodeId)
    .where('stationId', stationId)
    .first();
  
  if (existing) {
    return { error: 'Station already assigned to this node' };
  }
  
  // Calculate priority if not provided
  let stationPriority = priority;
  if (!stationPriority) {
    const lastStation = await db('mes.node_stations')
      .where('nodeId', node.nodeId)
      .orderBy('priority', 'desc')
      .first();
    
    stationPriority = lastStation ? lastStation.priority + 1 : 1;
  }
  
  // Insert station assignment
  const [station] = await db('mes.node_stations')
    .insert({
      nodeId: node.nodeId,
      stationId: stationId,
      priority: stationPriority
    })
    .returning('*');
  
  console.log(`✅ Assigned station ${stationId} to node ${nodeId}`);
  return { success: true, station };
}

/**
 * Remove station from a node
 */
export async function removeStation(nodeId, stationId) {
  // Verify plan is draft/production
  const node = await db('mes.production_plan_nodes as n')
    .join('mes.production_plans as p', 'n.planId', 'p.id')
    .where('n.id', nodeId)
    .orWhere('n.nodeId', nodeId)
    .select('n.nodeId', 'p.status as planStatus')
    .first();
  
  if (!node) {
    return { error: 'Node not found' };
  }
  
  if (!['draft', 'production'].includes(node.planStatus)) {
    return { error: 'Can only modify stations in draft or production plans' };
  }
  
  // Delete station assignment
  const deleted = await db('mes.node_stations')
    .where('nodeId', node.nodeId)
    .where('stationId', stationId)
    .delete();
  
  if (deleted === 0) {
    return { error: 'Station not assigned to node' };
  }
  
  console.log(`🗑️  Removed station ${stationId} from node ${nodeId}`);
  return { success: true };
}
