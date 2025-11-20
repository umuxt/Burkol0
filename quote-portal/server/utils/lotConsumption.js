/**
 * FIFO Lot Consumption Utility
 * 
 * Purpose: Reserve and consume materials from lots using FIFO (First-In-First-Out) logic
 * when production tasks start.
 * 
 * FIFO Logic: Consume from oldest lots first (ORDER BY lot_date ASC)
 * 
 * Features:
 * - Multi-lot consumption (consume from multiple lots if needed)
 * - Partial reservation handling (warn if insufficient stock)
 * - Transaction safety (atomic all-or-nothing)
 * - Full traceability (records which lot was used in which assignment)
 * - Aggregate stock updates (materials.stock, wip_reserved)
 * 
 * @module lotConsumption
 */

import db from '../../db/connection.js';

/**
 * Reserve materials with lot tracking using FIFO consumption
 * 
 * This is the main function called when a production task starts.
 * It finds available lots, consumes from oldest first, creates stock movements,
 * and records lot consumption in assignment_material_reservations.
 * 
 * Algorithm:
 * 1. Start serializable transaction (prevent race conditions)
 * 2. For each material requirement:
 *    a. Query available lots (FIFO: ORDER BY lot_date ASC, created_at ASC)
 *    b. Calculate lot balances (SUM of IN - OUT movements)
 *    c. Consume from oldest lot first
 *    d. If lot insufficient, consume from next lot (multi-lot consumption)
 *    e. Create stock_movement (type='out') for each lot consumed
 *    f. Insert assignment_material_reservation record with lot_number
 *    g. Handle partial reservation if total stock insufficient
 * 3. Update materials.stock and wip_reserved aggregates
 * 4. Commit transaction (or rollback on any error)
 * 
 * @param {string} assignmentId - Worker assignment ID (e.g., 'WO-001-001')
 * @param {Array<Object>} materialRequirements - Array of material requirements
 * @param {string} materialRequirements[].materialCode - Material code
 * @param {number} materialRequirements[].requiredQty - Required quantity
 * @param {Object} [trx=null] - Optional existing transaction (for nested calls)
 * 
 * @returns {Promise<Object>} Reservation result
 * @returns {boolean} return.success - True if reservation successful
 * @returns {Array} return.reservations - List of reservations per material
 * @returns {Array} return.warnings - Warning messages (e.g., partial reservations)
 * @returns {string} return.error - Error message if failed
 * 
 * @example
 * const result = await reserveMaterialsWithLotTracking(
 *   'WO-001-001',
 *   [
 *     { materialCode: 'M-00-001', requiredQty: 100 },
 *     { materialCode: 'M-00-002', requiredQty: 50 }
 *   ]
 * );
 * 
 * // Success result:
 * {
 *   success: true,
 *   reservations: [
 *     {
 *       materialCode: 'M-00-001',
 *       lotsConsumed: [
 *         { lotNumber: 'LOT-M-00-001-20251101-001', qty: 50, lotDate: '2025-11-01' },
 *         { lotNumber: 'LOT-M-00-001-20251115-001', qty: 50, lotDate: '2025-11-15' }
 *       ],
 *       totalReserved: 100,
 *       partialReservation: false
 *     }
 *   ],
 *   warnings: []
 * }
 * 
 * // Partial reservation result:
 * {
 *   success: true,
 *   reservations: [...],
 *   warnings: [
 *     'Partial reservation for M-00-001: requested 100, reserved 80'
 *   ]
 * }
 */
