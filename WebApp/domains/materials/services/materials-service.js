// Materials Service - Backend API kullanarak

import { fetchWithTimeout } from '../../../shared/lib/api.js'

console.log('✅ Materials Service: Backend API kullanımı aktif');

// Auth header helper (API.js'den alındı)
function withAuth(headers = {}) {
  try {
    const token = localStorage.getItem('bp_admin_token')
    // Development mode: use dev token if no real token exists
    if (!token && window.location.hostname === 'localhost') {
      return { ...headers, Authorization: 'Bearer dev-admin-token', 'Content-Type': 'application/json' }
    }
    return token ? { ...headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { ...headers, 'Content-Type': 'application/json' }
  } catch {
    return { ...headers, 'Content-Type': 'application/json' }
  }
}

// Materials CRUD Operations
export const materialsService = {
  // Tüm materyalleri getir
  getMaterials: async (categoryFilter = null) => {
    try {
      const url = categoryFilter 
        ? `/api/materials?category=${encodeURIComponent(categoryFilter)}`
        : '/api/materials'
      
      const response = await fetchWithTimeout(url, {
        headers: withAuth()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const materials = await response.json()
      return materials
    } catch (error) {
      console.warn('❌ Materials fetch error (returning empty list):', error?.message || error)
      // Ağ hatalarında UI'yı bozmayalım; boş liste döndür
      return []
    }
  },

  // Yeni materyal ekle
  addMaterial: async (materialData) => {
    try {
      const response = await fetchWithTimeout('/api/materials', {
        method: 'POST',
        headers: withAuth(),
        body: JSON.stringify(materialData)
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const newMaterial = await response.json()
      return newMaterial
    } catch (error) {
      console.error('❌ Material add error:', error)
      throw error
    }
  },

  // Materyal güncelle
  updateMaterial: async (materialId, updates) => {
    try {
      const response = await fetchWithTimeout(`/api/materials/${materialId}`, {
        method: 'PATCH',
        headers: withAuth(),
        body: JSON.stringify(updates)
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const updatedMaterial = await response.json()
      return updatedMaterial
    } catch (error) {
      console.error('❌ Material update error:', error)
      throw error
    }
  },

  // Tüm materyalleri getir (kaldırılanlar dahil)
  getAllMaterials: async (forceRefresh = false) => {
    try {
      // Önce standart liste uç noktasını kullan
      const url = new URL('/api/materials/all', window.location.origin)
      if (forceRefresh) {
        url.searchParams.set('_t', Date.now().toString())
      }
      
      const response = await fetchWithTimeout(url.toString(), {
        headers: withAuth()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const materials = await response.json()
      return materials
    } catch (error) {
      console.warn('❌ All materials fetch error (returning empty list):', error?.message || error)
      return []
    }
  },

  // Tüm materyalleri getir (kaldırılanlar dahil) - Suppliers table için
  getAllMaterialsIncludingRemoved: async (forceRefresh = false) => {
    try {
      // Kaldırılanlar dahil tüm malzemeleri almak için /all endpoint'ini kullan
      const url = new URL('/api/materials/all', window.location.origin)
      if (forceRefresh) {
        url.searchParams.set('_t', Date.now().toString())
      }
      
      const response = await fetchWithTimeout(url.toString(), {
        headers: withAuth()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const materials = await response.json()
      return materials
    } catch (error) {
      console.warn('❌ All materials including removed fetch error (returning empty list):', error?.message || error)
      return []
    }
  },

  // Materyal sil
  deleteMaterial: async (materialId) => {
    try {
      const response = await fetchWithTimeout(`/api/materials/${materialId}`, {
        method: 'DELETE',
        headers: withAuth()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        id: materialId,
        action: result.action,
        message: result.message,
        alreadyRemoved: result.action === 'already_removed'
      }
    } catch (error) {
      console.error('❌ Material delete error:', error)
      throw error
    }
  }
}
