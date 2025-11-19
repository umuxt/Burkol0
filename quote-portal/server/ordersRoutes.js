/**
 * Orders API Routes - PostgreSQL Backend
 * Handles order creation, item management, and stock updates
 * Migrated from Firebase to PostgreSQL
 */

import express from 'express';
import { requireAuth } from './auth.js';
import Orders from '../db/models/orders.js';
import OrderItems from '../db/models/orderItems.js';
import Materials from '../db/models/materials.js';
import Suppliers from '../db/models/suppliers.js';

const router = express.Router();

// Cache configuration
const CACHE_TTL_MS = Number(process.env.ORDERS_CACHE_TTL_MS || 2_000); // 2 seconds - minimal cache for event-driven system
const cache = {
  orders: { data: null, ts: 0, etag: '' },
  stats: { data: null, ts: 0, etag: '' },
  activeMaterials: { data: null, ts: 0, etag: '' }
};

function buildEtag(payload) {
  try {
    const src = Array.isArray(payload) 
      ? `${payload.length}:${payload[0]?.id || ''}:${payload[payload.length-1]?.id || ''}`
      : JSON.stringify(Object.keys(payload || {}).sort()).slice(0, 128);
    return 'W/"' + Buffer.from(src).toString('base64').slice(0, 16) + '"';
  } catch {
    return 'W/"0"';
  }
}

// Cache invalidation utility
function invalidateOrdersCache(reason = 'manual') {
  console.log(`🔄 CACHE INVALIDATION: Clearing orders cache - reason: ${reason}`);
  cache.orders.data = null;
  cache.orders.ts = 0;
  cache.orders.etag = '';
}

// Auth middleware
router.use(requireAuth);

// Debug middleware
router.use((req, res, next) => {
  console.log(`🔍 Orders API: ${req.method} ${req.path} - Full URL: ${req.originalUrl}`);
  next();
});

/**
 * POST /api/orders - Create new order with auto-generated codes
 */
router.post('/orders', async (req, res) => {
  try {
    console.log('📦 POST /api/orders - Request body:', JSON.stringify(req.body, null, 2));
    
    const { orderData } = req.body;
    
    if (!orderData) {
      console.error('❌ Missing orderData in request');
      return res.status(400).json({ error: 'Order data is required' });
    }
    
    console.log('📋 Order data:', JSON.stringify(orderData, null, 2));
    
    // Validate supplier
    if (orderData.supplierId) {
      const supplier = await Suppliers.getSupplierById(orderData.supplierId);
      if (!supplier) {
        return res.status(400).json({ error: 'Invalid supplier' });
      }
    }
    
    // Validate materials in items
    if (orderData.items && orderData.items.length > 0) {
      for (const item of orderData.items) {
        // Frontend sends materialCode, validate and enrich with material details
        if (item.materialCode) {
          const material = await Materials.getMaterialByCode(item.materialCode);
          if (!material) {
            return res.status(400).json({ error: `Invalid material code: ${item.materialCode}` });
          }
          
          // Enrich item with material details (use actual schema field names)
          item.materialId = material.id; // Add materialId for foreign key
          item.materialName = material.name;
          item.unit = item.unit || material.unit;
        } else {
          return res.status(400).json({ error: 'Material code is required for each item' });
        }
      }
    }
    
    // Create order with items
    const createdOrder = await Orders.createOrder(
      {
        supplierId: orderData.supplierId,
        supplierName: orderData.supplierName,
        orderDate: orderData.orderDate || new Date().toISOString().split('T')[0],
        expectedDeliveryDate: orderData.expectedDeliveryDate || null, // Convert empty string to null
        notes: orderData.notes || null,
        createdBy: req.user?.email || 'system'
      },
      orderData.items || []
    );
    
    // Invalidate cache
    invalidateOrdersCache('order_created');
    
    res.status(201).json({
      message: 'Order created successfully',
      order: createdOrder
    });
    
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ 
      error: 'Failed to create order',
      details: error.message 
    });
  }
});

/**
 * GET /api/orders - Get all orders with optional filtering
 */
