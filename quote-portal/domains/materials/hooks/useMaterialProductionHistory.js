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
      console.log('📦 Raw movements data:', movements)
      if (movements.length > 0) {
        console.table(movements[0])
      }

      // Filter for MES production-related movements only
      // Only show movements that have assignmentId (linked to production tasks)
      // OR have subType indicating production activity
      const productionMovements = movements.filter(m => {
        const subType = m.subType || ''
        const hasAssignment = m.assignmentId !== null && m.assignmentId !== undefined
        
        // Must have assignmentId OR be production-related subType
        const isProductionRelated = 
          subType === 'production' ||
          subType === 'scrap' ||
          subType === 'production_consumption' ||
          subType === 'production_scrap' ||
          subType === 'production_output' ||
          subType === 'production_output_new_material' ||
          subType === 'wip_reservation' ||
          subType === 'adjustment' // Only if linked to assignment
        
        return hasAssignment && isProductionRelated
      })

      console.log(`📋 Filtered ${productionMovements.length}/${movements.length} production-related movements`)

      // Transform to production history format
      const historyItems = productionMovements.map(m => {
        // Determine type based on subType and type fields
        let type = 'other'
        const subType = m.subType || ''
        const movementType = m.type || ''
        
        if (subType === 'production' || subType === 'production_output' || subType === 'production_output_new_material') {
          type = 'production'
        } else if (subType === 'scrap' || subType === 'production_scrap') {
          type = 'scrap'
        } else if (subType === 'production_consumption' || m.status === 'consumption') {
          type = 'consumption'
        } else if (subType === 'wip_reservation' || m.status === 'wip') {
          type = 'wip'
        } else if (subType === 'adjustment') {
          type = movementType === 'in' ? 'adjustment_in' : 'adjustment_out'
        } else if (subType === 'order_delivery') {
          type = 'order'
        } else if (movementType === 'in') {
          type = 'stock_in'
        } else if (movementType === 'out') {
          type = 'stock_out'
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
      console.log('📊 Transformed history items:', historyItems)
      if (historyItems.length > 0) {
        console.table(historyItems[0])
      }

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
