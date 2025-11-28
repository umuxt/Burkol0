import * as masterDataService from '../services/masterDataService.js';

export const getMasterData = async (req, res) => {
  try {
    const masterData = await masterDataService.getMasterData();
    res.json(masterData);
  } catch (error) {
    console.error('Error fetching master data:', error);
    res.status(500).json({ error: 'Failed to fetch master data' });
  }
};

export const updateMasterData = async (req, res) => {
  try {
    const { availableSkills, availableOperationTypes, timeSettings, stationEfficiency, workerEfficiency } = req.body || {};
    
    const payload = {
      ...(availableSkills ? { availableSkills } : {}),
      ...(availableOperationTypes ? { availableOperationTypes } : {}),
      ...(timeSettings ? { timeSettings } : {}),
      ...(stationEfficiency !== undefined ? { stationEfficiency: parseFloat(stationEfficiency) || 1.0 } : {}),
      ...(workerEfficiency !== undefined ? { workerEfficiency: parseFloat(workerEfficiency) || 1.0 } : {})
    };
    
    await masterDataService.updateMasterData(payload, req.user?.email);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating master data:', error);
    res.status(500).json({ error: 'Failed to update master data' });
  }
};
