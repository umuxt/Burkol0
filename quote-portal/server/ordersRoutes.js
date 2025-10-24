// Orders API Routes - Backend order management
// This file handles order creation, item management, and stock updates
import express from 'express'
import admin from 'firebase-admin'

const router = express.Router()

// Get Firestore instance (will be initialized by server.js)
let db

// Initialize database connection when router is used
router.use((req, res, next) => {
  if (!db) {
    db = admin.firestore()
  }
  next()
})

// In-memory counters for order items (can be moved to Redis/DB later)
const orderItemCounters = new Map()

/**
 * Generate item codes for an order
 * Replaces Firebase orderItemCounters collection
 */
function generateItemCodes(orderId, count = 1) {
  const currentCounter = orderItemCounters.get(orderId) || 0
  const newCounter = currentCounter + count
  orderItemCounters.set(orderId, newCounter)
  
  const codes = []
  for (let i = 1; i <= count; i++) {
    const sequence = currentCounter + i
    codes.push({
      itemCode: `item-${String(sequence).padStart(2, '0')}`,
      itemSequence: sequence,
      lineId: `LINE-${String(sequence).padStart(2, '0')}`
    })
  }
  
  return codes
}

/**
 * POST /api/orders - Create new order with backend-generated item codes
 */
router.post('/orders', async (req, res) => {
  try {
    const { orderData } = req.body
    
    if (!orderData) {
      return res.status(400).json({ error: 'Order data is required' })
    }
    
    // Generate order code (keep existing logic)
    const now = new Date()
    const year = now.getFullYear()
    const yearKey = String(year)
    
    // Get next order sequence from systemCounters
    const counterDocRef = db.collection('systemCounters').doc('orderCounters')
    const result = await db.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(counterDocRef)
      const data = docSnap.exists ? docSnap.data() : {}
      const lastIndex = data?.[yearKey]?.lastIndex || 0
      const nextIndex = lastIndex + 1
      
      transaction.set(counterDocRef, {
        [yearKey]: {
          lastIndex: nextIndex,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      }, { merge: true })
      
      return {
        orderCode: `ORD-${year}-${String(nextIndex).padStart(4, '0')}`,
        orderSequence: nextIndex
      }
    })
    
    const orderCode = result.orderCode
    
    // Generate item codes for all items
    const items = orderData.items || []
    const itemCodes = generateItemCodes(orderCode, items.length)
    
    // Enhance items with generated codes
    const enhancedItems = items.map((item, index) => ({
      ...item,
      itemCode: itemCodes[index].itemCode,
      itemSequence: itemCodes[index].itemSequence,
      lineId: item.lineId || `${item.materialCode}-${String(itemCodes[index].itemSequence).padStart(2, '0')}`,
      itemStatus: item.itemStatus || 'Onay Bekliyor',
      createdAt: new Date(),
      updatedAt: new Date()
    }))
    
    // Prepare order document
    const orderToCreate = {
      orderCode,
      orderSequence: result.orderSequence,
      supplierId: orderData.supplierId,
      supplierName: orderData.supplierName,
      orderStatus: orderData.orderStatus || 'Taslak',
      orderDate: admin.firestore.FieldValue.serverTimestamp(),
      expectedDeliveryDate: orderData.expectedDeliveryDate,
      notes: orderData.notes || '',
      totalAmount: orderData.totalAmount || 0,
      createdBy: orderData.createdBy || 'system',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      items: enhancedItems,
      itemCount: enhancedItems.length
    }
    
    // Save to Firebase
    const orderDocRef = db.collection('orders').doc(orderCode)
    await orderDocRef.set(orderToCreate)
    
    // Create audit log for significant orders
    if (orderToCreate.totalAmount > 10000) {
      await db.collection('auditLogs').add({
        type: 'ORDER_CREATED',
        action: 'LARGE_ORDER',
        orderId: orderCode,
        supplierId: orderData.supplierId,
        totalAmount: orderToCreate.totalAmount,
        itemCount: enhancedItems.length,
        userId: orderData.createdBy || 'system',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      })
    }
    
    res.json({
      success: true,
      orderId: orderCode,
      order: {
        id: orderCode,
        ...orderToCreate,
        orderDate: new Date(),
        updatedAt: new Date()
      }
    })
    
  } catch (error) {
    console.error('❌ Order creation error:', error)
    res.status(500).json({ 
      error: 'Failed to create order',
      details: error.message 
    })
  }
})

