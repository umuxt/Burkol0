// Firebase Orders Hooks
// Orders ve OrderItems için React hooks

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNotifications } from './useNotifications.js';
import { OrdersService, OrderItemsService, getOrderWithItems, updateOrderStatusBasedOnItems } from '../lib/orders-service.js';
import { MaterialsService } from '../lib/materials-service.js';

// ================================
// USE ORDERS HOOK
// ================================

export function useOrders(filters = {}, options = {}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [initialized, setInitialized] = useState(false);
  
  const { showNotification } = useNotifications();
  const unsubscribeRef = useRef(null);
  const autoLoad = options.autoLoad !== false; // Default true
  
  // **LOAD ORDERS**
  const loadOrders = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      setError(null);
      
      const fetchedOrders = await OrdersService.getOrders(filters, options);
      setOrders(fetchedOrders);
      
      if (!initialized) {
        setInitialized(true);
      }
      
      console.log(`📋 Loaded ${fetchedOrders.length} orders`);
      
    } catch (error) {
      console.error('❌ Error loading orders:', error);
      setError(error.message);
      
      if (showNotification) {
        showNotification('Siparişler yüklenirken hata oluştu: ' + error.message, 'error');
      }
      
    } finally {
      setLoading(false);
    }
  }, [filters, options, initialized, showNotification]);
  
  // **REFRESH ORDERS**
  const refreshOrders = useCallback(async () => {
    await loadOrders(false); // Don't show loader for refresh
  }, [loadOrders]);
  
  // **REAL-TIME SUBSCRIPTION**
  const subscribeToOrders = useCallback(() => {
    try {
      // Clean up existing subscription
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      
      unsubscribeRef.current = OrdersService.subscribeToOrders(filters, (fetchedOrders) => {
        setOrders(fetchedOrders);
        setLoading(false);
        
        if (!initialized) {
          setInitialized(true);
        }
        
        console.log(`🔄 Real-time orders update: ${fetchedOrders.length} orders`);
      });
      
    } catch (error) {
      console.error('❌ Error setting up orders subscription:', error);
      setError(error.message);
      setLoading(false);
    }
  }, [filters, initialized]);
  
  // **AUTO-LOAD EFFECT**
  useEffect(() => {
    if (autoLoad && !initialized) {
      if (options.realTime) {
        subscribeToOrders();
      } else {
        loadOrders();
      }
    }
    
    // Cleanup subscription on unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [autoLoad, initialized, loadOrders, subscribeToOrders, options.realTime]);
  
  return {
    orders,
    loading,
    error,
    initialized,
    loadOrders,
    refreshOrders,
    subscribeToOrders
  };
}

// ================================
// USE ORDER ACTIONS HOOK
// ================================

export function useOrderActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const { showNotification } = useNotifications();
  
  // **CREATE ORDER**
  const createOrder = useCallback(async (orderData) => {
    try {
      setLoading(true);
      setError(null);
      
      const newOrder = await OrdersService.createOrder(orderData);
      
      if (showNotification) {
        showNotification(`Sipariş başarıyla oluşturuldu: ${newOrder.orderCode || newOrder.id}`, 'success');
      }
      
      console.log('✅ Order created:', newOrder);
      return newOrder;
      
    } catch (error) {
      console.error('❌ Error creating order:', error);
      setError(error.message);
      
      if (showNotification) {
        showNotification('Sipariş oluşturulurken hata oluştu: ' + error.message, 'error');
      }
      
      throw error;
      
    } finally {
      setLoading(false);
    }
  }, [showNotification]);
  
  // **UPDATE ORDER**
  const updateOrder = useCallback(async (orderId, updateData) => {
    try {
      setLoading(true);
      setError(null);
      
      const updatedOrder = await OrdersService.updateOrder(orderId, updateData);
      
      if (showNotification) {
        showNotification('Sipariş başarıyla güncellendi', 'success');
      }
      
      console.log('✅ Order updated:', updatedOrder);
      return updatedOrder;
      
    } catch (error) {
      console.error('❌ Error updating order:', error);
      setError(error.message);
      
      if (showNotification) {
        showNotification('Sipariş güncellenirken hata oluştu: ' + error.message, 'error');
      }
      
      throw error;
      
    } finally {
      setLoading(false);
    }
  }, [showNotification]);
  
  // **DELETE ORDER**
  const deleteOrder = useCallback(async (orderId) => {
    try {
      setLoading(true);
      setError(null);
      
      await OrdersService.deleteOrder(orderId);
      
      if (showNotification) {
        showNotification('Sipariş başarıyla silindi', 'success');
      }
      
      console.log('✅ Order deleted:', orderId);
      
    } catch (error) {
      console.error('❌ Error deleting order:', error);
      setError(error.message);
      
      if (showNotification) {
        showNotification('Sipariş silinirken hata oluştu: ' + error.message, 'error');
      }
      
      throw error;
      
    } finally {
      setLoading(false);
    }
  }, [showNotification]);
  
  // **CREATE ORDER WITH ITEMS**
  const createOrderWithItems = useCallback(async (orderData, itemsData) => {
    try {
      setLoading(true);
      setError(null);
      
      // Calculate total amount from items
      const totalAmount = itemsData.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      
      // Create the order first
      const newOrder = await OrdersService.createOrder({
        ...orderData,
        totalAmount
      });
      
      // Create order items
      const itemsToCreate = itemsData.map(item => ({
        ...item,
        orderId: newOrder.id
      }));
      
      const createdItems = await OrderItemsService.createOrderItems(itemsToCreate);
      const sortedCreatedItems = [...createdItems].sort((a, b) => {
        const aSeq = a.itemSequence || 0;
        const bSeq = b.itemSequence || 0;
        if (aSeq === bSeq) {
          const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
          const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
          return aTime - bTime;
        }
        return aSeq - bSeq;
      });

      const embeddedItems = sortedCreatedItems.map(item => ({
        lineId: item.lineId,
        itemCode: item.itemCode,
        itemSequence: item.itemSequence,
        materialCode: item.materialCode,
        materialName: item.materialName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        itemStatus: item.itemStatus,
        expectedDeliveryDate: item.expectedDeliveryDate || null
      }));

      const syncedOrder = await OrdersService.updateOrder(newOrder.id, {
        items: embeddedItems,
        itemCount: embeddedItems.length,
        totalAmount
      });
      
      if (showNotification) {
        showNotification(`Sipariş ve ${createdItems.length} kalem başarıyla oluşturuldu`, 'success');
      }
      
      const result = {
        ...syncedOrder,
        items: sortedCreatedItems
      };
      
      console.log('✅ Order with items created:', result);
      return result;
      
    } catch (error) {
      console.error('❌ Error creating order with items:', error);
      setError(error.message);
      
      if (showNotification) {
        showNotification('Sipariş oluşturulurken hata oluştu: ' + error.message, 'error');
      }
      
      throw error;
      
    } finally {
      setLoading(false);
    }
  }, [showNotification]);
  
  return {
    loading,
    error,
    createOrder,
    updateOrder,
    deleteOrder,
    createOrderWithItems
  };
}

