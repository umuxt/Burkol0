/**
 * Shipment Controller
 * HTTP handlers for outgoing shipments with multi-item support
 */

import * as shipmentService from '../services/shipmentService.js';
import * as exportService from '../services/exportService.js';
import { logAuditEvent } from '../../../../server/auditTrail.js';
import { logOperation } from '../../../../server/utils/logger.js';

// ============================================
// SHIPMENT CRUD (Header)
// ============================================

export async function createShipment(req, res) {
  try {
    const result = await shipmentService.createShipment(req.body, req.user);

    // Audit logging - shipment.create (result is the shipment object directly)
    logOperation({
      type: 'success',
      action: 'SHIPMENT CREATE',
      details: {
        shipmentId: result.id,
        shipmentCode: result.shipmentCode,
        customerId: result.customerId,
        itemsCount: result.items?.length || 0
      },
      audit: {
        entityType: 'shipment',
        entityId: result.id,
        action: 'create',
        changes: {
          shipmentCode: result.shipmentCode,
          customerId: result.customerId,
          customerName: result.customerName,
          itemsCount: result.items?.length || 0
        },
        performer: { email: req.user?.email, sessionId: req.user?.sessionId },
        ipAddress: req.ip
      },
      auditFn: logAuditEvent
    });

    res.status(201).json(result);
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    if (error.code === 'INSUFFICIENT_STOCK') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error creating shipment:', error);
    res.status(500).json({ error: 'Sevkiyat oluşturulamadı: ' + error.message });
  }
}

/**
 * Create quick shipment from stock page (single item)
 * Backwards compatible with old flow
 */
export async function createQuickShipment(req, res) {
  try {
    const result = await shipmentService.createQuickShipment(req.body, req.user);
    res.status(201).json(result);
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    if (error.code === 'INSUFFICIENT_STOCK') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error creating quick shipment:', error);
    res.status(500).json({ error: 'Sevkiyat oluşturulamadı: ' + error.message });
  }
}

export async function getShipments(req, res) {
  try {
    const { status, workOrderCode, quoteId, startDate, endDate, limit, offset, includeItems } = req.query;

    const filters = {
      status,
      workOrderCode,
      quoteId,
      startDate,
      endDate,
      limit,
      offset,
      includeItems: includeItems !== 'false' // Default true
    };

    const shipments = await shipmentService.getShipments(filters);
    res.json(shipments);
  } catch (error) {
    console.error('Error getting shipments:', error);
    res.status(500).json({ error: 'Failed to get shipments' });
  }
}

export async function getShipmentById(req, res) {
  try {
    const { id } = req.params;
    const shipment = await shipmentService.getShipmentById(id);
    res.json(shipment);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    console.error('Error getting shipment:', error);
    res.status(500).json({ error: 'Failed to get shipment' });
  }
}

export async function getShipmentByCode(req, res) {
  try {
    const { code } = req.params;
    const shipment = await shipmentService.getShipmentByCode(code);
    res.json(shipment);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    console.error('Error getting shipment:', error);
    res.status(500).json({ error: 'Failed to get shipment' });
  }
}

export async function updateShipment(req, res) {
  try {
    const { id } = req.params;
    const shipment = await shipmentService.updateShipment(id, req.body);
    res.json(shipment);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    if (error.code === 'INVALID_STATUS') {
      return res.status(400).json({ error: 'Cannot update completed shipment' });
    }
    console.error('Error updating shipment:', error);
    res.status(500).json({ error: 'Failed to update shipment' });
  }
}

/**
 * PUT /api/materials/shipments/:id/full
 * Update shipment header and items (P1.6.2)
 */