export async function reserveMaterialsWithLotTracking(assignmentId, materialRequirements, trx = null) {
  // Validate inputs
  if (!assignmentId || typeof assignmentId !== 'string') {
    return {
      success: false,
      error: 'Invalid assignment ID'
    };
  }

  if (!Array.isArray(materialRequirements) || materialRequirements.length === 0) {
    return {
      success: false,
      error: 'Material requirements must be a non-empty array'
    };
  }

  const result = {
    success: true,
    reservations: [],
    warnings: []
  };

  try {
    // Use existing transaction or create new one
    const transaction = trx || await db.transaction({ isolationLevel: 'serializable' });

    try {
      // Process each material requirement
      for (const req of materialRequirements) {
        const { materialCode, requiredQty } = req;

        if (!materialCode || requiredQty <= 0) {
          throw new Error(`Invalid material requirement: ${JSON.stringify(req)}`);
        }

        // Get available lots for this material (FIFO order)
        const availableLots = await getAvailableLots(materialCode, transaction);

        // Calculate consumption from lots
        const consumption = calculateLotConsumption(availableLots, requiredQty);

        // Create stock movements and reservations
        const reservation = await createReservationRecords(
          assignmentId,
          materialCode,
          requiredQty,
          consumption,
          transaction
        );

        result.reservations.push(reservation);

        // Add warning if partial reservation
        if (reservation.partialReservation) {
          result.warnings.push(
            `Partial reservation for ${materialCode}: requested ${requiredQty}, reserved ${reservation.totalReserved}`
          );
        }

        // Update material aggregate stock
        await updateMaterialAggregates(materialCode, reservation.totalReserved, transaction);
      }

      // Commit transaction if we created it
      if (!trx) {
        await transaction.commit();
      }

      console.log(`[FIFO] Successfully reserved materials for assignment ${assignmentId}`);
      return result;

    } catch (error) {
      // Rollback transaction if we created it
      if (!trx) {
        await transaction.rollback();
      }
      throw error;
    }

  } catch (error) {
    console.error('[FIFO] Error reserving materials:', error);
    return {
      success: false,
      error: error.message,
      reservations: [],
      warnings: []
    };
  }
}

/**
 * Get available lots for a material in FIFO order
 * 
 * Queries stock_movements to calculate lot balances and returns
 * lots ordered by lot_date ASC (oldest first).
 * 
 * @param {string} materialCode - Material code
 * @param {Object} trx - Database transaction
 * @returns {Promise<Array>} Available lots with balances
 * 
 * @private
 */
async function getAvailableLots(materialCode, trx) {
  // Query to get lot balances (IN - OUT)
  const lots = await trx('materials.stock_movements')
    .select(
      'lot_number',
      'lot_date',
      trx.raw(`
        SUM(CASE 
          WHEN type = 'in' THEN quantity 
          ELSE -quantity 
        END) as available_qty
      `),
      trx.raw('MIN(movement_date) as first_movement')
    )
    .where('material_code', materialCode)
    .whereNotNull('lot_number')
    .groupBy('lot_number', 'lot_date')
    .havingRaw(`
      SUM(CASE 
        WHEN type = 'in' THEN quantity 
        ELSE -quantity 
      END) > 0
    `)
    .orderBy([
      { column: 'lot_date', order: 'asc' },
      { column: 'first_movement', order: 'asc' }
    ]);

  return lots.map(lot => ({
    lotNumber: lot.lot_number,
    lotDate: lot.lot_date,
    availableQty: parseFloat(lot.available_qty),
    firstMovement: lot.first_movement
  }));
}

/**
 * Calculate which lots to consume and how much from each
 * 
 * Implements FIFO logic: consume from oldest lot first,
 * if insufficient, consume from next lot, etc.
 * 
 * @param {Array} availableLots - Available lots (already sorted by lot_date ASC)
 * @param {number} requiredQty - Required quantity
 * @returns {Object} Consumption plan
 * 
 * @private
 */
function calculateLotConsumption(availableLots, requiredQty) {
  const lotsToConsume = [];
  let remainingQty = requiredQty;
  let totalAvailable = 0;

  for (const lot of availableLots) {
    totalAvailable += lot.availableQty;

    if (remainingQty <= 0) {
      break; // Already consumed enough
    }

    const consumeFromThisLot = Math.min(lot.availableQty, remainingQty);

    lotsToConsume.push({
      lotNumber: lot.lotNumber,
      lotDate: lot.lotDate,
      qty: consumeFromThisLot
    });

    remainingQty -= consumeFromThisLot;
  }

  const totalReserved = requiredQty - remainingQty;
  const partialReservation = remainingQty > 0;

  return {
    lotsToConsume,
    totalReserved,
    totalAvailable,
    partialReservation,
    shortfall: remainingQty > 0 ? remainingQty : 0
  };
}

