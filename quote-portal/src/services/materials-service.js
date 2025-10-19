// Materials Service - Backend API kullanarak (quote-dashboard tarzı)
// Firebase Admin SDK backend'de çalışıyor, client'da API call'lar yapıyoruz

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
      console.warn('🔄 SERVICE DEBUG: getMaterials başladı');
      const url = categoryFilter 
        ? `/api/materials?category=${encodeURIComponent(categoryFilter)}`
        : '/api/materials'
      
      console.warn('🔍 SERVICE DEBUG: URL:', url);
      console.warn('🔍 SERVICE DEBUG: Headers:', withAuth());
      
      const response = await fetchWithTimeout(url, {
        headers: withAuth()
      })
      
      console.warn('🔍 SERVICE DEBUG: Response status:', response.status);
      console.warn('🔍 SERVICE DEBUG: Response ok:', response.ok);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const materials = await response.json()
      console.warn('🔍 SERVICE DEBUG: Response parsed:', materials?.length || 0, 'materyal');
      console.warn('🔍 SERVICE DEBUG: Materials detay:', materials);
      console.log('✅ Materials fetch successful:', materials.length, 'items')
      return materials
    } catch (error) {
      console.error('❌ Materials fetch error:', error)
      console.warn('❌ SERVICE DEBUG: Error details:', error.message);
      throw error
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
      console.warn('🔄 SERVICE DEBUG: getAllMaterials başladı (kaldırılanlar dahil)')
      const response = await fetchWithTimeout('/api/materials/all', {
        headers: withAuth()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const materials = await response.json()
      console.log('✅ All materials fetch successful:', materials.length, 'items (including removed)')
      return materials
    } catch (error) {
      console.error('❌ All materials fetch error:', error)
      throw error
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