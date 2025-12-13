/**
 * Order Controller
 * HTTP handlers for purchase orders
 */

import * as orderService from '../services/orderService.js';
import { logAuditEvent } from '../../../../server/auditTrail.js';
import { logOperation } from '../../../../server/utils/logger.js';

export async function createOrder(req, res) {
  try {
    const { orderData } = req.body;

    if (!orderData) {
      return res.status(400).json({ error: 'Order data is required' });
    }

    const createdBy = req.user?.email || 'system';
    const order = await orderService.createOrder(orderData, createdBy);

    // P1.7: Audit log
    const itemsSummary = (order.items || orderData.items || []).slice(0, 3).map(i =>
      `${i.materialCode}: ${i.quantity} ${i.unit || 'adet'}`
    ).join(', ');

    logOperation({
      type: 'success',
      action: 'ORDER CREATE',
      details: {
        orderId: order.id,
        orderCode: order.orderCode,
        supplier: order.supplierName || order.supplierId,
        itemsCount: order.items?.length || orderData.items?.length || 0,
        items: itemsSummary || '-',
        deliveryDate: orderData.estimatedDelivery || orderData.expectedDeliveryDate || '-'
      },
      audit: {
        entityType: 'order',
        entityId: order.id,
        action: 'create',
        changes: {
          orderCode: order.orderCode,
          totalAmount: order.totalAmount,
          items: order.items || orderData.items
        },
        performer: { email: req.user?.email, sessionId: req.user?.sessionId },
        ipAddress: req.ip
      },
      auditFn: logAuditEvent
    });

    res.status(201).json({
      message: 'Order created successfully',
      order
    });
  } catch (error) {
    if (error.code === 'INVALID_SUPPLIER') {
      return res.status(400).json({ error: 'Invalid supplier' });
    }
    if (error.code === 'MISSING_MATERIAL_CODE') {
      return res.status(400).json({ error: 'Material code is required for each item' });
    }
    if (error.code === 'INVALID_MATERIAL') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order', details: error.message });
  }
}

export async function getOrders(req, res) {
  try {
    const filters = {
      status: req.query.status,
      supplierId: req.query.supplierId,
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };

    const orders = await orderService.getOrders(filters);
    res.json({ orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders', details: error.message });
  }
}

export async function getOrderById(req, res) {
  try {
    const order = await orderService.getOrderById(req.params.orderId);
    res.json(order);
  } catch (error) {
    if (error.code === 'INVALID_ID') {
      return res.status(400).json({ error: 'Invalid order ID' });
    }
    if (error.message === 'Order not found') {
      return res.status(404).json({ error: 'Order not found' });
    }
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order', details: error.message });
  }
}

export async function updateOrder(req, res) {
  try {
    const updates = req.body.updates || req.body;

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Updates are required' });
    }

    const order = await orderService.updateOrder(req.params.orderId, updates);

    res.json({
      message: 'Order updated successfully',
      order
    });
  } catch (error) {
    if (error.code === 'INVALID_ID') {
      return res.status(400).json({ error: 'Invalid order ID' });
    }
    if (error.message === 'Order not found') {
      return res.status(404).json({ error: 'Order not found' });
    }
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order', details: error.message });
  }
}

export async function getOrderStats(req, res) {
  try {
    const stats = await orderService.getOrderStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching order stats:', error);
    res.status(500).json({ error: 'Failed to fetch order stats', details: error.message });
  }
}

export async function getActiveMaterials(req, res) {
  try {
    const materials = await orderService.getActiveMaterials();
    res.json(materials);
  } catch (error) {
    console.error('Error fetching active materials:', error);
    res.status(500).json({ error: 'Failed to fetch active materials', details: error.message });
  }
}

export async function getDeliveryStatus(req, res) {
  try {
    const stats = await orderService.getDeliveryStatus();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching delivery status:', error);
    res.status(500).json({ error: 'Failed to fetch delivery status', details: error.message });
  }
}

export async function getOrderDeliveryStatus(req, res) {
  try {
    const status = await orderService.getOrderDeliveryStatus(req.params.orderId);
    res.json(status);
  } catch (error) {
    if (error.code === 'INVALID_ID') {
      return res.status(400).json({ error: 'Invalid order ID' });
    }
    console.error('Error fetching order delivery status:', error);
    res.status(500).json({ error: 'Failed to fetch order delivery status', details: error.message });
  }
}

export async function updateOrderItem(req, res) {
  try {
    const { orderId, itemId } = req.params;
    const updates = req.body.updates || req.body;

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Updates are required' });
    }

    const result = await orderService.updateOrderItem(orderId, itemId, updates);

    // P1.7: Audit log (status değişikliği)
    if (updates.status) {
      logOperation({
        type: 'success',
        action: 'ORDER ITEM UPDATE',
        details: {
          orderId,
          itemId,
          newStatus: updates.status,
          materialCode: result.item?.materialCode || '-'
        },
        audit: {
          entityType: 'order',
          entityId: orderId,
          action: 'item_update',
          changes: {
            itemId,
            status: updates.status
          },
          performer: { email: req.user?.email, sessionId: req.user?.sessionId },
          ipAddress: req.ip
        },
        auditFn: logAuditEvent
      });
    }

    res.json({
      message: 'Order item updated successfully',
      item: result.item,
      orderStatus: result.orderStatus,
      orderStatusChanged: true
    });
  } catch (error) {
    if (error.code === 'INVALID_ID') {
      return res.status(400).json({ error: 'Invalid order or item ID' });
    }
    if (error.message === 'Order item not found') {
      return res.status(404).json({ error: 'Order item not found' });
    }
    console.error('Error updating order item:', error);
    res.status(500).json({ error: 'Failed to update order item', details: error.message });
  }
}

