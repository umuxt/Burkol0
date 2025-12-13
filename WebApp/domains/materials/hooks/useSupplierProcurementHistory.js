// Hook: useSupplierProcurementHistory
// Fetches procurement (order items) history for a given supplier from backend orders API
// Lazy loads on demand via exposed loadHistory()

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

function computeSortDate(itemStatus, actual, expected, orderDate) {
  const delivered = String(itemStatus || '').toLowerCase() === 'teslim edildi'
  if (delivered && actual) return actual
  if (expected) return expected
  return orderDate || null
}

export function useSupplierProcurementHistory(supplier) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const supplierKey = useMemo(() => {
    if (!supplier) return ''
    // Prefer id; fallback to code/name to maintain compatibility
    return String(supplier.id || supplier.code || supplier.name || '')
  }, [supplier])

  const loadedKeyRef = useRef(null)

  const loadHistory = useCallback(async () => {
    if (!supplierKey) return
    try {
      setLoading(true)
      setError(null)

      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/orders', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Orders API error: ${res.status}`)
      }
      const data = await res.json()
      const orders = Array.isArray(data?.orders) ? data.orders : []

      const rows = []
      for (const order of orders) {
        const orderSupplierKey = String(order.supplierId || order.supplierName || '')
        const selectedMatches = supplierKey && orderSupplierKey && (orderSupplierKey === supplierKey)
          || (supplier?.id && order.supplierId && String(order.supplierId) === String(supplier.id))
          || (supplier?.name && order.supplierName && String(order.supplierName) === String(supplier.name))

        if (!selectedMatches) continue

        const orderItems = Array.isArray(order.items) ? order.items : []
        for (let idx = 0; idx < orderItems.length; idx++) {
          const it = orderItems[idx] || {}

          const qty = Number(it.quantity ?? 0)
          const unitPrice = Number(it.unitPrice ?? 0)
          const currency = it.currency || order.currency || 'TRY'
          const actual = normalizeDate(it.actualDeliveryDate)
          const expected = normalizeDate(it.expectedDeliveryDate)
          const orderDate = normalizeDate(order.orderDate)
          const itemStatus = it.itemStatus || 'Onay Bekliyor'
          const sortDate = computeSortDate(itemStatus, actual, expected, orderDate)

          rows.push({
            orderId: order.id,
            orderCode: order.orderCode || order.id,
            itemSequence: it.itemSequence || idx + 1,
            // supplier context
            supplierName: order.supplierName || order.supplierId || '-',
            // display for supplier view
            materialName: it.materialName || it.materialCode || '-',
            materialCode: it.materialCode || '-',
            unit: it.unit || '',
            quantity: isNaN(qty) ? 0 : qty,
            unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
            currency,
            itemStatus,
            actualDeliveryDate: actual,
            expectedDeliveryDate: expected,
            orderDate,
            _sortDate: sortDate
          })
        }
      }

      rows.sort((a, b) => {
        const ad = a._sortDate ? a._sortDate.getTime() : -Infinity
        const bd = b._sortDate ? b._sortDate.getTime() : -Infinity
        if (bd !== ad) return bd - ad
        const aod = a.orderDate ? a.orderDate.getTime() : -Infinity
        const bod = b.orderDate ? b.orderDate.getTime() : -Infinity
        if (bod !== aod) return bod - aod
        const ac = String(a.orderCode || '')
        const bc = String(b.orderCode || '')
        if (ac !== bc) return ac.localeCompare(bc)
        return (b.itemSequence || 0) - (a.itemSequence || 0)
      })

      setItems(rows.slice(0, 10))
      loadedKeyRef.current = supplierKey
    } catch (e) {
      setError(e?.message || 'Tedarik geçmişi yüklenemedi')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [supplierKey, supplier?.id, supplier?.name])

  return {
    items,
    loading,
    error,
    loadHistory,
    isLoadedForSupplier: loadedKeyRef.current === supplierKey
  }
}

export default useSupplierProcurementHistory

