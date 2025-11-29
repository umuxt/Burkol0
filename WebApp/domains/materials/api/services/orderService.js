/**
 * Order Service
 * Handles purchase orders and deliveries
 */

import Orders from '#db/models/orders';
import OrderItems from '#db/models/orderItems';
import Materials from '#db/models/materials';
import Suppliers from '#db/models/suppliers';

// Cache configuration
const CACHE_TTL_MS = 2000;
const cache = {
  orders: { data: null, ts: 0 },
  stats: { data: null, ts: 0 },
  activeMaterials: { data: null, ts: 0 }
};

function invalidateCache() {
  cache.orders.data = null;
  cache.stats.data = null;
  cache.activeMaterials.data = null;
}

/**
 * Create new order with items
 */
export async function createOrder(orderData, createdBy) {
  // Validate supplier
  if (orderData.supplierId) {
    const supplier = await Suppliers.getSupplierById(orderData.supplierId);
    if (!supplier) {
      const error = new Error('Invalid supplier');
      error.code = 'INVALID_SUPPLIER';
      throw error;
    }
  }

  // Validate and enrich items with material details
  if (orderData.items && orderData.items.length > 0) {
    for (const item of orderData.items) {
      if (!item.materialCode) {
        const error = new Error('Material code is required for each item');
        error.code = 'MISSING_MATERIAL_CODE';
        throw error;
      }

      const material = await Materials.getMaterialByCode(item.materialCode);
      if (!material) {
        const error = new Error(`Invalid material code: ${item.materialCode}`);
        error.code = 'INVALID_MATERIAL';
        throw error;
      }

      item.materialId = material.id;
      item.materialName = material.name;
      item.unit = item.unit || material.unit;
    }
  }

  const createdOrder = await Orders.createOrder(
    {
      supplierId: orderData.supplierId,
      supplierName: orderData.supplierName,
      orderDate: orderData.orderDate || new Date().toISOString().split('T')[0],
      expectedDeliveryDate: orderData.expectedDeliveryDate || null,
      notes: orderData.notes || null,
      createdBy
    },
    orderData.items || []
  );

  invalidateCache();
  return createdOrder;
}

/**
 * Get all orders with optional filtering
 */
export async function getOrders(filters = {}) {
  const now = Date.now();
  
  // Check cache for unfiltered requests
  if (!filters.status && !filters.supplierId && !filters.startDate && !filters.endDate) {
    if (cache.orders.data && (now - cache.orders.ts) < CACHE_TTL_MS) {
      return cache.orders.data;
    }
  }

  const orders = await Orders.getAllOrders({
    status: filters.status,
    supplierId: filters.supplierId ? parseInt(filters.supplierId, 10) : undefined,
    startDate: filters.startDate,
    endDate: filters.endDate,
    includeItems: true
  });

  // Update cache for unfiltered
  if (!filters.status && !filters.supplierId && !filters.startDate && !filters.endDate) {
    cache.orders.data = orders;
    cache.orders.ts = now;
  }

  return orders;
}

/**
 * Get order by ID
 */
export async function getOrderById(orderId) {
  const id = parseInt(orderId, 10);
  if (isNaN(id)) {
    const error = new Error('Invalid order ID');
    error.code = 'INVALID_ID';
    throw error;
  }

  return Orders.getOrderById(id);
}

/**
 * Update order
 */
export async function updateOrder(orderId, updates) {
  const id = parseInt(orderId, 10);
  if (isNaN(id)) {
    const error = new Error('Invalid order ID');
    error.code = 'INVALID_ID';
    throw error;
  }

  const updatedOrder = await Orders.updateOrder(id, updates);
  invalidateCache();
  return updatedOrder;
}

/**
 * Get order statistics
 */
export async function getOrderStats() {
  const now = Date.now();
  
  if (cache.stats.data && (now - cache.stats.ts) < CACHE_TTL_MS) {
    return cache.stats.data;
  }

  const stats = await Orders.getOrderStats();
  cache.stats.data = stats;
  cache.stats.ts = now;

  return stats;
}

/**
 * Get active materials from pending orders
 */