router.get('/orders', async (req, res) => {
  try {
    const { status, supplierId, startDate, endDate } = req.query;
    
    // Check cache
    const now = Date.now();
    if (cache.orders.data && (now - cache.orders.ts) < CACHE_TTL_MS) {
      const etag = buildEtag(cache.orders.data);
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }
      res.setHeader('ETag', etag);
      res.setHeader('X-Cache-Hit', 'true');
      return res.json(cache.orders.data); // Already in {orders: [...]} format
    }
    
    // Fetch from database
    const orders = await Orders.getAllOrders({
      status,
      supplierId: supplierId ? parseInt(supplierId, 10) : undefined,
      startDate,
      endDate,
      includeItems: true
    });
    
    // Convert snake_case to camelCase for frontend
    const normalizedOrders = orders.map(order => ({
      ...order,
      orderStatus: order.order_status,
      orderCode: order.order_code,
      orderSequence: order.order_sequence,
      supplierId: order.supplier_id,
      supplierName: order.supplier_name,
      orderDate: order.order_date,
      expectedDeliveryDate: order.expected_delivery_date,
      totalAmount: order.total_amount,
      itemCount: order.item_count,
      createdBy: order.created_by,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      items: (order.items || []).map(item => ({
        ...item,
        itemCode: item.item_code,
        itemSequence: item.item_sequence,
        orderId: item.order_id,
        orderCode: item.order_code,
        materialId: item.material_id,
        materialCode: item.material_code,
        materialName: item.material_name,
        unitPrice: item.unit_price,
        totalPrice: item.total_price,
        itemStatus: item.item_status,
        expectedDeliveryDate: item.expected_delivery_date,
        actualDeliveryDate: item.actual_delivery_date,
        deliveredBy: item.delivered_by,
        createdAt: item.created_at,
        updatedAt: item.updated_at
      }))
    }));
    
    // Update cache
    const response = { orders: normalizedOrders };
    cache.orders.data = response;
    cache.orders.ts = now;
    const etag = buildEtag(response);
    cache.orders.etag = etag;
    
    res.setHeader('ETag', etag);
    res.setHeader('X-Cache-Hit', 'false');
    res.json(response);
    
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ 
      error: 'Failed to fetch orders',
      details: error.message 
    });
  }
});

/**
 * GET /api/orders/stats - Get order statistics
 */
router.get('/orders/stats', async (req, res) => {
  try {
    // Check cache
    const now = Date.now();
    if (cache.stats.data && (now - cache.stats.ts) < CACHE_TTL_MS) {
      const etag = buildEtag(cache.stats.data);
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }
      res.setHeader('ETag', etag);
      res.setHeader('X-Cache-Hit', 'true');
      return res.json(cache.stats.data);
    }
    
    const stats = await Orders.getOrderStats();
    
    // Update cache
    cache.stats.data = stats;
    cache.stats.ts = now;
    const etag = buildEtag(stats);
    cache.stats.etag = etag;
    
    res.setHeader('ETag', etag);
    res.setHeader('X-Cache-Hit', 'false');
    res.json(stats);
    
  } catch (error) {
    console.error('Error fetching order stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch order stats',
      details: error.message 
    });
  }
});

/**
 * GET /api/orders/materials/active - Get active materials from pending orders
 */
router.get('/orders/materials/active', async (req, res) => {
  try {
    // Check cache
    const now = Date.now();
    if (cache.activeMaterials.data && (now - cache.activeMaterials.ts) < CACHE_TTL_MS) {
      const etag = buildEtag(cache.activeMaterials.data);
      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }
      res.setHeader('ETag', etag);
      res.setHeader('X-Cache-Hit', 'true');
      return res.json(cache.activeMaterials.data);
    }
    
    // Get pending deliveries
    const pendingItems = await OrderItems.getPendingDeliveries();
    
    // Group by material
    const materialsMap = new Map();
    for (const item of pendingItems) {
      const key = item.material_id;
      if (!materialsMap.has(key)) {
        materialsMap.set(key, {
          materialId: item.material_id,
          materialCode: item.material_code,
          materialName: item.material_name,
          unit: item.unit,
          totalQuantity: 0,
          orderCount: 0,
          orders: []
        });
      }
      
      const material = materialsMap.get(key);
      material.totalQuantity += parseFloat(item.quantity);
      material.orders.push({
        orderId: item.order_id,
        orderCode: item.order_code,
        quantity: item.quantity,
        expectedDeliveryDate: item.expected_delivery_date,
        itemStatus: item.item_status
      });
      material.orderCount = material.orders.length;
    }
    
    const activeMaterials = Array.from(materialsMap.values());
    
    // Update cache
    cache.activeMaterials.data = activeMaterials;
    cache.activeMaterials.ts = now;
    const etag = buildEtag(activeMaterials);
    cache.activeMaterials.etag = etag;
    
    res.setHeader('ETag', etag);
    res.setHeader('X-Cache-Hit', 'false');
    res.json(activeMaterials);
    
  } catch (error) {
    console.error('Error fetching active materials:', error);
    res.status(500).json({ 
      error: 'Failed to fetch active materials',
      details: error.message 
    });
  }
});

