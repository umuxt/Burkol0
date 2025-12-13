/**
 * Scrap & Output Controller
 * HTTP handlers for scrap records and output code validation
 */

import * as scrapService from '../services/scrapService.js';
import { logAuditEvent } from '../../../../server/auditTrail.js';
import { logOperation } from '../../../../server/utils/logger.js';
import { logWorkerActivity } from '../services/workerActivityLogService.js';

/**
 * POST /api/mes/work-packages/:id/scrap
 */
export async function recordScrap(req, res) {
  try {
    const { id } = req.params;
    const result = await scrapService.recordScrap(id, req.body);

    if (result.error) {
      return res.status(400).json(result);
    }

    // Audit logging - scrap.record (use result values which handle both frontend and flat formats)
    logOperation({
      type: 'success',
      action: 'SCRAP RECORD',
      details: {
        workPackageId: id,
        scrapType: result.scrapType,
        materialCode: result.materialCode,
        quantity: result.quantity
      },
      audit: {
        entityType: 'scrap',
        entityId: id,
        action: 'record',
        changes: {
          scrapType: result.scrapType,
          materialCode: result.materialCode,
          quantity: result.quantity,
          totalScrap: result.totalScrap,
          reason: req.body.reason || null
        },
        performer: { email: req.user?.email || req.body.workerId },
        ipAddress: req.ip
      },
      auditFn: logAuditEvent
    });

    // Worker activity log - for personnel activity logs display
    if (req.body.workerId) {
      logWorkerActivity({
        workerId: req.body.workerId,
        action: 'scrap_record',
        entityType: 'assignment',
        entityId: id,
        details: {
          scrapType: result.scrapType,
          materialCode: result.materialCode,
          quantity: result.quantity,
          totalScrap: result.totalScrap
        },
        ipAddress: req.ip
      });
    }

    res.json(result);
  } catch (error) {
    console.error('❌ Error recording scrap:', error);
    res.status(500).json({
      error: 'Failed to record scrap',
      details: error.message
    });
  }
}

/**
 * GET /api/mes/work-packages/:id/scrap
 */
export async function getScrapRecords(req, res) {
  try {
    const { id } = req.params;
    const result = await scrapService.getScrapRecords(id);

    if (result.error) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('❌ Error fetching scrap records:', error);
    res.status(500).json({
      error: 'Failed to fetch scrap records',
      details: error.message
    });
  }
}

/**
 * DELETE /api/mes/work-packages/:id/scrap/:scrapType/:materialCode/:quantity
 */
export async function removeScrap(req, res) {
  try {
    const { id, scrapType, materialCode, quantity } = req.params;
    const result = await scrapService.removeScrap(id, scrapType, materialCode, quantity);

    if (result.error) {
      const statusCode = result.error.includes('not found') ? 404 : 400;
      return res.status(statusCode).json(result);
    }

    // Audit logging - scrap.remove
    logOperation({
      type: 'success',
      action: 'SCRAP REMOVE',
      details: {
        workPackageId: id,
        scrapType,
        materialCode,
        quantity
      },
      audit: {
        entityType: 'scrap',
        entityId: id,
        action: 'remove',
        changes: {
          scrapType,
          materialCode,
          quantity
        },
        performer: { email: req.user?.email || req.query.workerId },
        ipAddress: req.ip
      },
      auditFn: logAuditEvent
    });

    // Worker activity log - for personnel activity logs display
    const workerId = req.query.workerId;
    if (workerId) {
      logWorkerActivity({
        workerId,
        action: 'scrap_remove',
        entityType: 'assignment',
        entityId: id,
        details: {
          scrapType,
          materialCode,
          quantity: parseFloat(quantity),
          remaining: result.remaining
        },
        ipAddress: req.ip
      });
    }

    res.json(result);
  } catch (error) {
    console.error('❌ Error removing scrap:', error);
    res.status(500).json({
      error: 'Failed to remove scrap',
      details: error.message
    });
  }
}

/**
 * GET /api/mes/output-codes/validate
 */
export async function validateOutputCode(req, res) {
  try {
    const { code, excludePlanId } = req.query;
    const result = await scrapService.validateOutputCode(code, excludePlanId);
    res.json(result);
  } catch (error) {
    console.error('❌ Error validating output code:', error);
    res.status(500).json({
      error: 'Failed to validate output code',
      details: error.message
    });
  }
}

/**
 * GET /api/mes/output-codes/existing
 * Query params:
 * - prefix: Filter by output code prefix (e.g., "Cu" for Kesim operation)
 * - planId: Filter by specific plan (optional)
 */
export async function getExistingOutputCodes(req, res) {
  try {
    const { planId, prefix } = req.query;
    const result = await scrapService.getExistingOutputCodes(planId, prefix);
    res.json(result);
  } catch (error) {
    console.error('❌ Error fetching output codes:', error);
    res.status(500).json({
      error: 'Failed to fetch output codes',
      details: error.message
    });
  }
}
