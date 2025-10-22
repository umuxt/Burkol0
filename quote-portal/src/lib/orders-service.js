// Firebase Orders Service Layer
// Bu dosya tüm sipariş ile ilgili Firebase işlemlerini yönetir

import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter,
  writeBatch,
  increment,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  onSnapshot,
  Timestamp,
  setDoc,
  runTransaction
} from 'firebase/firestore';

import { db, COLLECTIONS } from '../firebase-config.js';

// ================================
// ORDERS CRUD OPERATIONS
// ================================

export class OrdersService {

  static async generateOrderCode(customYear = null) {
    const now = new Date();
    const year = customYear || now.getFullYear();
    const yearKey = String(year);
    const counterDocRef = doc(db, 'systemCounters', 'orderCounters');

    const { orderCode, orderSequence } = await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(counterDocRef);
      const data = docSnap.exists() ? docSnap.data() : {};
      const lastIndex = data?.[yearKey]?.lastIndex || 0;
      const nextIndex = lastIndex + 1;

      transaction.set(counterDocRef, {
        [yearKey]: {
          lastIndex: nextIndex,
          updatedAt: serverTimestamp()
        }
      }, { merge: true });

      return {
        orderCode: `ORD-${year}-${String(nextIndex).padStart(4, '0')}`,
        orderSequence: nextIndex
      };
    });

    return {
      orderCode,
      orderYear: year,
      orderSequence
    };
  }
  
  // **CREATE ORDER**
  static async createOrder(orderData) {
    try {
      const ordersRef = collection(db, COLLECTIONS.ORDERS);

      const { orderCode, orderYear, orderSequence } = orderData.orderCode
        ? (() => {
            const codeMatch = orderData.orderCode.match(/ORD-(\d{4})-(\d+)/);
            return {
              orderCode: orderData.orderCode,
              orderYear: orderData.orderYear || (codeMatch ? Number(codeMatch[1]) : new Date().getFullYear()),
              orderSequence: orderData.orderSequence || (codeMatch ? Number(codeMatch[2]) : 0)
            };
          })()
        : await this.generateOrderCode(orderData.orderYear);

      // Prepare order data with auto-generated fields
      const orderToCreate = {
        ...orderData,
        orderCode,
        orderYear,
        orderSequence,
        orderDate: serverTimestamp(),
        orderStatus: orderData.orderStatus || 'Taslak',
        totalAmount: orderData.totalAmount || 0,
        createdBy: orderData.createdBy || 'system',
        updatedAt: serverTimestamp(),
        items: Array.isArray(orderData.items) ? orderData.items : [],
        itemCount: Array.isArray(orderData.items) ? orderData.items.length : 0
      };
      
      // Validate required fields
      if (!orderToCreate.supplierId) {
        throw new Error('Tedarikçi ID gerekli');
      }
      
      if (!orderToCreate.supplierName) {
        throw new Error('Tedarikçi adı gerekli');
      }
      
      const orderDocRef = doc(ordersRef, orderCode);
      await setDoc(orderDocRef, orderToCreate);
      
      console.log('✅ Order created successfully:', orderCode);
      
      return {
        id: orderCode,
        ...orderToCreate,
        orderDate: new Date(),
        updatedAt: new Date()
      };
      
    } catch (error) {
      console.error('❌ Error creating order:', error);
      throw new Error(`Sipariş oluşturulamadı: ${error.message}`);
    }
  }
  
    // **READ ORDERS**
  static async getOrders(filters = {}, pagination = {}) {
    try {
      let q = collection(db, COLLECTIONS.ORDERS);
      
      // Apply filters - Single field filters only to avoid index requirements
      const queries = [];
      
      if (filters.orderStatus) {
        if (Array.isArray(filters.orderStatus)) {
          // Multiple statuses - use 'in' operator (max 10 values)
          if (filters.orderStatus.length <= 10) {
            queries.push(where('orderStatus', 'in', filters.orderStatus));
          } else {
            // If more than 10 statuses, use first status only
            queries.push(where('orderStatus', '==', filters.orderStatus[0]));
          }
        } else {
          queries.push(where('orderStatus', '==', filters.orderStatus));
        }
        
        // When filtering by status, don't add orderBy to avoid composite index requirement
        // Just use limit if provided
        if (pagination.limit) {
          queries.push(limit(pagination.limit));
        }
      } else {
        // Only add orderBy when not filtering by status
        queries.push(orderBy(pagination.orderBy || 'orderDate', pagination.order || 'desc'));
        
        // Add limit
        if (pagination.limit) {
          queries.push(limit(pagination.limit));
        }
      }
      
      if (filters.supplierId) {
        queries.push(where('supplierId', '==', filters.supplierId));
      }
      
      if (filters.createdBy) {
        queries.push(where('createdBy', '==', filters.createdBy));
      }
      
      // Create final query
      if (queries.length > 0) {
        q = query(q, ...queries);
      }
      
      const snapshot = await getDocs(q);
      
      const orders = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const items = Array.isArray(data.items)
          ? data.items.map(item => ({
              ...item,
              expectedDeliveryDate: item.expectedDeliveryDate?.toDate ? item.expectedDeliveryDate.toDate() : item.expectedDeliveryDate
            }))
          : [];
        orders.push({
          id: doc.id,
          ...data,
          orderCode: data.orderCode || doc.id,
          // Convert Timestamps to Date objects
          orderDate: data.orderDate?.toDate ? data.orderDate.toDate() : data.orderDate,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
          expectedDeliveryDate: data.expectedDeliveryDate?.toDate ? data.expectedDeliveryDate.toDate() : data.expectedDeliveryDate,
          items,
          itemCount: data.itemCount ?? items.length
        });
      });
      
      // If we filtered by status but need sorting, sort in memory
      if (filters.orderStatus && orders.length > 0) {
        const sortField = pagination.orderBy || 'orderDate';
        const sortOrder = pagination.order || 'desc';
        
        orders.sort((a, b) => {
          const aValue = a[sortField];
          const bValue = b[sortField];
          
          if (!aValue && !bValue) return 0;
          if (!aValue) return sortOrder === 'desc' ? 1 : -1;
          if (!bValue) return sortOrder === 'desc' ? -1 : 1;
          
          if (aValue instanceof Date && bValue instanceof Date) {
            return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
          }
          
          if (typeof aValue === 'string' && typeof bValue === 'string') {
            return sortOrder === 'desc' ? bValue.localeCompare(aValue) : aValue.localeCompare(bValue);
          }
          
          return sortOrder === 'desc' ? bValue - aValue : aValue - bValue;
        });
      }
      
      console.log(`📋 Fetched ${orders.length} orders from Firestore`);
      return orders;
      
    } catch (error) {
      console.error('❌ Error fetching orders:', error);
      throw new Error(`Siparişler getirilemedi: ${error.message}`);
    }
  }
  
  // **GET SINGLE ORDER**
  static async getOrder(orderId) {
    try {
      const orderRef = doc(db, COLLECTIONS.ORDERS, orderId);
      const orderSnap = await getDoc(orderRef);
      
      if (!orderSnap.exists()) {
        throw new Error('Sipariş bulunamadı');
      }
      
      const data = orderSnap.data();
      const items = Array.isArray(data.items)
        ? data.items.map(item => ({
            ...item,
            expectedDeliveryDate: item.expectedDeliveryDate?.toDate ? item.expectedDeliveryDate.toDate() : item.expectedDeliveryDate
          }))
        : [];
      const itemCount = data.itemCount ?? items.length;
      return {
        id: orderSnap.id,
        ...data,
        orderCode: data.orderCode || orderSnap.id,
        orderDate: data.orderDate?.toDate ? data.orderDate.toDate() : data.orderDate,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
        items,
        itemCount
      };
      
    } catch (error) {
      console.error('❌ Error fetching order:', error);
      throw new Error(`Sipariş getirilemedi: ${error.message}`);
    }
  }
  
  // **UPDATE ORDER**
  static async updateOrder(orderId, updateData) {
    try {
      const orderRef = doc(db, COLLECTIONS.ORDERS, orderId);
      
      const dataToUpdate = {
        ...updateData,
        updatedAt: serverTimestamp()
      };
      
      await updateDoc(orderRef, dataToUpdate);
      
      console.log('✅ Order updated successfully:', orderId);
      
      // Return updated order
      return await this.getOrder(orderId);
      
    } catch (error) {
      console.error('❌ Error updating order:', error);
      throw new Error(`Sipariş güncellenemedi: ${error.message}`);
    }
  }
  
  // **DELETE ORDER**
  static async deleteOrder(orderId) {
    try {
      const batch = writeBatch(db);
      
      // Delete order items first
      const orderItemsQuery = query(
        collection(db, COLLECTIONS.ORDER_ITEMS),
        where('orderId', '==', orderId)
      );
      
      const orderItemsSnapshot = await getDocs(orderItemsQuery);
      orderItemsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      // Delete the order
      const orderRef = doc(db, COLLECTIONS.ORDERS, orderId);
      batch.delete(orderRef);
      
      await batch.commit();

      try {
        await deleteDoc(doc(db, 'orderItemCounters', orderId));
      } catch (counterError) {
        console.warn('⚠️ Order item counter cleanup skipped:', counterError?.message);
      }
      
      console.log('✅ Order and related items deleted successfully:', orderId);
      
    } catch (error) {
      console.error('❌ Error deleting order:', error);
      throw new Error(`Sipariş silinemedi: ${error.message}`);
    }
  }
  
  // **REAL-TIME SUBSCRIPTION**
  static subscribeToOrders(filters = {}, callback) {
    try {
      let q = collection(db, COLLECTIONS.ORDERS);
      
      // Apply filters - Simple queries only to avoid index requirements
      const queries = [];
      
      if (filters.orderStatus) {
        if (Array.isArray(filters.orderStatus)) {
          if (filters.orderStatus.length <= 10) {
            queries.push(where('orderStatus', 'in', filters.orderStatus));
          } else {
            queries.push(where('orderStatus', '==', filters.orderStatus[0]));
          }
        } else {
          queries.push(where('orderStatus', '==', filters.orderStatus));
        }
        
        // Don't add orderBy when filtering by status to avoid composite index
      } else {
        // Add order by only when not filtering by status
        queries.push(orderBy('orderDate', 'desc'));
      }
      
      if (filters.supplierId) {
        queries.push(where('supplierId', '==', filters.supplierId));
      }
      
      // Create final query
      if (queries.length > 0) {
        q = query(q, ...queries);
      }
      
      return onSnapshot(q, (snapshot) => {
        const orders = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          const items = Array.isArray(data.items)
            ? data.items.map(item => ({
                ...item,
                expectedDeliveryDate: item.expectedDeliveryDate?.toDate ? item.expectedDeliveryDate.toDate() : item.expectedDeliveryDate
              }))
            : [];
          orders.push({
            id: doc.id,
            ...data,
            orderCode: data.orderCode || doc.id,
            orderDate: data.orderDate?.toDate ? data.orderDate.toDate() : data.orderDate,
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
            items,
            itemCount: data.itemCount ?? items.length
          });
        });
        
        // Sort in memory if we filtered by status
        if (filters.orderStatus && orders.length > 0) {
          orders.sort((a, b) => {
            const aDate = a.orderDate;
            const bDate = b.orderDate;
            
            if (!aDate && !bDate) return 0;
            if (!aDate) return 1;
            if (!bDate) return -1;
            
            return bDate - aDate; // desc order
          });
        }
        
        callback(orders);
      });
      
    } catch (error) {
      console.error('❌ Error setting up orders subscription:', error);
      throw new Error(`Sipariş dinleme başlatılamadı: ${error.message}`);
    }
  }
}

