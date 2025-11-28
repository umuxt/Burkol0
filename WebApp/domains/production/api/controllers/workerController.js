import * as workerService from '../services/workerService.js';

export const getWorkers = async (req, res) => {
  try {
    const workers = await workerService.getAllWorkers();
    res.json(workers);
  } catch (error) {
    console.error('Error fetching workers:', error);
    res.status(500).json({ error: 'Failed to fetch workers' });
  }
};

export const saveWorkers = async (req, res) => {
  const { workers } = req.body;
  
  if (!Array.isArray(workers) || workers.length === 0) {
    return res.status(400).json({ error: 'Workers array is required' });
  }
  
  try {
    const results = await workerService.saveWorkers(workers);
    res.json(results);
  } catch (error) {
    console.error('Error saving workers:', error);
    res.status(500).json({ error: error.message || 'Failed to save workers' });
  }
};

export const getWorkerAssignments = async (req, res) => {
  const { id } = req.params;
  const { status } = req.query;
  
  try {
    const result = await workerService.getWorkerAssignments(id, status);
    if (!result) return res.status(404).json({ error: 'Worker not found' });
    res.json(result);
  } catch (error) {
    console.error('Error fetching worker assignments:', error);
    res.status(500).json({ error: 'Failed to fetch worker assignments' });
  }
};

export const getWorkerStations = async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await workerService.getWorkerStations(id);
    if (!result) return res.status(404).json({ error: 'Worker not found' });
    res.json(result);
  } catch (error) {
    console.error('Error fetching worker stations:', error);
    res.status(500).json({ error: 'Failed to fetch worker stations' });
  }
};

export const deleteWorker = async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await workerService.deleteWorker(id);
    if (!result) return res.status(404).json({ error: 'Worker not found' });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error deleting worker:', error);
    res.status(500).json({ error: 'Failed to delete worker' });
  }
};
