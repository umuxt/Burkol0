// Order Item Delivery Service
// Bu dosya order içindeki item'ların delivery durumlarını yönetir

import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, COLLECTIONS } from '../firebase-config.js';
import { OrdersService } from './orders-service.js';

export class OrderItemService {

  /**
   * Update delivery status of individual order item
   * @param {string} orderId - Order ID
   * @param {string} itemId - Item ID within the order
   * @param {string} deliveryStatus - New delivery status ('Teslim Edildi', 'Bekliyor', etc.)
   * @param {Date|null} actualDeliveryDate - Actual delivery date
   */
  static async updateItemDeliveryStatus(orderId, itemId, deliveryStatus, actualDeliveryDate = null) {
    try {
      console.log('📦 OrderItemService: Updating item delivery status:', {
        orderId,
        itemId,
        deliveryStatus,
        actualDeliveryDate
      });

      // Get current order
      const order = await OrdersService.getOrder(orderId);
      if (!order || !order.items) {
        throw new Error('Sipariş veya sipariş kalemleri bulunamadı');
      }

      console.log('🔍 OrderItemService: Full order items structure:', JSON.stringify(order.items, null, 2));
      console.log('🔍 OrderItemService: Looking for itemId:', itemId);

      // Simple, direct field matching since frontend now sends correct identifiers
      let itemIndex = order.items.findIndex(item => 
        item.lineId === itemId || 
        item.itemCode === itemId || 
        item.id === itemId
      );

      if (itemIndex === -1) {
        console.error('❌ OrderItemService: Item not found with ID:', itemId);
        console.error('❌ OrderItemService: Available items (full):', order.items);
        throw new Error('Sipariş kalemi bulunamadı');
      }

      console.log('✅ OrderItemService: Found item at index', itemIndex, '->', order.items[itemIndex]);

      const currentItem = order.items[itemIndex];
      const wasAlreadyDelivered = currentItem.itemStatus === 'Teslim Edildi';

      // Update the item
      const updatedItem = {
        ...currentItem,
        itemStatus: deliveryStatus,
        actualDeliveryDate: actualDeliveryDate || (deliveryStatus === 'Teslim Edildi' ? new Date() : null),
        updatedAt: new Date()
      };

      // Update items array
      const updatedItems = [...order.items];
      updatedItems[itemIndex] = updatedItem;

      // Handle stock update if item is being delivered for the first time
      if (deliveryStatus === 'Teslim Edildi' && !wasAlreadyDelivered) {
        await this._updateStockForDelivery(currentItem, orderId, itemId);
      }

      // Calculate new order status based on all items
      const newOrderStatus = this._calculateOrderStatus(updatedItems);

      // Serialize items for Firebase
      const serializedItems = this._serializeItems(updatedItems);

      // Update order in Firebase
      await OrdersService.updateOrder(orderId, {
        orderStatus: newOrderStatus,
        items: serializedItems,
        itemCount: updatedItems.length
      });

      console.log(`✅ OrderItemService: Item ${itemId} delivery status updated to ${deliveryStatus}`);
      console.log(`✅ OrderItemService: Order ${orderId} status updated to ${newOrderStatus}`);

      return {
        success: true,
        updatedItem,
        newOrderStatus,
        deliveredCount: updatedItems.filter(item => item.itemStatus === 'Teslim Edildi').length,
        totalCount: updatedItems.length
      };

    } catch (error) {
      console.error('❌ Error updating order item delivery status:', error);
      throw new Error(`Sipariş kalemi teslim durumu güncellenemedi: ${error.message}`);
    }
  }

  /**
   * Mark multiple order items as delivered
   * @param {string} orderId - Order ID
   * @param {string[]} itemIds - Array of item IDs to mark as delivered
   * @param {Date|null} actualDeliveryDate - Actual delivery date
   */
  static async markItemsDelivered(orderId, itemIds, actualDeliveryDate = null) {
    try {
      console.log('📦 OrderItemService: Marking multiple items as delivered:', {
        orderId,
        itemIds,
        actualDeliveryDate
      });

      // Get current order
      const order = await OrdersService.getOrder(orderId);
      if (!order || !order.items) {
        throw new Error('Sipariş veya sipariş kalemleri bulunamadı');
      }

      const updatedItems = [...order.items];
      const stockUpdates = [];
      let updatedCount = 0;

      // Process each item
      for (const itemId of itemIds) {
        const itemIndex = updatedItems.findIndex(item => item.id === itemId);
        if (itemIndex === -1) {
          console.warn(`⚠️ Item ${itemId} not found in order ${orderId}`);
          continue;
        }

        const currentItem = updatedItems[itemIndex];
        const wasAlreadyDelivered = currentItem.itemStatus === 'Teslim Edildi';

        if (!wasAlreadyDelivered) {
          // Update item status
          updatedItems[itemIndex] = {
            ...currentItem,
            itemStatus: 'Teslim Edildi',
            actualDeliveryDate: actualDeliveryDate || new Date(),
            updatedAt: new Date()
          };

          // Prepare stock update
          stockUpdates.push({
            materialCode: currentItem.materialCode,
            quantity: currentItem.quantity,
            itemId: itemId,
            materialName: currentItem.materialName,
            unit: currentItem.unit
          });

          updatedCount++;
        }
      }

      if (updatedCount === 0) {
        return {
          success: true,
          message: 'Hiçbir kalem güncellenmedi (zaten teslim edilmiş)',
          updatedCount: 0
        };
      }

      // Update stocks for all delivered items
      for (const stockUpdate of stockUpdates) {
        await this._updateStockForDeliveryBulk(stockUpdate, orderId);
      }

      // Calculate new order status
      const newOrderStatus = this._calculateOrderStatus(updatedItems);

      // Serialize items for Firebase
      const serializedItems = this._serializeItems(updatedItems);

      // Update order in Firebase
      await OrdersService.updateOrder(orderId, {
        orderStatus: newOrderStatus,
        items: serializedItems,
        itemCount: updatedItems.length
      });

      console.log(`✅ OrderItemService: ${updatedCount} items marked as delivered in order ${orderId}`);
      console.log(`✅ OrderItemService: Order status updated to ${newOrderStatus}`);

      return {
        success: true,
        updatedCount,
        newOrderStatus,
        deliveredCount: updatedItems.filter(item => item.itemStatus === 'Teslim Edildi').length,
        totalCount: updatedItems.length
      };

    } catch (error) {
      console.error('❌ Error marking multiple order items as delivered:', error);
      throw new Error(`Toplu kalem teslimi başarısız: ${error.message}`);
    }
  }

