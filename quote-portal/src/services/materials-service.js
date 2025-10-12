// Materials Service - Backend API kullanarak (quote-dashboard tarzı)
// Firebase Admin SDK backend'de çalışıyor, client'da API call'lar yapıyoruz

console.log('✅ Materials Service: Backend API kullanımı aktif');

// Auth header helper (API.js'den alındı)
function withAuth() {
  const headers = { 'Content-Type': 'application/json' }
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('bk_admin_token') : null
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

// Fetch helper with timeout
async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
  return await Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
  ])
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
      console.error('❌ Materials fetch error:', error)
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
      
      console.log('✅ Material deleted:', materialId)
      return true
    } catch (error) {
      console.error('❌ Material delete error:', error)
      throw error
    }
  }
}