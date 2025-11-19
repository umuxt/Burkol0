/**
 * OrderItems Model
 * Manages order item operations with stock integration
 */

import db from '../connection.js';
import Materials from './materials.js';

const OrderItems = {
  /**
   * Create multiple order items
   * @param {number} orderId - Order ID
   * @param {string} orderCode - Order code
   * @param {Array} items - Array of item data
   * @returns {Array} Created items
   */
  async createItems(orderId, orderCode, items) {
    const itemsData = items.map((item, index) => ({
      item_code: `${orderCode}-item-${String(index + 1).padStart(2, '0')}`, // Unique per order
      item_sequence: index + 1,
      order_id: orderId,
      order_code: orderCode,
      material_id: item.materialId,
      material_code: item.materialCode,
      material_name: item.materialName,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unitPrice,
      total_price: item.totalPrice,
      expected_delivery_date: item.expectedDeliveryDate,
      notes: item.notes,
      item_status: 'Onay Bekliyor'
    }));
    
    return await db('materials.order_items').insert(itemsData).returning('*');
  },

  /**
   * Get items by order ID
   * @param {number} orderId - Order ID
   * @returns {Array} Order items
   */
  async getItemsByOrder(orderId) {
    return await db('materials.order_items')
      .where({ order_id: orderId })
      .orderBy('item_sequence');
  },

  /**
   * Get single item by ID
   * @param {number} itemId - Item ID
   * @returns {Object} Order item
   */
  async getItemById(itemId) {
    const item = await db('materials.order_items').where({ id: itemId }).first();
    
    if (!item) {
      throw new Error('Order item not found');
    }
    
    return item;
  },

  /**
   * Update item status
   * @param {number} itemId - Item ID
   * @param {string} status - New status
   * @param {Object} additionalData - Additional fields to update
   * @returns {Object} Updated item
   */
  async updateItemStatus(itemId, status, additionalData = {}) {
    // Only allow valid database fields (snake_case)
    const allowedFields = [
      'item_status',
      'expected_delivery_date',
      'actual_delivery_date',
      'notes',
      'delivered_by'
    ];
    
    const updates = {
      item_status: status,
      updated_at: new Date()
    };
    
    // Filter additionalData to only include allowed fields
    for (const field of allowedFields) {
      if (additionalData[field] !== undefined && field !== 'item_status') {
        updates[field] = additionalData[field];
      }
    }
    
    const [updated] = await db('materials.order_items')
      .where({ id: itemId })
      .update(updates)
      .returning('*');
    
    if (!updated) {
      throw new Error('Order item not found');
    }
    
    return updated;
  },

  /**
   * Deliver item and update stock
   * This is the critical integration point with materials inventory
   * @param {number} itemId - Item ID
   * @param {Object} deliveryData - Delivery information
   * @returns {Object} Result with updated item and stock info
   */
  async deliverItem(itemId, deliveryData) {
    const { deliveredBy, actualDeliveryDate = new Date(), notes } = deliveryData;
    
    const trx = await db.transaction();
    
    try {
      // Get item details
      const item = await trx('materials.order_items').where({ id: itemId }).first();
      
      if (!item) {
        throw new Error('Order item not found');
      }
      
      if (item.item_status === 'Teslim Edildi') {
        throw new Error('Item already delivered');
      }
      
      // Update item status to delivered
      const [updatedItem] = await trx('materials.order_items')
        .where({ id: itemId })
        .update({
          item_status: 'Teslim Edildi',
          actual_delivery_date: actualDeliveryDate,
          delivered_by: deliveredBy,
          notes: notes || item.notes,
          updated_at: new Date()
        })
        .returning('*');
      
      // Update material stock
      // This creates the critical link between orders and inventory
      // Use material_code (not material_id) as Materials.updateMaterialStock expects code
      const previousStock = await Materials.getMaterialByCode(item.material_code);
      
      const stockUpdate = await Materials.updateMaterialStock(
        item.material_code,
        item.quantity,
        0, // reservedChange
        0  // wipReservedChange
      );
      
      await trx.commit();
      
      return {
        item: updatedItem,
        stockUpdate: {
          materialId: item.material_id,
          materialCode: item.material_code,
          previousStock: parseFloat(previousStock?.stock || 0),
          newStock: parseFloat(stockUpdate.stock),
          quantityAdded: parseFloat(item.quantity)
        }
      };
      
    } catch (error) {
      await trx.rollback();
      console.error('Error delivering item:', error);
      throw error;
    }
  },

  /**
   * Bulk update item statuses
   * @param {Array} updates - Array of {itemId, status, data}
   * @returns {Array} Updated items
   */
  async bulkUpdateStatus(updates) {
    const trx = await db.transaction();
    
    try {
      const results = [];
      
      for (const update of updates) {
        const [updated] = await trx('materials.order_items')
          .where({ id: update.itemId })
          .update({
            item_status: update.status,
            updated_at: new Date(),
            ...update.data
          })
          .returning('*');
        
        results.push(updated);
      }
      
      await trx.commit();
      return results;
      
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  },

  /**
   * Get items by material (useful for tracking material sourcing)
   * @param {number} materialId - Material ID
   * @param {Object} filters - Optional filters
   * @returns {Array} Order items
   */
  async getItemsByMaterial(materialId, filters = {}) {
    let query = db('materials.order_items')
      .where({ material_id: materialId });
    
    if (filters.status) {
      query = query.where('item_status', filters.status);
    }
    
    if (filters.startDate) {
      query = query.where('actual_delivery_date', '>=', filters.startDate);
    }
    
    if (filters.endDate) {
      query = query.where('actual_delivery_date', '<=', filters.endDate);
    }
    
    return await query.orderBy('actual_delivery_date', 'desc');
  },

  /**
   * Get pending deliveries (items not yet delivered)
   * @param {Object} filters - Optional filters
   * @returns {Array} Pending items
   */
  async getPendingDeliveries(filters = {}) {
    let query = db('materials.order_items')
      .whereIn('item_status', ['Onay Bekliyor', 'Onaylandı']);
    
    if (filters.orderId) {
      query = query.where('order_id', filters.orderId);
    }
    
    if (filters.materialId) {
      query = query.where('material_id', filters.materialId);
    }
    
    // Overdue items
    if (filters.overdue) {
      query = query.where('expected_delivery_date', '<', new Date());
    }
    
    return await query.orderBy('expected_delivery_date', 'asc');
  },

  /**
   * Get delivery statistics
   * @param {Object} filters - Optional filters
   * @returns {Object} Statistics
   */
  async getDeliveryStats(filters = {}) {
    const { startDate, endDate } = filters;
    
    let query = db('materials.order_items');
    
    if (startDate) {
      query = query.where('actual_delivery_date', '>=', startDate);
    }
    
    if (endDate) {
      query = query.where('actual_delivery_date', '<=', endDate);
    }
    
    const [stats] = await query
      .select(
        db.raw('COUNT(CASE WHEN item_status = ? THEN 1 END) as delivered_count', ['Teslim Edildi']),
        db.raw('COUNT(CASE WHEN item_status = ? THEN 1 END) as pending_count', ['Onay Bekliyor']),
        db.raw('COUNT(CASE WHEN item_status = ? THEN 1 END) as approved_count', ['Onaylandı']),
        db.raw('SUM(CASE WHEN item_status = ? THEN total_price ELSE 0 END) as delivered_value', ['Teslim Edildi']),
        db.raw('SUM(CASE WHEN item_status != ? THEN total_price ELSE 0 END) as pending_value', ['Teslim Edildi']),
        db.raw('SUM(quantity) as total_quantity')
      );
    
    return {
      deliveredCount: parseInt(stats.delivered_count, 10),
      pendingCount: parseInt(stats.pending_count, 10),
      approvedCount: parseInt(stats.approved_count, 10),
      deliveredValue: parseFloat(stats.delivered_value || 0),
      pendingValue: parseFloat(stats.pending_value || 0),
      totalQuantity: parseFloat(stats.total_quantity || 0)
    };
  },

  /**
   * Delete item
   * @param {number} itemId - Item ID
   * @returns {boolean} Success
   */
  async deleteItem(itemId) {
    // Check if item is already delivered
    const item = await db('materials.order_items').where({ id: itemId }).first();
    
    if (!item) {
      throw new Error('Order item not found');
    }
    
    if (item.item_status === 'Teslim Edildi') {
      throw new Error('Cannot delete delivered item');
    }
    
    const deleted = await db('materials.order_items').where({ id: itemId }).delete();
    
    return deleted > 0;
  }
};

export default OrderItems;
