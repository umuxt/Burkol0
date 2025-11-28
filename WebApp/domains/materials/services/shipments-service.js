// Shipments Service - Materials sevkiyat yönetimi
// materials.shipments tablosu ile çalışır

import { fetchWithTimeout } from '../../../shared/lib/api.js'

console.log('✅ Shipments Service: Backend API kullanımı aktif');

// Auth header helper
function withAuth(headers = {}) {
  try {
    const token = localStorage.getItem('bp_admin_token')
    if (!token && window.location.hostname === 'localhost') {
      return { ...headers, Authorization: 'Bearer dev-admin-token', 'Content-Type': 'application/json' }
    }
    return token ? { ...headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { ...headers, 'Content-Type': 'application/json' }
  } catch {
    return { ...headers, 'Content-Type': 'application/json' }
  }
}

// Shipment status flow: pending -> shipped -> delivered (or cancelled at any point)
export const SHIPMENT_STATUSES = {
  PENDING: 'pending',
  SHIPPED: 'shipped', 
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
}

// Status display labels (Turkish)
export const SHIPMENT_STATUS_LABELS = {
  pending: 'Beklemede',
  shipped: 'Yola Çıktı',
  delivered: 'Teslim Edildi',
  cancelled: 'İptal Edildi'
}

// Status colors for UI
export const SHIPMENT_STATUS_COLORS = {
  pending: '#f59e0b',    // amber
  shipped: '#3b82f6',    // blue
  delivered: '#22c55e',  // green
  cancelled: '#ef4444'   // red
}

// Shipments CRUD Operations
export const shipmentsService = {
  /**
   * Yeni sevkiyat oluştur
   * - Stok düşürülür (stock_movement oluşturulur)
   * - Shipment kaydı oluşturulur
   * 
   * @param {Object} shipmentData
   * @param {string} shipmentData.productCode - M kodlu ürün (required)
   * @param {number} shipmentData.shipmentQuantity - Sevk miktarı (required)
   * @param {string} [shipmentData.planId] - İlişkili plan ID
   * @param {string} [shipmentData.workOrderCode] - İlişkili iş emri kodu
   * @param {string} [shipmentData.quoteId] - İlişkili onaylı teklif ID
   * @param {string} [shipmentData.description] - Açıklama
   * @returns {Promise<Object>} Oluşturulan shipment kaydı
   */
  createShipment: async (shipmentData) => {
    try {
      const response = await fetchWithTimeout('/api/materials/shipments', {
        method: 'POST',
        headers: withAuth(),
        body: JSON.stringify(shipmentData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      console.log('✅ Shipment created:', result)
      return result
    } catch (error) {
      console.error('❌ Shipment create error:', error)
      throw error
    }
  },

  /**
   * Sevkiyatları listele
   * 
   * @param {Object} [filters]
   * @param {string} [filters.productCode] - Ürün koduna göre filtrele
   * @param {string} [filters.status] - Duruma göre filtrele
   * @param {string} [filters.planId] - Plan ID'ye göre filtrele
   * @param {string} [filters.workOrderCode] - İş emri koduna göre filtrele
   * @param {string} [filters.quoteId] - Teklif ID'ye göre filtrele
   * @param {string} [filters.startDate] - Başlangıç tarihi (ISO string)
   * @param {string} [filters.endDate] - Bitiş tarihi (ISO string)
   * @param {number} [filters.limit] - Sayfa boyutu
   * @param {number} [filters.offset] - Sayfa offset
   * @returns {Promise<Array>} Shipment listesi
   */
  getShipments: async (filters = {}) => {
    try {
      const url = new URL('/api/materials/shipments', window.location.origin)
      
      // Add filters as query params
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, value)
        }
      })
      
      const response = await fetchWithTimeout(url.toString(), {
        headers: withAuth()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const shipments = await response.json()
      return shipments
    } catch (error) {
      console.warn('❌ Shipments fetch error (returning empty list):', error?.message || error)
      return []
    }
  },

  /**
   * Tek bir sevkiyat detayını getir
   * 
   * @param {number} shipmentId - Shipment ID
   * @returns {Promise<Object|null>} Shipment detayı
   */
  getShipmentById: async (shipmentId) => {
    try {
      const response = await fetchWithTimeout(`/api/materials/shipments/${shipmentId}`, {
        headers: withAuth()
      })
      
      if (!response.ok) {
        if (response.status === 404) {
          return null
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const shipment = await response.json()
      return shipment
    } catch (error) {
      console.error('❌ Shipment fetch error:', error)
      throw error
    }
  },

  /**
   * Sevkiyat detaylarını güncelle (metadata)
   * 
   * @param {number} shipmentId - Shipment ID
   * @param {Object} data - Güncellenecek alanlar (workOrderCode, quoteId, planId, description)
   * @returns {Promise<Object>} Güncellenmiş shipment
   */
  updateShipment: async (shipmentId, data) => {
    try {
      const response = await fetchWithTimeout(`/api/materials/shipments/${shipmentId}`, {
        method: 'PUT',
        headers: withAuth(),
        body: JSON.stringify(data)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      console.log('✅ Shipment updated:', result)
      return result
    } catch (error) {
      console.error('❌ Shipment update error:', error)
      throw error
    }
  },

  /**
   * Üretim planlarını getir
   * @returns {Promise<Array>} Plan listesi
   */
  getProductionPlans: async () => {
    try {
      const response = await fetchWithTimeout('/api/mes/production-plans', {
        headers: withAuth()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      // Handle different response structures ({ plans: [] } vs [])
      return result.plans || (Array.isArray(result) ? result : [])
    } catch (error) {
      console.warn('❌ Production plans fetch error:', error?.message || error)
      return []
    }
  },

  /**
   * Sevkiyat durumunu güncelle
   * Flow: pending -> shipped -> delivered
   * İptal: Herhangi bir durumdan cancelled'a geçilebilir
   * 
   * @param {number} shipmentId - Shipment ID
   * @param {string} newStatus - Yeni durum
   * @returns {Promise<Object>} Güncellenmiş shipment
   */
  updateShipmentStatus: async (shipmentId, newStatus) => {
    try {
      const response = await fetchWithTimeout(`/api/materials/shipments/${shipmentId}/status`, {
        method: 'PUT',
        headers: withAuth(),
        body: JSON.stringify({ status: newStatus })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      console.log('✅ Shipment status updated:', result)
      return result
    } catch (error) {
      console.error('❌ Shipment status update error:', error)
      throw error
    }
  },

  /**
   * Sevkiyatı iptal et
   * - Stok geri eklenir (stock_movement ile)
   * - Shipment durumu cancelled olur
   * 
   * @param {number} shipmentId - Shipment ID
   * @param {string} [reason] - İptal sebebi
   * @returns {Promise<Object>} İptal edilmiş shipment
   */
  cancelShipment: async (shipmentId, reason = '') => {
    try {
      const response = await fetchWithTimeout(`/api/materials/shipments/${shipmentId}/cancel`, {
        method: 'PUT',
        headers: withAuth(),
        body: JSON.stringify({ reason })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      console.log('✅ Shipment cancelled:', result)
      return result
    } catch (error) {
      console.error('❌ Shipment cancel error:', error)
      throw error
    }
  },

  /**
   * Ürün için sevkiyat geçmişini getir
   * 
   * @param {string} productCode - M kodlu ürün
   * @returns {Promise<Array>} Sevkiyat listesi
   */
  getShipmentsByProduct: async (productCode) => {
    return shipmentsService.getShipments({ productCode })
  },

  /**
   * Plan için sevkiyatları getir
   * 
   * @param {string} planId - Plan ID
   * @returns {Promise<Array>} Sevkiyat listesi
   */
  getShipmentsByPlan: async (planId) => {
    return shipmentsService.getShipments({ planId })
  },

  /**
   * İş emri için sevkiyatları getir
   * 
   * @param {string} workOrderCode - İş emri kodu
   * @returns {Promise<Array>} Sevkiyat listesi
   */
  getShipmentsByWorkOrder: async (workOrderCode) => {
    return shipmentsService.getShipments({ workOrderCode })
  },

  /**
   * Belirli durumdaki sevkiyatları getir
   * 
   * @param {string} status - Durum (pending, shipped, delivered, cancelled)
   * @returns {Promise<Array>} Sevkiyat listesi
   */
  getShipmentsByStatus: async (status) => {
    return shipmentsService.getShipments({ status })
  },

  /**
   * Onaylı teklifleri getir (quotes.quotes WHERE status='approved')
   * @returns {Promise<Array>} Onaylı teklif listesi
   */
  getApprovedQuotes: async () => {
    try {
      const response = await fetchWithTimeout('/api/materials/shipments/approved-quotes', {
        headers: withAuth()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.warn('❌ Approved quotes fetch error:', error?.message || error)
      return []
    }
  },

  /**
   * Tamamlanmış iş emirlerini getir (mes.work_orders WHERE tüm node'ları tamamlanmış)
   * @returns {Promise<Array>} Tamamlanmış iş emri listesi
   */
  getCompletedWorkOrders: async () => {
    try {
      const response = await fetchWithTimeout('/api/materials/shipments/completed-work-orders', {
        headers: withAuth()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.warn('❌ Completed work orders fetch error:', error?.message || error)
      return []
    }
  }
}
