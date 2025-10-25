// Orders API Routes - Backend order management
// This file handles order creation, item management, and stock updates
import express from 'express'
import admin from 'firebase-admin'

const router = express.Router()

// Get Firestore instance (will be initialized by server.js)
let db

// Debug middleware
router.use((req, res, next) => {
  if (!db) {
    db = admin.firestore()
  }
  console.log(`🔍 Orders API: ${req.method} ${req.path} - Full URL: ${req.originalUrl}`)
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
 * PUT /api/orders/:orderId/items/:itemId - Update order item
 */
router.put('/orders/:orderId/items/:itemId', async (req, res) => {
  console.log('🎯🎯🎯 ROUTE MATCHED! Item update route HIT!')
  try {
    const { orderId, itemId } = req.params
    const updates = req.body
    
    console.log('📝 DEBUG: Updating order item:', orderId, itemId, updates)
    
    // Get order document  
    const orderRef = db.collection('orders').doc(orderId)
    const orderSnap = await orderRef.get()
    
    if (!orderSnap.exists) {
      console.log('❌ DEBUG: Order not found:', orderId)
      return res.status(404).json({ error: 'Order not found' })
    }
    
    const orderData = orderSnap.data()
    const items = orderData.items || []
    
    console.log('🔍 DEBUG: Looking for itemId:', itemId)
    console.log('🔍 DEBUG: Available items:', items.map(item => ({
      id: item.id,
      itemCode: item.itemCode,
      lineId: item.lineId,
      materialCode: item.materialCode
    })))
    
    // Find item to update
    const itemIndex = items.findIndex(item => 
      item.itemCode === itemId || 
      item.lineId === itemId ||
      item.id === itemId
    )
    
    console.log('🔍 DEBUG: Item found at index:', itemIndex)
    
    if (itemIndex === -1) {
      console.log('❌ DEBUG: Item not found. Search details:', {
        searchItemId: itemId,
        againstFields: ['itemCode', 'lineId', 'id'],
        availableItems: items.map(item => ({ 
          itemCode: item.itemCode, 
          lineId: item.lineId, 
          id: item.id 
        }))
      })
      return res.status(404).json({ error: 'Item not found in order' })
    }
    
    // Update item
    const currentTimestamp = new Date()
    items[itemIndex] = {
      ...items[itemIndex],
      ...updates,
      updatedAt: currentTimestamp
    }
    
    // Check if order status should be updated based on all items' status
    let newOrderStatus = null
    const itemStatuses = items.map(item => item.itemStatus || 'Onay Bekliyor')
    console.log('🔍 DEBUG: All item statuses:', itemStatuses)
    
    // Determine new order status based on item statuses
    if (itemStatuses.every(status => status === 'Teslim Edildi')) {
      newOrderStatus = 'Teslim Edildi'
      console.log('✅ DEBUG: All items delivered, updating order status to: Teslim Edildi')
    } else if (itemStatuses.every(status => status === 'İptal Edildi')) {
      newOrderStatus = 'İptal Edildi'
      console.log('❌ DEBUG: All items cancelled, updating order status to: İptal Edildi')
    } else if (itemStatuses.some(status => status === 'Yolda')) {
      newOrderStatus = 'Yolda'
      console.log('🚚 DEBUG: Some items in transit, updating order status to: Yolda')
    } else if (itemStatuses.some(status => status === 'Onaylandı')) {
      newOrderStatus = 'Onaylandı'
      console.log('✅ DEBUG: Some items approved, updating order status to: Onaylandı')
    }
    
    // Prepare update object
    const updateData = {
      items: items,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }
    
    // Add order status update if needed
    if (newOrderStatus) {
      updateData.orderStatus = newOrderStatus
      console.log('🔄 DEBUG: Updating order status to:', newOrderStatus)
    }
    
    // Update order
    await orderRef.update(updateData)
    
    res.json({
      item: items[itemIndex],
      message: 'Item updated successfully'
    })
    
  } catch (error) {
    console.error('❌ Update item error:', error)
    res.status(500).json({ 
      error: 'Failed to update item',
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
 * GET /api/orders/stats - Get order statistics
 */
router.get('/orders/stats', async (req, res) => {
  try {
    console.log('📊 Getting order statistics...')
    
    const ordersSnapshot = await db.collection('orders').get()
    const orders = []
    
    ordersSnapshot.forEach(doc => {
      const orderData = doc.data()
      orders.push({
        id: doc.id,
        ...orderData,
        orderDate: orderData.orderDate?.toDate ? orderData.orderDate.toDate() : orderData.orderDate
      })
    })
    
    // Calculate statistics
    const totalOrders = orders.length
    const pendingOrders = orders.filter(order => 
      order.orderStatus === 'Onay Bekliyor' || order.orderStatus === 'Onaylandı'
    ).length
    const completedOrders = orders.filter(order => 
      order.orderStatus === 'Teslim Edildi'
    ).length
    const partialOrders = orders.filter(order => 
      order.orderStatus === 'Yolda'
    ).length
    
    // This month orders
    const now = new Date()
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const thisMonthOrders = orders.filter(order => {
      const orderDate = new Date(order.orderDate)
      return orderDate >= firstDayOfMonth
    }).length
    
    // Total amount calculation (if price field exists)
    const totalAmount = orders.reduce((sum, order) => {
      return sum + (parseFloat(order.totalPrice) || 0)
    }, 0)
    
    const stats = {
      totalOrders,
      pendingOrders,
      completedOrders,
      partialOrders,
      thisMonthOrders,
      totalAmount
    }
    
    console.log('✅ Order statistics:', stats)
    res.json({ stats })
    
  } catch (error) {
    console.error('❌ Get order statistics error:', error)
    res.status(500).json({ 
      error: 'Failed to get order statistics',
      details: error.message 
    })
  }
})

/**
 * GET /api/orders/materials/active - Get active materials for order creation
 * Malzeme tipi dropdown için aktif malzemeleri getir
 */
router.get('/orders/materials/active', async (req, res) => {
  try {
    console.log('📦 Orders API: Active materials requested')
    
    // Get all materials (no filter to avoid index issues) and filter client-side
    const materialsSnapshot = await db.collection('materials').get()
    
    const activeMaterials = []
    materialsSnapshot.forEach(doc => {
      const materialData = doc.data()
      
      // Filter only active materials
      if (materialData.status === 'Aktif') {
        activeMaterials.push({
          id: doc.id,
          code: materialData.code,
          name: materialData.name,
          category: materialData.category,
          unit: materialData.unit,
          costPrice: materialData.costPrice,
          sellPrice: materialData.sellPrice,
          stock: materialData.stock,
          status: materialData.status,
          type: materialData.type || '',
          description: materialData.description || ''
        })
      }
    })
    
    // Sort by name
    activeMaterials.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    
    console.log(`✅ Orders API: ${activeMaterials.length} active materials returned (from ${materialsSnapshot.size} total)`)
    res.json({
      success: true,
      materials: activeMaterials,
      count: activeMaterials.length
    })
    
  } catch (error) {
    console.error('❌ Orders API: Active materials fetch error:', error)
    res.status(500).json({ 
      error: 'Failed to fetch active materials',
      details: error.message 
    })
  }
})

/**
 * GET /api/orders - Get all orders
 */
router.get('/orders', async (req, res) => {
  try {
    console.log('📋 Getting all orders...')
    
    const ordersSnapshot = await db.collection('orders').get()
    const orders = []
    
    ordersSnapshot.forEach(doc => {
      const orderData = doc.data()
      
      // Debug: Order'ın structure'ını kontrol et
      console.log(`📋 Order ${doc.id} structure:`, {
        hasItems: 'items' in orderData,
        hasOrderItems: 'orderItems' in orderData,
        hasLineItems: 'lineItems' in orderData,
        itemsLength: orderData.items?.length || 0,
        orderItemsLength: orderData.orderItems?.length || 0,
        lineItemsLength: orderData.lineItems?.length || 0,
        allKeys: Object.keys(orderData)
      })
      
      orders.push({
        id: doc.id,
        ...orderData,
        orderDate: orderData.orderDate?.toDate ? orderData.orderDate.toDate() : orderData.orderDate,
        expectedDeliveryDate: orderData.expectedDeliveryDate?.toDate ? orderData.expectedDeliveryDate.toDate() : orderData.expectedDeliveryDate,
        updatedAt: orderData.updatedAt?.toDate ? orderData.updatedAt.toDate() : orderData.updatedAt
      })
    })
    
    console.log(`✅ Retrieved ${orders.length} orders`)
    console.log(`📦 Sample order structure:`, orders[0] ? {
      id: orders[0].id,
      hasItems: 'items' in orders[0],
      itemsCount: orders[0].items?.length || 0
    } : 'No orders')
    
    res.json({ orders })
    
  } catch (error) {
    console.error('❌ Get all orders error:', error)
    res.status(500).json({ 
      error: 'Failed to get orders',
      details: error.message 
    })
  }
})

/**
 * GET /api/orders/delivery-status - Get delivery status for all orders
 */
router.get('/orders/delivery-status', async (req, res) => {
  try {
    console.log('📋 Getting delivery status for all orders...')
    
    const ordersSnapshot = await db.collection('orders').get()
    const deliveryStatuses = {}
    
    ordersSnapshot.forEach(doc => {
      const orderData = doc.data()
      const deliveryInfo = calculateDeliveryStatus(orderData)
      
      deliveryStatuses[doc.id] = {
        orderId: doc.id,
        ...deliveryInfo,
        expectedDeliveryDate: orderData.expectedDeliveryDate?.toDate ? orderData.expectedDeliveryDate.toDate() : orderData.expectedDeliveryDate,
        orderStatus: orderData.status
      }
    })
    
    console.log(`✅ Calculated delivery status for ${Object.keys(deliveryStatuses).length} orders`)
    res.json(deliveryStatuses)
    
  } catch (error) {
    console.error('❌ Get all delivery statuses error:', error)
    res.status(500).json({ 
      error: 'Failed to get delivery statuses',
      details: error.message 
    })
  }
})

/**
 * GET /api/orders/:orderId/delivery-status - Get delivery status for specific order
 */
router.get('/orders/:orderId/delivery-status', async (req, res) => {
  try {
    const { orderId } = req.params
    console.log(`📋 Getting delivery status for order: ${orderId}`)
    
    const orderSnapshot = await db.collection('orders').doc(orderId).get()
    
    if (!orderSnapshot.exists) {
      return res.status(404).json({ error: 'Order not found' })
    }
    
    const orderData = orderSnapshot.data()
    const deliveryInfo = calculateDeliveryStatus(orderData)
    
    const result = {
      orderId,
      ...deliveryInfo,
      expectedDeliveryDate: orderData.expectedDeliveryDate?.toDate ? orderData.expectedDeliveryDate.toDate() : orderData.expectedDeliveryDate,
      orderStatus: orderData.status
    }
    
    console.log(`✅ Delivery status calculated for order ${orderId}:`, result)
    res.json(result)
    
  } catch (error) {
    console.error('❌ Get order delivery status error:', error)
    res.status(500).json({ 
      error: 'Failed to get order delivery status',
      details: error.message 
    })
  }
})

/**
 * GET /api/orders/:orderId - Get specific order by ID
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
      order: {
        id: orderSnap.id,
        ...orderData,
        orderDate: orderData.orderDate?.toDate ? orderData.orderDate.toDate() : orderData.orderDate,
        expectedDeliveryDate: orderData.expectedDeliveryDate?.toDate ? orderData.expectedDeliveryDate.toDate() : orderData.expectedDeliveryDate,
        updatedAt: orderData.updatedAt?.toDate ? orderData.updatedAt.toDate() : orderData.updatedAt
      }
    })
    
  } catch (error) {
    console.error('❌ Get order error:', error)
    res.status(500).json({ 
      error: 'Failed to get order',
      details: error.message 
    })
  }
})

/**
 * Helper function to calculate delivery status
 */
function calculateDeliveryStatus(order) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  // Check if order has expectedDeliveryDate
  if (!order.expectedDeliveryDate || order.expectedDeliveryDate === '') {
    return {
      status: 'hesaplanıyor',
      daysRemaining: null,
      message: 'Teslimat tarihi belirtilmemiş'
    }
  }
  
  const deliveryDate = order.expectedDeliveryDate?.toDate ? 
    order.expectedDeliveryDate.toDate() : 
    new Date(order.expectedDeliveryDate)
  deliveryDate.setHours(0, 0, 0, 0)
  
  const diffTime = deliveryDate.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  
  // Check order status for completed orders
  if (order.status === 'Teslim Edildi' || order.status === 'Tamamlandı') {
    return {
      status: 'zamanında',
      daysRemaining: 0,
      message: 'Teslim edildi'
    }
  }
  
  // Calculate status based on remaining days
  if (diffDays < 0) {
    return {
      status: 'gecikmiş',
      daysRemaining: diffDays,
      message: `${Math.abs(diffDays)} gün gecikti`
    }
  } else if (diffDays === 0) {
    return {
      status: 'bugün-teslim',
      daysRemaining: 0,
      message: 'Bugün teslim edilmeli'
    }
  } else if (diffDays <= 7) {
    return {
      status: 'bu-hafta-teslim',
      daysRemaining: diffDays,
      message: `${diffDays} gün kaldı`
    }
  } else {
    return {
      status: 'zamanında',
      daysRemaining: diffDays,
      message: `${diffDays} gün kaldı`
    }
  }
}

/**
 * PUT /orders/:orderId - Update order
 */
router.put('/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params
    const updates = req.body
    
    console.log('📝 Updating order:', orderId, updates)
    
    const orderRef = db.collection('orders').doc(orderId)
    const orderSnap = await orderRef.get()
    
    if (!orderSnap.exists) {
      return res.status(404).json({ error: 'Order not found' })
    }
    
    // Update the order
    const updateData = {
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }
    
    await orderRef.update(updateData)
    
    // Get updated order
    const updatedSnap = await orderRef.get()
    const updatedData = updatedSnap.data()
    
    res.json({
      order: {
        id: updatedSnap.id,
        ...updatedData,
        orderDate: updatedData.orderDate?.toDate ? updatedData.orderDate.toDate() : updatedData.orderDate,
        expectedDeliveryDate: updatedData.expectedDeliveryDate?.toDate ? updatedData.expectedDeliveryDate.toDate() : updatedData.expectedDeliveryDate,
        updatedAt: updatedData.updatedAt?.toDate ? updatedData.updatedAt.toDate() : updatedData.updatedAt
      }
    })
    
  } catch (error) {
    console.error('❌ Update order error:', error)
    res.status(500).json({ 
      error: 'Failed to update order',
      details: error.message 
    })
  }
})

export { router as ordersRoutes }