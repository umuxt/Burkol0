import db from '#db/connection';

/**
 * Parse JSONB value (handles both string and object)
 * @param {*} val - Value to parse
 * @returns {Object} Parsed object
 */
const parseJsonb = (val) => {
  if (!val) return {};
  if (typeof val === 'string') return JSON.parse(val);
  return val;
};

/**
 * Get work packages with all related data
 * @param {Object} filters - Query filters
 * @param {string} filters.status - Assignment status filter
 * @param {string} filters.workerId - Worker ID filter
 * @param {string} filters.stationId - Station ID filter
 * @param {number} filters.limit - Maximum results (default: 100, max: 500)
 * @returns {Promise<Object>} Work packages with metadata
 */
export const getWorkPackages = async ({ status, workerId, stationId, limit } = {}) => {
  const maxResults = Math.min(parseInt(limit) || 100, 500);
  
  // Canonical SQL query - same structure as worker task queue
  let query = db('mes.worker_assignments as wa')
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
      'sub.name as substationName',
      
      // Plan info
      'pp.planName as planName',
      
      // Work order info (for customer)
      'wo.data as workOrderData'
    )
    .leftJoin('mes.workers as w', 'w.id', 'wa.workerId')
    .leftJoin('mes.production_plan_nodes as n', function() {
      this.on('n.id', '=', db.raw('wa."nodeId"::integer'));
    })
    .leftJoin('mes.operations as op', 'op.id', 'wa.operationId')
    .leftJoin('mes.stations as st', 'st.id', 'wa.stationId')
    .leftJoin('mes.substations as sub', 'sub.id', 'wa.substationId')
    .leftJoin('mes.production_plans as pp', 'pp.id', 'wa.planId')
    .leftJoin('mes.work_orders as wo', 'wo.code', 'wa.workOrderCode')
    .orderBy([
      { column: 'wa.isUrgent', order: 'desc' },
      { column: 'wa.estimatedStartTime', order: 'asc' },
      { column: 'wa.createdAt', order: 'asc' }
    ])
    .limit(maxResults);
  
  // Apply filters
  if (status) {
    query = query.where('wa.status', status);
  }
  if (workerId) {
    query = query.where('wa.workerId', workerId);
  }
  if (stationId) {
    query = query.where('wa.stationId', stationId);
  }
  
  const tasks = await query;

  // Get material inputs for each task (from junction table)
  const nodeIds = [...new Set(tasks.map(t => t.nodeIdString).filter(Boolean))];
  const materialInputs = nodeIds.length > 0
    ? await db('mes.node_material_inputs')
        .whereIn('nodeId', nodeIds)
        .select('nodeId', 'materialCode', 'requiredQuantity')
    : [];

  // Get consumed amounts from assignment_material_reservations
  const assignmentIds = tasks.map(t => t.assignmentId);
  const consumedReservations = assignmentIds.length > 0
    ? await db('mes.assignment_material_reservations')
        .whereIn('assignmentId', assignmentIds)
        .select('assignmentId', 'materialCode', 'consumedQty')
    : [];
  
  // Group consumed amounts by assignmentId
  const consumedByAssignment = consumedReservations.reduce((acc, r) => {
    if (!acc[r.assignmentId]) acc[r.assignmentId] = {};
    const prevQty = acc[r.assignmentId][r.materialCode] || 0;
    acc[r.assignmentId][r.materialCode] = prevQty + (parseFloat(r.consumedQty) || 0);
    return acc;
  }, {});

  // Group materials by nodeId
  const materialsByNode = materialInputs.reduce((acc, m) => {
    if (!acc[m.nodeId]) acc[m.nodeId] = {};
    acc[m.nodeId][m.materialCode] = m.requiredQuantity;
    return acc;
  }, {});

  // Get all unique material codes needed across all tasks (inputs + outputs)
  const allMaterialCodes = [...new Set(materialInputs.map(m => m.materialCode))];
  
  // Also collect output codes from tasks
  const outputCodes = tasks.map(t => t.outputCode).filter(Boolean);
  const allCodes = [...new Set([...allMaterialCodes, ...outputCodes])];
  
  // Get predecessor relationships for all nodes
  const predecessorRelations = nodeIds.length > 0
    ? await db('mes.node_predecessors')
        .whereIn('nodeId', nodeIds)
        .select('nodeId', 'predecessorNodeId')
    : [];
  
  // Group predecessors by nodeId
  const predecessorsByNode = predecessorRelations.reduce((acc, p) => {
    if (!acc[p.nodeId]) acc[p.nodeId] = [];
    acc[p.nodeId].push(p.predecessorNodeId);
    return acc;
  }, {});
  
  // Get all unique predecessor nodeIds to check their completion status
  const allPredecessorNodeIds = [...new Set(predecessorRelations.map(p => p.predecessorNodeId))];
  
  // Get assignment statuses for all predecessor nodes
  const predecessorStatuses = allPredecessorNodeIds.length > 0
    ? await db('mes.worker_assignments as wa')
        .join('mes.production_plan_nodes as n', function() {
          this.on('n.id', '=', db.raw('wa."nodeId"::integer'));
        })
        .whereIn('n.nodeId', allPredecessorNodeIds)
        .select('n.nodeId as nodeIdString', 'wa.status')
    : [];
  
  // Build a map of nodeIdString -> isCompleted
  const predecessorCompletionMap = predecessorStatuses.reduce((acc, ps) => {
    acc[ps.nodeIdString] = ps.status === 'completed';
    return acc;
  }, {});
  
  // Get worker and substation availability for canStart check
  const workerIds = [...new Set(tasks.map(t => t.workerId).filter(Boolean))];
  const substationIds = [...new Set(tasks.map(t => t.substationId).filter(Boolean))];
  
  // Get workers with in-progress tasks (not just assigned, actually working)
  const workersWithActiveTasks = workerIds.length > 0
    ? await db('mes.worker_assignments')
        .whereIn('workerId', workerIds)
        .whereIn('status', ['in_progress', 'in-progress', 'paused'])
        .select('workerId', 'id as assignmentId')
    : [];
  // Map workerId -> active assignmentId
  const workerActiveAssignment = workersWithActiveTasks.reduce((acc, w) => {
    acc[w.workerId] = w.assignmentId;
    return acc;
  }, {});
  
  // Get substations currently in_use (actively being used, not just reserved)
  const substationsData = substationIds.length > 0
    ? await db('mes.substations')
        .whereIn('id', substationIds)
        .select('id', 'status', 'currentAssignmentId')
    : [];
  // Map substationId -> {status, currentAssignmentId}
  const substationInfo = substationsData.reduce((acc, s) => {
    acc[s.id] = { status: s.status, currentAssignmentId: s.currentAssignmentId };
    return acc;
  }, {});
  
  // Check stock availability and get names for all materials (PostgreSQL materials.materials table)
  const stockAvailability = {};
  const materialNames = {};
  if (allCodes.length > 0) {
    const stockLevels = await db('materials.materials')
      .select('code', 'stock', 'name')
      .whereIn('code', allCodes);
    
    stockLevels.forEach(s => {
      stockAvailability[s.code] = parseFloat(s.stock) || 0;
      materialNames[s.code] = s.name || s.code;
    });
  }

  // Format response with canonical schema
  const formatted = tasks.map(t => {
    // Check if materials are sufficient for this task
    const taskMaterials = materialsByNode[t.nodeIdString] || {};
    const reservedAmounts = parseJsonb(t.preProductionReservedAmount);
    
    let materialStatus = 'sufficient';
    
    // Check each material required for this task
    for (const [materialCode, requiredQty] of Object.entries(taskMaterials)) {
      const reserved = parseFloat(reservedAmounts[materialCode]) || 0;
      const available = stockAvailability[materialCode] || 0;
      
      // If we need more than what's available in stock
      if (reserved > available) {
        materialStatus = 'insufficient';
        break;
      }
    }
    
    // Extract customer info from work order data
    const woData = parseJsonb(t.workOrderData);
    const quoteSnapshot = woData?.quoteSnapshot || {};
    const customerName = quoteSnapshot.customerName || quoteSnapshot.customerCompany || '';
    
    // Build prerequisites object for canStart check
    const preds = predecessorsByNode[t.nodeIdString] || [];
    const pendingPredecessors = preds.filter(predNodeId => !predecessorCompletionMap[predNodeId]);
    const predecessorsDone = pendingPredecessors.length === 0;
    
    // Worker available: no active (in-progress/paused) task, OR this IS the active task
    const workerActiveId = workerActiveAssignment[t.workerId];
    const workerAvailable = !workerActiveId || workerActiveId === t.assignmentId;
    
    // Substation available: not in_use by another, OR reserved for this assignment, OR available
    const subInfo = substationInfo[t.substationId] || { status: 'available', currentAssignmentId: null };
    const substationAvailable = 
      subInfo.status === 'available' || 
      subInfo.currentAssignmentId === t.assignmentId ||
      (subInfo.status === 'reserved' && subInfo.currentAssignmentId === t.assignmentId);
    
    // Materials ready is just a warning, not a blocker
    const materialsReady = materialStatus === 'sufficient';
    
    // canStart = predecessor, worker, substation must be ok. Materials is just a warning!
    const canStart = predecessorsDone && workerAvailable && substationAvailable;
    
    return {
      // Assignment IDs (backwards compatibility)
      id: t.assignmentId,
      assignmentId: t.assignmentId,
      workPackageId: t.assignmentId,
      status: t.status,
      
      // Plan & Node IDs for chart predecessor highlighting
      planId: t.planId,
      nodeId: t.nodeId,
      nodeIdString: t.nodeIdString,
      predecessorNodeIds: predecessorsByNode[t.nodeIdString] || [],
      
      // Prerequisites for canStart
      prerequisites: {
        predecessorsDone,
        pendingPredecessors,
        workerAvailable,
        substationAvailable,
        materialsReady,
        canStart
      },
      
      // Plan info
      planName: t.planName || '',
      
      // Work Order & Product
      workOrderCode: t.workOrderCode,
      customer: customerName,
      productName: null,
      
      // Node/Operation
      nodeName: t.nodeName,
      operationId: t.operationId,
      operationName: t.operationName,
      outputCode: t.outputCode,
      outputQty: t.outputQty,
      
      // Worker
      workerId: t.workerId,
      workerName: t.workerName,
      workerSkills: t.workerSkills || [],
      
      // Station/Substation
      stationId: t.stationId,
      stationName: t.stationName,
      substationId: t.substationId,
      substationCode: t.substationCode,
      substationName: t.substationName,
      
      // Material inputs (from junction table)
      materialInputs: materialsByNode[t.nodeIdString] || {},
      materialNames: materialNames,
      preProductionReservedAmount: parseJsonb(t.preProductionReservedAmount),
      plannedOutput: parseJsonb(t.plannedOutput),
      actualReservedAmounts: parseJsonb(t.actualReservedAmounts),
      actualConsumptionAmounts: consumedByAssignment[t.assignmentId] || {},
      materialReservationStatus: t.materialReservationStatus,
      
      // Timing
      estimatedNominalTime: t.nominalTime,
      estimatedEffectiveTime: t.effectiveTime,
      estimatedStartTime: t.estimatedStartTime,
      estimatedEndTime: t.estimatedEndTime,
      startedAt: t.startedAt,
      completedAt: t.completedAt,
      
      // Scrap & defects
      inputScrapCount: parseJsonb(t.inputScrapCount),
      productionScrapCount: parseJsonb(t.productionScrapCount),
      defectQuantity: t.defectQuantity || 0,
      
      // Status flags
      isUrgent: t.isUrgent || false,
      isPaused: t.status === 'paused',
      materialStatus: materialStatus,
      
      // Metadata
      createdAt: t.createdAt,
      actualQuantity: t.actualQuantity,
      actualOutputQuantity: t.actualQuantity,
      notes: t.notes,
      priority: t.priority,
      sequenceNumber: t.sequenceNumber
    };
  });

  // Post-processing: For same worker, only the first (FIFO) pending task can start
  const pendingByWorker = {};
  formatted.forEach(task => {
    if (task.status === 'pending' || task.status === 'queued' || task.status === 'ready') {
      if (!pendingByWorker[task.workerId]) {
        pendingByWorker[task.workerId] = [];
      }
      pendingByWorker[task.workerId].push(task);
    }
  });
  
  // For each worker, sort by FIFO (urgent first, then estimatedStartTime)
  Object.values(pendingByWorker).forEach(workerTasks => {
    workerTasks.sort((a, b) => {
      if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
      const aTime = new Date(a.estimatedStartTime || 0).getTime();
      const bTime = new Date(b.estimatedStartTime || 0).getTime();
      return aTime - bTime;
    });
    
    // Find the first task that could start (ignoring FIFO)
    let firstCanStartFound = false;
    workerTasks.forEach(task => {
      if (task.prerequisites.canStart) {
        if (!firstCanStartFound) {
          firstCanStartFound = true;
          task.prerequisites.isFirstInQueue = true;
        } else {
          task.prerequisites.canStart = false;
          task.prerequisites.isFirstInQueue = false;
          task.prerequisites.workerQueueBlocked = true;
        }
      }
    });
  });

  console.log(`📦 Work Packages Query: Found ${formatted.length} assignments (limit: ${maxResults})`);

  return {
    workPackages: formatted,
    total: formatted.length,
    filters: { status, workerId, stationId },
    timestamp: new Date().toISOString()
  };
};