/**
 * GET /api/orders/delivery-status - Get overall delivery status
 */
router.get('/orders/delivery-status', async (req, res) => {
  try {
    const stats = await OrderItems.getDeliveryStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching delivery status:', error);
    res.status(500).json({ 
      error: 'Failed to fetch delivery status',
      details: error.message 
    });
  }
});

/**
 * GET /api/orders/:orderId - Get single order by ID
 */
router.get('/orders/:orderId', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }
    
    const order = await Orders.getOrderById(orderId);
    
    // Convert snake_case to camelCase for frontend
    const normalizedOrder = {
      ...order,
      orderStatus: order.order_status,
      orderCode: order.order_code,
      orderSequence: order.order_sequence,
      supplierId: order.supplier_id,
      supplierName: order.supplier_name,
      orderDate: order.order_date,
      expectedDeliveryDate: order.expected_delivery_date,
      totalAmount: order.total_amount,
      itemCount: order.item_count,
      createdBy: order.created_by,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      items: (order.items || []).map(item => ({
        ...item,
        itemCode: item.item_code,
        itemSequence: item.item_sequence,
        orderId: item.order_id,
        orderCode: item.order_code,
        materialId: item.material_id,
        materialCode: item.material_code,
        materialName: item.material_name,
        unitPrice: item.unit_price,
        totalPrice: item.total_price,
        itemStatus: item.item_status,
        expectedDeliveryDate: item.expected_delivery_date,
        actualDeliveryDate: item.actual_delivery_date,
        deliveredBy: item.delivered_by,
        createdAt: item.created_at,
        updatedAt: item.updated_at
      }))
    };
    
    res.json(normalizedOrder);
    
  } catch (error) {
    if (error.message === 'Order not found') {
      return res.status(404).json({ error: 'Order not found' });
    }
    console.error('Error fetching order:', error);
    res.status(500).json({ 
      error: 'Failed to fetch order',
      details: error.message 
    });
  }
});

/**
 * GET /api/orders/:orderId/delivery-status - Get delivery status for specific order
 */
router.get('/orders/:orderId/delivery-status', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }
    
    const items = await OrderItems.getItemsByOrder(orderId);
    
    const statusCounts = items.reduce((acc, item) => {
      acc[item.item_status] = (acc[item.item_status] || 0) + 1;
      return acc;
    }, {});
    
    const totalItems = items.length;
    const deliveredCount = statusCounts['Teslim Edildi'] || 0;
    const pendingCount = (statusCounts['Onay Bekliyor'] || 0) + (statusCounts['Onaylandı'] || 0);
    
    res.json({
      totalItems,
      deliveredCount,
      pendingCount,
      statusCounts,
      completionPercentage: totalItems > 0 ? (deliveredCount / totalItems) * 100 : 0
    });
    
  } catch (error) {
    console.error('Error fetching order delivery status:', error);
    res.status(500).json({ 
      error: 'Failed to fetch order delivery status',
      details: error.message 
    });
  }
});

/**
 * PUT /api/orders/:orderId - Update order
 */
