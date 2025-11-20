// Hook: useMaterialLots
// Fetches lot inventory for a given material from backend materials API
// Only runs on demand (expose loadLots) so parent can trigger on button click
// Follows the same lazy-loading pattern as useMaterialProcurementHistory

import { useCallback, useMemo, useRef, useState } from 'react'

function normalizeDate(d) {
  if (!d) return null
  try {
    if (d instanceof Date) return d
    const ts = typeof d === 'number' ? new Date(d) : new Date(String(d))
    return isNaN(ts.getTime()) ? null : ts
  } catch {
    return null
  }
}

export function useMaterialLots(material) {
  const [lots, setLots] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const materialCode = useMemo(() => {
    if (!material) return ''
    return String(material.code || material.id || '')
  }, [material])

  const loadedCodeRef = useRef(null)

  const loadLots = useCallback(async () => {
    if (!materialCode) return
    
    try {
      setLoading(true)
      setError(null)

      console.log('🔄 Loading lots for material:', materialCode)

      // Fetch lots from backend API
      const res = await fetch(`/api/materials/${materialCode}/lots`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Lots API error: ${res.status}`)
      }
      
      const data = await res.json()
      const lotsData = Array.isArray(data?.lots) ? data.lots : []

      console.log('✅ Lots loaded:', lotsData.length)

      // Map and normalize lot data
      const normalizedLots = lotsData.map(lot => ({
        lotNumber: lot.lot_number || '',
        lotDate: normalizeDate(lot.lot_date),
        supplierLotCode: lot.supplier_lot_code || '-',
        manufacturingDate: normalizeDate(lot.manufacturing_date),
        expiryDate: normalizeDate(lot.expiry_date),
        balance: Number(lot.lot_balance) || 0,
        status: lot.lot_status || 'active',
        fifoOrder: Number(lot.fifo_order) || 0
      }))

      setLots(normalizedLots)
      loadedCodeRef.current = materialCode
    } catch (err) {
      console.error('❌ Error loading lots:', err)
      setError(err.message || 'Failed to load lots')
      setLots([])
    } finally {
      setLoading(false)
    }
  }, [materialCode])

  // Reset when material changes
  const resetLots = useCallback(() => {
    setLots([])
    setError(null)
    loadedCodeRef.current = null
  }, [])

  return {
    lots,
    loading,
    error,
    loadLots,
    resetLots,
    hasLoaded: loadedCodeRef.current === materialCode
  }
}

export default useMaterialLots
