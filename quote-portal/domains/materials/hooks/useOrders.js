// Backend API Orders Hooks
// Orders ve OrderItems için React hooks

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNotifications } from '../../../shared/hooks/useNotifications.js';
import { fetchWithTimeout, API_BASE, API } from '../../../shared/lib/api.js';
function withAuth(headers = {}) { try { const t = localStorage.getItem('bk_admin_token') || (window.location.hostname === 'localhost' ? 'dev-admin-token' : ''); return t ? { ...headers, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { ...headers, 'Content-Type': 'application/json' } } catch { return { ...headers, 'Content-Type': 'application/json' } } }
import { OrdersService, OrderItemsService, getOrderWithItems, updateOrderStatusBasedOnItems } from '../services/orders-service.js';
import { OrderItemService } from '../services/order-item-service.js';

// ================================
// USE ORDERS HOOK
// ================================

export function useOrders(filters = {}, options = {}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [initialized, setInitialized] = useState(false);
  const [deliveryStatuses, setDeliveryStatuses] = useState({}); // Teslimat durumları
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  
  const { showNotification } = useNotifications();
  const unsubscribeRef = useRef(null);
  const autoLoad = options.autoLoad !== false; // Default true
  
  // **LOAD ORDERS**
  const loadOrders = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      setError(null);
      
      // Backend API: fetch orders list
      const fetchedOrders = await API.listOrders();
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
  
  // **LOAD DELIVERY STATUSES**
  const loadDeliveryStatuses = useCallback(async () => {
    try {
      setDeliveryLoading(true);
      
      // Backend URL - development modunda port 3000
      const baseUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000'
      const fullUrl = `${baseUrl}/api/orders/delivery-status`
      
      console.log('🔍 NODE_ENV:', process.env.NODE_ENV)
      console.log('🔍 Base URL:', baseUrl)
      console.log('🔍 Full URL:', fullUrl)
      
      const response = await fetch(fullUrl);
      
      if (!response.ok) {
        console.log('❌ Response not OK:', response.status, response.statusText)
        throw new Error(`API Error: ${response.status}`);
      }
      
      const statuses = await response.json();
      setDeliveryStatuses(statuses);
      
      console.log('✅ Delivery statuses loaded:', Object.keys(statuses).length);
      
    } catch (error) {
      console.error('❌ Error loading delivery statuses:', error);
      if (showNotification) {
        showNotification('Teslimat durumları yüklenirken hata: ' + error.message, 'error');
      }
    } finally {
      setDeliveryLoading(false);
    }
  }, []); // dependency array'i boşalttık, sadece mount'ta çalışsın
  
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
      // Temporarily disable real-time due to CORS issues, use manual fetch
      console.log('🔄 useOrders: Loading orders (no realtime due to CORS)');
      loadOrders();
      
      // Timeout fallback - if still loading after 10 seconds, force initialized
      const timeoutId = setTimeout(() => {
        if (!initialized) {
          console.log('⚠️ Orders loading timeout - forcing initialized state');
          setInitialized(true);
          setLoading(false);
          setError('Siparişler yüklenemedi - bağlantı problemi olabilir');
        }
      }, 10000);
      
      return () => {
        clearTimeout(timeoutId);
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
        }
      };
    }
    
    // Cleanup subscription on unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [autoLoad, initialized, loadOrders]);
  
  return {
    orders,
    loading,
    error,
    initialized,
    deliveryStatuses,      // Teslimat durumları
    deliveryLoading,       // Teslimat durumu yükleme durumu
    loadOrders,
    refreshOrders,
    subscribeToOrders,
    loadDeliveryStatuses   // Teslimat durumlarını yükleme fonksiyonu
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
  const createOrderWithItems = useCallback(async (orderData, itemsData, options = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      // Calculate total amount from items
      const totalAmount = itemsData.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      
      console.log('📝 useOrderActions: Creating order via backend API:', orderData);
      
      // Use backend API for order creation (includes items)
      const orderWithItems = {
        ...orderData,
        totalAmount,
        items: itemsData.map((item, index) => ({
          materialCode: item.materialCode,
          materialName: item.materialName,
          quantity: item.quantity,
          unitPrice: item.unitPrice || 0,
          itemStatus: item.itemStatus || 'Onay Bekliyor',
          expectedDeliveryDate: item.expectedDeliveryDate || null,
          actualDeliveryDate: item.actualDeliveryDate || null,
          itemSequence: index + 1
        }))
      };

      // Call backend API to create order with items
      const newOrder = await OrdersService.createOrder(orderWithItems);
      console.log('✅ useOrderActions: Order created via backend:', newOrder);
      
      // If this was a delivered record, ensure stock increments and order status
      if (options.deliveredRecordMode) {
        try {
          // Increment stock for each delivered item
          for (const item of newOrder.items || []) {
            if (item.itemStatus === 'Teslim Edildi') {
              try {
                const url = `${API_BASE}/api/materials/${encodeURIComponent(item.materialCode)}/stock`
                const res = await fetchWithTimeout(url, {
                  method: 'PATCH',
                  headers: withAuth(),
                  body: JSON.stringify({
                    quantity: Number(item.quantity) || 0,
                    operation: 'add',
                    orderId: newOrder.id,
                    movementType: 'delivery'
                  })
                }, 8000);
                if (!res.ok) {
                  const err = await res.json().catch(() => ({}));
                  console.warn('⚠️ Stock API failed:', item.materialCode, err?.error || res.statusText);
                } else {
                  // Parse response to get updated stock info
                  const stockUpdateResponse = await res.json().catch(() => ({}));
                  
                  // Notify UI for material refresh with detailed info
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('materialStockUpdated', { 
                      detail: { 
                        materialCode: item.materialCode,
                        newStock: stockUpdateResponse.newStock,
                        quantity: item.quantity,
                        operation: 'add',
                        context: 'order_delivery'
                      } 
                    }));
                  }
                  
                  console.log('✅ Stock updated and event dispatched for:', item.materialCode, 'New stock:', stockUpdateResponse.newStock);
                }
              } catch (e) {
                console.warn('⚠️ Stock update error for', item.materialCode, e?.message);
              }
            }
          }
          // Ensure order status reflects delivered
          try {
            await OrdersService.updateOrder(newOrder.id, { orderStatus: 'Teslim Edildi' });
            newOrder.orderStatus = 'Teslim Edildi';
          } catch (e) {
            console.warn('⚠️ Order status finalize failed:', e?.message);
          }
        } catch (e) {
          console.warn('⚠️ DeliveredRecordMode post-create steps failed:', e?.message);
        }
      }

      if (showNotification) {
        showNotification(`Sipariş ve ${newOrder.items?.length || 0} kalem başarıyla oluşturuldu`, 'success');
      }
      
      console.log('✅ Order with items created:', newOrder);
      return newOrder;
      
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
      
      // Update the order item using the new service
      let updatedItem;
      if (updateData.itemStatus) {
        // Use OrderItemService for status updates (handles stock automatically)
        console.log('📝 Using OrderItemService.updateItemDeliveryStatus for status change');
        const result = await OrderItemService.updateItemDeliveryStatus(
          orderId, 
          itemId, 
          updateData.itemStatus,
          updateData.actualDeliveryDate
        );
        updatedItem = result.updatedItem;
        
        // Refresh items from updated order
        await loadItems();
        
        if (showNotification) {
          showNotification('Sipariş kalemi başarıyla güncellendi', 'success');
        }
        
        console.log('✅ Order item updated via OrderItemService:', updatedItem);
        return updatedItem;
      } else {
        // Use legacy method for non-status updates
        updatedItem = await OrderItemsService.updateOrderItem(itemId, updateData);
      }
      
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
          
          // Trigger material stock update event
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('materialStockUpdated', {
              detail: {
                materialCode: currentItem.materialCode,
                newStock: result.newStock,
                quantity: currentItem.quantity,
                operation: 'add',
                context: 'item_delivery'
              }
            }));
          }
          
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
  }, [orderId, showNotification, loadItems]);
  
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
        ['Taslak', 'Onay Bekliyor', 'Onaylandı', 'Yolda', 'Bekliyor', 'Kısmi Teslimat'].includes(order.orderStatus)
      ).length;
      const completedOrders = allOrders.filter(order => 
        ['Teslim Edildi', 'Tamamlandı'].includes(order.orderStatus)
      ).length;
      const partialOrders = allOrders.filter(order => 
        order.orderStatus === 'Kısmi Teslimat'
      ).length;
      const totalAmount = allOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
      
      // This month delivered orders (based on order status or item delivery dates)
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);
      
      const thisMonthOrders = allOrders.filter(order => {
        // Check if order is completed this month
        if (order.orderStatus === 'Tamamlandı' && order.orderDate && order.orderDate >= thisMonth) {
          return true;
        }
        
        // Check if any items were delivered this month
        if (Array.isArray(order.items)) {
          return order.items.some(item => 
            item.itemStatus === 'Teslim Edildi' && 
            item.actualDeliveryDate && 
            item.actualDeliveryDate >= thisMonth
          );
        }
        
        return false;
      }).length;
      
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
