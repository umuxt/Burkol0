// Categories Service - Backend API kullanarak
// Backend API ile Firebase Admin SDK, frontend'de API call'lar yapıyoruz

import { fetchWithTimeout } from '../lib/api.js'

console.log('✅ Categories Service: Backend API kullanımı aktif');

const API_BASE_PATH = '/api/material-categories';

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
  getCategories: async (forceRefresh = false) => {
    try {
      const url = new URL(API_BASE_PATH, window.location.origin)
      if (forceRefresh) url.searchParams.set('_t', Date.now().toString())
      const response = await fetchWithTimeout(url.toString(), {
        headers: withAuth()
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const categories = await response.json()
      return categories
    } catch (error) {
      console.warn('❌ Categories fetch error (returning empty list):', error?.message || error)
      // UI akışını bozmayalım; boş liste döndür
      return []
    }
  },

  // Yeni kategori ekle
  addCategory: async (categoryData) => {
    try {
      const response = await fetchWithTimeout(API_BASE_PATH, {
        method: 'POST',
        headers: withAuth(),
        body: JSON.stringify(categoryData)
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const newCategory = await response.json()
      return newCategory
    } catch (error) {
      console.error('❌ Category add error:', error)
      throw error
    }
  },

  // Kategori güncelle
  updateCategory: async (categoryId, updates) => {
    try {
      const response = await fetchWithTimeout(`${API_BASE_PATH}/${categoryId}`, {
        method: 'PATCH',
        headers: withAuth(),
        body: JSON.stringify(updates)
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const updatedCategory = await response.json()
      return updatedCategory
    } catch (error) {
      console.error('❌ Category update error:', error)
      throw error
    }
  },

  // Kategori sil
  deleteCategory: async (categoryId, updateRemoved = false) => {
    try {
      const url = new URL(`${API_BASE_PATH}/${categoryId}`, window.location.origin);
      if (updateRemoved) {
        url.searchParams.set('updateRemoved', 'true');
      }

      const response = await fetchWithTimeout(url.toString(), {
        method: 'DELETE',
        headers: withAuth()
      });
      
      if (!response.ok) {
        const errorBody = await response.text();
        console.error('Category delete failed with status:', response.status, 'Body:', errorBody);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return true;
    } catch (error) {
      console.error('❌ Category delete error:', error);
      throw error;
    }
  },
  // Kategori kullanımını getir (bu kategoriyi kullanan aktif malzemeler)
  getCategoryUsage: async (categoryId) => {
    try {
      const response = await fetchWithTimeout(`${API_BASE_PATH}/${encodeURIComponent(categoryId)}/usage`, {
        headers: withAuth()
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const usage = await response.json()
      return usage
    } catch (error) {
      console.error('❌ Category usage fetch error:', error)
      return { categoryId, count: 0, materials: [] }
    }
  }
}
