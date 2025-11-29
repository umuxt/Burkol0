/**
 * Shipment Controller
 * HTTP handlers for outgoing shipments with multi-item support
 */

import * as shipmentService from '../services/shipmentService.js';

// ============================================
// SHIPMENT CRUD (Header)
// ============================================

export async function createShipment(req, res) {
  try {
    const result = await shipmentService.createShipment(req.body, req.user);
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
