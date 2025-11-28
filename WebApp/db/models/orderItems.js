/**
 * OrderItems Model
 * Manages order item operations with stock integration
 */

import db from '../connection.js';
import Materials from './materials.js';
import StockMovements from './stockMovements.js';
import { generateLotNumber } from '../../server/utils/lotGenerator.js';
import { isLotTrackingEnabled } from './settings.js';

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
      itemCode: `${orderCode}-item-${String(index + 1).padStart(2, '0')}`, // Unique per order
      itemSequence: index + 1,
      orderId: orderId,
      orderCode: orderCode,
      materialId: item.materialId,
      materialCode: item.materialCode,
      materialName: item.materialName,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      expectedDeliveryDate: item.expectedDeliveryDate,
      notes: item.notes,
      itemStatus: 'Onay Bekliyor'
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
      .where({ orderId: orderId })
      .orderBy('itemSequence');
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
    // Only allow valid database fields (camelCase)
    const allowedFields = [
      'itemStatus',
      'expectedDeliveryDate',
      'actualDeliveryDate',
      'notes',
      'deliveredBy'
    ];
    
    const updates = {
      itemStatus: status,
      updatedAt: new Date()
    };
    
    // Filter additionalData to only include allowed fields (handle both cases)
    if (additionalData.expected_delivery_date !== undefined) updates.expectedDeliveryDate = additionalData.expected_delivery_date;
    if (additionalData.expectedDeliveryDate !== undefined) updates.expectedDeliveryDate = additionalData.expectedDeliveryDate;
    if (additionalData.actual_delivery_date !== undefined) updates.actualDeliveryDate = additionalData.actual_delivery_date;
    if (additionalData.actualDeliveryDate !== undefined) updates.actualDeliveryDate = additionalData.actualDeliveryDate;
    if (additionalData.notes !== undefined) updates.notes = additionalData.notes;
    if (additionalData.delivered_by !== undefined) updates.deliveredBy = additionalData.delivered_by;
    if (additionalData.deliveredBy !== undefined) updates.deliveredBy = additionalData.deliveredBy;
    
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
  /**
   * Deliver an order item and update stock with lot tracking
   * @param {number} itemId - Order item ID
   * @param {Object} deliveryData - Delivery information
   * @param {string} deliveryData.deliveredBy - User who delivered
   * @param {Date} deliveryData.actualDeliveryDate - Delivery date
   * @param {string} deliveryData.notes - Delivery notes
   * @param {string} deliveryData.supplierLotCode - Supplier's lot/batch code (optional)
   * @param {Date} deliveryData.manufacturingDate - Manufacturing date (optional)
   * @param {Date} deliveryData.expiryDate - Expiry date (optional)
   * @returns {Object} Updated item, stock update, and lot number
   */
  async deliverItem(itemId, deliveryData) {
    const { 
      deliveredBy, 
      actualDeliveryDate = new Date(), 
      notes,
      supplierLotCode,
      manufacturingDate,
      expiryDate
    } = deliveryData;
    
    const trx = await db.transaction();
    
    try {
      // Get item details
      const item = await trx('materials.order_items').where({ id: itemId }).first();
      
      if (!item) {
        throw new Error('Order item not found');
      }
      
      // Check if already delivered - allow update if lotNumber is missing (backward compatibility)
      const isAlreadyDelivered = item.itemStatus === 'Teslim Edildi';
      const hasLotTracking = item.lotNumber != null;
      
      if (isAlreadyDelivered && hasLotTracking) {
        // Already delivered with lot tracking - prevent duplicate delivery
        throw new Error('Item already delivered with lot tracking. Cannot re-deliver.');
      }
      
      // Check if Lot Tracking is enabled in system settings
      const lotTrackingEnabled = await isLotTrackingEnabled();
      
      // Generate lot number for this delivery (only if enabled)
      let lotNumber = null;
      let lotDate = null;
      
      if (lotTrackingEnabled) {
        lotNumber = await generateLotNumber(item.materialCode, actualDeliveryDate);
        lotDate = actualDeliveryDate instanceof Date 
          ? actualDeliveryDate.toISOString().split('T')[0] 
          : new Date(actualDeliveryDate).toISOString().split('T')[0];
        
        console.log(`📦 [LOT] Generated lot number: ${lotNumber} for material ${item.materialCode}`);
      } else {
        console.log(`🚫 [LOT] Lot tracking disabled - skipping lot generation for ${item.materialCode}`);
      }
      
      // Update item status to delivered with lot information (or null if disabled)
      const [updatedItem] = await trx('materials.order_items')
        .where({ id: itemId })
        .update({
          itemStatus: 'Teslim Edildi',
          actualDeliveryDate: actualDeliveryDate,
          deliveredBy: deliveredBy,
          notes: notes || item.notes,
          // Lot tracking fields
          lotNumber: lotNumber,
          supplierLotCode: supplierLotCode || null,
          manufacturingDate: manufacturingDate || null,
          expiryDate: expiryDate || null,
          updatedAt: new Date()
        })
        .returning('*');
      
      // Only update stock and create movement if this is a NEW delivery
      // (not just adding lot tracking to an existing delivery)
      if (!isAlreadyDelivered) {
        // Update material stock
        // This creates the critical link between orders and inventory
        // Use materialCode (not materialId) as Materials.updateMaterialStock expects code
        const previousStock = await Materials.getMaterialByCode(item.materialCode);
        
        const stockUpdate = await Materials.updateMaterialStock(
          item.materialCode,
          item.quantity,
          0, // reservedChange
          0  // wipReservedChange
        );
        
        // Create stock movement record for audit trail
        const movement = await StockMovements.createMovement({
          materialId: item.materialId,
          materialCode: item.materialCode,
          materialName: item.materialName,
          type: 'in', // Order delivery = stock in
          subType: 'order_delivery',
          status: 'completed',
          quantity: parseFloat(item.quantity),
          unit: item.unit,
          stockBefore: parseFloat(previousStock?.stock || 0),
          stockAfter: parseFloat(stockUpdate.stock),
          unitCost: parseFloat(item.unitPrice || 0),
          totalCost: parseFloat(item.totalPrice || 0),
          currency: 'TRY',
          reference: item.orderCode,
          referenceType: 'order_delivery',
          location: 'Warehouse',
          notes: `Order delivery: ${item.orderCode} - Item ${item.itemCode}${lotNumber ? ` - Lot: ${lotNumber}` : ''}`,
          reason: 'Order item delivered',
          movementDate: actualDeliveryDate,
          approved: true,
          userId: deliveredBy,
          userName: deliveredBy,
          // Lot tracking fields (null if disabled)
          lotNumber: lotNumber,
          lotDate: lotDate,
          supplierLotCode: supplierLotCode || null,
          manufacturingDate: manufacturingDate || null,
          expiryDate: expiryDate || null
        });
        
        const msg = lotNumber 
          ? `✅ [LOT] New delivery with lot ${lotNumber}`
          : `✅ [NO-LOT] New delivery (lot tracking disabled)`;
        console.log(msg);
      } else {
        // Update existing stock movement with lot information (if enabled)
        // If disabled, we can still update other fields, or skip if lotNumber is null
        
        const updateData = {
          supplierLotCode: supplierLotCode || null,
          manufacturingDate: manufacturingDate || null,
          expiryDate: expiryDate || null,
          updatedAt: new Date()
        };
        
        // Only update lot fields if we have a lot number
        if (lotNumber) {
          updateData.lotNumber = lotNumber;
          updateData.lotDate = lotDate;
          updateData.notes = `Order delivery: ${item.orderCode} - Item ${item.itemCode} - Lot: ${lotNumber}`;
        }
        
        await trx('materials.stock_movements')
          .where({
            materialCode: item.materialCode,
            reference: item.orderCode,
            type: 'in',
            subType: 'order_delivery'
          })
          .update(updateData);
        
        const msg = lotNumber
          ? `✅ [LOT] Updated existing delivery with lot tracking: ${lotNumber}`
          : `✅ [NO-LOT] Updated existing delivery (lot tracking disabled)`;
        console.log(msg);
      }
      
      await trx.commit();
      
      // Build response object
      const response = {
        item: updatedItem,
        lotNumber, // Return generated lot number (or null) to API response
        isUpdate: isAlreadyDelivered // Indicate if this was an update vs new delivery
      };
      
      // Only include stock info for new deliveries
      if (!isAlreadyDelivered) {
        const previousStock = await Materials.getMaterialByCode(item.materialCode);
        const currentStock = await Materials.getMaterialByCode(item.materialCode);
        response.stockUpdate = {
          materialId: item.materialId,
          materialCode: item.materialCode,
          previousStock: parseFloat(previousStock?.stock || 0),
          newStock: parseFloat(currentStock?.stock || 0),
          quantityAdded: parseFloat(item.quantity)
        };
      }
      
      return response;
      
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
            itemStatus: update.status,
            updatedAt: new Date(),
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
      .where({ materialId: materialId });
    
    if (filters.status) {
      query = query.where('itemStatus', filters.status);
    }
    
    if (filters.startDate) {
      query = query.where('actualDeliveryDate', '>=', filters.startDate);
    }
    
    if (filters.endDate) {
      query = query.where('actualDeliveryDate', '<=', filters.endDate);
    }
    
    return await query.orderBy('actualDeliveryDate', 'desc');
  },

  /**
   * Get pending deliveries (items not yet delivered)
   * @param {Object} filters - Optional filters
   * @returns {Array} Pending items
   */
  async getPendingDeliveries(filters = {}) {
    let query = db('materials.order_items')
      .whereIn('itemStatus', ['Onay Bekliyor', 'Onaylandı']);
    
    if (filters.orderId) {
      query = query.where('orderId', filters.orderId);
    }
    
    if (filters.materialId) {
      query = query.where('materialId', filters.materialId);
    }
    
    // Overdue items
    if (filters.overdue) {
      query = query.where('expectedDeliveryDate', '<', new Date());
    }
    
    return await query.orderBy('expectedDeliveryDate', 'asc');
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
      query = query.where('actualDeliveryDate', '>=', startDate);
    }
    
    if (endDate) {
      query = query.where('actualDeliveryDate', '<=', endDate);
    }
    
    const [stats] = await query
      .select(
        db.raw('COUNT(CASE WHEN "itemStatus" = ? THEN 1 END) as delivered_count', ['Teslim Edildi']),
        db.raw('COUNT(CASE WHEN "itemStatus" = ? THEN 1 END) as pending_count', ['Onay Bekliyor']),
        db.raw('COUNT(CASE WHEN "itemStatus" = ? THEN 1 END) as approved_count', ['Onaylandı']),
        db.raw('SUM(CASE WHEN "itemStatus" = ? THEN "totalPrice" ELSE 0 END) as delivered_value', ['Teslim Edildi']),
        db.raw('SUM(CASE WHEN "itemStatus" != ? THEN "totalPrice" ELSE 0 END) as pending_value', ['Teslim Edildi']),
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
    
    if (item.itemStatus === 'Teslim Edildi') {
      throw new Error('Cannot delete delivered item');
    }
    
    const deleted = await db('materials.order_items').where({ id: itemId }).delete();
    
    return deleted > 0;
  }
};

export default OrderItems;