// ================================
// ORDER ITEMS CRUD OPERATIONS
// ================================

export class OrderItemsService {

  static async generateItemCodes(orderId, count = 1) {
    if (!orderId) {
      throw new Error('Sipariş ID gerekli');
    }

    const counterDocRef = doc(db, 'orderItemCounters', orderId);

    const { startIndex } = await runTransaction(db, async (transaction) => {
      const docSnap = await transaction.get(counterDocRef);
      const data = docSnap.exists() ? docSnap.data() : {};
      const lastIndex = data.lastIndex || 0;
      const nextIndex = lastIndex + count;

      transaction.set(counterDocRef, {
        lastIndex: nextIndex,
        updatedAt: serverTimestamp()
      }, { merge: true });

      return {
        startIndex: lastIndex + 1
      };
    });

    return Array.from({ length: count }, (_, i) => {
      const sequence = startIndex + i;
      return {
        itemCode: `item-${String(sequence).padStart(2, '0')}`,
        itemSequence: sequence
      };
    });
  }
  
  // **CREATE ORDER ITEM**
  static async createOrderItem(itemData) {
    try {
      const orderItemsRef = collection(db, COLLECTIONS.ORDER_ITEMS);

      const [{ itemCode, itemSequence }] = await this.generateItemCodes(itemData.orderId, 1);

      const baseLineId = itemData.lineId || `${itemData.materialCode || itemCode}-${String(itemSequence).padStart(2, '0')}`;

      // Prepare item data
      const itemToCreate = {
        ...itemData,
        lineId: baseLineId,
        itemCode,
        itemSequence,
        itemStatus: itemData.itemStatus || 'Onay Bekliyor',
        actualDeliveryDate: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      // Validate required fields
      if (!itemToCreate.orderId) {
        throw new Error('Sipariş ID gerekli');
      }
      
      if (!itemToCreate.materialCode) {
        throw new Error('Malzeme kodu gerekli');
      }
      
      if (!itemToCreate.quantity || itemToCreate.quantity <= 0) {
        throw new Error('Geçerli bir miktar gerekli');
      }
      
      const docRef = await addDoc(orderItemsRef, itemToCreate);
      
      console.log('✅ Order item created successfully:', docRef.id);
      
      return {
        id: docRef.id,
        ...itemToCreate,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
    } catch (error) {
      console.error('❌ Error creating order item:', error);
      throw new Error(`Sipariş kalemi oluşturulamadı: ${error.message}`);
    }
  }
  
  // **GET ORDER ITEMS BY ORDER ID**
  static async getOrderItems(orderId) {
    try {
      const q = query(
        collection(db, COLLECTIONS.ORDER_ITEMS),
        where('orderId', '==', orderId)
      );
      
      const snapshot = await getDocs(q);
      
      const items = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          ...data,
          itemCode: data.itemCode || `item-${String(data.itemSequence || 0).padStart(2, '0')}`,
          itemSequence: data.itemSequence,
          itemStatus: data.itemStatus || 'Onay Bekliyor',
          expectedDeliveryDate: data.expectedDeliveryDate?.toDate ? data.expectedDeliveryDate.toDate() : data.expectedDeliveryDate,
          actualDeliveryDate: data.actualDeliveryDate?.toDate ? data.actualDeliveryDate.toDate() : data.actualDeliveryDate,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt
        });
      });
      
