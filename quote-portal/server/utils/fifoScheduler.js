/**
 * FIFO Task Scheduler for MES Worker Portal
 * 
 * Purpose: Implement First-In-First-Out task scheduling for workers
 * 
 * Features:
 * - FIFO queue ordering (oldest tasks first)
 * - Urgent task prioritization
 * - Index-optimized queries (idx_fifo_queue)
 * - Worker-specific task queues
 * - Real-time task status tracking
 * - Integrated lot-based material consumption
 * 
 * Query Performance Target: < 5ms
 * Index Used: idx_fifo_queue (partial index on worker_id, status, scheduling_mode)
 * 
 * Reference: MES-COMPLETE-MIGRATION-GUIDE.md - STEP 6 & STEP 7
 * Reference: MES-FIFO-OPTIMIZATION-DATABASE-REQUIREMENTS.md
 * 
 * Created: 2025-11-20
 * Updated: 2025-11-20 (Added lot consumption integration)
 */

import db from '../../db/connection.js';
import { reserveMaterialsWithLotTracking } from './lotConsumption.js';

/**
 * Get the next task for a worker using FIFO scheduling
 * 
 * @param {string} workerId - Worker ID (e.g., 'W-001')
 * @returns {Promise<Object|null>} Next task to work on, or null if no tasks available
 * 
 * Response format:
 * {
 *   assignmentId: 'WO-001-001',
 *   workOrderCode: 'WO-001',
 *   planId: 'PLAN-001',
 *   nodeId: 123,
 *   nodeName: 'Kesim İşlemi',
 *   operationId: 'OP-001',
 *   operationName: 'Kesim',
 *   status: 'pending',
 *   expectedStart: '2025-11-20T10:00:00Z',
 *   nominalTime: 60,
 *   effectiveTime: 70,
 *   isUrgent: false,
 *   fifoPosition: 1
 * }
 * 
 * Edge cases handled:
 * - No tasks available → returns null
 * - All tasks completed → returns null
 * - Urgent tasks → prioritized first
 * - Multiple workers → isolated queues
 */
export async function getWorkerNextTask(workerId) {
  try {
    // Query: Get next task in FIFO order
    // Uses idx_fifo_queue partial index for performance
    const result = await db('mes.worker_assignments as a')
      .select(
        'a.id as assignmentId',
        'a.worker_id as workerId',
        'a.plan_id as planId',
        'a.node_id as nodeId',
        'a.status',
        'a.expected_start as expectedStart',
        'a.nominal_time as nominalTime',
        'a.effective_time as effectiveTime',
        'a.is_urgent as isUrgent',
        'a.scheduling_mode as schedulingMode',
        'p.work_order_code as workOrderCode',
        'p.quote_id as quoteId',
        'n.name as nodeName',
        'n.operation_id as operationId',
        'o.name as operationName'
      )
      .join('mes.production_plans as p', 'p.id', 'a.plan_id')
      .joinRaw('INNER JOIN mes.production_plan_nodes as n ON n.id = a.node_id::integer')
      .leftJoin('mes.operations as o', 'o.id', 'n.operation_id')
      .where('a.worker_id', workerId)
      .whereIn('a.status', ['pending', 'ready'])
      .where('a.scheduling_mode', 'fifo')
      .orderBy([
        { column: 'a.is_urgent', order: 'desc' },    // Urgent first
        { column: 'a.expected_start', order: 'asc' }, // FIFO (oldest first)
        { column: 'a.created_at', order: 'asc' }      // Tiebreaker
      ])
      .limit(1)
      .first();

    if (!result) {
      return null; // No tasks available
    }

    // Add FIFO position (always 1 for the next task)
    result.fifoPosition = 1;

    return result;

  } catch (error) {
    console.error('❌ Error in getWorkerNextTask:', error);
    throw error;
  }
}

/**
 * Get full FIFO task queue for a worker
 * 
 * @param {string} workerId - Worker ID
 * @param {number} limit - Maximum tasks to return (default: 10)
 * @returns {Promise<Array>} Array of tasks in FIFO order
 * 
 * Use case: Worker portal showing upcoming tasks
 * Performance: < 10ms for 100 tasks
 */
