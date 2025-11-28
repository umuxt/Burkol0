import db from '#db/connection';

export const getAllSkills = async () => {
  return await db('mes.skills')
    .select('id', 'name', 'description', 'isActive', 'createdAt', 'updatedAt')
    .where('isActive', true)
    .orderBy('name');
};

export const createSkill = async (skillData, user) => {
  // Generate skill-xxx ID
  const [{ maxId }] = await db('mes.skills').max('id as maxId');
  const nextNum = maxId ? parseInt(maxId.split('-')[1]) + 1 : 1;
  const newId = `skill-${nextNum.toString().padStart(3, '0')}`;
  
  const result = await db('mes.skills')
    .insert({
      id: newId,
      name: skillData.name,
      description: skillData.description,
      isActive: true,
      createdAt: db.fn.now(),
      updatedAt: db.fn.now(),
      createdBy: user?.email || 'system'
    })
    .returning(['id', 'name', 'description', 'isActive', 'createdAt']);
  
  return result[0];
};

export const updateSkill = async (id, skillData, user) => {
  const result = await db('mes.skills')
    .where({ id })
    .update({
      name: skillData.name,
      description: skillData.description,
      updatedAt: db.fn.now(),
      updatedBy: user?.email || 'system'
    })
    .returning(['id', 'name', 'description', 'isActive', 'updatedAt']);
  
  return result[0];
};

export const deleteSkill = async (id, user) => {
  // Check usage
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
    throw new Error(JSON.stringify({ 
      message: 'Cannot delete skill in use',
      usage: {
        workers: parseInt(workersCount.count),
        stations: parseInt(stationsCount.count),
        operations: parseInt(operationsCount.count)
      }
    }));
  }
  
  // Soft delete
  const result = await db('mes.skills')
    .where({ id })
    .update({
      isActive: false,
      updatedAt: db.fn.now(),
      updatedBy: user?.email || 'system'
    })
    .returning('id');
  
  return result[0];
};