/**
 * Create stock movement and reservation records for consumed lots
 * 
 * For each lot consumed:
 * - Creates stock_movement (type='out')
 * - Inserts assignment_material_reservation record
 * 
 * @param {string} assignmentId - Assignment ID
 * @param {string} materialCode - Material code
 * @param {number} requiredQty - Originally required quantity
 * @param {Object} consumption - Consumption plan from calculateLotConsumption()
 * @param {Object} trx - Database transaction
 * @returns {Promise<Object>} Reservation summary
 * 
 * @private
 */
async function createReservationRecords(assignmentId, materialCode, requiredQty, consumption, trx) {
  const { lotsToConsume, totalReserved, partialReservation, shortfall } = consumption;

  // Get current material stock for stock_before/stock_after tracking
  const material = await trx('materials.materials')
    .select('stock')
    .where('code', materialCode)
    .first();

  if (!material) {
    throw new Error(`Material ${materialCode} not found`);
  }

  let currentStock = parseFloat(material.stock);

  // Create stock movements and reservations for each lot
  for (const lot of lotsToConsume) {
    const stockBefore = currentStock;
    const stockAfter = currentStock - lot.qty;

    // Create stock movement (OUT)
    await trx('materials.stock_movements').insert({
      material_code: materialCode,
      type: 'out',
      quantity: lot.qty,
      stock_before: stockBefore,
      stock_after: stockAfter,
      movement_date: trx.fn.now(),
      lot_number: lot.lotNumber,
      assignment_id: assignmentId,
      requested_quantity: requiredQty,
      partial_reservation: partialReservation,
      warning: partialReservation 
        ? `Partial reservation: requested ${requiredQty}, reserved ${totalReserved} (shortfall: ${shortfall})`
        : null,
      notes: `FIFO consumption for assignment ${assignmentId}`
    });

    // Insert assignment_material_reservation
    const existingReservation = await trx('mes.assignment_material_reservations')
      .where('assignment_id', assignmentId)
      .where('material_code', materialCode)
      .where('lot_number', lot.lotNumber)
      .first();

    if (existingReservation) {
      // Update existing reservation
      await trx('mes.assignment_material_reservations')
        .where('id', existingReservation.id)
        .update({
          actual_reserved_qty: trx.raw('actual_reserved_qty + ?', [lot.qty]),
          reservation_status: 'reserved'
        });
    } else {
      // Create new reservation
      await trx('mes.assignment_material_reservations').insert({
        assignment_id: assignmentId,
        material_code: materialCode,
        lot_number: lot.lotNumber,
        pre_production_qty: requiredQty,
        actual_reserved_qty: lot.qty,
        consumed_qty: 0, // Will be updated at task completion
        reservation_status: 'reserved',
        created_at: trx.fn.now()
      });
    }

    currentStock = stockAfter;
  }

  return {
    materialCode,
    lotsConsumed: lotsToConsume,
    totalReserved,
    partialReservation
  };
}

/**
 * Update material aggregate stock fields
 * 
 * Updates materials.stock and materials.wip_reserved after reservation
 * 
 * @param {string} materialCode - Material code
 * @param {number} reservedQty - Quantity reserved
 * @param {Object} trx - Database transaction
 * @returns {Promise<void>}
 * 
 * @private
 */
async function updateMaterialAggregates(materialCode, reservedQty, trx) {
  await trx('materials.materials')
    .where('code', materialCode)
    .update({
      stock: trx.raw('stock - ?', [reservedQty]),
      wip_reserved: trx.raw('wip_reserved + ?', [reservedQty])
    });
}

/**
 * Get lot consumption preview (without actually reserving)
 * 
 * Shows which lots will be consumed for a given material requirement.
 * Useful for UI preview before task start.
 * 
 * @param {Array<Object>} materialRequirements - Material requirements
 * @returns {Promise<Object>} Preview of lot consumption
 * 
 * @example
 * const preview = await getLotConsumptionPreview([
 *   { materialCode: 'M-00-001', requiredQty: 100 }
 * ]);
 * 
 * // Returns:
 * {
 *   materials: [
 *     {
 *       materialCode: 'M-00-001',
 *       materialName: 'Çelik Sac',
 *       requiredQty: 100,
 *       lotsToConsume: [
 *         { lotNumber: 'LOT-M-00-001-001', lotDate: '2025-11-01', consumeQty: 50 },
 *         { lotNumber: 'LOT-M-00-001-002', lotDate: '2025-11-15', consumeQty: 50 }
 *       ],
 *       totalAvailable: 250,
 *       sufficient: true
 *     }
 *   ]
 * }
 */