export async function updateFullShipment(req, res) {
  try {
    const { id } = req.params;
    const result = await shipmentService.updateFullShipment(id, req.body, req.user);

    // Audit logging - shipment.update
    logOperation({
      type: 'success',
      action: 'SHIPMENT UPDATE',
      details: {
        shipmentId: id,
        shipmentCode: result.shipmentCode,
        itemsUpdated: result.items?.length || 0
      },
      audit: {
        entityType: 'shipment',
        entityId: id,
        action: 'update',
        changes: {
          shipmentCode: result.shipmentCode,
          itemsCount: result.items?.length || 0,
          updatedAt: new Date().toISOString()
        },
        performer: { email: req.user?.email, sessionId: req.user?.sessionId },
        ipAddress: req.ip
      },
      auditFn: logAuditEvent
    });

    res.json(result);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    if (error.code === 'INVALID_STATUS') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'INSUFFICIENT_STOCK') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error updating full shipment:', error);
    res.status(500).json({ error: 'Failed to update shipment' });
  }
}

export async function updateShipmentStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const updatedBy = req.user?.email || 'system';

    const shipment = await shipmentService.updateShipmentStatus(id, status, updatedBy);
    res.json(shipment);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    if (error.code === 'INVALID_TRANSITION') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error updating shipment status:', error);
    res.status(500).json({ error: 'Failed to update shipment status' });
  }
}

export async function cancelShipment(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const cancelledBy = req.user?.email || 'system';

    const shipment = await shipmentService.cancelShipment(id, reason, cancelledBy);

    // Audit logging - shipment.cancel
    logOperation({
      type: 'success',
      action: 'SHIPMENT CANCEL',
      details: {
        shipmentId: id,
        shipmentCode: shipment?.shipmentCode,
        reason: reason || null
      },
      audit: {
        entityType: 'shipment',
        entityId: id,
        action: 'cancel',
        changes: {
          shipmentCode: shipment?.shipmentCode,
          reason: reason || null,
          cancelledAt: new Date().toISOString(),
          stockRestored: true
        },
        performer: { email: req.user?.email, sessionId: req.user?.sessionId },
        ipAddress: req.ip
      },
      auditFn: logAuditEvent
    });

    res.json(shipment);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    if (error.code === 'ALREADY_DELIVERED') {
      return res.status(400).json({ error: 'Cannot cancel delivered shipment' });
    }
    if (error.code === 'ALREADY_CANCELLED') {
      return res.status(400).json({ error: 'Shipment already cancelled' });
    }
    console.error('Error cancelling shipment:', error);
    res.status(500).json({ error: 'Failed to cancel shipment' });
  }
}

export async function deleteShipment(req, res) {
  try {
    const { id } = req.params;
    await shipmentService.deleteShipment(id);
    res.json({ success: true, message: 'Shipment deleted' });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    if (error.code === 'INVALID_STATUS') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error deleting shipment:', error);
    res.status(500).json({ error: 'Failed to delete shipment' });
  }
}

export async function getShipmentStats(req, res) {
  try {
    const stats = await shipmentService.getShipmentStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting shipment stats:', error);
    res.status(500).json({ error: 'Failed to get shipment stats' });
  }
}

// ============================================
// SHIPMENT ITEMS CRUD
// ============================================

export async function getShipmentItems(req, res) {
  try {
    const { id } = req.params;
    const items = await shipmentService.getShipmentItems(id);
    res.json(items);
  } catch (error) {
    console.error('Error getting shipment items:', error);
    res.status(500).json({ error: 'Failed to get shipment items' });
  }
}

export async function getShipmentItemById(req, res) {
  try {
    const { itemId } = req.params;
    const item = await shipmentService.getShipmentItemById(itemId);
    res.json(item);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Shipment item not found' });
    }
    console.error('Error getting shipment item:', error);
    res.status(500).json({ error: 'Failed to get shipment item' });
  }
}

export async function addItemToShipment(req, res) {
  try {
    const { id } = req.params;
    const item = await shipmentService.addItemToShipment(id, req.body, req.user);
    res.status(201).json(item);
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    if (error.code === 'INSUFFICIENT_STOCK') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'INVALID_STATUS') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error adding item to shipment:', error);
    res.status(500).json({ error: 'Failed to add item to shipment' });
  }
}

