/**
 * Sipariş Takip Sistemi Cloud Functions
 * Bu dosya Firebase Cloud Functions için hazırlanmıştır
 * 
 * İki ana otomasyonu içerir:
 * 1. Stok güncelleme - OrderItem "Teslim Edildi" olduğunda
 * 2. Sipariş durumu güncelleme - OrderItems durumuna göre
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Firebase Admin SDK'yı başlat
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Cloud Function: Stok Güncelleme
 * Tetikleyici: orderItems koleksiyonunda bir belge güncellendiğinde
 * İşlem: itemStatus "Teslim Edildi" olduğunda materials stok güncellemesi
 */
exports.updateStockOnDelivery = functions.firestore
  .document('orderItems/{itemId}')
  .onUpdate(async (change, context) => {
    try {
      const { itemId } = context.params;
      const beforeData = change.before.data();
      const afterData = change.after.data();
      
      console.log(`📦 OrderItem ${itemId} güncellendi`);
      
      // Status değişikliği kontrolü
      const statusChanged = beforeData.itemStatus !== afterData.itemStatus;
      const isDelivered = afterData.itemStatus === 'Teslim Edildi';
      const wasNotDelivered = beforeData.itemStatus !== 'Teslim Edildi';
      
      if (!statusChanged || !isDelivered || !wasNotDelivered) {
        console.log('⏭️ Stok güncellemesi gerekmiyor');
        return null;
      }
      
      // Malzeme bilgilerini al
      const { materialCode, quantity } = afterData;
      
      if (!materialCode || !quantity || quantity <= 0) {
        console.error('❌ Geçersiz malzeme kodu veya miktar');
        return null;
      }
      
      // Materials koleksiyonunda ilgili malzemeyi bul
      const materialsRef = db.collection('materials');
      const materialQuery = materialsRef.where('code', '==', materialCode);
      const materialSnapshot = await materialQuery.get();
      
      if (materialSnapshot.empty) {
        console.error(`❌ Malzeme bulunamadı: ${materialCode}`);
        return null;
      }
      
      // İlk eşleşen malzemeyi al (code unique olmalı)
      const materialDoc = materialSnapshot.docs[0];
      const materialData = materialDoc.data();
      const currentStock = materialData.stock || 0;
      const newStock = currentStock + quantity;
      
      // Malzeme stokunu güncelle
      await materialDoc.ref.update({
        stock: newStock,
        available: newStock - (materialData.reserved || 0),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastStockUpdate: {
          orderId: afterData.orderId,
          itemId: itemId,
          quantity: quantity,
          previousStock: currentStock,
          newStock: newStock,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        }
      });
      
      console.log(`✅ Stok güncellendi: ${materialCode} (${currentStock} → ${newStock})`);
      
      // Audit log oluştur
      await db.collection('auditLogs').add({
        type: 'STOCK_UPDATE',
        action: 'DELIVERY_RECEIVED',
        materialCode: materialCode,
        materialId: materialDoc.id,
        orderId: afterData.orderId,
        itemId: itemId,
        quantity: quantity,
        previousStock: currentStock,
        newStock: newStock,
        userId: 'system',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: {
          materialName: materialData.name,
          supplierInfo: afterData.supplierId || 'unknown'
        }
      });
      
      return null;
      
    } catch (error) {
      console.error('❌ Stok güncelleme hatası:', error);
      
      // Error log oluştur
      await db.collection('auditLogs').add({
        type: 'ERROR',
        action: 'STOCK_UPDATE_FAILED',
        itemId: context.params.itemId,
        error: error.message,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      throw error;
    }
  });

/**
 * Cloud Function: Sipariş Durumu Güncelleme
 * Tetikleyici: orderItems koleksiyonunda bir belge güncellendiğinde
 * İşlem: Tüm orderItems durumuna göre ana order durumunu güncelle
 */
exports.updateOrderStatusBasedOnItems = functions.firestore
  .document('orderItems/{itemId}')
  .onUpdate(async (change, context) => {
    try {
      const { itemId } = context.params;
      const beforeData = change.before.data();
      const afterData = change.after.data();
      
      console.log(`📋 OrderItem ${itemId} durum kontrolü`);
      
      // Status değişikliği kontrolü
      const statusChanged = beforeData.itemStatus !== afterData.itemStatus;
      
      if (!statusChanged) {
        console.log('⏭️ Status değişmedi, sipariş durumu kontrolü gerekmiyor');
        return null;
      }
      
      const { orderId } = afterData;
      
      if (!orderId) {
        console.error('❌ OrderId bulunamadı');
        return null;
      }
      
      // Bu siparişe ait tüm orderItems'ları al
      const orderItemsRef = db.collection('orderItems');
      const orderItemsQuery = orderItemsRef.where('orderId', '==', orderId);
      const orderItemsSnapshot = await orderItemsQuery.get();
      
      if (orderItemsSnapshot.empty) {
        console.log('⚠️ Bu siparişe ait item bulunamadı');
        return null;
      }
      
      // İstatistikleri hesapla
      let totalItems = 0;
      let deliveredItems = 0;
      let cancelledItems = 0;
      
      orderItemsSnapshot.forEach(doc => {
        const itemData = doc.data();
        totalItems++;
        
        if (itemData.itemStatus === 'Teslim Edildi') {
          deliveredItems++;
        } else if (itemData.itemStatus === 'İptal Edildi' || itemData.itemStatus === 'Reddedildi') {
          cancelledItems++;
        }
      });
      
      console.log(`📊 Sipariş istatistikleri: ${deliveredItems}/${totalItems} teslim edildi, ${cancelledItems} iptal`);
      
      // Yeni sipariş durumunu belirle
      let newOrderStatus = null;
      
      if (deliveredItems === totalItems && totalItems > 0) {
        // Tüm items teslim edildi
        newOrderStatus = 'Tamamlandı';
      } else if (deliveredItems > 0) {
        // Kısmi teslimat
        newOrderStatus = 'Kısmi Teslimat';
      } else if (cancelledItems === totalItems && totalItems > 0) {
        // Tüm items iptal edildi
        newOrderStatus = 'İptal Edildi';
      }
      // Diğer durumlar: Durum değişmez (Onaylandı, vb. kalır)
      
      if (!newOrderStatus) {
        console.log('⏭️ Sipariş durumu değişikliği gerekmiyor');
        return null;
      }
      
      // Ana siparişi güncelle
      const orderRef = db.collection('orders').doc(orderId);
      const orderDoc = await orderRef.get();
      
      if (!orderDoc.exists) {
        console.error(`❌ Sipariş bulunamadı: ${orderId}`);
        return null;
      }
      
      const currentOrderData = orderDoc.data();
      const currentStatus = currentOrderData.orderStatus;
      
      if (currentStatus === newOrderStatus) {
        console.log(`⏭️ Sipariş durumu zaten ${newOrderStatus}`);
        return null;
      }
      
      // Sipariş durumunu güncelle
      await orderRef.update({
        orderStatus: newOrderStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        statusHistory: admin.firestore.FieldValue.arrayUnion({
          from: currentStatus,
          to: newOrderStatus,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          triggeredBy: 'system',
          reason: 'order_items_status_change',
          itemStats: {
            total: totalItems,
            delivered: deliveredItems,
            cancelled: cancelledItems
          }
        })
      });
      
      console.log(`✅ Sipariş durumu güncellendi: ${orderId} (${currentStatus} → ${newOrderStatus})`);
      
      // Audit log oluştur
      await db.collection('auditLogs').add({
        type: 'ORDER_STATUS_UPDATE',
        action: 'AUTO_STATUS_CHANGE',
        orderId: orderId,
        previousStatus: currentStatus,
        newStatus: newOrderStatus,
        triggeredBy: 'system',
        reason: 'order_items_status_change',
        itemStats: {
          total: totalItems,
          delivered: deliveredItems,
          cancelled: cancelledItems
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return null;
      
    } catch (error) {
      console.error('❌ Sipariş durumu güncelleme hatası:', error);
      
      // Error log oluştur
      await db.collection('auditLogs').add({
        type: 'ERROR',
        action: 'ORDER_STATUS_UPDATE_FAILED',
        itemId: context.params.itemId,
        error: error.message,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      throw error;
    }
  });

/**
 * Cloud Function: Sipariş Oluşturulduğunda
 * Tetikleyici: orders koleksiyonuna yeni belge eklendiğinde
 * İşlem: Başlangıç durumu ve audit log oluştur
 */
exports.onOrderCreated = functions.firestore
  .document('orders/{orderId}')
  .onCreate(async (snapshot, context) => {
    try {
      const { orderId } = context.params;
      const orderData = snapshot.data();
      
      console.log(`📝 Yeni sipariş oluşturuldu: ${orderId}`);
      
      // Audit log oluştur
      await db.collection('auditLogs').add({
        type: 'ORDER_CREATED',
        action: 'ORDER_NEW',
        orderId: orderId,
        supplierId: orderData.supplierId,
        supplierName: orderData.supplierName,
        totalAmount: orderData.totalAmount,
        orderStatus: orderData.orderStatus,
        createdBy: orderData.createdBy || 'unknown',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: {
          notes: orderData.notes || '',
          expectedDeliveryDate: orderData.expectedDeliveryDate || null
        }
      });
      
      return null;
      
    } catch (error) {
      console.error('❌ Sipariş oluşturma log hatası:', error);
      return null; // Bu hata kritik değil, sipariş oluşturmayı engellemez
    }
  });

/**
 * Cloud Function: OrderItem Oluşturulduğunda
 * Tetikleyici: orderItems koleksiyonuna yeni belge eklendiğinde
 * İşlem: Audit log oluştur
 */
exports.onOrderItemCreated = functions.firestore
  .document('orderItems/{itemId}')
  .onCreate(async (snapshot, context) => {
    try {
      const { itemId } = context.params;
      const itemData = snapshot.data();
      
      console.log(`📦 Yeni sipariş kalemi oluşturuldu: ${itemId}`);
      
      // Audit log oluştur
      await db.collection('auditLogs').add({
        type: 'ORDER_ITEM_CREATED',
        action: 'ORDER_ITEM_NEW',
        itemId: itemId,
        orderId: itemData.orderId,
        materialCode: itemData.materialCode,
        materialName: itemData.materialName,
        quantity: itemData.quantity,
        unitPrice: itemData.unitPrice,
        itemStatus: itemData.itemStatus,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      return null;
      
    } catch (error) {
      console.error('❌ OrderItem oluşturma log hatası:', error);
      return null; // Bu hata kritik değil
    }
  });

/**
 * Scheduled Function: Günlük Sipariş Raporu
 * Tetikleyici: Her gün saat 09:00'da
 * İşlem: Günlük sipariş istatistiklerini hesapla ve kaydet
 */
exports.dailyOrderReport = functions.pubsub
  .schedule('0 9 * * *') // Her gün 09:00
  .timeZone('Europe/Istanbul')
  .onRun(async (context) => {
    try {
      console.log('📊 Günlük sipariş raporu oluşturuluyor...');
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Bugün oluşturulan siparişler
      const ordersRef = db.collection('orders');
      const todayOrdersQuery = ordersRef
        .where('orderDate', '>=', today)
        .where('orderDate', '<', tomorrow);
      
      const todayOrdersSnapshot = await todayOrdersQuery.get();
      
      // İstatistikleri hesapla
      let stats = {
        date: today,
        totalOrders: todayOrdersSnapshot.size,
        totalAmount: 0,
        statusBreakdown: {
          'Taslak': 0,
          'Onay Bekliyor': 0,
          'Onaylandı': 0,
          'Kısmi Teslimat': 0,
          'Tamamlandı': 0,
          'İptal Edildi': 0
        },
        topSuppliers: {}
      };
      
      todayOrdersSnapshot.forEach(doc => {
        const orderData = doc.data();
        stats.totalAmount += orderData.totalAmount || 0;
        
        // Status breakdown
        const status = orderData.orderStatus || 'Taslak';
        if (stats.statusBreakdown[status] !== undefined) {
          stats.statusBreakdown[status]++;
        }
        
        // Top suppliers
        const supplierId = orderData.supplierId;
        if (supplierId) {
          if (!stats.topSuppliers[supplierId]) {
            stats.topSuppliers[supplierId] = {
              name: orderData.supplierName,
              orderCount: 0,
              totalAmount: 0
            };
          }
          stats.topSuppliers[supplierId].orderCount++;
          stats.topSuppliers[supplierId].totalAmount += orderData.totalAmount || 0;
        }
      });
      
      // Raporu kaydet
      await db.collection('dailyReports').add({
        type: 'ORDERS',
        date: today,
        stats: stats,
        generatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`✅ Günlük sipariş raporu oluşturuldu: ${stats.totalOrders} sipariş`);
      
      return null;
      
    } catch (error) {
      console.error('❌ Günlük rapor hatası:', error);
      return null;
    }
  });

/**
 * HTTPS Function: Manuel Sipariş Durumu Güncelleme
 * Kullanım: Manuel olarak bir siparişin durumunu güncellemek için
 */
exports.updateOrderStatus = functions.https.onCall(async (data, context) => {
  try {
    // Auth kontrolü
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Kimlik doğrulama gerekli');
    }
    
    const { orderId, newStatus, reason } = data;
    
    if (!orderId || !newStatus) {
      throw new functions.https.HttpsError('invalid-argument', 'OrderId ve newStatus gerekli');
    }
    
    console.log(`📋 Manuel sipariş durumu güncelleme: ${orderId} → ${newStatus}`);
    
    // Sipariş kontrolü
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    
    if (!orderDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Sipariş bulunamadı');
    }
    
    const currentData = orderDoc.data();
    const currentStatus = currentData.orderStatus;
    
    // Sipariş durumunu güncelle
    await orderRef.update({
      orderStatus: newStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      statusHistory: admin.firestore.FieldValue.arrayUnion({
        from: currentStatus,
        to: newStatus,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        triggeredBy: context.auth.uid,
        reason: reason || 'manual_update'
      })
    });
    
    // Audit log
    await db.collection('auditLogs').add({
      type: 'ORDER_STATUS_UPDATE',
      action: 'MANUAL_STATUS_CHANGE',
      orderId: orderId,
      previousStatus: currentStatus,
      newStatus: newStatus,
      triggeredBy: context.auth.uid,
      reason: reason || 'manual_update',
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ Manuel sipariş durumu güncellendi: ${orderId} (${currentStatus} → ${newStatus})`);
    
    return {
      success: true,
      message: 'Sipariş durumu başarıyla güncellendi',
      orderId: orderId,
      previousStatus: currentStatus,
      newStatus: newStatus
    };
    
  } catch (error) {
    console.error('❌ Manuel sipariş durumu güncelleme hatası:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    
    throw new functions.https.HttpsError('internal', 'Sipariş durumu güncellenemedi');
  }
});