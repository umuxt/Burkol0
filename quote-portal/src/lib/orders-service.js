// Orders service (Backend API only)
import { API, fetchWithTimeout, API_BASE } from './api.js'

export class OrdersService {
  static async generateOrderCode(customYear = null) {
    const now = new Date()
    const year = customYear || now.getFullYear()
    const orderCode = `ORD-${year}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`
    return { orderCode, orderYear: year, orderSequence: 0 }
  }

  static async createOrder(orderData) {
    try {
      return await API.createOrder(orderData)
    } catch (error) {
      console.error('❌ Error creating order:', error)
      throw new Error(`Sipariş oluşturulamadı: ${error.message}`)
    }
  }

  static async getOrders(filters = {}, pagination = {}) {
    try {
      const params = {}
      if (filters.orderStatus) params.orderStatus = filters.orderStatus
      if (filters.supplierId) params.supplierId = filters.supplierId
      if (pagination.limit) params.limit = pagination.limit
      return await API.listOrders(params)
    } catch (error) {
      console.error('❌ OrdersService: Error fetching orders:', error)
      throw new Error(`Siparişler getirilemedi: ${error.message}`)
    }
  }

  static async getOrder(orderId) {
    try {
      return await API.getOrder(orderId)
    } catch (error) {
      console.error('❌ Error fetching order:', error)
      throw new Error(`Sipariş getirilemedi: ${error.message}`)
    }
  }

  static async updateOrder(orderId, updateData) {
    try {
      return await API.updateOrder(orderId, updateData)
    } catch (error) {
      console.error('❌ Error updating order:', error)
      throw new Error(`Sipariş güncellenemedi: ${error.message}`)
    }
  }

  static async deleteOrder(orderId) {
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE' }, 10000)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Sipariş silinemedi')
      }
    } catch (error) {
      console.error('❌ Error deleting order:', error)
      throw new Error(`Sipariş silinemedi: ${error.message}`)
    }
  }

  static subscribeToOrders(filters = {}, callback) {
    let active = true
    const tick = async () => {
      if (!active) return
      try {
        const list = await API.listOrders()
        callback(list)
      } catch {}
    }
    const interval = setInterval(tick, 5000)
    tick()
    return () => { active = false; clearInterval(interval) }
  }
}

