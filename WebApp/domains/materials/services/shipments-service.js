// Shipments Service - Materials sevkiyat yönetimi (Multi-item support)
// materials.shipments + materials.shipment_items tabloları ile çalışır

import { fetchWithTimeout } from '../../../shared/lib/api.js'

console.log('✅ Shipments Service: Backend API kullanımı aktif (Multi-item)');

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

// Shipment status flow for invoice export
export const SHIPMENT_STATUSES = {
  PENDING: 'pending',
  SHIPPED: 'shipped', 
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  EXPORTED: 'exported',
  COMPLETED: 'completed'
}

// Document types for invoice export
export const DOCUMENT_TYPES = {
  WAYBILL: 'waybill',    // İrsaliye (fiyatsız)
  INVOICE: 'invoice',    // Fatura (fiyatlı)
  BOTH: 'both'           // İkisi birden
}

// Status display labels (Turkish)
export const SHIPMENT_STATUS_LABELS = {
  pending: 'Beklemede',
  shipped: 'Yola Çıktı',
  delivered: 'Teslim Edildi',
  cancelled: 'İptal Edildi',
  exported: 'Export Edildi',
  completed: 'Tamamlandı'
}

// Status colors for UI
export const SHIPMENT_STATUS_COLORS = {
  pending: '#f59e0b',    // amber
  shipped: '#3b82f6',    // blue
  delivered: '#22c55e',  // green
  cancelled: '#ef4444',  // red
  exported: '#8b5cf6',   // purple
  completed: '#10b981'   // emerald
}