router.put('/orders/:orderId', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    
    if (isNaN(orderId)) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }
    
    // Accept both direct fields and updates wrapper
    const updates = req.body.updates || req.body;
    
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Updates are required' });
    }
    
    const updatedOrder = await Orders.updateOrder(orderId, updates);
    
    // Invalidate cache
    invalidateOrdersCache('order_updated');
    
    res.json({
      message: 'Order updated successfully',
      order: updatedOrder
    });
    
  } catch (error) {
    if (error.message === 'Order not found') {
      return res.status(404).json({ error: 'Order not found' });
    }
    console.error('Error updating order:', error);
    res.status(500).json({ 
      error: 'Failed to update order',
      details: error.message 
    });
  }
});

/**
 * PUT /api/orders/:orderId/items/:itemId - Update order item
 */
router.put('/orders/:orderId/items/:itemId', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    const itemId = parseInt(req.params.itemId, 10);
    
    if (isNaN(orderId) || isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid order or item ID' });
    }
    
    // Accept both direct fields and updates wrapper
    const updates = req.body.updates || req.body;
    
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Updates are required' });
    }
    
    // Normalize field names (support both camelCase and snake_case)
    const itemStatus = updates.itemStatus || updates.item_status;
    
    // Update item
    const updatedItem = await OrderItems.updateItemStatus(
      itemId,
      itemStatus,
      updates
    );
    
    // Update order status based on all item statuses
    await Orders.updateOrderStatus(orderId);
    
    // Get updated order to return current status
    const updatedOrder = await Orders.getOrderById(orderId);
    
    // Normalize item response
    const normalizedItem = {
      ...updatedItem,
      itemCode: updatedItem.item_code,
      itemSequence: updatedItem.item_sequence,
      orderId: updatedItem.order_id,
      orderCode: updatedItem.order_code,
      materialId: updatedItem.material_id,
      materialCode: updatedItem.material_code,
      materialName: updatedItem.material_name,
      unitPrice: updatedItem.unit_price,
      totalPrice: updatedItem.total_price,
      itemStatus: updatedItem.item_status,
      expectedDeliveryDate: updatedItem.expected_delivery_date,
      actualDeliveryDate: updatedItem.actual_delivery_date,
      deliveredBy: updatedItem.delivered_by,
      createdAt: updatedItem.created_at,
      updatedAt: updatedItem.updated_at
    };
    
    // Invalidate cache
    invalidateOrdersCache('item_updated');
    
    res.json({
      message: 'Order item updated successfully',
      item: normalizedItem,
      order_status: updatedOrder.order_status,
      order_statusChanged: true
    });
    
  } catch (error) {
    if (error.message === 'Order item not found') {
      return res.status(404).json({ error: 'Order item not found' });
    }
    console.error('Error updating order item:', error);
    res.status(500).json({ 
      error: 'Failed to update order item',
      details: error.message 
    });
  }
});

/**
 * PUT /api/orders/:orderId/items/:itemId/deliver - Deliver item and update stock
 * This is the critical endpoint that links orders to inventory
 */
router.put('/orders/:orderId/items/:itemId/deliver', async (req, res) => {
  try {
    const orderId = parseInt(req.params.orderId, 10);
    const itemId = parseInt(req.params.itemId, 10);
    const { deliveryData } = req.body;
    
    if (isNaN(orderId) || isNaN(itemId)) {
      return res.status(400).json({ error: 'Invalid order or item ID' });
    }
    
    // Deliver item (updates stock automatically)
    const result = await OrderItems.deliverItem(itemId, {
      deliveredBy: req.user?.email || 'system',
      actualDeliveryDate: deliveryData?.actualDeliveryDate || new Date(),
      notes: deliveryData?.notes
    });
    
    // Update order status based on item statuses
    const updatedOrder = await Orders.updateOrderStatus(orderId);
    
    // Invalidate cache
    invalidateOrdersCache('item_delivered');
    
    res.json({
      message: 'Item delivered successfully',
      item: result.item,
      stockUpdate: result.stockUpdate,
      orderStatus: updatedOrder.order_status
    });
    
  } catch (error) {
    if (error.message === 'Order item not found') {
      return res.status(404).json({ error: 'Order item not found' });
    }
    if (error.message === 'Item already delivered') {
      return res.status(400).json({ error: 'Item already delivered' });
    }
    console.error('Error delivering item:', error);
    res.status(500).json({ 
      error: 'Failed to deliver item',
      details: error.message 
    });
  }
});

export default router;
