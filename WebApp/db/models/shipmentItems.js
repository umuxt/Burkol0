/**
 * ShipmentItems Model
 * Manages individual shipment item operations (like orderItems.js)
 * Each item represents a material being shipped
 */

import db from '../connection.js';

const ShipmentItems = {
  /**
   * Get items by shipment ID
   * @param {number} shipmentId - Shipment ID
   * @returns {Array} Shipment items
   */
  async getItemsByShipment(shipmentId) {
    return await db('materials.shipment_items')
      .where({ shipmentId: shipmentId })
      .orderBy('itemSequence');
  },

  /**
   * Get single item by ID
   * @param {number} itemId - Item ID
   * @returns {Object} Shipment item
   */
  async getItemById(itemId) {
    const item = await db('materials.shipment_items')
      .where({ id: itemId })
      .first();
    
    if (!item) {
      const error = new Error('Shipment item not found');
      error.code = 'NOT_FOUND';
      throw error;
    }
    
    return item;
  },

  /**
   * Get item by code
   * @param {string} itemCode - Item code
   * @returns {Object} Shipment item
   */
  async getItemByCode(itemCode) {
    const item = await db('materials.shipment_items')
      .where({ itemCode })
      .first();
    
    if (!item) {
      const error = new Error('Shipment item not found');
      error.code = 'NOT_FOUND';
      throw error;
    }
    
    return item;
  },

  /**
   * Add item to existing shipment
   * @param {number} shipmentId - Shipment ID
   * @param {Object} itemData - Item data
   * @param {Object} user - Current user
   * @returns {Object} Created item
   */
  async addItemToShipment(shipmentId, itemData, user = {}) {
    const trx = await db.transaction();
    
    try {
      // Get shipment
      const shipment = await trx('materials.shipments')
        .where({ id: shipmentId })
        .first();
      
      if (!shipment) {
        const error = new Error('Shipment not found');
        error.code = 'NOT_FOUND';
        throw error;
      }
      
      // Can't add to completed shipments
      if (shipment.status === 'delivered' || shipment.status === 'cancelled') {
        const error = new Error('Cannot add items to completed shipment');
        error.code = 'INVALID_STATUS';
        throw error;
      }
      
      // Get current item count for sequence
      const [currentItems] = await trx('materials.shipment_items')
        .where({ shipmentId })
        .count('* as count');
      
      const itemSequence = parseInt(currentItems.count, 10) + 1;
      const itemCode = `${shipment.shipmentCode}-item-${String(itemSequence).padStart(2, '0')}`;
      
      // Get material details
      const material = await trx('materials.materials')
        .where({ code: itemData.materialCode })
        .first();
      
      if (!material) {
        const error = new Error(`Malzeme bulunamadı: ${itemData.materialCode}`);
        error.code = 'NOT_FOUND';
        throw error;
      }
      
      // Check stock availability
      const quantity = parseFloat(itemData.quantity);
      const availableStock = material.stock - (material.reserved || 0) - (material.wipReserved || 0);
      
      if (quantity > availableStock) {
        const error = new Error(`Yetersiz stok: ${material.name}. Mevcut: ${availableStock}, İstenen: ${quantity}`);
        error.code = 'INSUFFICIENT_STOCK';
        throw error;
      }
      
      const previousStock = parseFloat(material.stock);
      const newStock = previousStock - quantity;
      
      // Create stock movement
      const [stockMovement] = await trx('materials.stock_movements')
        .insert({
          materialId: material.id,
          materialCode: material.code,
          materialName: material.name,
          type: 'out',
          subType: 'shipment',
          status: 'completed',
          quantity,
          unit: itemData.unit || material.unit || 'adet',
          stockBefore: previousStock,
          stockAfter: newStock,
          warehouse: 'Warehouse',
          location: material.storage || 'Main',
          notes: `Sevkiyat: ${shipment.shipmentCode} - ${quantity} ${itemData.unit || material.unit}`,
          reason: shipment.workOrderCode ? `Work Order: ${shipment.workOrderCode}` : 'Shipment',
          reference: shipment.shipmentCode,
          referenceType: 'shipment',
          movementDate: new Date(),
          approved: true,
          userId: user?.uid || 'system',
          userName: user?.email || 'system',
          lotNumber: itemData.lotNumber || null
        })
        .returning('*');
      
      // Update material stock
      await trx('materials.materials')
        .where({ id: material.id })
        .update({ 
          stock: newStock,
          updatedAt: new Date()
        });
      
      // Insert shipment item
      const [shipmentItem] = await trx('materials.shipment_items')
        .insert({
          itemCode,
          itemSequence,
          shipmentId: shipment.id,
          shipmentCode: shipment.shipmentCode,
          materialId: material.id,
          materialCode: material.code,
          materialName: material.name,
          quantity,
          unit: itemData.unit || material.unit || 'adet',
          stockMovementId: stockMovement.id,
          lotNumber: itemData.lotNumber || null,
          itemStatus: shipment.status, // Match parent status
          notes: itemData.notes || null,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning('*');
      
      // Update shipment timestamp (itemCount and totalQuantity are calculated from shipment_items)
      await trx('materials.shipments')
        .where({ id: shipmentId })
        .update({
          updatedAt: new Date()
        });
      
      await trx.commit();
      
      return {
        ...shipmentItem,
        stockMovement,
        previousStock,
        newStock
      };
      
    } catch (error) {
      await trx.rollback();
      console.error('Error adding item to shipment:', error);
      throw error;
    }
  },

  /**
   * Remove item from shipment (restore stock)
   * @param {number} itemId - Item ID
   * @param {Object} user - Current user
   * @returns {boolean} Success
   */
  async removeItemFromShipment(itemId, user = {}) {
    const trx = await db.transaction();
    
    try {
      const item = await trx('materials.shipment_items')
        .where({ id: itemId })
        .first();
      
      if (!item) {
        const error = new Error('Shipment item not found');
        error.code = 'NOT_FOUND';
        throw error;
      }
      
      // Get shipment
      const shipment = await trx('materials.shipments')
        .where({ id: item.shipmentId })
        .first();
      
      // Can't remove from completed shipments
      if (shipment.status === 'delivered' || shipment.status === 'cancelled') {
        const error = new Error('Cannot remove items from completed shipment');
        error.code = 'INVALID_STATUS';
        throw error;
      }
      
      // Get material and restore stock
      const material = await trx('materials.materials')
        .where({ code: item.materialCode })
        .first();
      
      if (material) {
        const newStock = parseFloat(material.stock) + parseFloat(item.quantity);
        
        // Update material stock
        await trx('materials.materials')
          .where({ id: material.id })
          .update({ 
            stock: newStock,
            updatedAt: new Date()
          });
        
        // Create reversal stock movement
        await trx('materials.stock_movements')
          .insert({
            materialId: material.id,
            materialCode: material.code,
            materialName: material.name,
            type: 'in',
            subType: 'shipment_item_removal',
            status: 'completed',
            quantity: item.quantity,
            unit: item.unit,
            stockBefore: material.stock,
            stockAfter: newStock,
            warehouse: 'Warehouse',
            location: material.storage || 'Main',
            notes: `Sevkiyat kalem silme: ${item.itemCode}`,
            reason: 'Item removed from shipment',
            reference: item.shipmentCode,
            referenceType: 'shipment_item_removal',
            movementDate: new Date(),
            approved: true,
            userId: user?.uid || 'system',
            userName: user?.email || 'system'
          });
      }
      
      // Delete item
      await trx('materials.shipment_items')
        .where({ id: itemId })
        .delete();
      
      // Update shipment timestamp
      await trx('materials.shipments')
        .where({ id: item.shipmentId })
        .update({
          updatedAt: new Date()
        });
      
      await trx.commit();
      
      return true;
      
    } catch (error) {
      await trx.rollback();
      console.error('Error removing item from shipment:', error);
      throw error;
    }
  },

  /**
   * Update item quantity (adjust stock accordingly)
   * @param {number} itemId - Item ID
   * @param {number} newQuantity - New quantity
   * @param {Object} user - Current user
   * @returns {Object} Updated item
   */
  async updateItemQuantity(itemId, newQuantity, user = {}) {
    const trx = await db.transaction();
    
    try {
      const item = await trx('materials.shipment_items')
        .where({ id: itemId })
        .first();
      
      if (!item) {
        const error = new Error('Shipment item not found');
        error.code = 'NOT_FOUND';
        throw error;
      }
      
      // Get shipment
      const shipment = await trx('materials.shipments')
        .where({ id: item.shipmentId })
        .first();
      
      // Can't update completed shipments
      if (shipment.status === 'delivered' || shipment.status === 'cancelled') {
        const error = new Error('Cannot update items in completed shipment');
        error.code = 'INVALID_STATUS';
        throw error;
      }
      
      const oldQuantity = parseFloat(item.quantity);
      const quantityDiff = newQuantity - oldQuantity;
      
      if (quantityDiff === 0) {
        return item; // No change needed
      }
      
      // Get material
      const material = await trx('materials.materials')
        .where({ code: item.materialCode })
        .first();
      
      if (!material) {
        const error = new Error('Material not found');
        error.code = 'NOT_FOUND';
        throw error;
      }
      
      // If increasing quantity, check stock availability
      if (quantityDiff > 0) {
        const availableStock = material.stock - (material.reserved || 0) - (material.wipReserved || 0);
        if (quantityDiff > availableStock) {
          const error = new Error(`Yetersiz stok: ${material.name}. Mevcut: ${availableStock}, Gerekli: ${quantityDiff}`);
          error.code = 'INSUFFICIENT_STOCK';
          throw error;
        }
      }
      
      const previousStock = parseFloat(material.stock);
      const newStock = previousStock - quantityDiff; // Subtract diff (negative diff adds to stock)
      
      // Update material stock
      await trx('materials.materials')
        .where({ id: material.id })
        .update({ 
          stock: newStock,
          updatedAt: new Date()
        });
      
      // Create adjustment stock movement
      await trx('materials.stock_movements')
        .insert({
          materialId: material.id,
          materialCode: material.code,
          materialName: material.name,
          type: quantityDiff > 0 ? 'out' : 'in',
          subType: 'shipment_adjustment',
          status: 'completed',
          quantity: Math.abs(quantityDiff),
          unit: item.unit,
          stockBefore: previousStock,
          stockAfter: newStock,
          warehouse: 'Warehouse',
          location: material.storage || 'Main',
          notes: `Sevkiyat miktar düzeltme: ${item.itemCode} (${oldQuantity} → ${newQuantity})`,
          reason: 'Shipment quantity adjustment',
          reference: item.shipmentCode,
          referenceType: 'shipment_adjustment',
          movementDate: new Date(),
          approved: true,
          userId: user?.uid || 'system',
          userName: user?.email || 'system'
        });
      
      // Update item
      const [updated] = await trx('materials.shipment_items')
        .where({ id: itemId })
        .update({
          quantity: newQuantity,
          updatedAt: new Date()
        })
        .returning('*');
      
      // Update shipment timestamp
      await trx('materials.shipments')
        .where({ id: item.shipmentId })
        .update({
          updatedAt: new Date()
        });
      
      await trx.commit();
      
      return updated;
      
    } catch (error) {
      await trx.rollback();
      console.error('Error updating item quantity:', error);
      throw error;
    }
  },

  /**
   * Update item notes
   * @param {number} itemId - Item ID
   * @param {string} notes - New notes
   * @returns {Object} Updated item
   */
  async updateItemNotes(itemId, notes) {
    const [updated] = await db('materials.shipment_items')
      .where({ id: itemId })
      .update({
        notes,
        updatedAt: new Date()
      })
      .returning('*');
    
    if (!updated) {
      const error = new Error('Shipment item not found');
      error.code = 'NOT_FOUND';
      throw error;
    }
    
    return updated;
  },

  /**
   * Get items by material (useful for tracking shipment history)
   * @param {string} materialCode - Material code
   * @param {Object} filters - Optional filters
   * @returns {Array} Shipment items
   */
  async getItemsByMaterial(materialCode, filters = {}) {
    let query = db('materials.shipment_items as si')
      .join('materials.shipments as s', 'si.shipmentId', 's.id')
      .where('si.materialCode', materialCode)
      .select('si.*', 's.status as shipmentStatus', 's.customerName', 's.customerCompany');
    
    if (filters.status) {
      query = query.where('s.status', filters.status);
    }
    
    if (filters.startDate) {
      query = query.where('si.createdAt', '>=', filters.startDate);
    }
    
    if (filters.endDate) {
      query = query.where('si.createdAt', '<=', filters.endDate);
    }
    
    return await query.orderBy('si.createdAt', 'desc');
  },

  /**
   * Get shipment item statistics
   * @param {Object} filters - Filter options
   * @returns {Object} Statistics
   */
  async getItemStats(filters = {}) {
    const { startDate, endDate } = filters;
    
    let query = db('materials.shipment_items');
    
    if (startDate) {
      query = query.where('createdAt', '>=', startDate);
    }
    
    if (endDate) {
      query = query.where('createdAt', '<=', endDate);
    }
    
    const [stats] = await query
      .select(
        db.raw('COUNT(*) as total_items'),
        db.raw('COUNT(CASE WHEN "itemStatus" = ? THEN 1 END) as pending_count', ['pending']),
        db.raw('COUNT(CASE WHEN "itemStatus" = ? THEN 1 END) as shipped_count', ['shipped']),
        db.raw('COUNT(CASE WHEN "itemStatus" = ? THEN 1 END) as delivered_count', ['delivered']),
        db.raw('SUM(quantity) as total_quantity')
      );
    
    return {
      totalItems: parseInt(stats.total_items, 10),
      pendingCount: parseInt(stats.pending_count, 10),
      shippedCount: parseInt(stats.shipped_count, 10),
      deliveredCount: parseInt(stats.delivered_count, 10),
      totalQuantity: parseFloat(stats.total_quantity || 0)
    };
  }
};

export default ShipmentItems;