// ================================
// USE ORDER ITEMS HOOK
// ================================

export function useOrderItems(orderId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const { showNotification } = useNotifications();

  const serializeItemsForOrder = useCallback((list) => (
    list.map(item => {
      const fallbackLineId = item.lineId || `${item.materialCode || item.itemCode || item.id}-${String(item.itemSequence || 1).padStart(2, '0')}`
      return {
        id: item.id,
        lineId: fallbackLineId,
        itemCode: item.itemCode,
        itemSequence: item.itemSequence,
        materialCode: item.materialCode,
        materialName: item.materialName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        itemStatus: item.itemStatus,
        expectedDeliveryDate: item.expectedDeliveryDate instanceof Date
          ? item.expectedDeliveryDate
          : (item.expectedDeliveryDate || null),
        actualDeliveryDate: item.actualDeliveryDate instanceof Date
          ? item.actualDeliveryDate
          : (item.actualDeliveryDate || null)
      }
    })
  ), [])
  
  // **LOAD ORDER ITEMS**
  const loadOrderItems = useCallback(async () => {
    if (!orderId) {
      setItems([]);
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const fetchedItems = await OrderItemsService.getOrderItems(orderId);
      setItems(fetchedItems);

      try {
        await OrdersService.updateOrder(orderId, {
          items: serializeItemsForOrder(fetchedItems),
          itemCount: fetchedItems.length
        });
      } catch (syncError) {
        console.warn('⚠️ Order items sync skipped:', syncError?.message);
      }
      
      console.log(`📦 Loaded ${fetchedItems.length} order items for order ${orderId}`);
      
    } catch (error) {
      console.error('❌ Error loading order items:', error);
      setError(error.message);
      
      if (showNotification) {
        showNotification('Sipariş kalemleri yüklenirken hata oluştu: ' + error.message, 'error');
      }
      
    } finally {
      setLoading(false);
    }
  }, [orderId, showNotification, serializeItemsForOrder]);
  
  // **UPDATE ORDER ITEM WITH STOCK MANAGEMENT**
  const updateOrderItem = useCallback(async (itemId, updateData) => {
    try {
      // Get current item data first
      const orderItemsQuery = await OrderItemsService.getOrderItems(orderId);
      const currentItem = orderItemsQuery.find(item => item.id === itemId);
      
      if (!currentItem) {
        throw new Error('Sipariş kalemi bulunamadı');
      }
      
      // Check if status is changing to "Teslim Edildi"
      const isBecomingDelivered = updateData.itemStatus === 'Teslim Edildi' && 
                                 currentItem.itemStatus !== 'Teslim Edildi';

      console.log('🔍 DEBUG: Item status update check:', {
        updateDataStatus: updateData.itemStatus,
        currentItemStatus: currentItem.itemStatus,
        isBecomingDelivered: isBecomingDelivered,
        materialCode: currentItem.materialCode,
        quantity: currentItem.quantity
      });
      
      // Update the order item
      const updatedItem = await OrderItemsService.updateOrderItem(itemId, updateData);
      
      // Update local state
      let nextItems = [];
      setItems(prevItems => {
        const updatedList = prevItems.map(item =>
          item.id === itemId ? updatedItem : item
        );
        nextItems = updatedList;
        return updatedList;
      });

      if (orderId) {
        try {
          await OrdersService.updateOrder(orderId, {
            items: serializeItemsForOrder(nextItems),
            itemCount: nextItems.length
          });
        } catch (syncError) {
          console.warn('⚠️ Order items sync skipped:', syncError?.message);
        }
      }
      
      // If item is delivered, update material stock via backend API
      if (isBecomingDelivered) {
        console.log('🚀 DEBUG: Starting stock update for delivered item:', {
          materialCode: currentItem.materialCode,
          quantity: currentItem.quantity,
          orderId: orderId,
          itemId: itemId
        });
        
        try {
          console.log('📡 DEBUG: Making API call to:', `/api/materials/${currentItem.materialCode}/stock`);
          
          // Backend API çağrısı ile stok güncelleme
          const response = await fetch(`/api/materials/${currentItem.materialCode}/stock`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('bk_admin_token') || ''}` // Doğru token adı
            },
            body: JSON.stringify({
              quantity: currentItem.quantity,
              operation: 'add',
              orderId: orderId,
              itemId: itemId,
              movementType: 'delivery',
              notes: `Sipariş kalemi teslimi: ${currentItem.materialName} (${currentItem.quantity} ${currentItem.unit || 'adet'})`
            })
          });

          console.log('📡 DEBUG: API response status:', response.status);

          if (!response.ok) {
            const errorData = await response.json();
            console.error('❌ DEBUG: API error response:', errorData);
            throw new Error(errorData.error || 'Stok güncellenemedi');
          }

          const result = await response.json();
          console.log('✅ DEBUG: API success response:', result);
          
          console.log(`✅ Stock updated via API for ${currentItem.materialCode}: ${result.previousStock} → ${result.newStock}`);
          
          if (showNotification) {
            showNotification(
              `Stok güncellendi: ${currentItem.materialName} (+${currentItem.quantity}) → ${result.newStock}`, 
              'success'
            );
          }
          
        } catch (stockError) {
          console.error('❌ DEBUG: Stock update error:', stockError);
          
          if (showNotification) {
            showNotification(
              `Stok güncellenemedi: ${stockError.message}`, 
              'warning'
            );
          }
          
          // Fallback: Client-side güncelleme dene (güvenlik için)
          try {
            console.log('🔄 DEBUG: Fallback: Client-side stok güncelleme deneniyor...');
            await MaterialsService.updateStockByCode(
              currentItem.materialCode,
              currentItem.quantity,
              'delivery',
              {
                reference: orderId,
                referenceType: 'purchase_order',
                notes: `Sipariş teslimi (fallback): ${orderId}`,
                userId: 'system'
              }
            );
            
            if (showNotification) {
              showNotification(
                `Stok güncellendi (fallback): ${currentItem.materialName} (+${currentItem.quantity})`, 
                'info'
              );
            }
          } catch (fallbackError) {
            console.error('❌ Fallback stock update failed:', fallbackError);
          }
        }
      }
      
      // Update order status based on items if status changed
      if (updateData.itemStatus && orderId) {
        await updateOrderStatusBasedOnItems(orderId);
      }
      
      if (showNotification) {
        showNotification('Sipariş kalemi başarıyla güncellendi', 'success');
      }
      
      console.log('✅ Order item updated:', updatedItem);
      return updatedItem;
      
    } catch (error) {
      console.error('❌ Error updating order item:', error);
      
      if (showNotification) {
        showNotification('Sipariş kalemi güncellenirken hata oluştu: ' + error.message, 'error');
      }
      
      throw error;
    }
  }, [orderId, showNotification, serializeItemsForOrder]);
  
  // **DELETE ORDER ITEM**
  const deleteOrderItem = useCallback(async (itemId) => {
    try {
      await OrderItemsService.deleteOrderItem(itemId);
      
      // Update local state
      let nextItems = [];
      setItems(prevItems => {
        const updatedList = prevItems.filter(item => item.id !== itemId);
        nextItems = updatedList;
        return updatedList;
      });

      if (orderId) {
        try {
          await OrdersService.updateOrder(orderId, {
            items: serializeItemsForOrder(nextItems),
            itemCount: nextItems.length
          });
        } catch (syncError) {
          console.warn('⚠️ Order items sync skipped:', syncError?.message);
        }
      }
      
      // Update order status based on remaining items
      if (orderId) {
        await updateOrderStatusBasedOnItems(orderId);
      }
      
      if (showNotification) {
        showNotification('Sipariş kalemi başarıyla silindi', 'success');
      }
      
      console.log('✅ Order item deleted:', itemId);
      
    } catch (error) {
      console.error('❌ Error deleting order item:', error);
      
      if (showNotification) {
        showNotification('Sipariş kalemi silinirken hata oluştu: ' + error.message, 'error');
      }
      
      throw error;
    }
  }, [orderId, showNotification, serializeItemsForOrder]);
  
  // **ADD ORDER ITEM**
  const addOrderItem = useCallback(async (itemData) => {
    if (!orderId) {
      throw new Error('Sipariş ID gerekli');
    }
    
    try {
      const newItem = await OrderItemsService.createOrderItem({
        ...itemData,
        orderId
      });
      
      // Update local state
      let nextItems = [];
      setItems(prevItems => {
        const updated = [...prevItems, newItem];
        const sorted = updated.sort((a, b) => {
          const aSeq = a.itemSequence || 0;
          const bSeq = b.itemSequence || 0;
          if (aSeq === bSeq) {
            const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
            const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
            return aTime - bTime;
          }
          return aSeq - bSeq;
        });
        nextItems = sorted;
        return sorted;
      });

      if (orderId) {
        try {
          await OrdersService.updateOrder(orderId, {
            items: serializeItemsForOrder(nextItems),
            itemCount: nextItems.length
          });
        } catch (syncError) {
          console.warn('⚠️ Order items sync skipped:', syncError?.message);
        }
      }
      
      if (showNotification) {
        showNotification('Yeni sipariş kalemi eklendi', 'success');
      }
      
      console.log('✅ Order item added:', newItem);
      return newItem;
      
    } catch (error) {
      console.error('❌ Error adding order item:', error);
      
      if (showNotification) {
        showNotification('Sipariş kalemi eklenirken hata oluştu: ' + error.message, 'error');
      }
      
      throw error;
    }
  }, [orderId, showNotification, serializeItemsForOrder]);
  
  // **LOAD ITEMS ON ORDER ID CHANGE**
  useEffect(() => {
    loadOrderItems();
  }, [loadOrderItems]);
  
  return {
    items,
    loading,
    error,
    loadOrderItems,
    updateOrderItem,
    deleteOrderItem,
    addOrderItem
  };
}

// ================================
// USE SINGLE ORDER HOOK
// ================================

export function useSingleOrder(orderId) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const { showNotification } = useNotifications();
  
  // **LOAD ORDER WITH ITEMS**
  const loadOrder = useCallback(async () => {
    if (!orderId) {
      setOrder(null);
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const fetchedOrder = await getOrderWithItems(orderId);
      setOrder(fetchedOrder);
      
      console.log('📋 Loaded order with items:', fetchedOrder);
      
    } catch (error) {
      console.error('❌ Error loading order:', error);
      setError(error.message);
      
      if (showNotification) {
        showNotification('Sipariş yüklenirken hata oluştu: ' + error.message, 'error');
      }
      
    } finally {
      setLoading(false);
    }
  }, [orderId, showNotification]);
  
  // **LOAD ORDER ON ID CHANGE**
  useEffect(() => {
    loadOrder();
  }, [loadOrder]);
  
  return {
    order,
    loading,
    error,
    loadOrder
  };
}

// ================================
// USE ORDER STATS HOOK
// ================================

export function useOrderStats() {
  const [stats, setStats] = useState({
    totalOrders: 0,
    pendingOrders: 0,
    completedOrders: 0,
    partialOrders: 0,
    totalAmount: 0,
    thisMonthOrders: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // **LOAD ORDER STATISTICS**
  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get all orders for stats calculation
      const allOrders = await OrdersService.getOrders();
      
      // Calculate statistics
      const totalOrders = allOrders.length;
      const pendingOrders = allOrders.filter(order => 
        ['Taslak', 'Onay Bekliyor', 'Onaylandı'].includes(order.orderStatus)
      ).length;
      const completedOrders = allOrders.filter(order => 
        order.orderStatus === 'Tamamlandı'
      ).length;
      const partialOrders = allOrders.filter(order => 
        order.orderStatus === 'Kısmi Teslimat'
      ).length;
      const totalAmount = allOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
      
      // This month orders
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);
      
      const thisMonthOrders = allOrders.filter(order => 
        order.orderDate && order.orderDate >= thisMonth
      ).length;
      
      const calculatedStats = {
        totalOrders,
        pendingOrders,
        completedOrders,
        partialOrders,
        totalAmount,
        thisMonthOrders
      };
      
      setStats(calculatedStats);
      console.log('📊 Order stats calculated:', calculatedStats);
      
    } catch (error) {
      console.error('❌ Error loading order stats:', error);
      setError(error.message);
      
    } finally {
      setLoading(false);
    }
  }, []);
  
  // **LOAD STATS ON MOUNT**
  useEffect(() => {
    loadStats();
  }, [loadStats]);
  
  return {
    stats,
    loading,
    error,
    loadStats
  };
}
