import { useState, useEffect, useCallback } from 'react'
import { fetchWithTimeout, withAuth } from '../../../shared/lib/api.js'
import { getAuthToken } from '../../../shared/utils/auth.js'

async function fetchJsonWith401Retry(url, options = {}, timeoutMs = 10000) {
  const res = await fetchWithTimeout(url, options, timeoutMs)
  if (res.status !== 401) return res
  try {
    const host = typeof window !== 'undefined' ? window.location.hostname : ''
    const isLocal = host === 'localhost' || host === '127.0.0.1'
    if (!isLocal) return res
    localStorage.removeItem('bk_admin_token')
    const retry = await fetchWithTimeout(url, { ...(options || {}), headers: withAuth(options?.headers || {}) }, timeoutMs)
    return retry
  } catch {
    return res
  }
}

export function useSuppliers(autoLoad = true) {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(autoLoad)
  const [error, setError] = useState(null)
  const [lastInvalidateTime, setLastInvalidateTime] = useState(0) // Cache invalidation timestamp

  // Normalize supplier.suppliedMaterials items to a consistent shape
  const normalizeSuppliedMaterial = (item) => {
    if (!item || typeof item !== 'object') return item
    const {
      // backend relation keys
      materialId,
      materialCode,
      materialName,
      // legacy/frontend keys
      id,
      code,
      name,
      // passthrough
      price,
      deliveryTime,
      minQuantity,
      addedAt,
      category,
      unit,
      status,
      statusUpdatedAt
    } = item

    const norm = {
      // keep both for compatibility
      id: id || materialId || null,
      materialId: materialId || id || null,
      code: code || materialCode || null,
      materialCode: materialCode || code || null,
      name: name || materialName || null,
      materialName: materialName || name || null,
      price,
      deliveryTime,
      minQuantity,
      addedAt,
      category,
      unit,
      status,
      statusUpdatedAt
    }
    return norm
  }

  // Fetch all suppliers
  const fetchSuppliers = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true)
      
      console.log('🔍 useSuppliers: API çağrısı yapılıyor...', {
        timestamp: new Date().toISOString(),
        forceRefresh
      })
      
      // Add cache bust parameter if force refresh is requested
      const url = forceRefresh 
        ? `/api/suppliers?_t=${Date.now()}` 
        : '/api/suppliers'
      
      const response = await fetchJsonWith401Retry(url, { headers: withAuth({ 'Content-Type': 'application/json' }) })

      console.log('📡 Server response:', response.status, response.statusText)

      if (!response.ok) {
        if (response.status === 401) {
          // Yetkisiz: boş liste ile devam et, hata göstermeden
          setSuppliers([])
          setError(null)
          return
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      // Normalize suppliedMaterials so UI can read id/name/code
      const normalized = (data || []).map(s => ({
        ...s,
        suppliedMaterials: Array.isArray(s?.suppliedMaterials)
          ? s.suppliedMaterials.map(normalizeSuppliedMaterial)
          : []
      }))
      console.log('🔍 useSuppliers: API response:', {
        count: normalized?.length || 0,
        timestamp: new Date().toISOString(),
        data: normalized?.map(s => ({ id: s.id, code: s.code, name: s.name || s.companyName }))
      })
      
      setSuppliers(normalized)
      setError(null)
    } catch (err) {
      console.error('❌ useSuppliers: Error fetching suppliers:', err)
      setError(err.message)
      setSuppliers([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Add new supplier
  const addSupplier = async (supplierData) => {
    try {
      const response = await fetchWithTimeout('/api/suppliers', {
        method: 'POST',
        headers: withAuth({ 'Content-Type': 'application/json' }),
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
      console.log('🔄 Updating supplier on client:', { id, updateData })
      
      if (!id) {
        throw new Error('Supplier ID is required')
      }
      
      if (!updateData || Object.keys(updateData).length === 0) {
        throw new Error('Update data is required')
      }
      
      // Clean update data - remove read-only fields
      const cleanUpdateData = { ...updateData }
      delete cleanUpdateData.id
      delete cleanUpdateData.createdAt
      delete cleanUpdateData.updatedAt
      
      console.log('🧹 Clean update data:', cleanUpdateData)
      
      const response = await fetchWithTimeout(`/api/suppliers/${id}`, {
        method: 'PATCH',
        headers: withAuth({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(cleanUpdateData)
      })

      console.log('📡 Server response status:', response.status)
      
      if (!response.ok) {
        const errorData = await response.text()
        console.error('❌ Server error response:', errorData)
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorData}`)
      }

      const updatedSupplier = await response.json()
      console.log('✅ Supplier updated successfully:', updatedSupplier)
      
      setSuppliers(prev => prev.map(supplier => 
        supplier.id === id ? { ...supplier, ...updatedSupplier } : supplier
      ))
      return updatedSupplier
    } catch (err) {
      console.error('❌ Error updating supplier:', {
        error: err.message,
        supplierId: id,
        updateData
      })
      throw err
    }
  }

  // Delete supplier
  const deleteSupplier = async (id) => {
    try {
      const response = await fetchWithTimeout(`/api/suppliers/${id}`, {
        method: 'DELETE',
        headers: withAuth({ 'Content-Type': 'application/json' })
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

  // Invalidate cache - triggers fresh data load
  const invalidateCache = useCallback((reason = 'manual') => {
    console.log('🗑️ Suppliers cache invalidated. Reason:', reason);
    setLastInvalidateTime(Date.now());
    // Trigger fresh data load
    fetchSuppliers(true);
  }, [])

  // Add material to supplier
  const addMaterialToSupplier = async (supplierId, materialData) => {
    try {
      const token = getAuthToken()
      
      const response = await fetchWithTimeout(`/api/suppliers/${supplierId}/materials`, {
        method: 'POST',
        headers: withAuth({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(materialData)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const relation = await response.json()
      const normalizedRelation = normalizeSuppliedMaterial(relation)

      // Optimistically update suppliers state so UI reflects immediately
      setSuppliers(prev => prev.map(s => {
        if (String(s.id) !== String(supplierId)) return s
        const current = Array.isArray(s.suppliedMaterials) ? s.suppliedMaterials : []
        // de-duplicate by id/materialId
        const exists = current.some(m => (m.id && normalizedRelation.id && String(m.id) === String(normalizedRelation.id))
          || (m.materialId && normalizedRelation.materialId && String(m.materialId) === String(normalizedRelation.materialId)))
        const nextMaterials = exists
          ? current
          : [...current, normalizedRelation]
        return { ...s, suppliedMaterials: nextMaterials }
      }))

      // Invalidate cache timestamp for next time
      console.log('➕ Material added to supplier, marking cache as stale...');
      setLastInvalidateTime(Date.now());
      
      // Global event for cross-component cache invalidation (don't trigger immediate refresh)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('suppliersUpdated', { 
          detail: { supplierId, materialData: normalizedRelation } 
        }));
      }

      return normalizedRelation
    } catch (err) {
      console.error('Error adding material to supplier:', err)
      throw err
    }
  }

  // Get suppliers for a specific material
  const getSuppliersForMaterial = async (materialId) => {
    try {
      const response = await fetchJsonWith401Retry(`/api/materials/${materialId}/suppliers`, { headers: withAuth({ 'Content-Type': 'application/json' }) })

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

  // Get suppliers for selected supplier
  const getMaterialsForSupplier = useCallback(async (supplierId) => {
    if (!supplierId) {
      return []
    }

    try {
      const response = await fetchJsonWith401Retry(`/api/suppliers/${supplierId}/materials`, { headers: withAuth({ 'Content-Type': 'application/json' }) })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      const normalized = Array.isArray(data) ? data.map(normalizeSuppliedMaterial) : []
      return normalized
    } catch (err) {
      console.error('Error fetching materials for supplier:', err)
      throw err
    }
  }, [])

  // Get suppliers by category
  const getSuppliersByCategory = async (category) => {
    try {
      const response = await fetchJsonWith401Retry(`/api/suppliers/category/${encodeURIComponent(category)}`, { headers: withAuth({ 'Content-Type': 'application/json' }) })

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

  // Load suppliers on mount (conditional based on autoLoad)
  useEffect(() => {
    if (autoLoad) {
      console.log('🔍 useSuppliers: autoLoad=true, fetchSuppliers çağrılıyor...')
      fetchSuppliers()
    } else {
      console.log('🔍 useSuppliers: autoLoad=false, manuel yükleme bekleniyor...')
      setLoading(false)
    }
  }, [fetchSuppliers, autoLoad])

  return {
    suppliers,
    loading,
    error,
    lastInvalidateTime, // Export for external cache checking
    addSupplier,
    updateSupplier,
    deleteSupplier,
    addMaterialToSupplier,
    getSuppliersForMaterial,
    getMaterialsForSupplier,
    getSuppliersByCategory,
    fetchSuppliers,  // Direct function reference
    refetch: fetchSuppliers,  // Alias for compatibility
    invalidateCache // Export cache invalidation
  }
}
