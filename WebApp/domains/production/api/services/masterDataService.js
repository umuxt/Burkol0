import db from '#db/connection';

export const getMasterData = async () => {
  const result = await db('mes.settings')
    .where({ key: 'master-data' })
    .first();
  
  if (!result) {
    console.warn('⚠️ No master-data found in mes.settings, returning minimal defaults');
    return {
      availableSkills: [],
      availableOperationTypes: [],
      stationEfficiency: 1.0,
      workerEfficiency: 1.0,
      timeSettings: null
    };
  }

  const data = result.value || {};
  
  // Map legacy field names if present
  if (!data.availableSkills && Array.isArray(data.skills)) {
    data.availableSkills = data.skills;
  }
  if (!data.availableOperationTypes && Array.isArray(data.operationTypes)) {
    data.availableOperationTypes = data.operationTypes;
  }
  
  // Ensure efficiency defaults
  data.stationEfficiency = data.stationEfficiency ?? 1.0;
  data.workerEfficiency = data.workerEfficiency ?? 1.0;
  
  return data;
};

export const updateMasterData = async (payload, userEmail) => {
  console.log('Master data payload to save:', payload);
  
  // Upsert using INSERT ... ON CONFLICT
  await db.raw(`
    INSERT INTO mes.settings (id, key, value, "updatedAt", "updatedBy")
    VALUES (?, ?, ?::jsonb, NOW(), ?)
    ON CONFLICT (key) 
    DO UPDATE SET 
      value = EXCLUDED.value,
      "updatedAt" = NOW(),
      "updatedBy" = EXCLUDED."updatedBy"
  `, ['master-data', 'master-data', JSON.stringify(payload), userEmail || 'system']);

  return { success: true };
};
