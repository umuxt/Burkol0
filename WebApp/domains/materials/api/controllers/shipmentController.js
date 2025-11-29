/**
 * Shipment Controller
 * HTTP handlers for outgoing shipments
 */

import * as shipmentService from '../services/shipmentService.js';

export async function createShipment(req, res) {
  try {
    const createdBy = req.user?.email || 'system';
    const shipment = await shipmentService.createShipment(req.body, createdBy);
    res.status(201).json(shipment);
  } catch (error) {
    console.error('Error creating shipment:', error);
    res.status(500).json({ error: 'Failed to create shipment', details: error.message });
  }
}

export async function getShipments(req, res) {
  try {
    const filters = {
      status: req.query.status,
      workOrderCode: req.query.workOrderCode,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      limit: req.query.limit ? parseInt(req.query.limit) : 100
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
