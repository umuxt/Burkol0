import * as operationService from '../services/operationService.js';

export const getOperations = async (req, res) => {
  try {
    const operations = await operationService.getAllOperations();
    res.json(operations);
  } catch (error) {
    console.error('Error fetching operations:', error);
    res.status(500).json({ error: 'Failed to fetch operations' });
  }
};

export const saveOperations = async (req, res) => {
  const { operations } = req.body;
  
  if (!Array.isArray(operations)) {
    return res.status(400).json({ error: 'operations array is required' });
  }
  
  try {
    await operationService.saveOperations(operations);
    res.json({ success: true, operations });
  } catch (error) {
    console.error('Error saving operations:', error);
    res.status(500).json({ error: 'Failed to save operations' });
  }
};