export async function getActiveMaterials() {
  const now = Date.now();
  
  if (cache.activeMaterials.data && (now - cache.activeMaterials.ts) < CACHE_TTL_MS) {
    return cache.activeMaterials.data;
  }

  const pendingItems = await OrderItems.getPendingDeliveries();

  // Group by material
  const materialsMap = new Map();
  for (const item of pendingItems) {
    const key = item.materialId;
    if (!materialsMap.has(key)) {
      materialsMap.set(key, {
        materialId: item.materialId,
        materialCode: item.materialCode,
        materialName: item.materialName,
        unit: item.unit,
        totalQuantity: 0,
        orderCount: 0,
        orders: []
      });
    }

    const material = materialsMap.get(key);
    material.totalQuantity += parseFloat(item.quantity);
    material.orders.push({
      orderId: item.orderId,
      orderCode: item.orderCode,
      quantity: item.quantity,
      expectedDeliveryDate: item.expectedDeliveryDate,
      itemStatus: item.itemStatus
    });
    material.orderCount = material.orders.length;
  }

  const activeMaterials = Array.from(materialsMap.values());
  cache.activeMaterials.data = activeMaterials;
  cache.activeMaterials.ts = now;

  return activeMaterials;
}

/**
 * Get delivery status for all orders
 */
export async function getDeliveryStatus() {
  return OrderItems.getDeliveryStats();
}

/**
 * Get delivery status for specific order
 */
export async function getOrderDeliveryStatus(orderId) {
  const id = parseInt(orderId, 10);
  const items = await OrderItems.getItemsByOrder(id);

  const statusCounts = items.reduce((acc, item) => {
    acc[item.itemStatus] = (acc[item.itemStatus] || 0) + 1;
    return acc;
  }, {});

  const totalItems = items.length;
  const deliveredCount = statusCounts['Teslim Edildi'] || 0;
  const pendingCount = (statusCounts['Onay Bekliyor'] || 0) + (statusCounts['Onaylandı'] || 0);

  return {
    totalItems,
    deliveredCount,
    pendingCount,
    statusCounts,
    completionPercentage: totalItems > 0 ? (deliveredCount / totalItems) * 100 : 0
  };
}

/**
 * Update order item
 */
export async function updateOrderItem(orderId, itemId, updates) {
  const oId = parseInt(orderId, 10);
  const iId = parseInt(itemId, 10);

  if (isNaN(oId) || isNaN(iId)) {
    const error = new Error('Invalid order or item ID');
    error.code = 'INVALID_ID';
    throw error;
  }

  const updatedItem = await OrderItems.updateItemStatus(iId, updates.itemStatus, updates);
  await Orders.updateOrderStatus(oId);
  
  const updatedOrder = await Orders.getOrderById(oId);
  invalidateCache();

  return {
    item: updatedItem,
    orderStatus: updatedOrder.orderStatus
  };
}

/**
 * Deliver order item and update stock
 */
export async function deliverItem(orderId, itemId, deliveryData, deliveredBy) {
  const oId = parseInt(orderId, 10);
  const iId = parseInt(itemId, 10);

  if (isNaN(oId) || isNaN(iId)) {
    const error = new Error('Invalid order or item ID');
    error.code = 'INVALID_ID';
    throw error;
  }

  // Validate dates if provided
  if (deliveryData?.manufacturingDate && deliveryData?.expiryDate) {
    const mfgDate = new Date(deliveryData.manufacturingDate);
    const expDate = new Date(deliveryData.expiryDate);
    const today = new Date();

    if (mfgDate > today) {
      const error = new Error('Manufacturing date cannot be in the future');
      error.code = 'INVALID_MFG_DATE';
      throw error;
    }

    if (expDate <= today) {
      const error = new Error('Expiry date must be in the future');
      error.code = 'INVALID_EXP_DATE';
      throw error;
    }

    if (expDate <= mfgDate) {
      const error = new Error('Expiry date must be after manufacturing date');
      error.code = 'INVALID_DATE_RANGE';
      throw error;
    }
  }

  const result = await OrderItems.deliverItem(iId, {
    deliveredBy,
    actualDeliveryDate: deliveryData?.actualDeliveryDate || new Date(),
    notes: deliveryData?.notes,
    supplierLotCode: deliveryData?.supplierLotCode,
    manufacturingDate: deliveryData?.manufacturingDate,
    expiryDate: deliveryData?.expiryDate
  });

  const updatedOrder = await Orders.updateOrderStatus(oId);
  invalidateCache();

  return {
    ...result,
    orderStatus: updatedOrder.orderStatus
  };
}
