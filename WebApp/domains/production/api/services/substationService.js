import db from '#db/connection';

/**
 * Get all substations with optional station filter
 * @param {string} stationId - Optional station ID filter
 * @returns {Promise<Array>} List of substations
 */
export const getAllSubstations = async (stationId = null) => {
  let query = db('mes.substations')
    .select(
      'id',
      'name',
      'stationId',
      'description',
      'isActive',
      'status',
      'technicalStatus',
      'currentAssignmentId',
      'assignedWorkerId',
      'currentOperation',
      'reservedAt',
      'inUseSince',
      'currentExpectedEnd',
      'createdAt',
      'updatedAt'
    )
    .where('isActive', true);
  
  if (stationId) {
    query = query.where('stationId', stationId);
  }
  
  return query.orderBy('id');
};

/**
 * Create a new substation
 * @param {Object} data - Substation data
 * @param {string} data.name - Substation name
 * @param {string} data.stationId - Parent station ID
 * @param {string} data.description - Optional description
 * @returns {Promise<Object>} Created substation
 */
export const createSubstation = async ({ name, stationId, description }) => {
  // Get station info for code prefix
  const station = await db('mes.stations')
    .select('id', 'substations')
    .where('id', stationId)
    .first();
  
  if (!station) {
    const error = new Error('Station not found');
    error.code = 'STATION_NOT_FOUND';
    throw error;
  }
  
  // Parse station code (ST-Ar-001 → Ar-001)
  const stationCode = stationId.replace('ST-', '');
  
  // Count existing substations for this station
  const existingCount = await db('mes.substations')
    .where('stationId', stationId)
    .count('* as count');
  
  const nextNum = parseInt(existingCount[0].count) + 1;
  const newId = `ST-${stationCode}-${nextNum.toString().padStart(2, '0')}`;
  
  // Insert substation
  const result = await db('mes.substations')
    .insert({
      id: newId,
      name,
      stationId,
      description,
      isActive: true,
      createdAt: db.fn.now(),
      updatedAt: db.fn.now()
    })
    .returning('*');
  
  // Update station's substations array
  const currentSubstations = station.substations || [];
  await db('mes.stations')
    .where('id', stationId)
    .update({
      substations: JSON.stringify([...currentSubstations, newId]),
      updatedAt: db.fn.now()
    });
  
  return result[0];
};

/**
 * Reset all substations to active state
 * Cleans orphaned reservations and applies deferred reservations
 * @returns {Promise<Object>} Reset results
 */
export const resetAllSubstations = async () => {
  const { applyDeferredReservation } = await import('#server/utils/fifoScheduler');
  
  const result = await db.transaction(async (trx) => {
    // Find substations with orphaned/stale reservations
    const orphaned = await trx('mes.substations as s')
      .leftJoin('mes.worker_assignments as a', 's.currentAssignmentId', 'a.id')
      .whereNotNull('s.currentAssignmentId')
      .where(function() {
        this.whereNull('a.id')
            .orWhereIn('a.status', ['completed', 'cancelled', 'pending', 'queued']);
      })
      .select('s.id');
    
    if (orphaned.length > 0) {
      console.log(`🧹 [RESET] Cleaning ${orphaned.length} orphaned/stale substation reservations...`);
      await trx('mes.substations')
        .whereIn('id', orphaned.map(s => s.id))
        .update({
          status: 'available',
          currentAssignmentId: null,
          assignedWorkerId: null,
          currentOperation: null,
          reservedAt: null,
          inUseSince: null,
          currentExpectedEnd: null,
          updatedAt: trx.fn.now()
        });
    }
    
    // Reset isActive flag (skip in_use stations with active work)
    const substations = await trx('mes.substations')
      .whereNotIn('status', ['in_use'])
      .update({
        isActive: true,
        updatedAt: trx.fn.now()
      })
      .returning('id');
    
    return { substations, orphanedCount: orphaned.length };
  });
  
  const { substations, orphanedCount } = result;
  const resetCount = substations.length;
  
  // Check deferred reservations AFTER transaction completes
  let appliedCount = 0;
  for (const sub of substations) {
    const applied = await applyDeferredReservation(sub.id);
    if (applied) appliedCount++;
  }
  
  return { resetCount, orphanedCount, appliedCount };
};

