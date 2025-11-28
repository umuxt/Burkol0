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

      // Filter for MES production-related movements only
      const productionMovements = movements.filter(m => {
        const subType = m.subType || ''
        const hasAssignment = m.assignmentId !== null && m.assignmentId !== undefined
        
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

      // Group movements by assignmentId for consolidation
      const groupedByAssignment = {}
      const otherMovements = []

      productionMovements.forEach(m => {
        const subType = m.subType || ''
        const assignmentId = m.assignmentId

        // Check if this is a consolidatable type (WIP or Adjustment)
        const isConsolidatable = subType === 'wip_reservation' || subType === 'adjustment'

        if (isConsolidatable && assignmentId) {
          if (!groupedByAssignment[assignmentId]) {
            groupedByAssignment[assignmentId] = []
          }
          groupedByAssignment[assignmentId].push(m)
        } else {
          otherMovements.push(m)
        }
      })

      // Process consolidated groups
      const consolidatedItems = []

      Object.values(groupedByAssignment).forEach(group => {
        // Find if there is an adjustment (completed task)
        const adjustment = group.find(m => m.subType === 'adjustment')
        
        if (adjustment) {
          // Task is complete: Consolidate into one "realized_consumption" record
          // Calculate net consumption: WIP (out = positive consumption) - Adjustment (in = returned)
          // WIP is type='out' (stock decreases), Adjustment can be 'in' (return) or 'out' (extra consumption)
          let totalConsumption = 0
          group.forEach(m => {
            const qty = Math.abs(Number(m.quantity) || 0)
            if (m.type === 'out') {
              // Out means consumption (stock decreased)
              totalConsumption += qty
            } else if (m.type === 'in') {
              // In means return/adjustment back to stock
              totalConsumption -= qty
            }
          })

          // Use the adjustment record as the base for metadata (timestamp = completion time)
          const baseRecord = adjustment
          
          consolidatedItems.push({
            id: baseRecord.id, // Use adjustment ID
            timestamp: baseRecord.movementDate || baseRecord.createdAt,
            workOrderCode: baseRecord.reference || '-',
            planId: baseRecord.relatedPlanId || '-',
            nodeId: baseRecord.relatedNodeId || '-',
            quantity: totalConsumption, // The net consumed quantity (positive = consumed from stock)
            reservedQuantity: baseRecord.reservedQuantity,
            adjustedQuantity: baseRecord.adjustedQuantity,
            type: 'realized_consumption', // New unified type
            status: 'completed',
            subType: 'realized_consumption',
            producedBy: baseRecord.userName || baseRecord.userId || 'Sistem',
            notes: baseRecord.notes || '',
            actualOutput: baseRecord.actualOutput,
            defectQuantity: baseRecord.defectQuantity,
            plannedOutput: baseRecord.plannedOutput
          })

        } else {
          // Task is in progress (only WIP exists): Add them as individual WIP records
          group.forEach(m => {
             consolidatedItems.push(transformToHistoryItem(m))
          })
        }
      })

      // Process other movements
      const otherItems = otherMovements.map(transformToHistoryItem)

      // Combine all items
      const historyItems = [...consolidatedItems, ...otherItems]

      // Sort by timestamp descending (newest first)
      historyItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

      setItems(historyItems)
      setLoadedMaterialCode(material.code)
      
    } catch (e) {
      console.error('❌ Error loading production history:', e)
      setError(e?.message || 'Üretim geçmişi yüklenemedi')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [material?.code])

  // Helper to transform a single movement record to history item format
  const transformToHistoryItem = (m) => {
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
  }

  const isLoadedForMaterial = loadedMaterialCode === material?.code

  return {
    items,
    loading,
    error,
    loadHistory,
    isLoadedForMaterial
  }
}