  // ================================
  // PRIVATE HELPER METHODS
  // ================================

  /**
   * Update stock for single item delivery
   * @private
   */
  static async _updateStockForDelivery(item, orderId, itemId) {
    try {
      console.log('📡 OrderItemService: Making stock API call for item delivery:', `/api/materials/${item.materialCode}/stock`);
      
      const response = await fetch(`/api/materials/${item.materialCode}/stock`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('bk_admin_token') || ''}`
        },
        body: JSON.stringify({
          quantity: item.quantity,
          operation: 'add',
          orderId: orderId,
          itemId: itemId,
          movementType: 'delivery',
          notes: `Kalem teslimi: ${item.materialName} (${item.quantity} ${item.unit || 'adet'})`
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ OrderItemService: Stock API error for item delivery:', errorData);
        throw new Error(`Stok güncellenemedi: ${errorData.error || 'Bilinmeyen hata'}`);
      } else {
        const result = await response.json();
        console.log('✅ OrderItemService: Stock updated for item delivery:', result);
        
        // Global stock update event dispatch
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('materialStockUpdated', {
            detail: { 
              materialCode: item.materialCode, 
              newStock: result.newStock,
              operation: 'add',
              quantity: item.quantity,
              context: 'orderitemservice-delivery'
            }
          }));
        }
      }
      
    } catch (stockError) {
      console.error('❌ OrderItemService: Stock update error for item delivery:', stockError);
      throw new Error(`Stok güncellenemedi: ${stockError.message}`);
    }
  }

  /**
   * Update stock for bulk item delivery
   * @private
   */
  static async _updateStockForDeliveryBulk(stockUpdate, orderId) {
    try {
      console.log('📡 OrderItemService: Making stock API call for bulk item delivery:', `/api/materials/${stockUpdate.materialCode}/stock`);
      
      const response = await fetch(`/api/materials/${stockUpdate.materialCode}/stock`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('bk_admin_token') || ''}`
        },
        body: JSON.stringify({
          quantity: stockUpdate.quantity,
          operation: 'add',
          orderId: orderId,
          itemId: stockUpdate.itemId,
          movementType: 'delivery',
          notes: `Toplu kalem teslimi: ${stockUpdate.materialName} (${stockUpdate.quantity} ${stockUpdate.unit || 'adet'})`
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ OrderItemService: Stock API error for bulk item delivery:', errorData);
      } else {
        const result = await response.json();
        console.log('✅ OrderItemService: Stock updated for bulk item delivery:', result);
        
        // Global stock update event dispatch
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('materialStockUpdated', {
            detail: { 
              materialCode: stockUpdate.materialCode, 
              newStock: result.newStock,
              operation: 'add',
              quantity: stockUpdate.quantity,
              context: 'orderitemservice-bulk-delivery'
            }
          }));
        }
      }
      
    } catch (stockError) {
      console.error('❌ OrderItemService: Stock update error for bulk item delivery:', stockError);
    }
  }

  /**
   * Calculate order status based on item statuses
   * @private
   */
  static _calculateOrderStatus(items) {
    const deliveredCount = items.filter(item => item.itemStatus === 'Teslim Edildi').length;
    const totalCount = items.length;
    
    if (deliveredCount === 0) {
      return 'Bekliyor';
    } else if (deliveredCount === totalCount) {
      return 'Teslim Edildi';
    } else {
      return 'Kısmi Teslimat';
    }
  }

  /**
   * Serialize items for Firebase storage
   * @private
   */
  static _serializeItems(items) {
    return items.map(item => ({
      id: item.id,
      lineId: item.lineId || `${item.materialCode || item.itemCode || item.id}-${String(item.itemSequence || 1).padStart(2, '0')}`,
      itemCode: item.itemCode,
      itemSequence: item.itemSequence,
      materialCode: item.materialCode,
      materialName: item.materialName,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      itemStatus: item.itemStatus,
      expectedDeliveryDate: item.expectedDeliveryDate || null,
      actualDeliveryDate: item.actualDeliveryDate || null
    }));
  }

}

export default OrderItemService;