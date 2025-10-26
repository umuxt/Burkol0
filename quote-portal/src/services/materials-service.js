// Materials Service - Backend API kullanarak
// Backend API ile Firebase Admin SDK, frontend'de API call'lar yapıyoruz

import { fetchWithTimeout } from '../lib/api.js'

console.log('✅ Materials Service: Backend API kullanımı aktif');

// Auth header helper (API.js'den alındı)
function withAuth(headers = {}) {
  try {
    const token = localStorage.getItem('bk_admin_token')
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
      console.log('✅ Materials fetch successful:', materials.length, 'items')
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
      console.log('✅ Material added:', newMaterial.id)
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
      console.log('✅ Material updated:', materialId)
      return updatedMaterial
    } catch (error) {
      console.error('❌ Material update error:', error)
      throw error
    }
  },

  // Tüm materyalleri getir (kaldırılanlar dahil)
  getAllMaterials: async () => {
    try {
      // Önce standart liste uç noktasını kullan
      const response = await fetchWithTimeout('/api/materials', {
        headers: withAuth()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const materials = await response.json()
      console.log('✅ All materials fetch successful (via /api/materials):', materials.length, 'items')
      return materials
    } catch (error) {
      console.warn('❌ All materials fetch error (returning empty list):', error?.message || error)
      return []
    }
  },

  // Tüm materyalleri getir (kaldırılanlar dahil) - Suppliers table için
  getAllMaterialsIncludingRemoved: async () => {
    try {
      // Kaldırılanlar dahil tüm malzemeleri almak için /all endpoint'ini kullan
      const response = await fetchWithTimeout('/api/materials/all', {
        headers: withAuth()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const materials = await response.json()
      console.log('✅ All materials including removed fetch successful (via /api/materials/all):', materials.length, 'items')
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
      console.log('✅ Material deleted:', materialId, result)
      
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
