import db from '#db/connection';

export const getAllStations = async () => {
  const rows = await db('mes.stations')
    .select('*')
    .where('isActive', true)
    .orderBy('name');
  
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    location: row.location,
    capabilities: row.capabilities,
    subStations: row.substations || [],
    operationIds: row.operationIds || [],
    subSkills: row.subSkills || [],
    status: row.isActive ? 'active' : 'inactive',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }));
};

export const saveStations = async (stations) => {
  return await db.transaction(async (trx) => {
    const upserted = [];
    
    for (const station of stations) {
      const dbRecord = {
        id: station.id,
        name: station.name,
        type: station.type || null,
        description: station.description || null,
        location: station.location || null,
        capabilities: station.capabilities ? JSON.stringify(station.capabilities) : null,
        substations: station.subStations ? JSON.stringify(station.subStations) : '[]',
        operationIds: station.operationIds ? JSON.stringify(station.operationIds) : '[]',
        subSkills: station.subSkills ? JSON.stringify(station.subSkills) : '[]',
        isActive: station.status === 'active',
        updatedAt: trx.fn.now()
      };

      const [result] = await trx('mes.stations')
        .insert({ ...dbRecord, createdAt: trx.fn.now() })
        .onConflict('id')
        .merge(['name', 'type', 'description', 'location', 'capabilities', 'substations', 'operationIds', 'subSkills', 'isActive', 'updatedAt'])
        .returning('*');
      
      if (Array.isArray(station.subStations) && station.subStations.length > 0) {
        const newSubStationCodes = station.subStations.map(s => s.code);
        await trx('mes.substations')
          .where('stationId', station.id)
          .whereNotIn('id', newSubStationCodes)
          .delete();
        
        for (const subStation of station.subStations) {
          const subStationNumber = subStation.code.split('-').pop();
          const subStationName = `${station.name} - ${subStationNumber}`;
          
          await trx('mes.substations')
            .insert({
              id: subStation.code,
              name: subStationName,
              stationId: station.id,
              status: subStation.status || 'active',
              isActive: subStation.status !== 'inactive',
              createdAt: trx.fn.now(),
              updatedAt: trx.fn.now()
            })
            .onConflict('id')
            .merge(['name', 'status', 'isActive', 'updatedAt']);
        }
      } else {
        await trx('mes.substations')
          .where('stationId', station.id)
          .delete();
      }
      
      upserted.push(result);
    }
    
    return upserted;
  });
};

export const getStationWorkers = async (id) => {
  const station = await db('mes.stations')
    .select('id', 'name', 'subSkills', 'operationIds')
    .where({ id, isActive: true })
    .first();
  
  if (!station) return null;
  
  const subSkills = Array.isArray(station.subSkills) ? station.subSkills : [];
  const operationIds = Array.isArray(station.operationIds) ? station.operationIds : [];
  
  let inheritedSkills = [];
  if (operationIds.length > 0) {
    const operations = await db('mes.operations')
      .select('skills')
      .whereIn('id', operationIds);
    
    operations.forEach(op => {
      const opSkills = Array.isArray(op.skills) ? op.skills : [];
      inheritedSkills.push(...opSkills);
    });
  }
  
  const allRequiredSkills = Array.from(new Set([...subSkills, ...inheritedSkills]));
  
  const workers = await db('mes.workers')
    .select('id', 'name', 'skills', 'email', 'phone')
    .where('isActive', true)
    .orderBy('name');
  
  const compatibleWorkers = workers
    .map(w => ({
      id: w.id,
      name: w.name,
      email: w.email,
      phone: w.phone,
      skills: Array.isArray(w.skills) ? w.skills : [],
      matchingSkills: []
    }))
    .filter(worker => {
      worker.matchingSkills = worker.skills.filter(skill => 
        allRequiredSkills.includes(skill)
      );
      return worker.matchingSkills.length > 0;
    })
    .sort((a, b) => b.matchingSkills.length - a.matchingSkills.length);
  
  return {
    stationId: id,
    stationName: station.name,
    requiredSkills: allRequiredSkills,
    compatibleWorkers: compatibleWorkers
  };
};

export const deleteStation = async (id) => {
  return await db.transaction(async (trx) => {
    await trx('mes.substations')
      .where({ stationId: id })
      .delete();
    
    const deletedCount = await trx('mes.stations')
      .where({ id })
      .delete();
    
    if (deletedCount === 0) return null;
    
    return { id };
  });
};
