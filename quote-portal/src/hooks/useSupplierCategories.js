import { useState, useEffect } from 'react'

// Auth header helper
function withAuth() {
  const headers = { 'Content-Type': 'application/json' }
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('bk_admin_token') : null
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

/**
 * Tedarikçi kategorilerini yönetmek için custom hook
 */
export function useSupplierCategories(autoLoad = true) {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const loadCategories = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/supplier-categories', {
        method: 'GET',
        headers: withAuth()
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      console.log('📋 Tedarikçi kategorileri yüklendi:', data)
      setCategories(data)
    } catch (err) {
      console.error('❌ Tedarikçi kategorileri yüklenirken hata:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (autoLoad) {
      loadCategories()
    }
  }, [autoLoad])

  return {
    categories,
    loading,
    error,
    refreshCategories: loadCategories
  }
}

/**
 * Tedarikçi kategori işlemleri için actions hook
 */
export function useSupplierCategoryActions() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const addCategory = async (categoryData) => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/supplier-categories', {
        method: 'POST',
        headers: withAuth(),
        body: JSON.stringify(categoryData)
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      console.log('✅ Yeni tedarikçi kategorisi eklendi:', result)
      return result
    } catch (err) {
      console.error('❌ Tedarikçi kategorisi eklenirken hata:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const updateCategory = async (categoryId, updates) => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/supplier-categories/${categoryId}`, {
        method: 'PATCH',
        headers: withAuth(),
        body: JSON.stringify(updates)
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      console.log('✅ Tedarikçi kategorisi güncellendi:', result)
      return result
    } catch (err) {
      console.error('❌ Tedarikçi kategorisi güncellenirken hata:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const deleteCategory = async (categoryId) => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/supplier-categories/${categoryId}`, {
        method: 'DELETE',
        headers: withAuth()
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      console.log('✅ Tedarikçi kategorisi silindi:', categoryId)
      return true
    } catch (err) {
      console.error('❌ Tedarikçi kategorisi silinirken hata:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    addCategory,
    updateCategory,
    deleteCategory,
    loading,
    error
  }
}