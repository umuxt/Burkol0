import db from '#db/connection';

export const getAllWorkers = async () => {
  const results = await db('mes.workers')
    .select(
      'id', 'name', 'email', 'phone', 'skills', 'personalSchedule', 'absences',
      'isActive', 'currentTaskPlanId', 'currentTaskNodeId', 'currentTaskAssignmentId',
      'createdAt', 'updatedAt', 'pinCode'
    )
    .where('isActive', true)
    .orderBy('name');

  return results.map(w => ({
    id: w.id,
    name: w.name,
    email: w.email,
    phone: w.phone,
    skills: typeof w.skills === 'string' ? JSON.parse(w.skills) : w.skills,
    personalSchedule: typeof w.personalSchedule === 'string' ? JSON.parse(w.personalSchedule) : w.personalSchedule,
    absences: typeof w.absences === 'string' ? JSON.parse(w.absences) : (w.absences || []),
    isActive: w.isActive,
    currentTaskPlanId: w.currentTaskPlanId,
    currentTaskNodeId: w.currentTaskNodeId,
    currentTaskAssignmentId: w.currentTaskAssignmentId,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    // Return boolean flag instead of actual PIN for security
    pinCode: !!w.pinCode
  }));
};

export const saveWorkers = async (workers) => {
  return await db.transaction(async (trx) => {
    for (const worker of workers) {
      const { id, name, skills, personalSchedule, absences, isActive, email, phone } = worker;

      let workerId = id;
      if (!workerId) {
        const [{ maxId }] = await trx('mes.workers').max('id as maxId');
        const nextNum = maxId ? parseInt(maxId.split('-')[1]) + 1 : 1;
        workerId = `WK-${nextNum.toString().padStart(3, '0')}`;
      }

      const dbWorker = {
        id: workerId,
        name,
        email: email || null,
        phone: phone || null,
        skills: JSON.stringify(skills),
        personalSchedule: personalSchedule ? JSON.stringify(personalSchedule) : null,
        absences: absences ? JSON.stringify(absences) : '[]',
        isActive: isActive !== undefined ? isActive : true,
        updatedAt: trx.fn.now()
      };

      const exists = await trx('mes.workers').where('id', workerId).first();

      if (exists) {
        await trx('mes.workers').where('id', workerId).update(dbWorker);
      } else {
        await trx('mes.workers').insert({
          ...dbWorker,
          createdAt: trx.fn.now()
        });
      }
    }

    const results = await db('mes.workers')
      .select('id', 'name', 'skills', 'personalSchedule', 'absences', 'isActive', 'createdAt', 'updatedAt')
      .whereIn('id', workers.map(w => w.id).filter(Boolean))
      .orWhere(function () {
        this.whereIn('name', workers.map(w => w.name));
      });

    return results.map(w => ({
      id: w.id,
      name: w.name,
      skills: typeof w.skills === 'string' ? JSON.parse(w.skills) : w.skills,
      personalSchedule: typeof w.personalSchedule === 'string' ? JSON.parse(w.personalSchedule) : w.personalSchedule,
      absences: typeof w.absences === 'string' ? JSON.parse(w.absences) : (w.absences || []),
      isActive: w.isActive,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt
    }));
  });
};

export const getWorkerAssignments = async (workerId, status) => {
  const worker = await db('mes.workers')
    .select('id', 'name')
    .where('id', workerId)
    .first();

  if (!worker) return null;

  let query = db('mes.worker_assignments')
    .select(
      'id', 'planId', 'workOrderCode', 'nodeId', 'operationId', 'workerId',
      'stationId', 'substationId', 'status', 'priority', 'isUrgent',
      'createdAt', 'startedAt', 'completedAt', 'estimatedStartTime', 'estimatedEndTime',
      'preProductionReservedAmount', 'plannedOutput', 'actualQuantity'
    )
    .where('workerId', workerId)
    .orderBy('estimatedStartTime', 'asc');

  if (status === 'active') {
    query = query.whereIn('status', ['pending', 'ready', 'in_progress']);
  } else if (status) {
    query = query.where('status', status);
  }

  const assignments = await query;

  return {
    workerId: worker.id,
    workerName: worker.name,
    assignments: assignments
  };
};

export const getWorkerStations = async (workerId) => {
  const worker = await db('mes.workers')
    .select('id', 'name', 'skills')
    .where('id', workerId)
    .first();

  if (!worker) return null;

  const workerSkills = Array.isArray(worker.skills) ? worker.skills : [];

  const stations = await db('mes.stations')
    .select('id', 'name', 'type', 'description', 'capabilities')
    .where('isActive', true);

  const compatibleStations = stations.map(s => ({
    id: s.id,
    name: s.name,
    type: s.type,
    description: s.description,
    capabilities: s.capabilities
  }));

  return {
    workerId: worker.id,
    workerName: worker.name,
    workerSkills: workerSkills,
    compatibleStations: compatibleStations
  };
};

export const deleteWorker = async (id) => {
  const result = await db('mes.workers')
    .update({
      isActive: false,
      updatedAt: db.fn.now()
    })
    .where('id', id)
    .returning(['id', 'name']);

  return result[0];
};
