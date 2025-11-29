import * as workPackageService from '../services/workPackageService.js';

export const getWorkPackages = async (req, res) => {
  try {
    const { status, workerId, stationId, limit } = req.query;
    
    const result = await workPackageService.getWorkPackages({
      status,
      workerId,
      stationId,
      limit
    });
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ Work packages fetch error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to fetch work packages',
      details: error.message
    });
  }
};

export const getWorkerTaskQueue = async (req, res) => {
  try {
    const { workerId } = req.params;
    
    const tasks = await workPackageService.getWorkerTaskQueue(workerId);
    
    res.json({
      success: true,
      workerId,
      tasks: tasks,  // Frontend expects 'tasks' not 'queue'
      total: tasks.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error getting worker task queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get task queue',
      details: error.message
    });
  }
};
