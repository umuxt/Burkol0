/**
 * Stock Controller
 * HTTP handlers for stock management
 */

import * as stockService from '../services/stockService.js';
import { logAuditEvent } from '../../../../server/auditTrail.js';
import { logOperation } from '../../../../server/utils/logger.js';

export async function updateStock(req, res) {
  try {
    const { code } = req.params;
    const updatedBy = req.user?.email || 'system';
    const result = await stockService.updateStock(code, req.body, updatedBy);

    // P1.7: Audit log (manuel stok düzeltmesi)
    logOperation({
      type: 'success',
      action: 'STOCK UPDATE',
      details: {
        materialCode: code,
        adjustment: req.body.adjustment,
        reason: req.body.reason,
        newStock: result.newStock
      },
      audit: {
        entityType: 'stock',
        entityId: code,
        action: 'update',
        changes: {
          adjustment: req.body.adjustment,
          reason: req.body.reason,
          newStock: result.newStock
        },
        performer: { email: req.user?.email, sessionId: req.user?.sessionId },
        ipAddress: req.ip
      },
      auditFn: logAuditEvent
    });

    res.json(result);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Material not found' });
    }
    if (error.code === 'NEGATIVE_STOCK') {
      return res.status(400).json({ error: 'Stock cannot be negative' });
    }
    console.error('Error updating stock:', error);
    res.status(500).json({ error: 'Failed to update stock', details: error.message });
  }
}

export async function getStockOverview(req, res) {
  try {
    const overview = await stockService.getStockOverview();
    res.json(overview);
  } catch (error) {
    console.error('Error getting stock overview:', error);
    res.status(500).json({ error: 'Failed to get stock overview' });
  }
}

export async function getMaterialLots(req, res) {
  try {
    const { code } = req.params;
    const lots = await stockService.getMaterialLots(code);
    res.json(lots);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Material not found' });
    }
    console.error('Error getting material lots:', error);
    res.status(500).json({ error: 'Failed to get material lots' });
  }
}

export async function getStockMovements(req, res) {
  try {
    const filters = {
      materialCode: req.query.materialCode,
      materialId: req.query.materialId,
      movementType: req.query.movementType,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: req.query.limit ? parseInt(req.query.limit) : 100,
      offset: req.query.offset ? parseInt(req.query.offset) : 0
    };

    const movements = await stockService.getStockMovements(filters);
    res.json(movements);
  } catch (error) {
    console.error('Error getting stock movements:', error);
    res.status(500).json({ error: 'Failed to get stock movements' });
  }
}

export async function reserveStock(req, res) {
  try {
    const { code } = req.params;
    const { quantity, referenceId, referenceType } = req.body;

    const result = await stockService.reserveStock(code, quantity, referenceId, referenceType);
    res.json(result);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Material not found' });
    }
    if (error.code === 'INSUFFICIENT_STOCK') {
      return res.status(400).json({ error: 'Insufficient available stock' });
    }
    console.error('Error reserving stock:', error);
    res.status(500).json({ error: 'Failed to reserve stock' });
  }
}

export async function releaseReservation(req, res) {
  try {
    const { code } = req.params;
    const { quantity } = req.body;

    const result = await stockService.releaseReservation(code, quantity);
    res.json(result);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Material not found' });
    }
    console.error('Error releasing reservation:', error);
    res.status(500).json({ error: 'Failed to release reservation' });
  }
}