// Shipments CRUD Operations
export const shipmentsService = {
  // ============================================
  // SHIPMENT CRUD (Header + Items)
  // ============================================

  /**
   * Yeni sevkiyat oluştur (çoklu kalem destekli)
   * - Her kalem için stok düşürülür
   * - Shipment header + items oluşturulur
   * 
   * @param {Object} shipmentData
   * @param {Array} shipmentData.items - Sevkiyat kalemleri (required)
   * @param {string} shipmentData.items[].materialCode - Malzeme kodu (required)
   * @param {number} shipmentData.items[].quantity - Miktar (required)
   * @param {string} [shipmentData.items[].notes] - Kalem notu
   * @param {string} [shipmentData.items[].lotNumber] - Lot numarası
   * @param {string} [shipmentData.workOrderCode] - İlişkili iş emri kodu
   * @param {string} [shipmentData.quoteId] - İlişkili onaylı teklif ID
   * @param {string} [shipmentData.planId] - İlişkili plan ID
   * @param {string} [shipmentData.customerName] - Müşteri adı
   * @param {string} [shipmentData.customerCompany] - Müşteri firma
   * @param {string} [shipmentData.deliveryAddress] - Teslimat adresi
   * @param {string} [shipmentData.notes] - Genel açıklama
   * @returns {Promise<Object>} Oluşturulan shipment kaydı (items dahil)
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
      console.log('✅ Shipment created:', result.shipmentCode || result.id)
      return result
    } catch (error) {
      console.error('❌ Shipment create error:', error)
      throw error
    }
  },

  /**
   * Hızlı sevkiyat oluştur (stok sayfasından tek kalem)
   * Eski API ile uyumlu - tek malzeme, tek miktar
   * 
   * @param {Object} shipmentData
   * @param {string} shipmentData.productCode - M kodlu ürün (required)
   * @param {number} shipmentData.shipmentQuantity - Sevk miktarı (required)
   * @param {string} [shipmentData.workOrderCode] - İlişkili iş emri kodu
   * @param {string} [shipmentData.quoteId] - İlişkili onaylı teklif ID
   * @param {string} [shipmentData.description] - Açıklama
   * @returns {Promise<Object>} Oluşturulan shipment kaydı
   */
  createQuickShipment: async (shipmentData) => {
    try {
      const response = await fetchWithTimeout('/api/materials/shipments/quick', {
        method: 'POST',
        headers: withAuth(),
        body: JSON.stringify(shipmentData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      console.log('✅ Quick shipment created:', result.shipmentCode || result.id)
      return result
    } catch (error) {
      console.error('❌ Quick shipment create error:', error)
      throw error
    }
  },

  /**
   * Sevkiyatları listele (items dahil)
   * 
   * @param {Object} [filters]
   * @param {string} [filters.status] - Duruma göre filtrele
   * @param {string} [filters.workOrderCode] - İş emri koduna göre filtrele
   * @param {string} [filters.quoteId] - Teklif ID'ye göre filtrele
   * @param {string} [filters.startDate] - Başlangıç tarihi (ISO string)
   * @param {string} [filters.endDate] - Bitiş tarihi (ISO string)
   * @param {number} [filters.limit] - Sayfa boyutu
   * @param {number} [filters.offset] - Sayfa offset
   * @param {boolean} [filters.includeItems=true] - Items dahil edilsin mi
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
   * Tek bir sevkiyat detayını getir (items dahil)
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
   * Sevkiyat koduna göre detay getir
   * 
   * @param {string} shipmentCode - Shipment kodu (SHP-2025-0001)
   * @returns {Promise<Object|null>} Shipment detayı
   */
  getShipmentByCode: async (shipmentCode) => {
    try {
      const response = await fetchWithTimeout(`/api/materials/shipments/code/${encodeURIComponent(shipmentCode)}`, {
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
   * @param {Object} data - Güncellenecek alanlar
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
   * - Tüm kalemler için stok geri eklenir
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
   * Sevkiyatı sil (sadece pending durumunda)
   * 
   * @param {number} shipmentId - Shipment ID
   * @returns {Promise<Object>} Sonuç
   */
  deleteShipment: async (shipmentId) => {
    try {
      const response = await fetchWithTimeout(`/api/materials/shipments/${shipmentId}`, {
        method: 'DELETE',
        headers: withAuth()
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      console.log('✅ Shipment deleted')
      return result
    } catch (error) {
      console.error('❌ Shipment delete error:', error)
      throw error
    }
  },

  /**
   * Sevkiyat istatistiklerini getir
   * @returns {Promise<Object>} İstatistikler
   */
  getShipmentStats: async () => {
    try {
      const response = await fetchWithTimeout('/api/materials/shipments/stats', {
        headers: withAuth()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.warn('❌ Shipment stats fetch error:', error?.message || error)
      return {}
    }
  },

  // ============================================
  // SHIPMENT ITEMS CRUD
  // ============================================

  /**
   * Sevkiyat kalemlerini getir
   * 
   * @param {number} shipmentId - Shipment ID
   * @returns {Promise<Array>} Kalem listesi
   */
  getShipmentItems: async (shipmentId) => {
    try {
      const response = await fetchWithTimeout(`/api/materials/shipments/${shipmentId}/items`, {
        headers: withAuth()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.warn('❌ Shipment items fetch error:', error?.message || error)
      return []
    }
  },

  /**
   * Sevkiyata kalem ekle
   * 
   * @param {number} shipmentId - Shipment ID
   * @param {Object} itemData - Kalem verisi
   * @param {string} itemData.materialCode - Malzeme kodu (required)
   * @param {number} itemData.quantity - Miktar (required)
   * @param {string} [itemData.notes] - Not
   * @param {string} [itemData.lotNumber] - Lot numarası
   * @returns {Promise<Object>} Eklenen kalem
   */
  addItemToShipment: async (shipmentId, itemData) => {
    try {
      const response = await fetchWithTimeout(`/api/materials/shipments/${shipmentId}/items`, {
        method: 'POST',
        headers: withAuth(),
        body: JSON.stringify(itemData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      console.log('✅ Item added to shipment')
      
      // Emit stock update event for materials list refresh
      if (typeof window !== 'undefined' && result.materialCode) {
        window.dispatchEvent(new CustomEvent('materialStockUpdated', {
          detail: {
            materialCode: result.materialCode,
            newStock: result.newStock,
            quantity: itemData.quantity,
            operation: 'shipment_out',
            context: 'shipment_item_added'
          }
        }));
      }
      
      return result
    } catch (error) {
      console.error('❌ Add item error:', error)
      throw error
    }
  },

  /**
   * Sevkiyattan kalem sil (stok geri eklenir)
   * 
   * @param {number} itemId - Item ID
   * @returns {Promise<Object>} Sonuç
   */
  removeItemFromShipment: async (itemId) => {
    try {
      const response = await fetchWithTimeout(`/api/materials/shipments/items/${itemId}`, {
        method: 'DELETE',
        headers: withAuth()
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      console.log('✅ Item removed from shipment, result:', result)
      
      // Emit stock update event for materials list refresh
      if (typeof window !== 'undefined' && result.materialCode) {
        console.log('📢 Emitting materialStockUpdated event:', {
          materialCode: result.materialCode,
          newStock: result.newStock
        });
        window.dispatchEvent(new CustomEvent('materialStockUpdated', {
          detail: {
            materialCode: result.materialCode,
            newStock: result.newStock,
            quantity: result.quantity,
            operation: 'shipment_return',
            context: 'shipment_item_removed'
          }
        }));
      } else {
        console.warn('⚠️ No materialCode in result, event not emitted:', result);
      }
      
      return result
    } catch (error) {
      console.error('❌ Remove item error:', error)
      throw error
    }
  },

  /**
   * Kalem miktarını güncelle (stok farkı ayarlanır)
   * 
   * @param {number} itemId - Item ID
   * @param {number} newQuantity - Yeni miktar
   * @returns {Promise<Object>} Güncellenmiş kalem
   */
  updateItemQuantity: async (itemId, newQuantity) => {
    try {
      const response = await fetchWithTimeout(`/api/materials/shipments/items/${itemId}/quantity`, {
        method: 'PUT',
        headers: withAuth(),
        body: JSON.stringify({ quantity: newQuantity })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      console.log('✅ Item quantity updated')
      return result
    } catch (error) {
      console.error('❌ Update item quantity error:', error)
      throw error
    }
  },

  /**
   * Kalem notunu güncelle
   * 
   * @param {number} itemId - Item ID
   * @param {string} notes - Yeni not
   * @returns {Promise<Object>} Güncellenmiş kalem
   */
  updateItemNotes: async (itemId, notes) => {
    try {
      const response = await fetchWithTimeout(`/api/materials/shipments/items/${itemId}/notes`, {
        method: 'PUT',
        headers: withAuth(),
        body: JSON.stringify({ notes })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('❌ Update item notes error:', error)
      throw error
    }
  },

  /**
   * Malzeme için sevkiyat geçmişini getir
   * 
   * @param {string} materialCode - Malzeme kodu
   * @param {Object} [filters] - Filtreler
   * @returns {Promise<Array>} Sevkiyat kalem listesi
   */
  getItemsByMaterial: async (materialCode, filters = {}) => {
    try {
      const url = new URL(`/api/materials/${encodeURIComponent(materialCode)}/shipments`, window.location.origin)
      
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
      
      return await response.json()
    } catch (error) {
      console.warn('❌ Material shipments fetch error:', error?.message || error)
      return []
    }
  },

  // ============================================
  // HELPER DATA (for dropdowns)
  // ============================================

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
   * Tamamlanmış iş emirlerini getir
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
  },

  /**
   * Sevkiyat için kullanılabilir malzemeleri getir (stok > 0)
   * @returns {Promise<Array>} Malzeme listesi
   */
  getAvailableMaterials: async () => {
    try {
      const response = await fetchWithTimeout('/api/materials/shipments/available-materials', {
        headers: withAuth()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.warn('❌ Available materials fetch error:', error?.message || error)
      return []
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
      return result.plans || (Array.isArray(result) ? result : [])
    } catch (error) {
      console.warn('❌ Production plans fetch error:', error?.message || error)
      return []
    }
  },

  // ============================================
  // LEGACY HELPERS (backwards compatibility)
  // ============================================

  /**
   * Ürün için sevkiyat geçmişini getir
   * @deprecated Use getItemsByMaterial instead
   */
  getShipmentsByProduct: async (productCode) => {
    return shipmentsService.getItemsByMaterial(productCode)
  },

  /**
   * Plan için sevkiyatları getir
   */
  getShipmentsByPlan: async (planId) => {
    return shipmentsService.getShipments({ planId })
  },

  /**
   * İş emri için sevkiyatları getir
   */
  getShipmentsByWorkOrder: async (workOrderCode) => {
    return shipmentsService.getShipments({ workOrderCode })
  },

  /**
   * Belirli durumdaki sevkiyatları getir
   */
  getShipmentsByStatus: async (status) => {
    return shipmentsService.getShipments({ status })
  },

  // ============================================
  // INVOICE EXPORT LOOKUP APIs
  // ============================================

  /**
   * KDV muafiyet kodlarını getir
   * @returns {Promise<Array>} VAT exemption codes
   */
  getVatExemptions: async () => {
    try {
      const response = await fetchWithTimeout('/api/materials/vat-exemptions', {
        headers: withAuth()
      })
      if (!response.ok) return []
      const result = await response.json()
      return result.data || []
    } catch (error) {
      console.warn('❌ VAT exemptions fetch error:', error?.message)
      return []
    }
  },

  /**
   * Tevkifat oranlarını getir
   * @returns {Promise<Array>} Withholding rates
   */
  getWithholdingRates: async () => {
    try {
      const response = await fetchWithTimeout('/api/materials/withholding-rates', {
        headers: withAuth()
      })
      if (!response.ok) return []
      const result = await response.json()
      return result.data || []
    } catch (error) {
      console.warn('❌ Withholding rates fetch error:', error?.message)
      return []
    }
  },

  /**
   * Shipment ayarlarını getir
   * @returns {Promise<Object>} Settings key-value map
   */
  getSettings: async () => {
    try {
      const response = await fetchWithTimeout('/api/materials/settings', {
        headers: withAuth()
      })
      if (!response.ok) return {}
      const result = await response.json()
      return result.data || {}
    } catch (error) {
      console.warn('❌ Settings fetch error:', error?.message)
      return {}
    }
  },

  /**
   * Export shipment in specified format
   * @param {number} shipmentId - Shipment ID
   * @param {string} format - csv | xml | pdf | json
   * @param {string} [target] - logo_tiger | logo_go | zirve
   * @returns {Promise<Blob>} File blob for download
   */
  exportShipment: async (shipmentId, format, target = 'logo_tiger') => {
    try {
      const url = `/api/materials/shipments/${shipmentId}/export/${format}?target=${target}`
      const response = await fetchWithTimeout(url, {
        headers: withAuth()
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Export failed')
      }
      return response.blob()
    } catch (error) {
      console.error('❌ Export error:', error)
      throw error
    }
  },

  /**
   * Import shipment confirmation
   * @param {number} shipmentId - Shipment ID
   * @param {FormData} formData - Contains file and externalDocNumber
   * @returns {Promise<Object>} Import result with stock updates
   */
  importShipmentConfirmation: async (shipmentId, formData) => {
    try {
      const token = localStorage.getItem('bp_admin_token') || 'dev-admin-token'
      const response = await fetchWithTimeout(`/api/materials/shipments/${shipmentId}/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
          // Note: Don't set Content-Type for FormData, browser will set it with boundary
        },
        body: formData
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || 'Import failed')
      }
      return response.json()
    } catch (error) {
      console.error('❌ Import error:', error)
      throw error
    }
  }
}