/**
 * Get worker task queue in FIFO order
 * @param {string} workerId - Worker ID
 * @returns {Promise<Array>} Task queue with material info
 */
export const getWorkerTaskQueue = async (workerId) => {
  // Canonical SQL-LAUNCH query - get full task data with all relationships
  const tasks = await db('mes.worker_assignments as wa')
    .select(
      'wa.id as assignmentId',
      'wa.status',
      'wa.isUrgent',
      'wa.priority',
      'wa.sequenceNumber',
      'wa.workerId',
      'wa.planId',
      'wa.nodeId',
      'wa.operationId',
      'wa.stationId',
      'wa.substationId',
      'wa.workOrderCode',
      'wa.estimatedStartTime',
      'wa.estimatedEndTime',
      'wa.startedAt',
      'wa.completedAt',
      'wa.nominalTime',
      'wa.effectiveTime',
      'wa.preProductionReservedAmount',
      'wa.plannedOutput',
      'wa.actualReservedAmounts',
      'wa.materialReservationStatus',
      'wa.inputScrapCount',
      'wa.productionScrapCount',
      'wa.defectQuantity',
      'wa.actualQuantity',
      'wa.notes',
      'wa.createdAt',
      'w.name as workerName',
      'w.skills as workerSkills',
      'n.name as nodeName',
      'n.nodeId as nodeIdString',
      'n.outputCode',
      'n.outputQty',
      'op.name as operationName',
      'st.name as stationName',
      'sub.id as substationCode',
      'p.planName as planName'
    )
    .leftJoin('mes.workers as w', 'w.id', 'wa.workerId')
    .leftJoin('mes.production_plan_nodes as n', function() {
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

  // Get material inputs for each task (from junction table)
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

  // Format response
  return tasks.map((t, index) => ({
    position: index + 1,
    assignmentId: t.assignmentId,
    status: t.status,
    isUrgent: t.isUrgent,
    priority: t.priority,
    planName: t.planName,
    workOrderCode: t.workOrderCode,
    nodeName: t.nodeName,
    operationName: t.operationName,
    stationName: t.stationName,
    substationCode: t.substationCode,
    estimatedStartTime: t.estimatedStartTime,
    estimatedEndTime: t.estimatedEndTime,
    estimatedDuration: t.effectiveTime || t.nominalTime,
    outputCode: t.outputCode,
    outputQty: t.outputQty,
    materialInputs: materialsByNode[t.nodeIdString] || {},
    preProductionReservedAmount: parseJsonb(t.preProductionReservedAmount)
  }));
};