export async function getLotConsumptionPreview(materialRequirements) {
  try {
    const materials = [];

    for (const req of materialRequirements) {
      const { materialCode, requiredQty } = req;

      // Get material details
      const material = await db('materials.materials')
        .select('code', 'name')
        .where('code', materialCode)
        .first();

      if (!material) {
        materials.push({
          materialCode,
          materialName: 'Unknown',
          requiredQty,
          lotsToConsume: [],
          totalAvailable: 0,
          sufficient: false,
          error: 'Material not found'
        });
        continue;
      }

      // Get available lots (read-only query, no transaction needed)
      const availableLots = await getAvailableLots(materialCode, db);

      // Calculate consumption (preview only)
      const consumption = calculateLotConsumption(availableLots, requiredQty);

      materials.push({
        materialCode,
        materialName: material.name,
        requiredQty,
        lotsToConsume: consumption.lotsToConsume,
        totalAvailable: consumption.totalAvailable,
        sufficient: !consumption.partialReservation
      });
    }

    return { materials };

  } catch (error) {
    console.error('[FIFO] Error generating lot consumption preview:', error);
    throw error;
  }
}

/**
 * Release reserved materials (when task is cancelled)
 * 
 * Reverses the reservation by creating IN movements and updating aggregates
 * 
 * @param {string} assignmentId - Assignment ID
 * @returns {Promise<Object>} Release result
 */
