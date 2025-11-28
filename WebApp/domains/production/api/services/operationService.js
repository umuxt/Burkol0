import db from '#db/connection';

export const getAllOperations = async () => {
  const result = await db('mes.operations')
    .select(
      'id', 'name', 'type', 'semiOutputCode', 'expectedDefectRate',
      'defaultEfficiency', 'supervisorId', 'skills', 'createdAt', 'updatedAt'
    )
    .orderBy('name');
  
  return result.map(op => ({
    id: op.id,
    name: op.name,
    type: op.type,
    semiOutputCode: op.semiOutputCode,
    expectedDefectRate: op.expectedDefectRate,
    defaultEfficiency: op.defaultEfficiency,
    supervisorId: op.supervisorId,
    skills: typeof op.skills === 'string' ? JSON.parse(op.skills) : (op.skills || []),
    createdAt: op.createdAt,
    updatedAt: op.updatedAt
  }));
};

export const saveOperations = async (operations) => {
  return await db.transaction(async (trx) => {
    for (const op of operations) {
      const operationData = {
        id: op.id,
        name: op.name,
        type: op.type || 'General',
        semiOutputCode: op.semiOutputCode || null,
        expectedDefectRate: op.expectedDefectRate || 0,
        defaultEfficiency: op.defaultEfficiency || 1.0,
        supervisorId: op.supervisorId || null,
        skills: JSON.stringify(op.skills || []),
        updatedAt: trx.fn.now()
      };
      
      const exists = await trx('mes.operations').where({ id: op.id }).first();
      
      if (exists) {
        await trx('mes.operations').where({ id: op.id }).update(operationData);
      } else {
        await trx('mes.operations').insert({
          ...operationData,
          createdAt: trx.fn.now()
        });
      }
    }
    return operations;
  });
};
