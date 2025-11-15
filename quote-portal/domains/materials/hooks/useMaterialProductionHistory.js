import { useState, useCallback } from 'react'

/**
 * Hook to manage material production history
 * Shows both consumption (input usage) and production (output creation) records
 * 
 * @param {Object} material - Material object with code
 * @returns {Object} - { items, loading, error, loadHistory, isLoadedForMaterial }
 */
export default function useMaterialProductionHistory(material) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [loadedMaterialCode, setLoadedMaterialCode] = useState(null)

  const loadHistory = useCallback(async () => {
    if (!material?.code) {
      console.warn('useMaterialProductionHistory: No material code provided')
      return
    }

    setLoading(true)
    setError(null)

    try {
      console.log(`📊 Loading production history for material: ${material.code}`)
      
      // Fetch stock movements with production-related subtypes
      const response = await fetch(`/api/stockMovements?materialCode=${material.code}`)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      const movements = data.movements || []

      console.log(`✅ Fetched ${movements.length} stock movements for ${material.code}`)

      // Filter for production-related movements
      const productionMovements = movements.filter(m => {
        const status = m.status || ''
        const subType = m.subType || ''
        return (
          status === 'wip' ||                           // WIP durumu
          status === 'consumption' ||                   // Sarf
          subType === 'production_consumption' ||       // Legacy: Sarf
          subType === 'production_output' ||            // Üretim
          subType === 'production_output_new_material' ||
          subType === 'wip_reservation'                 // Legacy: WIP
        )
      })

      // Transform to production history format
      const historyItems = productionMovements.map(m => {
        // Prefer status field, fallback to subType for legacy records
        let type = 'wip'
        if (m.status === 'consumption') {
          type = 'consumption'
        } else if (m.status === 'production') {
          type = 'production'
        } else if (m.status === 'wip') {
          type = 'wip'
        } else if (m.subType === 'production_consumption') {
          type = 'consumption'
        } else if (m.subType === 'production_output' || m.subType === 'production_output_new_material') {
          type = 'production'
        } else if (m.subType === 'wip_reservation') {
          type = 'wip'
        }

        return {
          id: m.id,
          timestamp: m.movementDate || m.createdAt,
          workOrderCode: m.reference || '-',
          planId: m.relatedPlanId || '-',
          nodeId: m.relatedNodeId || '-',
          quantity: m.quantity,
          reservedQuantity: m.reservedQuantity,
          adjustedQuantity: m.adjustedQuantity,
          type: type,
          status: m.status,
          subType: m.subType,
          producedBy: m.userName || m.userId || 'Sistem',
          notes: m.notes || '',
          actualOutput: m.actualOutput,
          defectQuantity: m.defectQuantity,
          plannedOutput: m.plannedOutput
        }
      })

      // Sort by timestamp descending (newest first)
      historyItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

      setItems(historyItems)
      setLoadedMaterialCode(material.code)
      
      console.log(`✅ Loaded ${historyItems.length} production history entries for ${material.code}`)

    } catch (e) {
      console.error('❌ Error loading production history:', e)
      setError(e?.message || 'Üretim geçmişi yüklenemedi')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [material?.code])

  const isLoadedForMaterial = loadedMaterialCode === material?.code

  return {
    items,
    loading,
    error,
    loadHistory,
    isLoadedForMaterial
  }
}