export class OrderItemsService {
  static async createOrderItem(itemData) {
    try {
      const itemToCreate = { ...itemData }
      if (!itemToCreate.orderId) throw new Error('Sipariş ID gerekli')
      if (!itemToCreate.materialCode) throw new Error('Malzeme kodu gerekli')
      if (!itemToCreate.quantity || itemToCreate.quantity <= 0) throw new Error('Geçerli bir miktar gerekli')

      const currentOrder = await OrdersService.getOrder(itemToCreate.orderId)
      const currentItems = Array.isArray(currentOrder.items) ? currentOrder.items : []
      const itemSequence = (currentItems.length || 0) + 1
      const itemCode = `item-${String(itemSequence).padStart(2, '0')}`
      const baseLineId = itemToCreate.lineId || `${itemToCreate.materialCode || itemCode}-${String(itemSequence).padStart(2, '0')}`

      return {
        ...itemToCreate,
        id: itemToCreate.id || `${currentOrder.id}-item-${itemSequence}`,
        lineId: baseLineId,
        itemCode,
        itemSequence,
        itemStatus: itemToCreate.itemStatus || 'Onay Bekliyor',
        actualDeliveryDate: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    } catch (error) {
      console.error('❌ Error creating order item:', error)
      throw new Error(`Sipariş kalemi oluşturulamadı: ${error.message}`)
    }
  }

  static async getOrderItems(orderId) {
    try {
      const order = await OrdersService.getOrder(orderId)
      if (!order || !Array.isArray(order.items)) return []
      const items = order.items.map((item, index) => ({
        id: item.id || `${orderId}-item-${index + 1}`,
        ...item,
        lineId: item.lineId || `${item.materialCode || item.itemCode || `item-${index + 1}`}-${String((item.itemSequence || (index + 1))).padStart(2, '0')}`,
        itemCode: item.itemCode || `item-${String(item.itemSequence || index + 1).padStart(2, '0')}`,
        itemSequence: item.itemSequence || (index + 1),
        itemStatus: item.itemStatus || 'Onay Bekliyor'
      }))
      items.sort((a, b) => (a.itemSequence || 0) - (b.itemSequence || 0))
      return items
    } catch (error) {
      console.error('❌ OrderItemsService: Error fetching order items:', error)
      return []
    }
  }

  static async updateOrderItem(itemId, updateData) {
    try {
      const orders = await API.listOrders()
      let found = null
      let idx = -1
      for (const ord of orders) {
        if (Array.isArray(ord.items)) {
          const i = ord.items.findIndex((it) => it.id === itemId || it.itemCode === itemId || it.lineId === itemId)
          if (i !== -1) { found = ord; idx = i; break }
        }
      }
      if (!found) throw new Error(`Item ${itemId} not found in any order`)
      const updatedItems = [...found.items]
      const current = updatedItems[idx] || {}
      const patch = { ...updateData, updatedAt: new Date() }
      if (patch.itemStatus === 'Teslim Edildi' && !patch.actualDeliveryDate) patch.actualDeliveryDate = new Date()
      updatedItems[idx] = { ...current, ...patch }
      await API.updateOrder(found.id, { items: updatedItems, itemCount: updatedItems.length })
      return updatedItems[idx]
    } catch (error) {
      console.error('❌ Error updating order item:', error)
      throw new Error(`Sipariş kalemi güncellenemedi: ${error.message}`)
    }
  }

  static async deleteOrderItem(itemId) {
    try {
      const orders = await API.listOrders()
      let found = null
      let idx = -1
      for (const ord of orders) {
        if (Array.isArray(ord.items)) {
          const i = ord.items.findIndex((it) => it.id === itemId || it.itemCode === itemId || it.lineId === itemId)
          if (i !== -1) { found = ord; idx = i; break }
        }
      }
      if (!found) throw new Error(`Item ${itemId} not found in any order`)
      const updatedItems = [...found.items]
      updatedItems.splice(idx, 1)
      await API.updateOrder(found.id, { items: updatedItems, itemCount: updatedItems.length })
      return { success: true }
    } catch (error) {
      console.error('❌ Error deleting order item:', error)
      throw new Error(`Sipariş kalemi silinemedi: ${error.message}`)
    }
  }

  static async createOrderItems(orderItems) {
    try {
      if (!orderItems || orderItems.length === 0) return []
      const orderId = orderItems[0].orderId
      const baseOrder = await OrdersService.getOrder(orderId)
      const startSeq = (baseOrder.items?.length || 0) + 1
      return orderItems.map((item, i) => {
        const seq = startSeq + i
        const code = `item-${String(seq).padStart(2, '0')}`
        return {
          ...item,
          id: item.id || `${orderId}-item-${seq}`,
          itemCode: code,
          itemSequence: seq,
          lineId: item.lineId || `${item.materialCode || code}-${String(seq).padStart(2, '0')}`,
          itemStatus: item.itemStatus || 'Onay Bekliyor',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      })
    } catch (error) {
      console.error('❌ Error creating order items in batch:', error)
      throw new Error(`Sipariş kalemleri oluşturulamadı: ${error.message}`)
    }
  }
}

export async function getOrderWithItems(orderId) {
  try {
    const order = await OrdersService.getOrder(orderId)
    try {
      const items = await OrderItemsService.getOrderItems(orderId)
      return { ...order, items }
    } catch {
      return { ...order, items: order.items || [] }
    }
  } catch (error) {
    console.error('❌ Error fetching order with items:', error)
    throw new Error(`Sipariş ve kalemleri getirilemedi: ${error.message}`)
  }
}

export async function updateOrderStatusBasedOnItems(orderId) {
  try {
    const items = await OrderItemsService.getOrderItems(orderId)
    if (items.length === 0) return
    const delivered = items.filter(i => i.itemStatus === 'Teslim Edildi').length
    let newStatus
    if (delivered === 0) {
      const order = await OrdersService.getOrder(orderId)
      if (order.orderStatus === 'Tamamlandı') newStatus = 'Onaylandı'
    } else if (delivered === items.length) {
      newStatus = 'Teslim Edildi'
    } else {
      newStatus = 'Kısmi Teslimat'
    }
    if (newStatus) {
      await API.updateOrder(orderId, { orderStatus: newStatus, items, itemCount: items.length })
    }
  } catch (error) {
    console.error('❌ Error updating order status based on items:', error)
    throw new Error(`Sipariş durumu güncellenemedi: ${error.message}`)
  }
}

export default OrdersService

