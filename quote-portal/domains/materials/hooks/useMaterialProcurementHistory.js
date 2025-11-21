// Hook: useMaterialProcurementHistory
// Fetches procurement (order items) history for a given material from backend orders API
// Only runs on demand (expose loadHistory) so parent can trigger on modal open

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

export function useMaterialProcurementHistory(material) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const materialKey = useMemo(() => {
    if (!material) return ''
    // Material procurement history from orders
    return String(material.id || material.code || '')
  }, [material])

  const loadedKeyRef = useRef(null)

  const loadHistory = useCallback(async () => {
    if (!materialKey) return
    try {
      setLoading(true)
      setError(null)

      // Fetch all orders via backend API; filter client-side by item.materialCode/Name
      const res = await fetch('/api/orders')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Orders API error: ${res.status}`)
      }
      const data = await res.json()
      const orders = Array.isArray(data?.orders) ? data.orders : []

      const matches = []
      for (const order of orders) {
        const orderItems = Array.isArray(order.items) ? order.items : []
        for (let idx = 0; idx < orderItems.length; idx++) {
          const it = orderItems[idx] || {}
          // Eşleşme sadece malzeme ID üzerinden yapılır.
          // Order item'da materialId yoksa materialCode'u ID yerine kullanırız (projede id===code)
          const itemMaterialKey = String(it.materialId || it.materialCode || it.itemCode || it.lineId || '')
          const materialMatches = itemMaterialKey && materialKey && (itemMaterialKey === materialKey)

          if (materialMatches) {
            const qty = Number(it.quantity ?? 0)
            const unitPrice = Number(it.unitPrice ?? 0)
            const currency = it.currency || order.currency || 'TRY'
            const actual = normalizeDate(it.actualDeliveryDate)
            const expected = normalizeDate(it.expectedDeliveryDate)
            const orderDate = normalizeDate(order.orderDate)
            const itemStatus = it.itemStatus || 'Onay Bekliyor'
            const sortDate = computeSortDate(itemStatus, actual, expected, orderDate)

            matches.push({
              // identity
              orderId: order.id,
              orderCode: order.orderCode || order.id,
              itemSequence: it.itemSequence || idx + 1,
              // display
              supplierName: order.supplierName || order.supplierId || '-',
              quantity: isNaN(qty) ? 0 : qty,
              unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
              currency,
              itemStatus,
              // dates
              actualDeliveryDate: actual,
              expectedDeliveryDate: expected,
              orderDate,
              // sortKey: delivered→actual, else expected, else orderDate
              _sortDate: sortDate
            })
          }
        }
      }

      // Sort by date desc and take last 10
      matches.sort((a, b) => {
        const ad = a._sortDate ? a._sortDate.getTime() : -Infinity
        const bd = b._sortDate ? b._sortDate.getTime() : -Infinity
        if (bd !== ad) return bd - ad
        // Tie-breaker: orderDate desc, then orderCode, then itemSequence
        const aod = a.orderDate ? a.orderDate.getTime() : -Infinity
        const bod = b.orderDate ? b.orderDate.getTime() : -Infinity
        if (bod !== aod) return bod - aod
        const ac = String(a.orderCode || '')
        const bc = String(b.orderCode || '')
        if (ac !== bc) return ac.localeCompare(bc)
        return (b.itemSequence || 0) - (a.itemSequence || 0)
      })

      setItems(matches.slice(0, 10))
      loadedKeyRef.current = materialKey
    } catch (e) {
      setError(e?.message || 'Tedarik geçmişi yüklenemedi')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [material, materialKey])

  return {
    items,
    loading,
    error,
    loadHistory,
    isLoadedForMaterial: loadedKeyRef.current === materialKey
  }
}

export default useMaterialProcurementHistory