export async function removeItemFromShipment(req, res) {
  try {
    const { itemId } = req.params;
    const result = await shipmentService.removeItemFromShipment(itemId, req.user);
    res.json(result);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Shipment item not found' });
    }
    if (error.code === 'INVALID_STATUS') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error removing item from shipment:', error);
    res.status(500).json({ error: 'Failed to remove item from shipment' });
  }
}

export async function updateItemQuantity(req, res) {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    const item = await shipmentService.updateItemQuantity(itemId, quantity, req.user);
    res.json(item);
  } catch (error) {
    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    if (error.code === 'INSUFFICIENT_STOCK') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'INVALID_STATUS') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error updating item quantity:', error);
    res.status(500).json({ error: 'Failed to update item quantity' });
  }
}

export async function updateItemNotes(req, res) {
  try {
    const { itemId } = req.params;
    const { notes } = req.body;
    const item = await shipmentService.updateItemNotes(itemId, notes);
    res.json(item);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Shipment item not found' });
    }
    console.error('Error updating item notes:', error);
    res.status(500).json({ error: 'Failed to update item notes' });
  }
}

export async function getItemsByMaterial(req, res) {
  try {
    const { materialCode } = req.params;
    const { status, startDate, endDate } = req.query;
    const items = await shipmentService.getItemsByMaterial(materialCode, { status, startDate, endDate });
    res.json(items);
  } catch (error) {
    console.error('Error getting items by material:', error);
    res.status(500).json({ error: 'Failed to get items by material' });
  }
}

export async function getItemStats(req, res) {
  try {
    const { startDate, endDate } = req.query;
    const stats = await shipmentService.getItemStats({ startDate, endDate });
    res.json(stats);
  } catch (error) {
    console.error('Error getting item stats:', error);
    res.status(500).json({ error: 'Failed to get item stats' });
  }
}

// ============================================
// HELPER DATA (for dropdowns)
// ============================================

export async function getApprovedQuotesForShipment(req, res) {
  try {
    const quotes = await shipmentService.getApprovedQuotesForShipment();
    res.json(quotes);
  } catch (error) {
    console.error('Error getting approved quotes:', error);
    res.status(500).json({ error: 'Failed to get approved quotes' });
  }
}

export async function getCompletedWorkOrdersForShipment(req, res) {
  try {
    const workOrders = await shipmentService.getCompletedWorkOrdersForShipment();
    res.json(workOrders);
  } catch (error) {
    console.error('Error getting completed work orders:', error);
    res.status(500).json({ error: 'Failed to get completed work orders' });
  }
}

export async function getMaterialsForShipment(req, res) {
  try {
    const materials = await shipmentService.getMaterialsForShipment();
    res.json(materials);
  } catch (error) {
    console.error('Error getting materials for shipment:', error);
    res.status(500).json({ error: 'Failed to get materials' });
  }
}

// ============================================
// IMPORT (Complete shipment with external document)
// ============================================

/**
 * Import confirmation from external system (Logo/Zirve)
 * POST /api/materials/shipments/:id/import
 * 
 * Accepts multipart/form-data with:
 * - file: optional confirmation file
 * - externalDocNumber: required external document number
 * 
 * Actions:
 * 1. Stores file in DB (if provided)
 * 2. Sets status to 'completed'
 * 3. Decreases stock for each item
 * 4. Returns stock update summary
 */
