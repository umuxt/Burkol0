import { useState, useEffect } from 'react'
import { withAuth } from '../lib/api.js'

async function fetchJsonWith401Retry(url, options = {}, timeoutMs = 10000) {
  const res = await fetch(url, options)
  if (res.status !== 401) return res
  try {
    const host = typeof window !== 'undefined' ? window.location.hostname : ''
    const isLocal = host === 'localhost' || host === '127.0.0.1'
    if (!isLocal) return res
    localStorage.removeItem('bk_admin_token')
    const retry = await fetch(url, { ...(options || {}), headers: withAuth(options?.headers || {}) })
    return retry
  } catch {
    return res
  }
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
      
      const response = await fetchJsonWith401Retry('/api/supplier-categories', { method: 'GET', headers: withAuth({ 'Content-Type': 'application/json' }) })

      if (!response.ok) {
        if (response.status === 401) {
          // Yetkisiz ise UI'yi bozmadan boş liste dön
          setCategories([])
          return
        }
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
        headers: withAuth({ 'Content-Type': 'application/json' }),
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
        headers: withAuth({ 'Content-Type': 'application/json' }),
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
        headers: withAuth({ 'Content-Type': 'application/json' })
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
