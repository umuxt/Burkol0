import db from '#db/connection';

/**
 * Get all templates (production plans with status='template')
 */
export const getAllTemplates = async () => {
  const templates = await db('mes.production_plans as p')
    .select(
      'p.id',
      'p.planName as name',
      'p.description',
      'p.workOrderCode',
      'p.quoteId',
      'p.status',
      'p.createdAt',
      db.raw('COUNT(pn.id)::integer as "nodeCount"')
    )
    .leftJoin('mes.production_plan_nodes as pn', 'pn.planId', 'p.id')
    .where('p.status', 'template')
    .groupBy('p.id')
    .orderBy('p.createdAt', 'desc');
  
  console.log(`📋 Templates: Found ${templates.length} templates`);
  return templates;
};

/**
 * Create or update a template
 */
export const saveTemplate = async (templateData) => {
  const { 
    id: templateId, 
    workOrderCode, 
    orderCode,
    quoteId, 
    nodes, 
    steps, 
    templateName, 
    name, 
    description 
  } = templateData;
  
  // Normalize orderCode
  const finalOrderCode = workOrderCode || orderCode || null;
  const finalPlanName = name || templateName || null;
  const nodeList = nodes || steps || [];
  
  console.log('📥 Template save request:', { 
    templateId,
    workOrderCode: finalOrderCode,
    nodeCount: nodeList.length,
    isUpdate: !!templateId
  });
  
  const trx = await db.transaction();
  
  try {
    let planId;
    
    // Check if this is an UPDATE
    if (templateId) {
      const existing = await trx('mes.production_plans')
        .where({ id: templateId, status: 'template' })
        .first();
      
      if (!existing) {
        await trx.rollback();
        throw new Error('TEMPLATE_NOT_FOUND');
      }
      
      planId = templateId;
      console.log(`🔄 Updating existing template: ${planId}`);
      
      // Delete existing nodes
      await trx('mes.production_plan_nodes')
        .where('planId', planId)
        .del();
      
      // Update template header
      await trx('mes.production_plans')
        .where('id', planId)
        .update({
          planName: finalPlanName,
          description: description || null,
          workOrderCode: finalOrderCode,
          quoteId: quoteId || null,
          updatedAt: trx.fn.now()
        });
      
    } else {
      // CREATE new template
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
      
      planId = `PLAN-${nextNum.toString().padStart(3, '0')}`;
      
      console.log(`📋 Creating new template: ${planId}`);
      
      await trx('mes.production_plans').insert({
        id: planId,
        planName: finalPlanName,
        description: description || null,
        workOrderCode: finalOrderCode,
        quoteId: quoteId || null,
        status: 'template',
        createdAt: trx.fn.now()
      });
    }
    
    // Insert nodes if provided
    if (Array.isArray(nodeList) && nodeList.length > 0) {
      // Build frontend ID to backend nodeId mapping
      const idMapping = {};
      nodeList.forEach((node, index) => {
        const frontendId = node.id || node.nodeId;
        const numericPart = node.sequenceOrder || parseInt(String(frontendId).replace(/\D/g, '')) || (index + 1);
        const backendNodeId = `${planId}-node-${numericPart}`;
        idMapping[frontendId] = backendNodeId;
      });
      
      // Step 1: Insert all nodes first
      for (let nodeIndex = 0; nodeIndex < nodeList.length; nodeIndex++) {
        const node = nodeList[nodeIndex];
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
            outputQty: node.outputQty || 1,
            outputUnit: node.outputUnit || 'adet',
            nominalTime: node.nominalTime || 0,
            efficiency: node.efficiency !== undefined ? parseFloat(node.efficiency) : 1.0,
            effectiveTime: node.effectiveTime || Math.round((node.nominalTime || 0) / (node.efficiency !== undefined ? parseFloat(node.efficiency) : 1.0)),
            sequenceOrder: numericPart,
            assignmentMode: node.assignmentMode || 'auto',
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
            isDerived: !!m.derivedFrom,
            createdAt: trx.fn.now()
          }));
          
          await trx('mes.node_material_inputs').insert(materialInputs);
        }
        
        // Insert station assignments
        const stationList = node.stationIds || (node.assignedStations?.map(s => s.stationId || s.id)) || [];
        if (stationList.length > 0) {
          const stationAssignments = stationList.map((stId, idx) => ({
            nodeId: stringNodeId,
            stationId: stId,
            priority: idx + 1,
            createdAt: trx.fn.now()
          }));
          
          await trx('mes.node_stations').insert(stationAssignments);
        }
      }
      
      // Step 2: Insert all predecessors
      for (let nodeIndex = 0; nodeIndex < nodeList.length; nodeIndex++) {
        const node = nodeList[nodeIndex];
        const frontendId = node.id || node.nodeId;
        const numericPart = node.sequenceOrder || parseInt(String(frontendId).replace(/\D/g, '')) || (nodeIndex + 1);
        const stringNodeId = `${planId}-node-${numericPart}`;
        
        const predecessorList = node.predecessors || [];
        if (Array.isArray(predecessorList) && predecessorList.length > 0) {
          const predecessorRecords = predecessorList
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
    }
    
    await trx.commit();
    
    console.log(`✅ Template saved: ${planId} with ${nodeList.length} nodes`);
    
    return { 
      success: true, 
      id: planId,
      nodeCount: nodeList.length
    };
    
  } catch (error) {
    await trx.rollback();
    throw error;
  }
};

/**
 * Delete a template
 */
export const deleteTemplate = async (id) => {
  // Verify it's a template
  const [template] = await db('mes.production_plans')
    .where({ id, status: 'template' })
    .select('id');
  
  if (!template) {
    return null;
  }
  
  // Delete template (CASCADE will delete related nodes)
  await db('mes.production_plans')
    .where({ id })
    .delete();
  
  console.log(`✅ Template deleted: ${id}`);
  
  return { id };
};