export async function importShipmentConfirmation(req, res) {
  try {
    const { id } = req.params;
    const { externalDocNumber } = req.body;

    // File is optional - multer puts it in req.file
    const file = req.file ? req.file.buffer : null;
    const fileName = req.file ? req.file.originalname : null;

    const importData = {
      externalDocNumber,
      file,
      fileName
    };

    const result = await shipmentService.importShipmentConfirmation(
      parseInt(id, 10),
      importData,
      req.user
    );

    // Audit logging - shipment.import
    logOperation({
      type: 'success',
      action: 'SHIPMENT IMPORT',
      details: {
        shipmentId: id,
        shipmentCode: result.shipment?.shipmentCode,
        externalDocNumber,
        itemsCount: result.stockUpdates?.length || 0
      },
      audit: {
        entityType: 'shipment',
        entityId: id,
        action: 'import',
        changes: {
          shipmentCode: result.shipment?.shipmentCode,
          externalDocNumber,
          stockDecreased: true,
          importedAt: new Date().toISOString(),
          hasFile: !!file
        },
        performer: { email: req.user?.email, sessionId: req.user?.sessionId },
        ipAddress: req.ip
      },
      auditFn: logAuditEvent
    });

    res.json(result);
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: error.message });
    }
    if (error.code === 'VALIDATION_ERROR') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'ALREADY_COMPLETED') {
      return res.status(400).json({ error: error.message });
    }
    if (error.code === 'INVALID_STATUS') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error importing shipment confirmation:', error);
    res.status(500).json({ error: 'Import işlemi başarısız: ' + error.message });
  }
}

// ============================================
// EXPORT (Generate export files)
// ============================================

/**
 * Export shipment in specified format
 * GET /api/materials/shipments/:id/export/:format
 * 
 * Formats: csv, xml, pdf, json
 * Query params: target (logo_tiger, logo_go, zirve) for XML
 * 
 * Returns file download
 */
export async function exportShipment(req, res) {
  try {
    const { id, format } = req.params;
    const { target = 'logo_tiger' } = req.query;

    // Validate format
    const validFormats = ['csv', 'xml', 'pdf', 'json'];
    if (!validFormats.includes(format.toLowerCase())) {
      return res.status(400).json({ error: `Geçersiz format: ${format}. Desteklenen: ${validFormats.join(', ')}` });
    }

    // Get shipment with items
    const shipment = await shipmentService.getShipmentById(id);
    if (!shipment) {
      return res.status(404).json({ error: 'Sevkiyat bulunamadı' });
    }

    // Generate export
    const result = await exportService.generateExport(shipment, format, target);

    // Update export history in DB
    await updateExportHistory(id, format);

    // Audit logging - shipment.export
    logOperation({
      type: 'success',
      action: 'SHIPMENT EXPORT',
      details: {
        shipmentId: id,
        shipmentCode: shipment?.shipmentCode,
        format,
        target
      },
      audit: {
        entityType: 'shipment',
        entityId: id,
        action: 'export',
        changes: {
          shipmentCode: shipment?.shipmentCode,
          format,
          target,
          filename: result.filename,
          exportedAt: new Date().toISOString()
        },
        performer: { email: req.user?.email, sessionId: req.user?.sessionId },
        ipAddress: req.ip
      },
      auditFn: logAuditEvent
    });

    // Set response headers for file download
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);

    // Send content (buffer for PDF, string for others)
    if (result.buffer) {
      res.send(result.buffer);
    } else {
      res.send(result.content);
    }

  } catch (error) {
    console.error('Error exporting shipment:', error);
    res.status(500).json({ error: 'Export başarısız: ' + error.message });
  }
}

/**
 * Export shipment package (Multiple formats) via POST
 * POST /api/materials/shipments/:id/export
 * 
 * Body: { target: 'logo_tiger', formats: ['xml', 'pdf'] }
 * 
 * NOTE: Currently returns the first format. For multi-file support, 'archiver' package is needed.
 */
