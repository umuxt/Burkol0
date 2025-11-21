/**
 * StockMovements Model
 * Manages stock movement audit trail for materials
 * Tracks all stock changes from orders, MES production, and manual adjustments
 */

import db from '../connection.js';

const StockMovements = {
  /**
   * Create stock movement record
   * @param {Object} movementData - Movement information
   * @returns {Object} Created movement
   */
  /**
   * Create a stock movement record with lot tracking support
   * @param {Object} movementData - Movement data
   * @returns {Object} Created movement
   */
  async createMovement(movementData) {
    const {
      materialId,
      materialCode,
      materialName,
      type, // 'in' or 'out'
      subType, // 'order_delivery', 'production_output', 'production_consumption', etc.
      status,
      quantity,
      unit,
      stockBefore,
      stockAfter,
      // Production fields (optional)
      actualOutput,
      defectQuantity,
      plannedOutput,
      // Cost fields (optional)
      unitCost,
      totalCost,
      currency = 'TRY',
      // Reference fields
      reference, // Order ID, Assignment ID, etc.
      referenceType, // 'order_delivery', 'mes_task_complete', etc.
      relatedPlanId,
      relatedNodeId,
      // Location fields (optional)
      warehouse,
      location,
      // Audit fields
      notes,
      reason,
      movementDate = new Date(),
      approved = true,
      userId,
      userName,
      // Lot tracking fields (Phase 2)
      lotNumber,
      lotDate,
      supplierLotCode,
      manufacturingDate,
      expiryDate,
      nodeSequence,
      // Partial reservation fields
      requestedQuantity,
      partialReservation,
      warning,
      assignmentId
    } = movementData;
    
    const [movement] = await db('materials.stock_movements')
      .insert({
        materialId: materialId,
        materialCode: materialCode,
        materialName: materialName,
        type,
        subType: subType,
        status,
        quantity,
        unit,
        stockBefore: stockBefore,
        stockAfter: stockAfter,
        actualOutput: actualOutput,
        defectQuantity: defectQuantity,
        plannedOutput: plannedOutput,
        unitCost: unitCost,
        totalCost: totalCost,
        currency,
        reference,
        referenceType: referenceType,
        relatedPlanId: relatedPlanId,
        relatedNodeId: relatedNodeId,
        warehouse,
        location,
        notes,
        reason,
        movementDate: movementDate,
        approved,
        userId: userId,
        userName: userName,
        // Lot tracking fields
        lotNumber: lotNumber || null,
        lotDate: lotDate || null,
        supplierLotCode: supplierLotCode || null,
        manufacturingDate: manufacturingDate || null,
        expiryDate: expiryDate || null,
        nodeSequence: nodeSequence || null,
        // Partial reservation fields
        requestedQuantity: requestedQuantity || null,
        partialReservation: partialReservation || false,
        warning: warning || null,
        assignmentId: assignmentId || null
      })
      .returning('*');
    
    return movement;
  },

  /**
   * Get movements by material
   * @param {number} materialId - Material ID
   * @param {Object} filters - Optional filters
   * @returns {Array} Stock movements
   */
  async getMovementsByMaterial(materialId, filters = {}) {
    let query = db('materials.stock_movements')
      .where({ materialId: materialId })
      .orderBy('movementDate', 'desc');
    
    if (filters.type) {
      query = query.where('type', filters.type);
    }
    
    if (filters.subType) {
      query = query.where('subType', filters.subType);
    }
    
    if (filters.startDate) {
      query = query.where('movementDate', '>=', filters.startDate);
    }
    
    if (filters.endDate) {
      query = query.where('movementDate', '<=', filters.endDate);
    }
    
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    
    return await query;
  },

  /**
   * Get movements by reference (order, assignment, etc.)
   * @param {string} reference - Reference ID
   * @param {string} referenceType - Reference type
   * @returns {Array} Stock movements
   */
  async getMovementsByReference(reference, referenceType) {
    return await db('materials.stock_movements')
      .where({
        reference,
        referenceType: referenceType
      })
      .orderBy('movementDate', 'desc');
  },

  /**
   * Get WIP movements by assignment (for MES)
   * @param {string} assignmentId - Assignment ID
   * @param {string} materialCode - Material code
   * @returns {Object|null} WIP movement
   */
  async getWipMovement(assignmentId, materialCode) {
    return await db('materials.stock_movements')
      .where({
        reference: assignmentId,
        materialCode: materialCode,
        status: 'wip'
      })
      .first();
  },

  /**
   * Update WIP movement to consumption (for MES task completion)
   * @param {number} movementId - Movement ID
   * @param {Object} updates - Updates to apply
   * @returns {Object} Updated movement
   */
  async updateWipToConsumption(movementId, updates) {
    const [updated] = await db('materials.stock_movements')
      .where({ id: movementId })
      .update({
        type: 'out',
        subType: 'production_consumption',
        status: 'production',
        quantity: updates.actualConsumption,
        stockAfter: updates.stockAfter,
        notes: updates.notes,
        updatedAt: new Date()
      })
      .returning('*');
    
    return updated;
  },

  /**
   * Get movement statistics
   * @param {Object} filters - Filter options
   * @returns {Object} Statistics
   */
  async getStatistics(filters = {}) {
    const { materialId, startDate, endDate } = filters;
    
    let query = db('materials.stock_movements');
    
    if (materialId) {
      query = query.where('materialId', materialId);
    }
    
    if (startDate) {
      query = query.where('movementDate', '>=', startDate);
    }
    
    if (endDate) {
      query = query.where('movementDate', '<=', endDate);
    }
    
    const [stats] = await query
      .select(
        db.raw('COUNT(*) as total_movements'),
        db.raw('COUNT(CASE WHEN type = ? THEN 1 END) as total_in', ['in']),
        db.raw('COUNT(CASE WHEN type = ? THEN 1 END) as total_out', ['out']),
        db.raw('SUM(CASE WHEN type = ? THEN quantity ELSE 0 END) as total_in_quantity', ['in']),
        db.raw('SUM(CASE WHEN type = ? THEN quantity ELSE 0 END) as total_out_quantity', ['out']),
        db.raw('SUM(CASE WHEN type = ? THEN total_cost ELSE 0 END) as total_in_value', ['in']),
        db.raw('SUM(CASE WHEN type = ? THEN total_cost ELSE 0 END) as total_out_value', ['out'])
      );
    
    return {
      totalMovements: parseInt(stats.total_movements, 10),
      totalIn: parseInt(stats.total_in, 10),
      totalOut: parseInt(stats.total_out, 10),
      totalInQuantity: parseFloat(stats.total_in_quantity || 0),
      totalOutQuantity: parseFloat(stats.total_out_quantity || 0),
      totalInValue: parseFloat(stats.total_in_value || 0),
      totalOutValue: parseFloat(stats.total_out_value || 0)
    };
  },

  /**
   * Get recent movements across all materials
   * @param {number} limit - Number of movements to return
   * @returns {Array} Recent movements
   */
  async getRecentMovements(limit = 50) {
    return await db('materials.stock_movements')
      .orderBy('movementDate', 'desc')
      .limit(limit);
  },

  /**
   * Delete movement (soft delete by marking as cancelled)
   * @param {number} movementId - Movement ID
   * @returns {boolean} Success
   */
  async cancelMovement(movementId) {
    const deleted = await db('materials.stock_movements')
      .where({ id: movementId })
      .update({
        status: 'cancelled',
        updatedAt: new Date()
      });
    
    return deleted > 0;
  }
};

export default StockMovements;
