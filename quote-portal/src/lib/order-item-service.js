// Order Item Delivery Service (API-only)
import { API } from './api.js';
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

      // If delivered, use backend endpoint that updates stock and order status
      if (deliveryStatus === 'Teslim Edildi') {
        const res = await API.deliverOrderItem(orderId, itemId, { actualDeliveryDate })
        return { success: true, updatedItem: res.item, newOrderStatus: undefined }
      }

      // Otherwise update the item via backend item update route
      const res = await API.updateOrderItem(orderId, itemId, {
        itemStatus: deliveryStatus,
        actualDeliveryDate
      })

      // Fetch latest order to compute status (backend may handle it already)
      const order = await OrdersService.getOrder(orderId)
      const newOrderStatus = this._calculateOrderStatus(order.items || [])

      // Ensure order status is consistent
      try { await OrdersService.updateOrder(orderId, { orderStatus: newOrderStatus }) } catch {}

      return { success: true, updatedItem: res.item || res, newOrderStatus }

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

      let updatedCount = 0
      for (const itemId of itemIds) {
        try {
          await API.deliverOrderItem(orderId, itemId, { actualDeliveryDate })
          updatedCount++
        } catch (e) {
          console.warn('⚠️ Bulk deliver failed for', itemId, e?.message)
        }
      }
      const order = await OrdersService.getOrder(orderId)
      const newOrderStatus = this._calculateOrderStatus(order.items || [])
      try { await OrdersService.updateOrder(orderId, { orderStatus: newOrderStatus }) } catch {}
      return { success: true, updatedCount, newOrderStatus, deliveredCount: (order.items || []).filter(i => i.itemStatus === 'Teslim Edildi').length, totalCount: (order.items || []).length }

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
        notes: `Sipariş satırı teslimi: ${item.materialName} (${item.quantity} ${item.unit || 'adet'})`
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
      // Align with app-wide naming
      return 'Onay Bekliyor';
    } else if (deliveredCount === totalCount) {
      return 'Teslim Edildi';
    } else {
      return 'Kısmi Teslimat';
    }
  }

  /**
   * Serialize items for Backend API storage
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
