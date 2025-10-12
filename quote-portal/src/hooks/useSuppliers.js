import { useState, useEffect } from 'react'

const API_BASE_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3001' 
  : ''

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Get authentication token
  const getAuthToken = () => {
    return localStorage.getItem('bk_admin_token')
  }

  // Fetch all suppliers
  const fetchSuppliers = async () => {
    try {
      setLoading(true)
      const token = getAuthToken()
      
      console.log('🔍 useSuppliers: API çağrısı yapılıyor...')
      
      const response = await fetch(`${API_BASE_URL}/api/suppliers`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('🔍 useSuppliers: API response:', {
        count: data?.length || 0,
        data: data?.map(s => ({ id: s.id, code: s.code, name: s.name || s.companyName }))
      })
      
      setSuppliers(data)
      setError(null)
    } catch (err) {
      console.error('❌ useSuppliers: Error fetching suppliers:', err)
      setError(err.message)
      setSuppliers([])
    } finally {
      setLoading(false)
    }
  }

  // Add new supplier
  const addSupplier = async (supplierData) => {
    try {
      const token = getAuthToken()
      
      const response = await fetch(`${API_BASE_URL}/api/suppliers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(supplierData)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const newSupplier = await response.json()
      setSuppliers(prev => [newSupplier, ...prev])
      return newSupplier
    } catch (err) {
      console.error('Error adding supplier:', err)
      throw err
    }
  }

  // Update supplier
  const updateSupplier = async (id, updateData) => {
    try {
      const token = getAuthToken()
      
      const response = await fetch(`${API_BASE_URL}/api/suppliers/${id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const updatedSupplier = await response.json()
      setSuppliers(prev => prev.map(supplier => 
        supplier.id === id ? { ...supplier, ...updatedSupplier } : supplier
      ))
      return updatedSupplier
    } catch (err) {
      console.error('Error updating supplier:', err)
      throw err
    }
  }

  // Delete supplier
  const deleteSupplier = async (id) => {
    try {
      const token = getAuthToken()
      
      const response = await fetch(`${API_BASE_URL}/api/suppliers/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      setSuppliers(prev => prev.filter(supplier => supplier.id !== id))
      return true
    } catch (err) {
      console.error('Error deleting supplier:', err)
      throw err
    }
  }

  // Add material to supplier
  const addMaterialToSupplier = async (supplierId, materialData) => {
    try {
      const token = getAuthToken()
      
      const response = await fetch(`${API_BASE_URL}/api/suppliers/${supplierId}/materials`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(materialData)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const relation = await response.json()
      return relation
    } catch (err) {
      console.error('Error adding material to supplier:', err)
      throw err
    }
  }

  // Get suppliers for a material
  const getSuppliersForMaterial = async (materialId) => {
    try {
      const token = getAuthToken()
      
      const response = await fetch(`${API_BASE_URL}/api/materials/${materialId}/suppliers`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const relations = await response.json()
      return relations
    } catch (err) {
      console.error('Error fetching suppliers for material:', err)
      throw err
    }
  }

  // Get suppliers by category
  const getSuppliersByCategory = async (category) => {
    try {
      const token = getAuthToken()
      
      const response = await fetch(`${API_BASE_URL}/api/suppliers/category/${encodeURIComponent(category)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return data
    } catch (err) {
      console.error('Error fetching suppliers by category:', err)
      throw err
    }
  }

  // Load suppliers on mount
  useEffect(() => {
    console.log('🔍 useSuppliers: useEffect çalıştı, fetchSuppliers çağrılıyor...')
    fetchSuppliers()
  }, [])

  return {
    suppliers,
    loading,
    error,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    addMaterialToSupplier,
    getSuppliersForMaterial,
    getSuppliersByCategory,
    refetch: fetchSuppliers
  }
}