export async function deliverItem(req, res) {
  try {
    const { orderId, itemId } = req.params;
    const { deliveryData } = req.body;
    const deliveredBy = req.user?.email || 'system';

    const result = await orderService.deliverItem(orderId, itemId, deliveryData, deliveredBy);

    // P1.7: Audit log
    const qty = deliveryData?.quantity || result.item?.quantity || result.stockUpdate?.quantity || '-';
    const oldStock = result.stockUpdate?.oldStock ?? result.stockUpdate?.previousStock ?? '-';
    const newStock = result.stockUpdate?.newStock ?? '-';
    const stockChange = oldStock !== '-' && newStock !== '-' ? `${oldStock} → ${newStock}` : '-';

    logOperation({
      type: 'success',
      action: 'ORDER DELIVER',
      details: {
        orderId,
        itemId,
        materialCode: result.item?.materialCode || '-',
        quantity: qty,
        stockChange,
        lotNumber: result.lotNumber || 'N/A'
      },
      audit: {
        entityType: 'order',
        entityId: orderId,
        action: 'deliver',
        changes: {
          itemId,
          materialCode: result.item?.materialCode,
          quantityDelivered: qty,
          stockBefore: oldStock,
          stockAfter: newStock
        },
        performer: { email: req.user?.email, sessionId: req.user?.sessionId },
        ipAddress: req.ip
      },
      auditFn: logAuditEvent
    });

    res.json({
      message: 'Item delivered successfully',
      item: result.item,
      stockUpdate: result.stockUpdate,
      lotNumber: result.lotNumber,
      orderStatus: result.orderStatus
    });
  } catch (error) {
    if (error.code === 'INVALID_ID') {
      return res.status(400).json({ error: 'Invalid order or item ID' });
    }
    if (error.code === 'INVALID_MFG_DATE') {
      return res.status(400).json({ error: 'Manufacturing date cannot be in the future' });
    }
    if (error.code === 'INVALID_EXP_DATE') {
      return res.status(400).json({ error: 'Expiry date must be in the future' });
    }
    if (error.code === 'INVALID_DATE_RANGE') {
      return res.status(400).json({ error: 'Expiry date must be after manufacturing date' });
    }
    if (error.message === 'Order item not found') {
      return res.status(404).json({ error: 'Order item not found' });
    }
    if (error.message === 'Item already delivered') {
      return res.status(400).json({ error: 'Item already delivered' });
    }
    console.error('Error delivering item:', error);
    res.status(500).json({ error: 'Failed to deliver item', details: error.message });
  }
}
