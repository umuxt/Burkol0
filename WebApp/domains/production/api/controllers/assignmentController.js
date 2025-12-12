/**
 * Assignment Controller
 * HTTP handlers for worker assignment lifecycle endpoints
 */

import * as assignmentService from '../services/assignmentService.js';
import { logWorkerActivity } from '../services/workerActivityLogService.js';

/**
 * GET /api/mes/worker-assignments
 */
export async function getWorkerAssignments(req, res) {
  try {
    const { workerId, status, limit } = req.query;
    const assignments = await assignmentService.getWorkerAssignments({ workerId, status, limit });
    res.json({ assignments });
  } catch (error) {
    console.error('❌ Error fetching assignments:', error);
    res.status(500).json({
      error: 'Failed to fetch assignments',
      details: error.message
    });
  }
}

/**
 * GET /api/mes/worker-assignments/:workerId
 */
export async function getAssignmentsByWorkerId(req, res) {
  try {
    const { workerId } = req.params;
    const assignments = await assignmentService.getAssignmentsByWorkerId(workerId);
    res.json({ assignments });
  } catch (error) {
    console.error('❌ Error fetching worker assignments:', error);
    res.status(500).json({
      error: 'Failed to fetch worker assignments',
      details: error.message
    });
  }
}

/**
 * GET /api/mes/assignments/:assignmentId/lot-preview
 */
export async function getLotPreview(req, res) {
  try {
    const { assignmentId } = req.params;
    const result = await assignmentService.getLotPreview(assignmentId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('❌ [LOT-PREVIEW] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch lot preview',
      details: error.message
    });
  }
}

/**
 * POST /api/mes/assignments/:assignmentId/start
 */
export async function startAssignment(req, res) {
  try {
    const { assignmentId } = req.params;
    const { workerId } = req.body;

    const result = await assignmentService.startAssignment(assignmentId, workerId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log task_start activity (P1.4.04)
    logWorkerActivity({
      workerId,
      workerName: result.assignment?.workerName || null,
      action: 'task_start',
      entityType: 'assignment',
      entityId: assignmentId,
      ipAddress: req.ip
    }).catch(() => { });

    res.json(result);
  } catch (error) {
    console.error('❌ [FIFO] Error starting task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start task',
      details: error.message
    });
  }
}

/**
 * POST /api/mes/assignments/:assignmentId/complete
 */
export async function completeAssignment(req, res) {
  try {
    const { assignmentId } = req.params;
    const { workerId, quantityProduced, defectQuantity, inputScrapCounters, productionScrapCounters, notes } = req.body;

    const result = await assignmentService.completeAssignment(assignmentId, workerId, {
      quantityProduced,
      defectQuantity,
      inputScrapCounters,
      productionScrapCounters,
      notes
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log task_complete activity with production data (P1.4.04)
    logWorkerActivity({
      workerId,
      workerName: result.assignment?.workerName || null,
      action: 'task_complete',
      entityType: 'assignment',
      entityId: assignmentId,
      quantityProduced: quantityProduced || 0,
      defectQuantity: defectQuantity || 0,
      scrapData: { inputScrapCounters, productionScrapCounters },
      details: { notes },
      ipAddress: req.ip
    }).catch(() => { });

    res.json(result);
  } catch (error) {
    console.error('❌ [FIFO] Error completing task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete task',
      details: error.message
    });
  }
}

/**
 * POST /api/mes/assignments/:assignmentId/pause
 */
export async function pauseAssignment(req, res) {
  try {
    const { assignmentId } = req.params;
    const { workerId } = req.body;

    const result = await assignmentService.pauseAssignment(assignmentId, workerId);

    if (!result.success) {
      const statusCode = result.error.includes('not found') ? 404 : 400;
      return res.status(statusCode).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('❌ Error pausing task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to pause task',
      details: error.message
    });
  }
}

/**
 * POST /api/mes/assignments/:assignmentId/resume
 */
export async function resumeAssignment(req, res) {
  try {
    const { assignmentId } = req.params;
    const { workerId } = req.body;

    const result = await assignmentService.resumeAssignment(assignmentId, workerId);

    if (!result.success) {
      const statusCode = result.error.includes('not found') ? 404 : 400;
      return res.status(statusCode).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('❌ Error resuming task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resume task',
      details: error.message
    });
  }
}

/**
 * GET /api/mes/workers/:workerId/tasks/next
 */
export async function getNextTask(req, res) {
  try {
    const { workerId } = req.params;
    const result = await assignmentService.getNextTask(workerId);
    res.json(result);
  } catch (error) {
    console.error('❌ Error getting next task:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get next task',
      details: error.message
    });
  }
}

/**
 * GET /api/mes/workers/:workerId/tasks/stats
 */
export async function getTaskStats(req, res) {
  try {
    const { workerId } = req.params;
    const result = await assignmentService.getTaskStats(workerId);
    res.json(result);
  } catch (error) {
    console.error('❌ Error getting task stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get task stats',
      details: error.message
    });
  }
}

/**
 * GET /api/mes/workers/:workerId/has-tasks
 */
export async function hasWorkerTasks(req, res) {
  try {
    const { workerId } = req.params;
    const result = await assignmentService.hasWorkerTasks(workerId);
    res.json(result);
  } catch (error) {
    console.error('❌ Error checking task queue:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check task queue',
      details: error.message
    });
  }
}
