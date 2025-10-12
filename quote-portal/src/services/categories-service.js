// Categories Service - Backend API kullanarak (quote-dashboard tarzı)
// Firebase Admin SDK backend'de çalışıyor, client'da API call'lar yapıyoruz

console.log('✅ Categories Service: Backend API kullanımı aktif');

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

// Categories CRUD Operations
export const categoriesService = {
  // Tüm kategorileri getir
  getCategories: async () => {
    try {
      const response = await fetchWithTimeout('/api/categories', {
        headers: withAuth()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const categories = await response.json()
      console.log('✅ Categories fetch successful:', categories.length, 'items')
      return categories
    } catch (error) {
      console.error('❌ Categories fetch error:', error)
      throw error
    }
  },

  // Yeni kategori ekle
  addCategory: async (categoryData) => {
    try {
      const response = await fetchWithTimeout('/api/categories', {
        method: 'POST',
        headers: withAuth(),
        body: JSON.stringify(categoryData)
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const newCategory = await response.json()
      console.log('✅ Category added:', newCategory.id)
      return newCategory
    } catch (error) {
      console.error('❌ Category add error:', error)
      throw error
    }
  },

  // Kategori güncelle
  updateCategory: async (categoryId, updates) => {
    try {
      const response = await fetchWithTimeout(`/api/categories/${categoryId}`, {
        method: 'PATCH',
        headers: withAuth(),
        body: JSON.stringify(updates)
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const updatedCategory = await response.json()
      console.log('✅ Category updated:', categoryId)
      return updatedCategory
    } catch (error) {
      console.error('❌ Category update error:', error)
      throw error
    }
  },

  // Kategori sil
  deleteCategory: async (categoryId) => {
    try {
      const response = await fetchWithTimeout(`/api/categories/${categoryId}`, {
        method: 'DELETE',
        headers: withAuth()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      console.log('✅ Category deleted:', categoryId)
      return true
    } catch (error) {
      console.error('❌ Category delete error:', error)
      throw error
    }
  }
}