export async function getWorkerTaskQueue(workerId, limit = 10) {
  try {
    const tasks = await db('mes.worker_assignments as a')
      .select(
        'a.id as assignmentId',
        'a.worker_id as workerId',
        'a.plan_id as planId',
        'a.node_id as nodeId',
        'a.status',
        'a.expected_start as expectedStart',
        'a.nominal_time as nominalTime',
        'a.effective_time as effectiveTime',
        'a.is_urgent as isUrgent',
        'p.work_order_code as workOrderCode',
        'n.name as nodeName',
        'n.operation_id as operationId',
        'o.name as operationName'
      )
      .join('mes.production_plans as p', 'p.id', 'a.plan_id')
      .joinRaw('INNER JOIN mes.production_plan_nodes as n ON n.id = a.node_id::integer')
      .leftJoin('mes.operations as o', 'o.id', 'n.operation_id')
      .where('a.worker_id', workerId)
      .whereIn('a.status', ['pending', 'ready'])
      .where('a.scheduling_mode', 'fifo')
      .orderBy([
        { column: 'a.is_urgent', order: 'desc' },
        { column: 'a.expected_start', order: 'asc' },
        { column: 'a.created_at', order: 'asc' }
      ])
      .limit(limit);

    // Add FIFO position to each task
    return tasks.map((task, index) => ({
      ...task,
      fifoPosition: index + 1
    }));

  } catch (error) {
    console.error('❌ Error in getWorkerTaskQueue:', error);
    throw error;
  }
}

/**
 * Get task statistics for a worker
 * 
 * @param {string} workerId - Worker ID
 * @returns {Promise<Object>} Task statistics
 * 
 * Response:
 * {
 *   totalPending: 5,
 *   totalReady: 3,
 *   urgentCount: 1,
 *   nextTaskDue: '2025-11-20T10:00:00Z',
 *   estimatedWorkload: 240 // minutes
 * }
 */
export async function getWorkerTaskStats(workerId) {
  try {
    const stats = await db('mes.worker_assignments')
      .where('worker_id', workerId)
      .whereIn('status', ['pending', 'ready'])
      .where('scheduling_mode', 'fifo')
      .select(
        db.raw('COUNT(*) as total_tasks'),
        db.raw('COUNT(*) FILTER (WHERE status = \'pending\') as total_pending'),
        db.raw('COUNT(*) FILTER (WHERE status = \'ready\') as total_ready'),
        db.raw('COUNT(*) FILTER (WHERE is_urgent = true) as urgent_count'),
        db.raw('MIN(expected_start) as next_task_due'),
        db.raw('SUM(effective_time) as estimated_workload')
      )
      .first();

    return {
      totalTasks: parseInt(stats.total_tasks) || 0,
      totalPending: parseInt(stats.total_pending) || 0,
      totalReady: parseInt(stats.total_ready) || 0,
      urgentCount: parseInt(stats.urgent_count) || 0,
      nextTaskDue: stats.next_task_due,
      estimatedWorkload: parseInt(stats.estimated_workload) || 0
    };

  } catch (error) {
    console.error('❌ Error in getWorkerTaskStats:', error);
    throw error;
  }
}

/**
 * Mark task as started (change status: pending/ready → in_progress)
 * 
 * STEP 7 INTEGRATION: Now includes lot-based material consumption!
 * 
 * Workflow:
 * 1. Verify worker owns this task
 * 2. Get material requirements from production plan node
 * 3. Reserve materials with FIFO lot consumption
 * 4. Update assignment status to 'in_progress'
 * 5. Record actual_start timestamp
 * 6. Link lot numbers to assignment
 * 
 * @param {string} assignmentId - Assignment ID
 * @param {string} workerId - Worker ID (for verification)
 * @returns {Promise<Object>} Result object with assignment and reservation details
 * 
 * Response format:
 * {
 *   success: true,
 *   assignment: { ... updated assignment record ... },
 *   materialReservation: {
 *     success: true,
 *     reservations: [{ materialCode, lotsConsumed, totalReserved }],
 *     warnings: ['Partial reservation...'] (if any)
 *   }
 * }
 * 
 * Side effects:
 * - Updates status to 'in_progress'
 * - Sets actual_start timestamp
 * - Creates stock_movements (type='out') for consumed lots
 * - Creates assignment_material_reservations records
 * - Updates materials.stock and wip_reserved aggregates
 * - Triggers real-time notification (via database trigger)
 */
