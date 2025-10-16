// Categories Service - Backend API kullanarak (quote-dashboard tarzı)
// Firebase Admin SDK backend'de çalışıyor, client'da API call'lar yapıyoruz

import { fetchWithTimeout } from '../lib/api.js'

console.log('✅ Categories Service: Backend API kullanımı aktif');

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