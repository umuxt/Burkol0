// Materials Service (Backend API only) with enhanced error handling
import { fetchWithTimeout, API_BASE } from './api.js'

function withAuth(headers = {}) {
  try {
    const t = localStorage.getItem('bk_admin_token') || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'dev-admin-token' : '')
    return t ? { ...headers, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { ...headers, 'Content-Type': 'application/json' }
  } catch {
    return { ...headers, 'Content-Type': 'application/json' }
  }
}

// Enhanced fetch with retry mechanism
async function fetchWithRetry(url, options = {}, maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, attempt === 1 ? 15000 : 25000)
      
      // If successful, return response
      if (response.ok) {
        return response
      }
      
      // Handle specific error codes
      if (response.status === 429 && attempt < maxRetries) {
        // Rate limited, wait and retry
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60')
        console.warn(`⚠️ Rate limited, waiting ${retryAfter}s before retry ${attempt + 1}`)
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000))
        continue
      }
      
      if (response.status === 503 && attempt < maxRetries) {
        // Service unavailable, exponential backoff
        const backoffMs = Math.pow(2, attempt) * 1000
        console.warn(`⚠️ Service unavailable, waiting ${backoffMs}ms before retry ${attempt + 1}`)
        await new Promise(resolve => setTimeout(resolve, backoffMs))
        continue
      }
      
      // If not retryable or last attempt, return the response for error handling
      return response
    } catch (error) {
      console.error(`❌ Fetch attempt ${attempt} failed:`, error.message)
      
      if (attempt === maxRetries) {
        throw error
      }
      
      // Exponential backoff for network errors
      const backoffMs = Math.pow(2, attempt) * 1000
      console.warn(`⚠️ Network error, waiting ${backoffMs}ms before retry ${attempt + 1}`)
      await new Promise(resolve => setTimeout(resolve, backoffMs))
    }
  }
}

