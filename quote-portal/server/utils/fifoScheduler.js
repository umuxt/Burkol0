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
import { recordStatusChange } from './statusHistory.js';
import { generateLotNumber } from './lotGenerator.js';

/**
 * Apply deferred reservation for a specific substation
 * Checks for pending assignments waiting for this substation
 * @param {number} substationId - The substation ID
 * @returns {Promise<boolean>} - True if reservation was applied
 */
export async function applyDeferredReservation(substationId) {
  try {
    return await db.transaction(async (trx) => {
      // Get substation status
      const substation = await trx('mes.substations')
        .where('id', substationId)
        .first();
      
      if (!substation) {
        return false;
      }
      
      // ✅ CRITICAL: Check if substation has an existing owner FIRST
      // Prevents stealing substations from paused/in_progress tasks
      if (substation.currentAssignmentId) {
        const existingOwner = await trx('mes.worker_assignments')
          .where('id', substation.currentAssignmentId)
          .whereIn('status', ['in_progress', 'paused'])
          .first();
        
        if (existingOwner) {
          console.log(`⏸️  [FIFO] Substation ${substationId} still owned by ${existingOwner.status} task ${existingOwner.id}, skipping deferred reservation`);
          return false; // Substation still owned by active/paused task
        }
      }
      
      // Now check if available for new reservations
      if (substation.status !== 'available') {
        return false; // Not available (in_use or reserved for someone else)
      }
      
      // Find pending assignment waiting for this substation
      const waitingAssignment = await trx('mes.worker_assignments')
        .where('substationId', substationId)
        .where('status', 'pending')
        .orderBy('expectedStart', 'asc')
        .first();
      
      if (!waitingAssignment) {
        return false; // No pending assignments
      }
      
      // Reserve substation for the pending assignment
      await trx('mes.substations')
        .where('id', substationId)
        .update({
          status: 'reserved',
          currentAssignmentId: waitingAssignment.id,
          assignedWorkerId: waitingAssignment.workerId,
          currentOperation: waitingAssignment.operationId,
          reservedAt: trx.fn.now(),
          updatedAt: trx.fn.now()
        });
      
      console.log(`🔄 [FIFO] Applied deferred reservation: substation ${substationId} → assignment ${waitingAssignment.id}`);
      return true;
    });
  } catch (error) {
    console.error(`Error applying deferred reservation for substation ${substationId}:`, error);
    return false;
  }
}

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
        'a.workerId as workerId',
        'a.planId as planId',
        'a.nodeId as nodeId',
        'a.status',
        'a.expected_start as expectedStart',
        'a.nominal_time as nominalTime',
        'a.effective_time as effectiveTime',
        'a.is_urgent as isUrgent',
        'a.scheduling_mode as schedulingMode',
        'p.workOrderCode as workOrderCode',
        'p.quote_id as quoteId',
        'n.name as nodeName',
        'n.operation_id as operationId',
        'o.name as operationName'
      )
      .join('mes.production_plans as p', 'p.id', 'a.planId')
      .joinRaw('INNER JOIN mes.production_plan_nodes as n ON n.id = a.nodeId::integer')
      .leftJoin('mes.operations as o', 'o.id', 'n.operation_id')
      .where('a.workerId', workerId)
      .whereIn('a.status', ['pending', 'ready'])
      .where('a.scheduling_mode', 'fifo')
      .orderBy([
        { column: 'a.is_urgent', order: 'desc' },    // Urgent first
        { column: 'a.expected_start', order: 'asc' }, // FIFO (oldest first)
        { column: 'a.createdAt', order: 'asc' }      // Tiebreaker
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
        'a.workerId as workerId',
        'a.planId as planId',
        'a.nodeId as nodeId',
        'a.status',
        'a.expected_start as expectedStart',
        'a.nominal_time as nominalTime',
        'a.effective_time as effectiveTime',
        'a.is_urgent as isUrgent',
        'p.workOrderCode as workOrderCode',
        'n.name as nodeName',
        'n.operation_id as operationId',
        'o.name as operationName'
      )
      .join('mes.production_plans as p', 'p.id', 'a.planId')
      .joinRaw('INNER JOIN mes.production_plan_nodes as n ON n.id = a.nodeId::integer')
      .leftJoin('mes.operations as o', 'o.id', 'n.operation_id')
      .where('a.workerId', workerId)
      .whereIn('a.status', ['pending', 'ready'])
      .where('a.scheduling_mode', 'fifo')
      .orderBy([
        { column: 'a.is_urgent', order: 'desc' },
        { column: 'a.expected_start', order: 'asc' },
        { column: 'a.createdAt', order: 'asc' }
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
      .where('workerId', workerId)
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
      .where('workerId', workerId)
      .first();

    if (!assignment) {
      throw new Error(`Assignment ${assignmentId} not found for worker ${workerId}`);
    }

    if (!['pending', 'ready'].includes(assignment.status)) {
      throw new Error(`Assignment ${assignmentId} is not in pending/ready state (current: ${assignment.status})`);
    }

    // Get material requirements for this node
    const materialRequirements = await getMaterialRequirements(assignment.nodeId, assignment.planId);

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

      // ✅ BUG FIX #2: Release substation from reserved state
      const assignmentData = await trx('mes.worker_assignments')
        .where('id', assignmentId)
        .first();
      
      if (assignmentData?.substationId) {
        // CRITICAL: Verify substation is actually reserved for this assignment
        // Prevents starting on busy/unreserved substations (deferred reservation case)
        const substation = await trx('mes.substations')
          .where('id', assignmentData.substationId)
          .first();
        
        if (!substation) {
          throw new Error(`Substation ${assignmentData.substationId} not found`);
        }
        
        // Check if substation is available for this assignment
        const canStart = 
          substation.status === 'available' ||
          (substation.status === 'reserved' && substation.currentAssignmentId === assignmentId);
        
        if (!canStart) {
          throw new Error(
            `Substation ${substation.name} is ${substation.status}` +
            (substation.currentAssignmentId ? ` (assigned to ${substation.currentAssignmentId})` : '') +
            `. Cannot start assignment ${assignmentId}.`
          );
        }
        
        await trx('mes.substations')
          .where('id', assignmentData.substationId)
          .update({
            status: 'in_use',
            currentAssignmentId: assignmentId,
            updatedAt: trx.fn.now()
          });
        
        console.log(`🔓 [FIFO] Released substation ${assignmentData.substationId} for use`);
      }
      
      // Update assignment to in_progress
      const [updated] = await trx('mes.worker_assignments')
        .where('id', assignmentId)
        .update({
          status: 'in_progress',
          startedAt: trx.fn.now(),
          materialReservationStatus: materialRequirements.length > 0 
            ? (reservationResult.warnings.length > 0 ? 'partial' : 'reserved')
            : 'not_required'
        })
        .returning('*');
      
      // Record status change in history
      await recordStatusChange(
        assignmentId, 
        assignment.status, 
        'in_progress', 
        workerId,
        { trx }
      );

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
 * UPDATED: Now calculates actual consumption based on:
 * - Input scrap (damaged materials)
 * - Production scrap (damaged during production)
 * - Actual output quantity × input/output ratio
 * - Defect quantity × input/output ratio
 * 
 * Formula: consumed = inputScrap + productionScrap + (actualQty × ratio) + (defectQty × ratio)
 * 
 * Workflow:
 * 1. Verify worker owns this task
 * 2. Calculate actual material consumption based on scrap + production
 * 3. Update assignment_material_reservations with consumed_qty
 * 4. Create stock adjustments for over/under reservations
 * 5. Update assignment status to 'completed'
 * 6. Record status history
 * 
 * @param {string} assignmentId - Assignment ID
 * @param {string} workerId - Worker ID (for verification)
 * @param {Object} completionData - Completion data
 * @param {number} [completionData.quantityProduced] - Actual quantity produced (good units)
 * @param {number} [completionData.defectQuantity] - Number of defects
 * @param {Object} [completionData.inputScrapCounters] - { 'M-001': 2, ... }
 * @param {Object} [completionData.productionScrapCounters] - { 'M-001': 5, ... }
 * @param {string} [completionData.notes] - Completion notes
 * @returns {Promise<Object>} Result object with updated assignment
 * 
 * Response format:
 * {
 *   success: true,
 *   assignment: { ... updated assignment record ... },
 *   materialsConsumed: 3,
 *   adjustments: [{ materialCode, reserved, consumed, delta }]
 * }
 */
export async function completeTask(assignmentId, workerId, completionData = {}) {
  try {
    // Verify worker owns this task
    const assignment = await db('mes.worker_assignments')
      .where('id', assignmentId)
      .where('workerId', workerId)
      .first();

    if (!assignment) {
      throw new Error(`Assignment ${assignmentId} not found for worker ${workerId}`);
    }

    if (assignment.status !== 'in_progress') {
      throw new Error(`Assignment ${assignmentId} is not in progress (current: ${assignment.status})`);
    }

    // Use transaction for atomic completion
    const result = await db.transaction(async (trx) => {
      // STEP 1: Get VARCHAR nodeId from production_plan_nodes and plan info
      const node = await trx('mes.production_plan_nodes')
        .where('id', assignment.nodeId)
        .first();
      
      if (!node) {
        throw new Error(`Node ${assignment.nodeId} not found`);
      }
      
      // Get plan details for reference
      const plan = await trx('mes.production_plans')
        .where('id', node.planId)
        .first();
      
      const workOrderCode = plan?.workOrderCode || `WO-${node.planId}`;
      
      // STEP 2: Get material input requirements with unit ratios using VARCHAR nodeId
      const materialInputs = await trx('mes.node_material_inputs')
        .where('nodeId', node.nodeId) // Use VARCHAR nodeId
        .select('materialCode', 'unitRatio');
      
      // unitRatio = input consumed per unit output (e.g., 0.5 kg input per 1 kg output)
      const ratioMap = materialInputs.reduce((acc, m) => {
        acc[m.materialCode] = m.unitRatio || 1.0;
        return acc;
      }, {});
      
      console.log(`📋 [FIFO] Found ${materialInputs.length} material inputs for node ${node.nodeId} (id: ${assignment.nodeId})`);
      console.log(`📊 [FIFO] Unit ratios:`, ratioMap);
      
      // STEP 3: Calculate actual consumption per material
      const actualQty = completionData.quantityProduced || 0;
      const defectQty = completionData.defectQuantity || 0;
      const inputScrap = completionData.inputScrapCounters || {};
      const productionScrap = completionData.productionScrapCounters || {};
      
      // Get all material reservations for this assignment
      const reservations = await trx('mes.assignment_material_reservations')
        .where('assignmentId', assignmentId)
        .where('reservationStatus', 'reserved')
        .select('*');
      
      const adjustments = [];
      let materialsConsumed = 0;
      
      // STEP 4: Group reservations by material and calculate total consumption per material
      const reservationsByMaterial = {};
      for (const res of reservations) {
        if (!reservationsByMaterial[res.materialCode]) {
          reservationsByMaterial[res.materialCode] = [];
        }
        reservationsByMaterial[res.materialCode].push(res);
      }
      
      // Process each material
      for (const [materialCode, materialReservations] of Object.entries(reservationsByMaterial)) {
        const ratio = ratioMap[materialCode] || 1.0;
        
        // Calculate TOTAL consumption for this material
        const inputScrapQty = inputScrap[materialCode] || 0;
        const productionScrapQty = productionScrap[materialCode] || 0;
        const productionConsumed = (actualQty + defectQty) * ratio;
        const totalConsumed = inputScrapQty + productionScrapQty + productionConsumed;
        
        // Calculate total reserved for this material (sum of all lots)
        const totalReserved = materialReservations.reduce((sum, r) => sum + parseFloat(r.actualReservedQty), 0);
        
        console.log(`📊 [FIFO] ${materialCode}: Total Reserved=${totalReserved.toFixed(2)}, Total Consumed=${totalConsumed.toFixed(2)}`);
        
        // Distribute consumption proportionally across lots
        let remainingConsumption = totalConsumed;
        
        for (let i = 0; i < materialReservations.length; i++) {
          const reservation = materialReservations[i];
          const reserved = parseFloat(reservation.actualReservedQty);
          
          // Last lot gets remaining consumption (to avoid rounding errors)
          const lotConsumed = (i === materialReservations.length - 1) 
            ? remainingConsumption 
            : (reserved / totalReserved) * totalConsumed;
          
          remainingConsumption -= lotConsumed;
          
          const delta = reserved - lotConsumed;
          
          // Update reservation with consumed qty
          await trx('mes.assignment_material_reservations')
            .where('id', reservation.id)
            .update({
              consumedQty: lotConsumed,
              reservationStatus: 'consumed'
            });
          
          console.log(`  📦 LOT ${reservation.lotNumber}: Reserved=${reserved.toFixed(2)}, Consumed=${lotConsumed.toFixed(2)}, Delta=${delta > 0 ? '+' : ''}${delta.toFixed(2)}`);
          
          // ✅ BUG FIX: Only count if actual consumption happened
          if (lotConsumed > 0) {
            materialsConsumed++;
          }
          
          adjustments.push({
            materialCode,
            lotNumber: reservation.lotNumber,
            reserved,
            consumed: lotConsumed,
            delta,
            breakdown: {
              inputScrap: inputScrapQty,
              productionScrap: productionScrapQty,
              productionUsed: productionConsumed,
              ratio
            }
          });
        }

        const materialDelta = totalReserved - totalConsumed;
        const deltaSign = materialDelta > 0 ? '+' : '';
        console.log(`📊 [FIFO] ${materialCode}: Reserved=${totalReserved}, Consumed=${totalConsumed}, Delta=${materialDelta === 0 ? 0 : `${deltaSign}${materialDelta}`}`);
        
        // STEP 5: Stock adjustment based on delta
        if (materialDelta !== 0) {
          const absDelta = Math.abs(materialDelta);
          
          if (materialDelta > 0) {
            // Over-reserved: Return excess to stock
            // Get current stock for this material
            const material = await trx('materials.materials')
              .where('code', materialCode)
              .first();
            
            const stockBefore = parseFloat(material?.stock || 0);
            const stockAfter = stockBefore + absDelta;
            
            // Create positive adjustment (return to stock)
            await trx('materials.stock_movements').insert({
              materialCode,
              type: 'in',
              subType: 'adjustment',
              quantity: absDelta,
              stockBefore,
              stockAfter,
              movementDate: trx.fn.now(),
              assignmentId: assignmentId,
              reference: workOrderCode,
              referenceType: 'production_plan',
              relatedPlanId: node.planId,
              relatedNodeId: node.nodeId,
              nodeSequence: assignment.sequenceNumber,
              notes: `Fazla rezervasyon iadesi - Reserved: ${totalReserved}, Consumed: ${totalConsumed}`
            });
            
            // Update material stock
            await trx('materials.materials')
              .where('code', materialCode)
              .update({ stock: stockAfter });
            
            console.log(`↩️  [FIFO] Returned ${absDelta} ${materialCode} to stock (${stockBefore} → ${stockAfter})`);
            
          } else {
            // Under-reserved: Consume additional from stock
            // Get current stock for this material
            const material = await trx('materials.materials')
              .where('code', materialCode)
              .first();
            
            const stockBefore = parseFloat(material?.stock || 0);
            const stockAfter = stockBefore - absDelta;
            
            if (stockAfter < 0) {
              console.warn(`⚠️  [FIFO] Warning: ${materialCode} stock will go negative (${stockBefore} → ${stockAfter})`);
            }
            
            // Create negative adjustment (deduct from stock)
            await trx('materials.stock_movements').insert({
              materialCode,
              type: 'out',
              subType: 'adjustment',
              quantity: absDelta,
              stockBefore,
              stockAfter,
              movementDate: trx.fn.now(),
              assignmentId: assignmentId,
              reference: workOrderCode,
              referenceType: 'production_plan',
              relatedPlanId: node.planId,
              relatedNodeId: node.nodeId,
              nodeSequence: assignment.sequenceNumber,
              notes: `Eksik rezervasyon tamamlama - Reserved: ${totalReserved}, Consumed: ${totalConsumed}`
            });
            
            // Update material stock
            await trx('materials.materials')
              .where('code', materialCode)
              .update({ stock: stockAfter });
            
            console.log(`⬇️  [FIFO] Consumed additional ${absDelta} ${materialCode} from stock (${stockBefore} → ${stockAfter})`);
          }
        }
      }

      // STEP 6: Add OUTPUT to stock WITH LOT TRACKING
      const completionTime = new Date(); // Use for LOT date consistency
      
      if (actualQty > 0 && node.outputCode) {
        const outputMaterial = await trx('materials.materials')
          .where('code', node.outputCode)
          .first();
        
        const outputStockBefore = parseFloat(outputMaterial?.stock || 0);
        const outputStockAfter = outputStockBefore + actualQty;
        
        // Generate LOT number for output
        const outputLotNumber = await generateLotNumber(node.outputCode, completionTime, trx);
        
        // Create output stock movement (IN) WITH LOT
        await trx('materials.stock_movements').insert({
          materialCode: node.outputCode,
          type: 'in',
          subType: 'production',
          quantity: actualQty,
          stockBefore: outputStockBefore,
          stockAfter: outputStockAfter,
          lotNumber: outputLotNumber,
          lotDate: completionTime,
          movementDate: trx.fn.now(),
          assignmentId: assignmentId,
          reference: workOrderCode,
          referenceType: 'production_plan',
          relatedPlanId: node.planId,
          relatedNodeId: node.nodeId, // VARCHAR nodeId
          nodeSequence: assignment.sequenceNumber,
          notes: `Üretim çıktısı - ${workOrderCode} - Node ${node.nodeId}`
        });
        
        // Update output material stock
        await trx('materials.materials')
          .where('code', node.outputCode)
          .update({ stock: outputStockAfter });
        
        console.log(`📦 [FIFO] Added ${actualQty} ${node.outputCode} to stock with LOT ${outputLotNumber} (${outputStockBefore} → ${outputStockAfter})`);
      }
      
      // STEP 7: Add SCRAP to stock (material codes ending with -H)
      const totalScrap = Object.entries(inputScrap).concat(Object.entries(productionScrap));
      
      // Add output defect scrap if exists
      if (defectQty > 0 && node.outputCode) {
        totalScrap.push([node.outputCode, defectQty]);
      }
      
      for (const [materialCode, scrapQty] of totalScrap) {
        if (scrapQty > 0) {
          const scrapCode = `${materialCode}-H`; // Hurda kodu
          
          // Check if scrap material exists
          let scrapMaterial = await trx('materials.materials')
            .where('code', scrapCode)
            .first();
          
          // If doesn't exist, create it
          if (!scrapMaterial) {
            const baseMaterial = await trx('materials.materials')
              .where('code', materialCode)
              .first();
            
            await trx('materials.materials').insert({
              code: scrapCode,
              name: `${baseMaterial?.name || materialCode} - Hurda`,
              type: 'scrap',
              category: baseMaterial?.category || null,
              unit: baseMaterial?.unit || 'kg',
              stock: 0,
              status: 'Aktif',
              createdAt: trx.fn.now()
            });
            
            scrapMaterial = { stock: 0, unit: baseMaterial?.unit || 'kg' };
            console.log(`➕ [FIFO] Created new scrap material: ${scrapCode}`);
          }
          
          const scrapStockBefore = parseFloat(scrapMaterial?.stock || 0);
          const scrapStockAfter = scrapStockBefore + scrapQty;
          
          // Generate LOT number for scrap
          const scrapLotNumber = await generateLotNumber(scrapCode, completionTime, trx);
          
          // Create scrap stock movement (IN) WITH LOT
          await trx('materials.stock_movements').insert({
            materialCode: scrapCode,
            type: 'in',
            subType: 'scrap',
            quantity: scrapQty,
            stockBefore: scrapStockBefore,
            stockAfter: scrapStockAfter,
            lotNumber: scrapLotNumber,
            lotDate: completionTime,
            movementDate: trx.fn.now(),
            assignmentId: assignmentId,
            reference: workOrderCode,
            referenceType: 'production_plan',
            relatedPlanId: node.planId,
            relatedNodeId: node.nodeId,
            nodeSequence: assignment.sequenceNumber,
            notes: `Üretim hurdası - ${materialCode} - ${workOrderCode} - Node ${node.nodeId}`
          });
          
          // Update scrap material stock
          await trx('materials.materials')
            .where('code', scrapCode)
            .update({ stock: scrapStockAfter });
          
          console.log(`♻️  [FIFO] Added ${scrapQty} ${scrapCode} scrap to stock with LOT ${scrapLotNumber} (${scrapStockBefore} → ${scrapStockAfter})`);
        }
      }

      // Update assignment to completed
      const [updated] = await trx('mes.worker_assignments')
        .where('id', assignmentId)
        .update({
          status: 'completed',
          completedAt: trx.fn.now(),
          materialReservationStatus: materialsConsumed > 0 ? 'consumed' : assignment.materialReservationStatus,
          actualQuantity: completionData.quantityProduced || null,
          defectQuantity: completionData.defectQuantity || 0,
          inputScrapCount: JSON.stringify(inputScrap),
          productionScrapCount: JSON.stringify(productionScrap),
          notes: completionData.notes || null
        })
        .returning('*');
      
      // ✅ BUG FIX #2: Free substation after task completion
      if (assignment.substationId) {
        await trx('mes.substations')
          .where('id', assignment.substationId)
          .update({
            status: 'available',
            currentAssignmentId: null,
            assignedWorkerId: null,
            currentOperation: null,
            updatedAt: trx.fn.now()
          });
        
        console.log(`🔓 [FIFO] Freed substation ${assignment.substationId} after completion`);
        
        // ✅ CRITICAL: Check ALL workers' queued tasks for this substation
        // Promotes first queued task (any worker) to pending + reserves substation
        const queuedForSubstation = await trx('mes.worker_assignments')
          .where('substationId', assignment.substationId)
          .where('status', 'queued')
          .orderBy('expectedStart', 'asc')
          .first();
        
        if (queuedForSubstation) {
          // Promote queued → pending
          await trx('mes.worker_assignments')
            .where('id', queuedForSubstation.id)
            .update({ status: 'pending' });
          
          // Reserve substation
          await trx('mes.substations')
            .where('id', assignment.substationId)
            .update({
              status: 'reserved',
              currentAssignmentId: queuedForSubstation.id,
              assignedWorkerId: queuedForSubstation.workerId,
              currentOperation: queuedForSubstation.operationId,
              reservedAt: trx.fn.now(),
              updatedAt: trx.fn.now()
            });
          
          console.log(`🎯 [FIFO] Promoted queued task ${queuedForSubstation.id} (worker ${queuedForSubstation.workerId}) for freed substation ${assignment.substationId}`);
        } else {
          // No queued tasks, check if any pending assignments waiting
          const waitingPending = await trx('mes.worker_assignments')
            .where('substationId', assignment.substationId)
            .where('status', 'pending')
            .orderBy('expectedStart', 'asc')
            .first();
          
          if (waitingPending) {
            await trx('mes.substations')
              .where('id', assignment.substationId)
              .update({
                status: 'reserved',
                currentAssignmentId: waitingPending.id,
                assignedWorkerId: waitingPending.workerId,
                currentOperation: waitingPending.operationId,
                reservedAt: trx.fn.now(),
                updatedAt: trx.fn.now()
              });
            
            console.log(`🔄 [FIFO] Reserved for pending task ${waitingPending.id} on freed substation ${assignment.substationId}`);
          }
        }
      }
      
      // ✅ FIFO: Activate next queued task for this worker (across all substations)
      // Prefer same plan, but fallback to other plans if current plan is done
      let nextQueued = await trx('mes.worker_assignments')
        .where('workerId', assignment.workerId)
        .where('planId', assignment.planId) // Try same plan first
        .where('status', 'queued')
        .orderBy('sequenceNumber', 'asc')
        .first();
      
      // ✅ FALLBACK: If no queued tasks in current plan, check other plans
      if (!nextQueued) {
        nextQueued = await trx('mes.worker_assignments')
          .where('workerId', assignment.workerId)
          .where('status', 'queued')
          .orderBy('expectedStart', 'asc') // Use expected start time for cross-plan priority
          .first();
        
        if (nextQueued) {
          console.log(`🔀 [FIFO] No queued tasks in plan ${assignment.planId}, promoting from plan ${nextQueued.planId}`);
        }
      }
      
      if (nextQueued) {
        // ✅ CRITICAL: Reserve substation ONLY if it's truly free
        // Don't steal substations reserved for other assignments
        const substation = await trx('mes.substations')
          .where('id', nextQueued.substationId)
          .first();
        
        const canReserve = substation && (
          substation.status === 'available' || 
          (substation.status === 'reserved' && substation.currentAssignmentId === nextQueued.id)
        );
        
        if (canReserve) {
          // Safe to reserve AND promote (only when reservation succeeds)
          await trx('mes.worker_assignments')
            .where('id', nextQueued.id)
            .update({ status: 'pending' });
          
          await trx('mes.substations')
            .where('id', nextQueued.substationId)
            .update({
              status: 'reserved',
              currentAssignmentId: nextQueued.id,
              assignedWorkerId: nextQueued.workerId,
              currentOperation: nextQueued.operationId,
              reservedAt: trx.fn.now(),
              updatedAt: trx.fn.now()
            });
          
          console.log(`🔒 [FIFO] Substation ${nextQueued.substationId} reserved for assignment ${nextQueued.id}`);
          console.log(`🔄 [FIFO] Activated next queued task: ${nextQueued.id} (worker ${nextQueued.workerId}, substation ${nextQueued.substationId}, seq ${nextQueued.sequenceNumber})`);
        } else {
          console.log(`⏳ [FIFO] Next queued task (assignment ${nextQueued.id}) stays queued - substation ${nextQueued.substationId} not available (${substation?.status})`);
        }
      }
      
      // Record status change in history
      await recordStatusChange(
        assignmentId,
        'in_progress',
        'completed',
        workerId,
        { 
          metadata: {
            actualQuantity: completionData.quantityProduced,
            defectQuantity: completionData.defectQuantity,
            adjustments
          },
          trx 
        }
      );

      console.log(`✅ [FIFO] Task ${assignmentId} completed by worker ${workerId}`);
      
      if (materialsConsumed > 0) {
        console.log(`📦 [FIFO] Processed ${materialsConsumed} material consumption(s)`);
      }

      return {
        assignment: updated,
        materialsConsumed,
        adjustments
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
      .where('workerId', workerId)
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
    // worker_assignments.nodeId is INTEGER (FK to production_plan_nodes.id)
    // But node_material_inputs.nodeId is VARCHAR (FK to production_plan_nodes.nodeId)
    // So we need to join to get the VARCHAR nodeId
    
    const node = await db('mes.production_plan_nodes')
      .where('id', nodeId)
      .first();
    
    if (!node) {
      console.warn(`⚠️  [FIFO] Node ${nodeId} not found`);
      return [];
    }
    
    // Get material inputs using the VARCHAR nodeId
    const materials = await db('mes.node_material_inputs as nmi')
      .select(
        'nmi.materialCode as materialCode',
        'nmi.requiredQuantity as requiredQty'
      )
      .where('nmi.nodeId', node.nodeId); // Use VARCHAR nodeId from production_plan_nodes

    console.log(`📋 [FIFO] Found ${materials.length} material requirement(s) for node ${node.nodeId} (id: ${nodeId})`);

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