      items.sort((a, b) => {
        const aSeq = a.itemSequence || 0;
        const bSeq = b.itemSequence || 0;
        if (aSeq === bSeq) {
          return (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0);
        }
        return aSeq - bSeq;
      });

      let fallbackIndex = 1;
      items.forEach(item => {
        if (!item.itemSequence) {
          item.itemSequence = fallbackIndex;
          item.itemCode = item.itemCode || `item-${String(fallbackIndex).padStart(2, '0')}`;
          item.lineId = item.lineId || `${item.materialCode || item.itemCode}-${String(fallbackIndex).padStart(2, '0')}`;
          fallbackIndex += 1;
        } else {
          item.itemCode = item.itemCode || `item-${String(item.itemSequence).padStart(2, '0')}`;
          fallbackIndex = Math.max(fallbackIndex, item.itemSequence + 1);
          item.lineId = item.lineId || `${item.materialCode || item.itemCode}-${String(item.itemSequence).padStart(2, '0')}`;
        }
      });

      console.log(`📦 Fetched ${items.length} order items for order ${orderId}`);
      return items;
      
    } catch (error) {
      console.error('❌ Error fetching order items:', error);
      throw new Error(`Sipariş kalemleri getirilemedi: ${error.message}`);
    }
  }
  
  // **UPDATE ORDER ITEM**
  static async updateOrderItem(itemId, updateData) {
    try {
      const itemRef = doc(db, COLLECTIONS.ORDER_ITEMS, itemId);
      
      const dataToUpdate = {
        ...updateData,
        updatedAt: serverTimestamp()
      };
      
      // If status is changing to "Teslim Edildi", set actual delivery date
      if (updateData.itemStatus === 'Teslim Edildi' && !updateData.actualDeliveryDate) {
        dataToUpdate.actualDeliveryDate = serverTimestamp();
      }
      
      await updateDoc(itemRef, dataToUpdate);
      
      console.log('✅ Order item updated successfully:', itemId);
      
      // Get the updated item
      const itemSnap = await getDoc(itemRef);
      const data = itemSnap.data();
      
      return {
        id: itemSnap.id,
        ...data,
        expectedDeliveryDate: data.expectedDeliveryDate?.toDate ? data.expectedDeliveryDate.toDate() : data.expectedDeliveryDate,
        actualDeliveryDate: data.actualDeliveryDate?.toDate ? data.actualDeliveryDate.toDate() : data.actualDeliveryDate,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt
      };
      
    } catch (error) {
      console.error('❌ Error updating order item:', error);
      throw new Error(`Sipariş kalemi güncellenemedi: ${error.message}`);
    }
  }
  
  // **DELETE ORDER ITEM**
  static async deleteOrderItem(itemId) {
    try {
      const itemRef = doc(db, COLLECTIONS.ORDER_ITEMS, itemId);
      await deleteDoc(itemRef);
      
      console.log('✅ Order item deleted successfully:', itemId);
      
    } catch (error) {
      console.error('❌ Error deleting order item:', error);
      throw new Error(`Sipariş kalemi silinemedi: ${error.message}`);
    }
  }
  
  // **BULK CREATE ORDER ITEMS**
  static async createOrderItems(orderItems) {
    try {
      if (!orderItems || orderItems.length === 0) {
        return [];
      }

      const batch = writeBatch(db);
      const orderItemsRef = collection(db, COLLECTIONS.ORDER_ITEMS);

      const orderId = orderItems[0].orderId;
      const hasDifferentOrder = orderItems.some(item => item.orderId !== orderId);
      if (hasDifferentOrder) {
        throw new Error('Toplu oluşturma için tüm sipariş kalemleri aynı siparişe ait olmalıdır');
      }
      const mappings = await this.generateItemCodes(orderId, orderItems.length);

      const createdItems = [];

      orderItems.forEach((itemData, index) => {
        const { itemCode, itemSequence } = mappings[index];
        const baseLineId = itemData.lineId || `${itemData.materialCode || itemCode}-${String(itemSequence).padStart(2, '0')}`;
        
        const itemToCreate = {
          ...itemData,
          lineId: baseLineId,
          itemCode,
          itemSequence,
          itemStatus: itemData.itemStatus || 'Onay Bekliyor',
          actualDeliveryDate: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        
        const newItemRef = doc(orderItemsRef);
        batch.set(newItemRef, itemToCreate);
        
        createdItems.push({
          id: newItemRef.id,
          ...itemToCreate,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      });
      
      await batch.commit();
      
      console.log(`✅ ${createdItems.length} order items created successfully`);
      return createdItems;
      
    } catch (error) {
      console.error('❌ Error creating order items in batch:', error);
      throw new Error(`Sipariş kalemleri oluşturulamadı: ${error.message}`);
    }
  }
}

// ================================
// HELPER FUNCTIONS
// ================================

// **GET ORDER WITH ITEMS**
export async function getOrderWithItems(orderId) {
  try {
    const order = await OrdersService.getOrder(orderId);

    try {
      const items = await OrderItemsService.getOrderItems(orderId);
      return {
        ...order,
        items
      };
    } catch (itemError) {
      console.warn('⚠️ Order items fallback to embedded data:', itemError?.message);
      return {
        ...order,
        items: order.items || []
      };
    }
    
  } catch (error) {
    console.error('❌ Error fetching order with items:', error);
    throw new Error(`Sipariş ve kalemleri getirilemedi: ${error.message}`);
  }
}

// **UPDATE ORDER STATUS BASED ON ITEMS**
export async function updateOrderStatusBasedOnItems(orderId) {
  try {
    const items = await OrderItemsService.getOrderItems(orderId);
    
    if (items.length === 0) {
      return; // No items, no status update needed
    }
    
    const deliveredItems = items.filter(item => item.itemStatus === 'Teslim Edildi');
    const totalItems = items.length;
    
    let newStatus;
    
    if (deliveredItems.length === 0) {
      // No items delivered - keep current status unless it's completed
      const order = await OrdersService.getOrder(orderId);
      if (order.orderStatus === 'Tamamlandı') {
        newStatus = 'Onaylandı'; // Revert from completed if no items are delivered
      }
    } else if (deliveredItems.length === totalItems) {
      // All items delivered
      newStatus = 'Teslim Edildi';
    } else {
      // Partial delivery
      newStatus = 'Kısmi Teslimat';
    }
    
    if (newStatus) {
      await OrdersService.updateOrder(orderId, { orderStatus: newStatus });
      console.log(`📋 Order ${orderId} status updated to: ${newStatus}`);
    }
    
  } catch (error) {
    console.error('❌ Error updating order status based on items:', error);
    throw new Error(`Sipariş durumu güncellenemedi: ${error.message}`);
  }
}

export default OrdersService;