export async function exportShipmentPackage(req, res) {
  try {
    const { id } = req.params;
    const { target = 'logo_tiger', formats = [] } = req.body;

    if (!formats || formats.length === 0) {
      return res.status(400).json({ error: 'En az bir format seçmelisiniz' });
    }

    // Get shipment with items
    const shipment = await shipmentService.getShipmentById(id);
    if (!shipment) {
      return res.status(404).json({ error: 'Sevkiyat bulunamadı' });
    }

    // For now, take the first format
    // TODO: Implement ZIP support for multiple formats using 'archiver'
    const format = formats[0];

    // Generate export
    const result = await exportService.generateExport(shipment, format, target);

    // Update export history
    await updateExportHistory(id, format);

    // Audit logging - shipment.export (from modal/package export)
    logOperation({
      type: 'success',
      action: 'SHIPMENT EXPORT',
      details: {
        shipmentId: id,
        shipmentCode: shipment?.shipmentCode,
        format,
        target,
        source: 'modal'
      },
      audit: {
        entityType: 'shipment',
        entityId: id,
        action: 'export',
        changes: {
          shipmentCode: shipment?.shipmentCode,
          format,
          target,
          filename: result.filename,
          exportedAt: new Date().toISOString()
        },
        performer: { email: req.user?.email, sessionId: req.user?.sessionId },
        ipAddress: req.ip
      },
      auditFn: logAuditEvent
    });

    // Set response headers
    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);

    if (result.buffer) {
      res.send(result.buffer);
    } else {
      res.send(result.content);
    }

  } catch (error) {
    console.error('Error exporting shipment package:', error);
    res.status(500).json({ error: 'Export başarısız: ' + error.message });
  }
}

/**
 * Update export history in shipment record
 */
async function updateExportHistory(shipmentId, format) {
  try {
    // Import db here to avoid circular dependency
    const { default: db } = await import('#db/connection');

    const shipment = await db('materials.shipments').where('id', shipmentId).first();
    const history = shipment?.exportHistory || {};

    history[format] = new Date().toISOString();

    await db('materials.shipments')
      .where('id', shipmentId)
      .update({
        exportHistory: JSON.stringify(history),
        lastExportedAt: db.fn.now(),
        status: shipment?.status === 'pending' ? 'exported' : shipment?.status,
        updatedAt: db.fn.now()
      });
  } catch (error) {
    console.error('Error updating export history:', error);
    // Don't throw - export was successful, history update is secondary
  }
}

// ============================================
// DOWNLOAD IMPORTED FILE
// ============================================

/**
 * Download imported file
 * GET /api/materials/shipments/:id/imported-file
 * 
 * Returns the imported file as download
 */
export async function downloadImportedFile(req, res) {
  try {
    const { id } = req.params;

    const { default: db } = await import('#db/connection');

    const shipment = await db('materials.shipments')
      .select('importedFile', 'importedFileUrl', 'importedFileName', 'shipmentCode')
      .where('id', id)
      .first();

    if (!shipment) {
      return res.status(404).json({ error: 'Sevkiyat bulunamadı' });
    }

    // 1. R2/URL Storage (New)
    if (shipment.importedFileUrl) {
      // If it's a full URL (R2), redirect
      if (shipment.importedFileUrl.startsWith('http')) {
        return res.redirect(shipment.importedFileUrl);
      }
      // If it's a local path (e.g. /uploads/...), redirect
      return res.redirect(shipment.importedFileUrl);
    }

    // 2. DB BLOB Storage (Legacy)
    if (!shipment.importedFile) {
      return res.status(404).json({ error: 'Bu sevkiyat için yüklenmiş dosya bulunamadı' });
    }

    const fileName = shipment.importedFileName || `${shipment.shipmentCode}_import`;

    // Determine content type from filename
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const contentTypes = {
      'pdf': 'application/pdf',
      'xml': 'application/xml',
      'csv': 'text/csv',
      'json': 'application/json',
      'txt': 'text/plain',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(shipment.importedFile);

  } catch (error) {
    console.error('Error downloading imported file:', error);
    res.status(500).json({ error: 'Dosya indirilemedi: ' + error.message });
  }
}