/**
 * PUT /api/orders/:orderId/items/:itemId/deliver - Mark item as delivered and update stock
 */
router.put('/orders/:orderId/items/:itemId/deliver', async (req, res) => {
  try {
    const { orderId, itemId } = req.params
    const { userId = 'system' } = req.body
    
    // Get order document  
    const orderRef = db.collection('orders').doc(orderId)
    const orderSnap = await orderRef.get()
    
    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Order not found' })
    }
    
    const orderData = orderSnap.data()
    const items = orderData.items || []
    
    // Find item to update
    const itemIndex = items.findIndex(item => 
      item.itemCode === itemId || 
      item.lineId === itemId ||
      item.id === itemId
    )
    
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found in order' })
    }
    
    const item = items[itemIndex]
    
    if (item.itemStatus === 'Teslim Edildi') {
      return res.status(400).json({ error: 'Item already delivered' })
    }
    
    // Update item status
    items[itemIndex] = {
      ...item,
      itemStatus: 'Teslim Edildi',
      actualDeliveryDate: admin.firestore.FieldValue.serverTimestamp(),
      deliveredBy: userId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }
    
    // Update material stock
    const materialCode = item.materialCode
    const quantity = item.quantity
    
    if (materialCode && quantity > 0) {
      // Find material by code
      const materialsRef = db.collection('materials')
      const materialQuery = materialsRef.where('code', '==', materialCode)
      const materialSnapshot = await materialQuery.get()
      
      if (!materialSnapshot.empty) {
        const materialDoc = materialSnapshot.docs[0]
        const materialData = materialDoc.data()
        const currentStock = materialData.stock || 0
        const newStock = currentStock + quantity
        
        // Update material stock
        await materialDoc.ref.update({
          stock: newStock,
          available: newStock - (materialData.reserved || 0),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastStockUpdate: {
            orderId: orderId,
            itemId: item.itemCode,
            quantity: quantity,
            previousStock: currentStock,
            newStock: newStock,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            userId: userId
          }
        })
        
        console.log(`✅ Stock updated: ${materialCode} (${currentStock} → ${newStock})`)
        
        // Create audit log for significant stock changes
        if (quantity > 100 || newStock < 50) {
          await db.collection('auditLogs').add({
            type: 'STOCK_UPDATE',
            action: 'DELIVERY_RECEIVED',
            materialCode: materialCode,
            orderId: orderId,
            itemId: item.itemCode,
            quantity: quantity,
            previousStock: currentStock,
            newStock: newStock,
            userId: userId,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          })
        }
      }
    }
    
    // Update order document
    await orderRef.update({
      items: items,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    })
    
    res.json({
      success: true,
      message: 'Item delivered and stock updated',
      item: items[itemIndex]
    })
    
  } catch (error) {
    console.error('❌ Item delivery error:', error)
    res.status(500).json({ 
      error: 'Failed to mark item as delivered',
      details: error.message 
    })
  }
})

/**
 * GET /api/orders/:orderId - Get order with items
 */
router.get('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params
    
    const orderRef = db.collection('orders').doc(orderId)
    const orderSnap = await orderRef.get()
    
    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Order not found' })
    }
    
    const orderData = orderSnap.data()
    
    res.json({
      id: orderSnap.id,
      ...orderData,
      orderDate: orderData.orderDate?.toDate(),
      expectedDeliveryDate: orderData.expectedDeliveryDate?.toDate(),
      updatedAt: orderData.updatedAt?.toDate()
    })
    
  } catch (error) {
    console.error('❌ Get order error:', error)
    res.status(500).json({ 
      error: 'Failed to get order',
      details: error.message 
    })
  }
})

export { router as ordersRoutes }