export async function startTask(assignmentId, workerId) {
  try {
    // Verify worker owns this task
    const assignment = await db('mes.worker_assignments')
      .where('id', assignmentId)
      .where('worker_id', workerId)
      .first();

    if (!assignment) {
      throw new Error(`Assignment ${assignmentId} not found for worker ${workerId}`);
    }

    if (!['pending', 'ready'].includes(assignment.status)) {
      throw new Error(`Assignment ${assignmentId} is not in pending/ready state (current: ${assignment.status})`);
    }

    // Get material requirements for this node
    const materialRequirements = await getMaterialRequirements(assignment.node_id, assignment.plan_id);

    // Start a transaction for atomic operation
    const result = await db.transaction(async (trx) => {
      let reservationResult = {
        success: true,
        reservations: [],
        warnings: []
      };

      // Reserve materials with FIFO lot consumption (if needed)
      if (materialRequirements.length > 0) {
        console.log(`📦 [FIFO] Reserving ${materialRequirements.length} materials for assignment ${assignmentId}`);
        
        reservationResult = await reserveMaterialsWithLotTracking(
          assignmentId,
          materialRequirements,
          trx // Pass transaction for atomicity
        );

        if (!reservationResult.success) {
          throw new Error(`Material reservation failed: ${reservationResult.error}`);
        }

        console.log(`✅ [FIFO] Reserved materials with ${reservationResult.reservations.length} lot(s)`);
        
        if (reservationResult.warnings.length > 0) {
          console.warn(`⚠️  [FIFO] Warnings:`, reservationResult.warnings);
        }
      }

      // Update assignment to in_progress
      const [updated] = await trx('mes.worker_assignments')
        .where('id', assignmentId)
        .update({
          status: 'in_progress',
          actual_start: trx.fn.now(),
          material_reservation_status: materialRequirements.length > 0 
            ? (reservationResult.warnings.length > 0 ? 'partial' : 'reserved')
            : 'not_required',
          updated_at: trx.fn.now()
        })
        .returning('*');

      console.log(`✅ [FIFO] Task ${assignmentId} started by worker ${workerId}`);

      return {
        assignment: updated,
        materialReservation: reservationResult
      };
    });

    return {
      success: true,
      ...result
    };

  } catch (error) {
    console.error('❌ [FIFO] Error in startTask:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Mark task as completed
 * 
 * STEP 7 INTEGRATION: Now marks materials as consumed!
 * 
 * Workflow:
 * 1. Verify worker owns this task
 * 2. Update assignment status to 'completed'
 * 3. Record actual_end timestamp
 * 4. Mark reserved materials as 'consumed'
 * 5. Update consumed_qty in assignment_material_reservations
 * 
 * @param {string} assignmentId - Assignment ID
 * @param {string} workerId - Worker ID (for verification)
 * @param {Object} completionData - Completion data
 * @param {number} [completionData.quantityProduced] - Actual quantity produced
 * @param {number} [completionData.defectQuantity] - Number of defects
 * @param {boolean} [completionData.qualityOk] - Quality check passed
 * @param {string} [completionData.notes] - Completion notes
 * @returns {Promise<Object>} Result object with updated assignment
 * 
 * Response format:
 * {
 *   success: true,
 *   assignment: { ... updated assignment record ... },
 *   materialsConsumed: 3  // Number of material reservations marked as consumed
 * }
 */
export async function completeTask(assignmentId, workerId, completionData = {}) {
  try {
    // Verify worker owns this task
    const assignment = await db('mes.worker_assignments')
      .where('id', assignmentId)
      .where('worker_id', workerId)
      .first();

    if (!assignment) {
      throw new Error(`Assignment ${assignmentId} not found for worker ${workerId}`);
    }

    if (assignment.status !== 'in_progress') {
      throw new Error(`Assignment ${assignmentId} is not in progress (current: ${assignment.status})`);
    }

    // Use transaction for atomic completion
    const result = await db.transaction(async (trx) => {
      // Mark materials as consumed (reserved → consumed)
      const materialsConsumed = await trx('mes.assignment_material_reservations')
        .where('assignment_id', assignmentId)
        .where('reservation_status', 'reserved')
        .update({
          consumed_qty: trx.raw('actual_reserved_qty'),
          reservation_status: 'consumed',
          consumed_at: trx.fn.now()
        });

      // Update assignment to completed
      const [updated] = await trx('mes.worker_assignments')
        .where('id', assignmentId)
        .update({
          status: 'completed',
          actual_end: trx.fn.now(),
          material_reservation_status: materialsConsumed > 0 ? 'consumed' : assignment.material_reservation_status,
          quantity_produced: completionData.quantityProduced || null,
          defect_quantity: completionData.defectQuantity || 0,
          quality_ok: completionData.qualityOk !== undefined ? completionData.qualityOk : true,
          completion_notes: completionData.notes || null,
          updated_at: trx.fn.now()
        })
        .returning('*');

      console.log(`✅ [FIFO] Task ${assignmentId} completed by worker ${workerId}`);
      
      if (materialsConsumed > 0) {
        console.log(`📦 [FIFO] Marked ${materialsConsumed} material reservation(s) as consumed`);
      }

      return {
        assignment: updated,
        materialsConsumed
      };
    });

    return {
      success: true,
      ...result
    };

  } catch (error) {
    console.error('❌ [FIFO] Error in completeTask:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check if worker has any tasks in queue
 * 
 * @param {string} workerId - Worker ID
 * @returns {Promise<boolean>} True if worker has pending/ready tasks
 */
export async function hasTasksInQueue(workerId) {
  try {
    const count = await db('mes.worker_assignments')
      .where('worker_id', workerId)
      .whereIn('status', ['pending', 'ready'])
      .where('scheduling_mode', 'fifo')
      .count('id as count')
      .first();

    return parseInt(count.count) > 0;

  } catch (error) {
    console.error('❌ Error in hasTasksInQueue:', error);
    throw error;
  }
}

/**
 * Get material requirements for a production plan node
 * 
 * Queries node_material_inputs to get all materials needed for this operation.
 * Returns format compatible with reserveMaterialsWithLotTracking().
 * 
 * @param {string} nodeId - Production plan node ID
 * @param {string} planId - Production plan ID
 * @returns {Promise<Array>} Material requirements array
 * 
 * @private
 * 
 * Response format:
 * [
 *   { materialCode: 'M-00-001', requiredQty: 100 },
 *   { materialCode: 'M-00-002', requiredQty: 50 }
 * ]
 */
async function getMaterialRequirements(nodeId, planId) {
  try {
    // Get material inputs for this node
    const materials = await db('mes.node_material_inputs as nmi')
      .select(
        'nmi.material_code as materialCode',
        'nmi.quantity as requiredQty'
      )
      .where('nmi.node_id', parseInt(nodeId))
      .where('nmi.plan_id', planId);

    console.log(`📋 [FIFO] Found ${materials.length} material requirement(s) for node ${nodeId}`);

    return materials;

  } catch (error) {
    console.error('❌ [FIFO] Error getting material requirements:', error);
    // Return empty array on error (task can still start without materials)
    return [];
  }
}

// Export all functions
export default {
  getWorkerNextTask,
  getWorkerTaskQueue,
  getWorkerTaskStats,
  startTask,
  completeTask,
  hasTasksInQueue
};