/**
 * Update a substation
 * @param {string} id - Substation ID
 * @param {Object} data - Update data
 * @returns {Promise<Object>} Updated substation
 */
export const updateSubstation = async (id, { name, description, stationId, isActive }) => {
  // Get current substation
  const currentSubstation = await db('mes.substations')
    .select('stationId', 'isActive')
    .where({ id })
    .first();
  
  if (!currentSubstation) {
    const error = new Error('Substation not found');
    error.code = 'NOT_FOUND';
    throw error;
  }
  
  const updateData = {
    updatedAt: db.fn.now()
  };
  
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (stationId !== undefined) updateData.stationId = stationId;
  if (isActive !== undefined) updateData.isActive = isActive;
  
  const result = await db('mes.substations')
    .where({ id })
    .update(updateData)
    .returning('*');
  
  // If soft deleting (isActive=false), remove from station's substations array
  if (isActive === false && currentSubstation.isActive === true) {
    const station = await db('mes.stations')
      .select('substations')
      .where('id', currentSubstation.stationId)
      .first();
    
    if (station && station.substations) {
      const updatedSubstations = (station.substations || []).filter(subId => subId !== id);
      await db('mes.stations')
        .where('id', currentSubstation.stationId)
        .update({
          substations: JSON.stringify(updatedSubstations),
          updatedAt: db.fn.now()
        });
    }
  }
  
  return result[0];
};

/**
 * Update substation technical status
 * @param {string} id - Substation ID
 * @param {string} technicalStatus - New status (active, passive, maintenance)
 * @returns {Promise<Object>} Updated substation
 */
export const updateTechnicalStatus = async (id, technicalStatus) => {
  const validStatuses = ['active', 'passive', 'maintenance'];
  if (!validStatuses.includes(technicalStatus)) {
    const error = new Error('Invalid technical status');
    error.code = 'INVALID_STATUS';
    throw error;
  }
  
  const isActive = technicalStatus === 'active';
  
  const result = await db('mes.substations')
    .where({ id })
    .update({
      technicalStatus,
      isActive,
      updatedAt: db.fn.now()
    })
    .returning('*');
  
  if (!result || result.length === 0) {
    const error = new Error('Substation not found');
    error.code = 'NOT_FOUND';
    throw error;
  }
  
  // If deactivating, remove from station's substations array
  if (!isActive) {
    const substation = result[0];
    const station = await db('mes.stations')
      .select('substations')
      .where('id', substation.stationId)
      .first();
    
    if (station && station.substations) {
      const updatedSubstations = (station.substations || []).filter(subId => subId !== id);
      await db('mes.stations')
        .where('id', substation.stationId)
        .update({
          substations: JSON.stringify(updatedSubstations),
          updatedAt: db.fn.now()
        });
    }
  }
  
  // If activating, check for deferred reservations
  if (isActive && result[0].status === 'available') {
    const { applyDeferredReservation } = await import('#server/utils/fifoScheduler');
    const applied = await applyDeferredReservation(id);
    if (applied) {
      const updated = await db('mes.substations').where({ id }).first();
      return updated;
    }
  }
  
  return result[0];
};

/**
 * Get detailed info about a substation
 * @param {string} id - Substation ID
 * @returns {Promise<Object>} Detailed substation info
 */
