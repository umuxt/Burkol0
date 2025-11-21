/**
 * Orders Model
 * Manages order CRUD operations with PostgreSQL
 */

import db from '../connection.js';

const Orders = {
  /**
   * Create new order with items
   * @param {Object} orderData - Order header data
   * @param {Array} items - Array of order items
   * @returns {Object} Created order with items
   */
  async createOrder(orderData, items = []) {
    const trx = await db.transaction();
    
    try {
      const { supplierId, supplierName, orderDate, expectedDeliveryDate, notes, createdBy } = orderData;
      
      // Get current year for sequence
      const orderYear = new Date(orderDate || new Date()).getFullYear();
      
      // Generate order code using PostgreSQL function
      const result = await trx.raw(
        'SELECT materials.generate_order_code(?)',
        [orderYear]
      );
      const orderCode = result.rows[0].generate_order_code;
      
      // Extract sequence number from order code (ORD-2025-0001 → 1)
      const orderSequence = parseInt(orderCode.split('-')[2], 10);
      
      // Calculate totals from items
      const totalAmount = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
      const itemCount = items.length;
      
      // Insert order
      const [order] = await trx('materials.orders').insert({
        orderCode: orderCode,
        orderSequence: orderSequence,
        supplierId: supplierId,
        supplierName: supplierName,
        orderDate: orderDate || new Date(),
        expectedDeliveryDate: expectedDeliveryDate,
        totalAmount: totalAmount,
        itemCount: itemCount,
        notes,
        createdBy: createdBy,
        orderStatus: 'Taslak'
      }).returning('*');
      
      // Insert items if provided
      let orderItems = [];
      if (items.length > 0) {
        const itemsData = items.map((item, index) => ({
          itemCode: `${orderCode}-item-${String(index + 1).padStart(2, '0')}`, // Unique per order
          itemSequence: index + 1,
          orderId: order.id,
          orderCode: orderCode,
          materialId: item.materialId,
          materialCode: item.materialCode,
          materialName: item.materialName,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          expectedDeliveryDate: item.expectedDeliveryDate || expectedDeliveryDate,
          notes: item.notes,
          itemStatus: 'Onay Bekliyor'
        }));
        
        orderItems = await trx('materials.order_items').insert(itemsData).returning('*');
      }
      
      await trx.commit();
      
      return {
        ...order,
        items: orderItems
      };
      
    } catch (error) {
      await trx.rollback();
      console.error('Error creating order:', error);
      throw error;
    }
  },

  /**
   * Get all orders with optional filtering
   * @param {Object} filters - Filter options
   * @returns {Array} Array of orders
   */
  async getAllOrders(filters = {}) {
    const { status, supplierId, startDate, endDate, includeItems = true } = filters;
    
    let query = db('materials.orders').select('*');
    
    if (status) {
      query = query.where('orderStatus', status);
    }
    
    if (supplierId) {
      query = query.where('supplierId', supplierId);
    }
    
    if (startDate) {
      query = query.where('orderDate', '>=', startDate);
    }
    
    if (endDate) {
      query = query.where('orderDate', '<=', endDate);
    }
    
    query = query.orderBy('orderDate', 'desc');
    
    const orders = await query;
    
    // Include items if requested
    if (includeItems && orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const items = await db('materials.order_items')
        .whereIn('orderId', orderIds)
        .orderBy('itemSequence');
      
      // Group items by order
      const itemsByOrder = items.reduce((acc, item) => {
        if (!acc[item.orderId]) acc[item.orderId] = [];
        acc[item.orderId].push(item);
        return acc;
      }, {});
      
      return orders.map(order => ({
        ...order,
        items: itemsByOrder[order.id] || []
      }));
    }
    
    return orders;
  },

  /**
   * Get order by ID
   * @param {number} orderId - Order ID
   * @returns {Object} Order with items
   */
  async getOrderById(orderId) {
    const order = await db('materials.orders').where({ id: orderId }).first();
    
    if (!order) {
      throw new Error('Order not found');
    }
    
    const items = await db('materials.order_items')
      .where({ orderId: orderId })
      .orderBy('itemSequence');
    
    return {
      ...order,
      items
    };
  },

  /**
   * Update order header
   * @param {number} orderId - Order ID
   * @param {Object} updates - Fields to update
   * @returns {Object} Updated order
   */
  async updateOrder(orderId, updates) {
    // VALIDATION: Prevent order-level "Teslim Edildi" - must use item-level delivery for lot tracking
    if (updates.order_status === 'Teslim Edildi' || updates.orderStatus === 'Teslim Edildi') {
      throw new Error('Order-level "Teslim Edildi" not allowed. Use item-level delivery for lot tracking.');
    }
    
    const allowedFields = [
      'supplierId',
      'supplierName',
      'orderStatus',
      'expectedDeliveryDate',
      'notes'
    ];
    
    const filteredUpdates = {};
    // Handle both camelCase and snake_case inputs
    if (updates.supplier_id !== undefined) filteredUpdates.supplierId = updates.supplier_id;
    if (updates.supplierId !== undefined) filteredUpdates.supplierId = updates.supplierId;
    if (updates.supplier_name !== undefined) filteredUpdates.supplierName = updates.supplier_name;
    if (updates.supplierName !== undefined) filteredUpdates.supplierName = updates.supplierName;
    if (updates.order_status !== undefined) filteredUpdates.orderStatus = updates.order_status;
    if (updates.orderStatus !== undefined) filteredUpdates.orderStatus = updates.orderStatus;
    if (updates.expected_delivery_date !== undefined) filteredUpdates.expectedDeliveryDate = updates.expected_delivery_date;
    if (updates.expectedDeliveryDate !== undefined) filteredUpdates.expectedDeliveryDate = updates.expectedDeliveryDate;
    if (updates.notes !== undefined) filteredUpdates.notes = updates.notes;
    
    filteredUpdates.updatedAt = new Date();
    
    const [updated] = await db('materials.orders')
      .where({ id: orderId })
      .update(filteredUpdates)
      .returning('*');
    
    if (!updated) {
      throw new Error('Order not found');
    }
    
    // If order status changed, propagate to all items
    if (updates.order_status || updates.orderStatus) {
      const orderStatus = updates.orderStatus || updates.order_status;
      const itemStatus = this._mapOrderStatusToItemStatus(orderStatus);
      if (itemStatus) {
        await db('materials.order_items')
          .where({ orderId: orderId })
          .update({ 
            itemStatus: itemStatus,
            updatedAt: new Date()
          });
      }
    }
    
    return updated;
  },

  /**
   * Map order status to item status
   * Helper for propagating order status changes to items
   */
  _mapOrderStatusToItemStatus(orderStatus) {
    const mapping = {
      'Taslak': 'Onay Bekliyor',
      'Onay Bekliyor': 'Onay Bekliyor',
      'Onaylandı': 'Onaylandı',
      'Teslim Edildi': 'Teslim Edildi',
      'İptal': 'İptal',
      // Don't auto-change items for partial delivery
      'Kısmi Teslim': null
    };
    return mapping[orderStatus];
  },

  /**
   * Update order status based on item statuses
   * Called after item status changes
   * @param {number} orderId - Order ID
   * @returns {Object} Updated order
   */
  async updateOrderStatus(orderId) {
    // Get all items for this order
    const items = await db('materials.order_items')
      .where({ orderId: orderId })
      .select('itemStatus');
    
    if (items.length === 0) {
      return await this.updateOrder(orderId, { orderStatus: 'Taslak' });
    }
    
    // Calculate order status from item statuses
    const statusCounts = items.reduce((acc, item) => {
      acc[item.itemStatus] = (acc[item.itemStatus] || 0) + 1;
      return acc;
    }, {});
    
    let orderStatus;
    const totalItems = items.length;
    
    if (statusCounts['Teslim Edildi'] === totalItems) {
      orderStatus = 'Teslim Edildi';
    } else if (statusCounts['Onay Bekliyor'] === totalItems) {
      orderStatus = 'Onay Bekliyor';
    } else if (statusCounts['Teslim Edildi'] > 0) {
      orderStatus = 'Kısmi Teslim';
    } else if (statusCounts['Onaylandı'] > 0) {
      orderStatus = 'Onaylandı';
    } else {
      orderStatus = 'Taslak';
    }
    
    return await this.updateOrder(orderId, { order_status: orderStatus });
  },

  /**
   * Get order statistics
   * @returns {Object} Statistics summary
   */
  async getOrderStats() {
    // Count by status
    const statusCounts = await db('materials.orders')
      .select('orderStatus')
      .count('* as count')
      .groupBy('orderStatus');
    
    // Total values
    const [totals] = await db('materials.orders')
      .sum('totalAmount as total_value')
      .count('* as total_orders');
    
    // Recent orders (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const [recentStats] = await db('materials.orders')
      .where('orderDate', '>=', thirtyDaysAgo)
      .sum('totalAmount as recent_value')
      .count('* as recent_orders');
    
    // Pending deliveries
    const [pendingDeliveries] = await db('materials.order_items')
      .whereIn('itemStatus', ['Onay Bekliyor', 'Onaylandı'])
      .count('* as pending_items')
      .sum('totalPrice as pending_value');
    
    return {
      byStatus: statusCounts.reduce((acc, row) => {
        acc[row.orderStatus] = parseInt(row.count, 10);
        return acc;
      }, {}),
      totalOrders: parseInt(totals.total_orders, 10),
      totalValue: parseFloat(totals.total_value || 0),
      recentOrders: parseInt(recentStats.recent_orders, 10),
      recentValue: parseFloat(recentStats.recent_value || 0),
      pendingItems: parseInt(pendingDeliveries.pending_items, 10),
      pendingValue: parseFloat(pendingDeliveries.pending_value || 0)
    };
  },

  /**
   * Delete order (cascades to items)
   * @param {number} orderId - Order ID
   * @returns {boolean} Success
   */
  async deleteOrder(orderId) {
    const deleted = await db('materials.orders')
      .where({ id: orderId })
      .delete();
    
    return deleted > 0;
  }
};

export default Orders;