export async function releaseMaterialReservations(assignmentId) {
  try {
    return await db.transaction(async (trx) => {
      // Get all reservations for this assignment
      const reservations = await trx('mes.assignment_material_reservations')
        .where('assignment_id', assignmentId)
        .where('reservation_status', 'reserved');

      if (reservations.length === 0) {
        return {
          success: true,
          message: 'No reservations to release'
        };
      }

      // Release each reservation
      for (const res of reservations) {
        // Get current material stock
        const material = await trx('materials.materials')
          .select('stock', 'wip_reserved')
          .where('code', res.material_code)
          .first();

        const stockBefore = parseFloat(material.stock);
        const stockAfter = stockBefore + parseFloat(res.actual_reserved_qty);

        // Create reverse stock movement (IN)
        await trx('materials.stock_movements').insert({
          material_code: res.material_code,
          type: 'in',
          quantity: res.actual_reserved_qty,
          stock_before: stockBefore,
          stock_after: stockAfter,
          movement_date: trx.fn.now(),
          lot_number: res.lot_number,
          assignment_id: assignmentId,
          notes: `Released reservation for cancelled assignment ${assignmentId}`
        });

        // Update material aggregates
        await trx('materials.materials')
          .where('code', res.material_code)
          .update({
            stock: trx.raw('stock + ?', [res.actual_reserved_qty]),
            wip_reserved: trx.raw('wip_reserved - ?', [res.actual_reserved_qty])
          });

        // Update reservation status
        await trx('mes.assignment_material_reservations')
          .where('id', res.id)
          .update({
            reservation_status: 'released'
          });
      }

      return {
        success: true,
        message: `Released ${reservations.length} material reservations`
      };
    });

  } catch (error) {
    console.error('[FIFO] Error releasing material reservations:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Mark materials as consumed (when task completes)
 * 
 * Updates reservation_status to 'consumed' and sets consumed_qty
 * 
 * @param {string} assignmentId - Assignment ID
 * @returns {Promise<Object>} Consumption result
 */
export async function markMaterialsConsumed(assignmentId) {
  try {
    const updated = await db('mes.assignment_material_reservations')
      .where('assignment_id', assignmentId)
      .where('reservation_status', 'reserved')
      .update({
        consumed_qty: db.raw('actual_reserved_qty'),
        reservation_status: 'consumed'
      });

    return {
      success: true,
      updated
    };

  } catch (error) {
    console.error('[FIFO] Error marking materials consumed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Export all functions
export default {
  reserveMaterialsWithLotTracking,
  getLotConsumptionPreview,
  releaseMaterialReservations,
  markMaterialsConsumed
};


/**
 * UNIT TEST EXAMPLES
 * 
 * Test 1: Single lot consumption (sufficient stock)
 * ==================================================
 * Setup:
 * - Material M-00-001 has 1 lot: LOT-001 (100 kg, date: 2025-11-01)
 * - Requirement: 50 kg
 * 
 * Expected result:
 * - lotsConsumed: [{ lotNumber: 'LOT-001', qty: 50 }]
 * - totalReserved: 50
 * - partialReservation: false
 * - stock_movements: 1 OUT movement (50 kg)
 * - assignment_material_reservations: 1 record
 * 
 * Test 2: Multi-lot consumption (FIFO order)
 * ==========================================
 * Setup:
 * - Material M-00-001 has 3 lots:
 *   - LOT-001: 50 kg, date: 2025-11-01 (oldest)
 *   - LOT-002: 100 kg, date: 2025-11-15
 *   - LOT-003: 200 kg, date: 2025-11-20 (newest)
 * - Requirement: 120 kg
 * 
 * Expected result:
 * - lotsConsumed: [
 *     { lotNumber: 'LOT-001', qty: 50 },  // Consumed first (oldest)
 *     { lotNumber: 'LOT-002', qty: 70 }   // Consumed second
 *   ]
 * - LOT-003 untouched (still 200 kg available)
 * - totalReserved: 120
 * - partialReservation: false
 * - stock_movements: 2 OUT movements
 * 
 * Test 3: Partial reservation (insufficient stock)
 * ================================================
 * Setup:
 * - Material M-00-001 has 1 lot: LOT-001 (80 kg)
 * - Requirement: 100 kg
 * 
 * Expected result:
 * - lotsConsumed: [{ lotNumber: 'LOT-001', qty: 80 }]
 * - totalReserved: 80
 * - partialReservation: true
 * - warnings: ['Partial reservation for M-00-001: requested 100, reserved 80']
 * - stock_movements.warning: 'Partial reservation...'
 * 
 * Test 4: Multiple materials
 * ==========================
 * Setup:
 * - M-00-001: 2 lots (100 kg total)
 * - M-00-002: 1 lot (50 kg)
 * - Requirements: [
 *     { materialCode: 'M-00-001', requiredQty: 60 },
 *     { materialCode: 'M-00-002', requiredQty: 50 }
 *   ]
 * 
 * Expected result:
 * - reservations.length: 2
 * - All materials reserved successfully
 * - Total stock_movements: 2-3 (depending on lot distribution)
 * 
 * Test 5: Lot consumption preview
 * ===============================
 * const preview = await getLotConsumptionPreview([
 *   { materialCode: 'M-00-001', requiredQty: 100 }
 * ]);
 * 
 * Expected:
 * - Shows which lots will be consumed
 * - Does NOT create stock_movements
 * - Does NOT update materials.stock
 * - Read-only operation
 * 
 * Test 6: Release reservation
 * ===========================
 * 1. Reserve 100 kg from LOT-001
 * 2. Call releaseMaterialReservations(assignmentId)
 * 
 * Expected:
 * - Creates IN movement (100 kg)
 * - materials.stock += 100
 * - materials.wip_reserved -= 100
 * - reservation_status = 'released'
 * 
 * Test 7: Mark as consumed
 * ========================
 * 1. Reserve 100 kg
 * 2. Complete task
 * 3. Call markMaterialsConsumed(assignmentId)
 * 
 * Expected:
 * - consumed_qty = actual_reserved_qty
 * - reservation_status = 'consumed'
 * 
 * Test 8: Transaction rollback on error
 * =====================================
 * 1. Start reservation with 2 materials
 * 2. First material succeeds
 * 3. Second material fails (material not found)
 * 
 * Expected:
 * - Entire transaction rolled back
 * - No stock_movements created
 * - No reservations created
 * - materials.stock unchanged
 */