export const getSubstationDetails = async (id) => {
  // Get substation
  const substation = await db('mes.substations')
    .select('*')
    .where({ id })
    .first();
  
  if (!substation) {
    const error = new Error('Substation not found');
    error.code = 'NOT_FOUND';
    throw error;
  }
  
  // Get station info
  const station = await db('mes.stations')
    .select('id', 'name')
    .where('id', substation.stationId)
    .first();
  
  // Get current assignment if exists
  let currentTask = null;
  const currentAssignment = await db('mes.worker_assignments')
    .select(
      'mes.worker_assignments.*',
      'mes.operations.name as operationName',
      'mes.workers.name as workerName',
      'mes.production_plans.planName as planName'
    )
    .leftJoin('mes.operations', 'mes.worker_assignments.operationId', 'mes.operations.id')
    .leftJoin('mes.workers', 'mes.worker_assignments.workerId', 'mes.workers.id')
    .leftJoin('mes.production_plans', 'mes.worker_assignments.planId', 'mes.production_plans.id')
    .where('mes.worker_assignments.substationId', id)
    .where('mes.worker_assignments.status', 'in_progress')
    .first();
  
  if (currentAssignment) {
    const durationMinutes = currentAssignment.effectiveTime || currentAssignment.nominalTime || 0;
    let timeRemaining = null;
    if (currentAssignment.startedAt && durationMinutes) {
      const startTime = new Date(currentAssignment.startedAt);
      const expectedEnd = new Date(startTime.getTime() + durationMinutes * 60000);
      const now = new Date();
      timeRemaining = Math.max(0, Math.round((expectedEnd - now) / 60000));
    }
    
    currentTask = {
      assignmentId: currentAssignment.id,
      operationName: currentAssignment.operationName || 'Bilinmiyor',
      workPackageId: currentAssignment.workPackageId,
      workerId: currentAssignment.workerId,
      workerName: currentAssignment.workerName || 'Bilinmiyor',
      planName: currentAssignment.planName || '',
      startTime: currentAssignment.startedAt,
      estimatedDuration: durationMinutes,
      expectedEnd: currentAssignment.startedAt && durationMinutes
        ? new Date(new Date(currentAssignment.startedAt).getTime() + durationMinutes * 60000).toISOString()
        : null,
      timeRemaining
    };
  }
  
  // Get upcoming tasks
  const upcomingAssignments = await db('mes.worker_assignments')
    .select(
      'mes.worker_assignments.*',
      'mes.operations.name as operationName',
      'mes.workers.name as workerName',
      'mes.production_plans.planName as planName'
    )
    .leftJoin('mes.operations', 'mes.worker_assignments.operationId', 'mes.operations.id')
    .leftJoin('mes.workers', 'mes.worker_assignments.workerId', 'mes.workers.id')
    .leftJoin('mes.production_plans', 'mes.worker_assignments.planId', 'mes.production_plans.id')
    .where('mes.worker_assignments.substationId', id)
    .whereIn('mes.worker_assignments.status', ['pending', 'queued'])
    .orderBy('mes.worker_assignments.estimatedStartTime', 'asc')
    .limit(10);
  
  const upcomingTasks = upcomingAssignments.map(a => ({
    assignmentId: a.id,
    operationName: a.operationName || 'Bilinmiyor',
    workPackageId: a.workPackageId,
    workerId: a.workerId,
    workerName: a.workerName || 'Atanmamış',
    planName: a.planName || '',
    status: a.status,
    estimatedStartTime: a.estimatedStartTime,
    estimatedDuration: a.effectiveTime || a.nominalTime
  }));
  
  // Get performance stats
  const completedStats = await db('mes.worker_assignments')
    .where('substationId', id)
    .where('status', 'completed')
    .whereNotNull('completedAt')
    .whereNotNull('startedAt')
    .count('id as total')
    .select(db.raw('AVG(EXTRACT(EPOCH FROM ("completedAt" - "startedAt")) / 60) as "avgDuration"'))
    .first();
  
  return {
    substation: {
      id: substation.id,
      code: substation.id,
      stationId: substation.stationId,
      stationName: station?.name || 'Unknown',
      name: substation.name,
      technicalStatus: substation.technicalStatus || 'active',
      isActive: substation.isActive,
      currentOperation: substation.currentOperation,
      currentAssignmentId: substation.currentAssignmentId,
      assignedWorkerId: substation.assignedWorkerId,
      currentExpectedEnd: substation.currentExpectedEnd,
      createdAt: substation.createdAt,
      updatedAt: substation.updatedAt
    },
    currentTask,
    upcomingTasks,
    performance: {
      totalCompleted: parseInt(completedStats?.total || 0),
      avgCompletionTime: Math.round(parseFloat(completedStats?.avgDuration || 0)),
      onTimeRate: 0,
      defectRate: 0
    }
  };
};