export class MaterialsService {
  // LIST MATERIALS with enhanced error handling
  static async getMaterials(filters = {}) {
    try {
      const res = await fetchWithRetry(`${API_BASE}/api/materials`, { headers: withAuth() })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Materials listesi alınamadı')
      }
      const list = await res.json()
      return list.filter(m => {
        if (filters.status && m.status !== filters.status) return false
        if (filters.category && m.category !== filters.category) return false
        return true
      })
    } catch (error) {
      console.error('❌ Materials fetch error:', error.message)
      // Fallback to local storage if available
      if (typeof localStorage !== 'undefined') {
        const cached = localStorage.getItem('bk_materials_cache')
        if (cached) {
          console.warn('⚠️ Using cached materials data due to API error')
          try {
            const parsedCache = JSON.parse(cached)
            if (parsedCache.data && Array.isArray(parsedCache.data)) {
              return parsedCache.data.filter(m => {
                if (filters.status && m.status !== filters.status) return false
                if (filters.category && m.category !== filters.category) return false
                return true
              })
            }
          } catch {}
        }
      }
      throw error
    }
  }

  // GET MATERIAL BY ID (fallback via list)
  static async getMaterial(id) {
    const list = await this.getMaterials({})
    const found = list.find(m => m.id === id)
    if (!found) throw new Error('Malzeme bulunamadı')
    return found
  }

  // GET MATERIAL BY CODE (use /api/materials/all) with enhanced error handling
  static async getMaterialByCode(code) {
    try {
      const res = await fetchWithRetry(`${API_BASE}/api/materials/all`, { headers: withAuth() })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Materials listesi alınamadı')
      }
      const list = await res.json()
      
      // Cache the full materials list for future use
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('bk_materials_cache', JSON.stringify({
          data: list,
          timestamp: Date.now(),
          ttl: 300000 // 5 minutes
        }))
      }
      
      return list.find(m => m.code === code) || null
    } catch (error) {
      console.error('❌ Material by code fetch error:', error.message)
      
      // Fallback to cached data
      if (typeof localStorage !== 'undefined') {
        const cached = localStorage.getItem('bk_materials_cache')
        if (cached) {
          try {
            const parsedCache = JSON.parse(cached)
            if (parsedCache.data && Array.isArray(parsedCache.data)) {
              console.warn('⚠️ Using cached materials for code lookup due to API error')
              return parsedCache.data.find(m => m.code === code) || null
            }
          } catch {}
        }
      }
      
      throw error
    }
  }

  // CREATE MATERIAL
  static async createMaterial(materialData) {
    const res = await fetchWithTimeout(`${API_BASE}/api/materials`, {
      method: 'POST', headers: withAuth(), body: JSON.stringify(materialData)
    }, 15000)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Malzeme eklenemedi')
    }
    return await res.json()
  }

  // UPDATE MATERIAL
  static async updateMaterial(materialId, updateData) {
    const res = await fetchWithTimeout(`${API_BASE}/api/materials/${encodeURIComponent(materialId)}`, {
      method: 'PATCH', headers: withAuth(), body: JSON.stringify(updateData)
    }, 15000)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Malzeme güncellenemedi')
    }
    const data = await res.json()
    // Broadcast a global event to allow UI to refresh material caches
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('materialUpdated', { detail: { id: materialId, updates: updateData } }))
    }
    return data
  }

  // SOFT DELETE MATERIAL
  static async deleteMaterial(materialId) {
    const res = await fetchWithTimeout(`${API_BASE}/api/materials/${encodeURIComponent(materialId)}`, {
      method: 'DELETE', headers: withAuth()
    }, 12000)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Malzeme silinemedi')
    }
    return await res.json()
  }

  // UPDATE STOCK VIA BACKEND API
  static async updateStockViaAPI(materialCode, quantity, operation = 'add', details = {}) {
    const res = await fetchWithTimeout(`${API_BASE}/api/materials/${encodeURIComponent(materialCode)}/stock`, {
      method: 'PATCH', headers: withAuth(), body: JSON.stringify({
        quantity: Math.abs(Number(quantity) || 0),
        operation,
        orderId: details.reference || '',
        itemId: details.itemId || '',
        movementType: details.referenceType || 'manual',
        notes: details.notes || ''
      })
    }, 15000)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || 'Stok güncellenemedi')
    }
    return await res.json()
  }

  static async updateStockByCode(materialCode, quantity, movementType, details = {}) {
    return await this.updateStockViaAPI(materialCode, quantity, 'add', {
      reference: details.reference,
      itemId: details.itemId,
      referenceType: movementType,
      notes: details.notes
    })
  }

  // CATEGORIES
  static async listCategories() {
    const res = await fetchWithTimeout(`${API_BASE}/api/categories`, { headers: withAuth() }, 12000)
    if (!res.ok) throw new Error('Kategoriler alınamadı')
    return await res.json()
  }

  static async createCategory(categoryData) {
    const res = await fetchWithTimeout(`${API_BASE}/api/categories`, { method: 'POST', headers: withAuth(), body: JSON.stringify(categoryData) }, 12000)
    if (!res.ok) throw new Error('Kategori eklenemedi')
    return await res.json()
  }

  static async updateCategory(categoryId, updateData) {
    const res = await fetchWithTimeout(`${API_BASE}/api/categories/${encodeURIComponent(categoryId)}`, { method: 'PATCH', headers: withAuth(), body: JSON.stringify(updateData) }, 12000)
    if (!res.ok) throw new Error('Kategori güncellenemedi')
    return await res.json()
  }

  static async deleteCategory(categoryId) {
    const res = await fetchWithTimeout(`${API_BASE}/api/categories/${encodeURIComponent(categoryId)}`, { method: 'DELETE', headers: withAuth() }, 12000)
    if (!res.ok) throw new Error('Kategori silinemedi')
    return await res.json()
  }

  // DASHBOARD STATS (client-computed)
  static async getDashboardStats() {
    const materials = await this.getMaterials()
    return {
      totalMaterials: materials.length,
      activeMaterials: materials.filter(m => m.status !== 'Kaldırıldı' && m.isActive !== false).length,
      lowStockMaterials: materials.filter(m => (m.stock || 0) <= (m.reorderPoint || 0)).length
    }
  }
}

export default MaterialsService
