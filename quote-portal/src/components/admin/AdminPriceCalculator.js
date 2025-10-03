// Admin Price Calculator - Price calculation and update logic
import API from '../../lib/api.js'

// Phase 1: Unified calculation using server API
export async function calculatePrice(quote, priceSettings) {
  if (!priceSettings || !priceSettings.parameters || !priceSettings.formula) {
    return quote.calculatedPrice || quote.price || 0
  }

  try {
    const result = await API.calculatePricePreview(quote, priceSettings)
    
    console.log('🔍 SERVER PRICE CALCULATION RESULT:', {
      quoteId: quote.id,
      serverPrice: result.calculatedPrice,
      currentPrice: quote.price,
      source: result.source,
      breakdown: result.breakdown
    })

    return result.calculatedPrice
  } catch (error) {
    console.error('❌ Server price calculation failed:', error)
    // Fallback to local calculation for backwards compatibility
    return calculatePriceLocal(quote, priceSettings)
  }
}

// Fallback local calculation (legacy)
function calculatePriceLocal(quote, priceSettings) {
  if (!priceSettings || !priceSettings.parameters || !priceSettings.formula) {
    return quote.calculatedPrice || quote.price || 0
  }

  try {
    // Create parameter values map
    const paramValues = {}
    
    priceSettings.parameters.forEach(param => {
      // Safety check for param object
      if (!param || !param.id) {
        return
      }
      
      if (param.type === 'fixed') {
        paramValues[param.id] = parseFloat(param.value) || 0
      } else if (param.type === 'form') {
        let value = 0
        
        if (param.formField === 'qty') {
          value = parseFloat(quote.qty) || 0
        } else if (param.formField === 'thickness') {
          value = parseFloat(quote.thickness) || 0
        } else if (param.formField === 'dimensions') {
          // Calculate area from numeric dims if present; fallback to parsing string
          const l = parseFloat(quote.dimsL)
          const w = parseFloat(quote.dimsW)
          if (!isNaN(l) && !isNaN(w)) {
            value = l * w
          } else {
            const dims = quote.dims || ''
            const match = String(dims).match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i)
            if (match) {
              value = (parseFloat(match[1]) || 0) * (parseFloat(match[2]) || 0)
            }
          }
        } else {
          // For custom form fields
          // Check both standard quote fields and customFields
          let fieldValue = quote[param.formField]
          if (fieldValue === undefined && quote.customFields) {
            fieldValue = quote.customFields[param.formField]
          }
          
          if (Array.isArray(fieldValue)) {
            // For multi-select fields, sum all values
            fieldValue.forEach(opt => {
              if (param.lookupTable && Array.isArray(param.lookupTable)) {
                const found = param.lookupTable.find(item => item.option === opt)
                if (found) {
                  value += parseFloat(found.value) || 0
                }
              }
            })
          } else {
            // Single value field with lookup
            if (param.lookupTable && Array.isArray(param.lookupTable)) {
              const lookupItem = param.lookupTable.find(item => item.option === fieldValue)
              if (lookupItem) {
                value = parseFloat(lookupItem.value) || 0
              } else {
                // Direct numeric value
                value = parseFloat(fieldValue) || 0
              }
            } else {
              // Direct numeric value
              value = parseFloat(fieldValue) || 0
            }
          }
        }
        
        paramValues[param.id] = value
      }
    })

    // DEBUG: Critical debugging information
    console.log('🔍 CLIENT PRICE CALCULATION DEBUG:', {
      quoteId: quote.id,
      currentPrice: quote.price,
      storedCalculatedPrice: quote.calculatedPrice,
      pendingCalculatedPrice: quote.pendingCalculatedPrice,
      paramValues: paramValues,
      originalFormula: priceSettings.formula,
      customFields: quote.customFields,
      needsPriceUpdate: quote.needsPriceUpdate
    })

    // Safely evaluate formula
    // Replace parameter IDs with their values
    let formula = priceSettings.formula
    
    if (!formula || formula.trim() === '') {
      console.log('🔍 Empty formula detected, returning stored price')
      return quote.calculatedPrice || quote.price || 0
    }

    // Sort parameters by ID length (descending) to avoid partial replacements
    const sortedParams = Object.keys(paramValues).sort((a, b) => b.length - a.length)
    
    console.log('🔍 PARAMETER REPLACEMENT ORDER:', sortedParams)
    
    sortedParams.forEach(paramId => {
      const regex = new RegExp('\\b' + paramId + '\\b', 'g')
      const oldFormula = formula
      formula = formula.replace(regex, paramValues[paramId])
      
      if (oldFormula !== formula) {
        console.log(`🔍 Replaced ${paramId} = ${paramValues[paramId]} in formula`)
        console.log(`🔍 Before: ${oldFormula}`)
        console.log(`🔍 After: ${formula}`)
      }
    })

    console.log('🔍 FINAL FORMULA AFTER ALL REPLACEMENTS:', formula)

    // Remove leading = if present (Excel-style formulas)
    if (formula.startsWith('=')) {
      formula = formula.substring(1)
      console.log('🔍 FORMULA AFTER = REMOVAL:', formula)
    }

    // Validate formula contains only numbers and basic operators
    if (!/^[\d\s+\-*/().]+$/.test(formula)) {
      console.warn('❌ Invalid formula characters detected:', formula)
      console.warn('❌ Original formula:', priceSettings.formula)
      console.warn('❌ Parameter replacements:', paramValues)
      return quote.calculatedPrice || quote.price || 0
    }

    // Evaluate the formula
    let result
    try {
      result = Function('"use strict"; return (' + formula + ')')()
      console.log('🔍 FORMULA EVALUATION RESULT:', result)
    } catch (evalError) {
      console.error('❌ Formula evaluation failed:', evalError)
      console.error('❌ Formula that failed:', formula)
      return quote.calculatedPrice || quote.price || 0
    }
    return isNaN(result) ? 0 : Math.max(0, result) // Ensure non-negative
    
  } catch (e) {
    console.error('Local price calculation error:', e)
    return quote.calculatedPrice || quote.price || 0
  }
}

export function needsPriceUpdate(quote) {
  // Use server-calculated needsPriceUpdate flag first
  if (quote.needsPriceUpdate === true) {
    return true
  }
  
  // Fallback: compare calculated vs original price if available
  if (quote.calculatedPrice !== undefined && quote.originalPrice !== undefined) {
    const priceDifference = Math.abs(quote.calculatedPrice - quote.originalPrice)
    return priceDifference > 0.01 // More than 1 cent difference
  }
  
  // Legacy fallback: if no versioning data, don't show update
  return false
}

export async function getPriceChangeType(quote, priceSettings) {
  try {
    const currentPrice = parseFloat(quote.price) || 0
    const calculatedPrice = parseFloat(await calculatePrice(quote, priceSettings)) || 0
    const priceDifference = Math.abs(calculatedPrice - currentPrice)
    
    console.log('🔧 DETAILED Price change analysis:', {
      quoteId: quote.id,
      currentPrice: currentPrice,
      calculatedPrice: calculatedPrice,
      difference: priceDifference,
      threshold: 0.01,
      needsPriceUpdate: quote.needsPriceUpdate,
      pendingCalculatedPrice: quote.pendingCalculatedPrice,
      storedCalculatedPrice: quote.calculatedPrice,
      priceUpdatedAt: quote.priceUpdatedAt,
      actualDifferenceCheck: priceDifference > 0.01,
      serverFlagCheck: quote.needsPriceUpdate === true
    })
    
    // Check if recently updated (within last 5 seconds)
    if (quote.priceUpdatedAt) {
      const updatedTime = new Date(quote.priceUpdatedAt)
      const now = new Date()
      const timeDiff = now - updatedTime
      if (timeDiff < 5000) { // 5 seconds
        console.log('🔧 Price recently updated, skipping button:', quote.id)
        return 'no-change'
      }
    }
    
    // ÖNCE: Fiyat gerçekten değişti mi? (en önemli kontrol)
    if (priceDifference > 0.01) {
      console.log('🔧 PRICE CHANGED - Red button:', {
        id: quote.id,
        current: currentPrice,
        calculated: calculatedPrice,
        difference: priceDifference
      })
      return 'price-changed' // 🔴 KIRMIZI - Fiyat gerçekten değişti
    }
    
    // SONRA: Fiyat aynı ama sistem güncellenmesi gerekli mi?
    let formulaChanged = false
    
    // Server tarafı needsPriceUpdate flag'i
    if (quote.needsPriceUpdate === true) {
      formulaChanged = true
      console.log('🔧 Server indicates needs update:', quote.id)
    }
    
    // Pending calculated price kontrolü
    if (quote.pendingCalculatedPrice !== undefined) {
      const pendingDiff = Math.abs(calculatedPrice - parseFloat(quote.pendingCalculatedPrice))
      if (pendingDiff > 0.01) {
        formulaChanged = true
        console.log('🔧 Pending price differs from current calculation:', quote.id)
      }
    }
    
    // Stored calculated price kontrolü
    if (quote.calculatedPrice !== undefined) {
      const storedDiff = Math.abs(calculatedPrice - parseFloat(quote.calculatedPrice))
      if (storedDiff > 0.01) {
        formulaChanged = true
        console.log('🔧 Stored calculated price differs:', quote.id)
      }
    }
    
    if (formulaChanged) {
      console.log('🔧 FORMULA CHANGED - Yellow button:', quote.id)
      return 'formula-changed' // 🟡 SARI - Formül/parametre değişti ama fiyat aynı
    }
    
    console.log('🔧 NO CHANGE - No button:', quote.id)
    return 'no-change' // ✅ DEĞİŞİKLİK YOK - Buton gösterilmez
  } catch (e) {
    console.error('Price change type calculation error:', e)
    return 'no-change' // Safe fallback
  }
}

export function getChanges(item, priceSettings) {
  const changes = []
  
  if (!item.priceHistory || !Array.isArray(item.priceHistory)) {
    return changes
  }
  
  // Get the most recent price history entry to compare
  const lastHistory = item.priceHistory[item.priceHistory.length - 1]
  if (!lastHistory) {
    return changes
  }
  
  // Compare current quote data with last history
  const fieldsToCheck = ['qty', 'thickness', 'material', 'process', 'finish', 'dims']
  
  fieldsToCheck.forEach(field => {
    const currentValue = item[field]
    const historyValue = lastHistory.quoteSnapshot?.[field]
    
    if (JSON.stringify(currentValue) !== JSON.stringify(historyValue)) {
      changes.push({
        field,
        from: historyValue,
        to: currentValue
      })
    }
  })
  
  // Check if formula or parameters changed
  if (lastHistory.priceSettings) {
    const currentFormula = priceSettings?.formula
    const historyFormula = lastHistory.priceSettings.formula
    
    if (currentFormula !== historyFormula) {
      changes.push({
        field: 'formula',
        from: historyFormula,
        to: currentFormula
      })
    }
    
    // Check parameters
    const currentParams = priceSettings?.parameters || []
    const historyParams = lastHistory.priceSettings.parameters || []
    
    if (JSON.stringify(currentParams) !== JSON.stringify(historyParams)) {
      changes.push({
        field: 'parameters',
        from: historyParams,
        to: currentParams
      })
    }
  }
  
  return changes
}

// New function to get all changes from original quote creation
export function getChangesFromOriginal(item, priceSettings, formConfig = null) {
  const changes = []
  
  // If no history exists, we can't compare with original
  if (!item.priceHistory || !Array.isArray(item.priceHistory) || item.priceHistory.length === 0) {
    return changes
  }
  
  // Get the first (original) history entry
  const originalHistory = item.priceHistory[0]
  if (!originalHistory || !originalHistory.quoteSnapshot) {
    return changes
  }
  
  // Compare current quote data with original history
  const fieldsToCheck = ['qty', 'thickness', 'material', 'process', 'finish', 'dims']
  
  fieldsToCheck.forEach(field => {
    const currentValue = item[field]
    const originalValue = originalHistory.quoteSnapshot[field]
    
    if (JSON.stringify(currentValue) !== JSON.stringify(originalValue)) {
      changes.push({
        field,
        from: originalValue,
        to: currentValue,
        type: 'form_field'
      })
    }
  })
  
  // Check custom fields if form config is available
  if (formConfig && formConfig.formStructure && formConfig.formStructure.fields) {
    formConfig.formStructure.fields.forEach(field => {
      const currentValue = item.customFields?.[field.id]
      const originalValue = originalHistory.quoteSnapshot?.customFields?.[field.id]
      
      if (JSON.stringify(currentValue) !== JSON.stringify(originalValue)) {
        changes.push({
          field: field.id,
          fieldLabel: field.label || field.id,
          from: originalValue,
          to: currentValue,
          type: 'custom_field'
        })
      }
    })
  }
  
  // Check if formula changed from original
  if (originalHistory.priceSettings) {
    const currentFormula = priceSettings?.formula
    const originalFormula = originalHistory.priceSettings.formula
    
    if (currentFormula !== originalFormula) {
      changes.push({
        field: 'formula',
        from: originalFormula,
        to: currentFormula,
        type: 'formula'
      })
    }
    
    // Check if parameters changed from original
    const currentParams = priceSettings?.parameters || []
    const originalParams = originalHistory.priceSettings.parameters || []
    
    // Compare parameter values
    const paramChanges = compareParameters(originalParams, currentParams)
    paramChanges.forEach(change => {
      changes.push({
        ...change,
        type: 'parameter'
      })
    })
  }
  
  // Check price change from original
  const originalPrice = parseFloat(originalHistory.price) || 0
  const currentPrice = parseFloat(item.price) || 0
  if (Math.abs(originalPrice - currentPrice) > 0.01) {
    changes.push({
      field: 'price',
      from: originalPrice,
      to: currentPrice,
      type: 'price'
    })
  }
  
  return changes
}

// Helper function to compare parameters in detail
function compareParameters(originalParams, currentParams) {
  const changes = []
  
  // Convert arrays to objects for easier comparison
  const originalObj = {}
  const currentObj = {}
  
  if (Array.isArray(originalParams)) {
    originalParams.forEach(p => {
      if (p && typeof p === 'object' && p.id) {
        originalObj[p.id] = p
      }
    })
  }
  
  if (Array.isArray(currentParams)) {
    currentParams.forEach(p => {
      if (p && typeof p === 'object' && p.id) {
        currentObj[p.id] = p
      }
    })
  }
  
  // Check for changed, added, or removed parameters
  const allParamIds = [...new Set([...Object.keys(originalObj), ...Object.keys(currentObj)])]
  
  allParamIds.forEach(paramId => {
    const originalParam = originalObj[paramId]
    const currentParam = currentObj[paramId]
    
    if (!originalParam && currentParam) {
      // Parameter added
      changes.push({
        field: `parameter_${paramId}`,
        fieldLabel: currentParam.name || paramId,
        from: undefined,
        to: getParameterValue(currentParam),
        changeType: 'added'
      })
    } else if (originalParam && !currentParam) {
      // Parameter removed
      changes.push({
        field: `parameter_${paramId}`,
        fieldLabel: originalParam.name || paramId,
        from: getParameterValue(originalParam),
        to: undefined,
        changeType: 'removed'
      })
    } else if (originalParam && currentParam) {
      // Parameter modified
      const originalValue = getParameterValue(originalParam)
      const currentValue = getParameterValue(currentParam)
      
      if (JSON.stringify(originalValue) !== JSON.stringify(currentValue)) {
        changes.push({
          field: `parameter_${paramId}`,
          fieldLabel: currentParam.name || paramId,
          from: originalValue,
          to: currentValue,
          changeType: 'modified'
        })
      }
    }
  })
  
  return changes
}

// Helper to get parameter value for comparison
function getParameterValue(param) {
  if (!param) return undefined
  
  if (param.type === 'fixed') {
    return parseFloat(param.value) || 0
  } else if (param.type === 'form' && Array.isArray(param.lookupTable)) {
    return param.lookupTable.map(item => ({ option: item.option, value: parseFloat(item.value) || 0 }))
  } else if (param.type === 'currency') {
    return {
      rate: parseFloat(param.rate) || 1,
      enabled: param.enabled || false
    }
  }
  
  return param.value || param
}

export function getChangeReason(item, priceSettings, formConfig = null) {
  // Helper function to get field label from form config
  function getFieldLabel(fieldId) {
    if (formConfig && formConfig.formStructure && formConfig.formStructure.fields) {
      const field = formConfig.formStructure.fields.find(f => f.id === fieldId)
      if (field && field.label) {
        return field.label
      }
    }
    return fieldId // fallback to field ID if label not found
  }

  // Helper function to format parameter values
  function formatParameterValue(value, param) {
    if (value === undefined) return 'tanımsız'
    if (value === null) return 'boş'
    
    if (typeof value === 'number') {
      return value.toFixed(2)
    }
    
    if (Array.isArray(value)) {
      return value.map(v => {
        if (v && typeof v === 'object' && v.option !== undefined && v.value !== undefined) {
          return `${v.option}: ${v.value}`
        }
        return String(v)
      }).join(', ')
    }
    
    if (typeof value === 'object' && value !== null) {
      if (value.rate !== undefined) {
        return `${value.rate.toFixed(4)} (${value.enabled ? 'aktif' : 'pasif'})`
      }
      // For other objects, try to extract meaningful info
      if (value.option !== undefined && value.value !== undefined) {
        return `${value.option}: ${value.value}`
      }
      // Last resort: try to stringify safely
      try {
        const keys = Object.keys(value)
        if (keys.length === 0) return 'boş obje'
        return keys.map(k => `${k}: ${value[k]}`).join(', ')
      } catch (e) {
        return '[karmaşık obje]'
      }
    }
    
    return String(value)
  }

  // Prefer server-provided reasons when available
  if (Array.isArray(item.priceUpdateReasons) && item.priceUpdateReasons.length > 0) {
    return item.priceUpdateReasons.join('; ')
  }

  // Check if this is a form structure change
  if (item.formStructureChanged === true) {
    return 'User form güncellendi'
  }

  // Get all changes from original quote
  const allChanges = getChangesFromOriginal(item, priceSettings, formConfig)
  
  if (allChanges.length === 0) {
    // Fallback to recent changes
    const recentChanges = getChanges(item, priceSettings)
    if (recentChanges.length === 0) {
      // Last fallback - check for any form-related changes
      if (item.priceUpdateReason === "Form structure changed" || 
          item.previousFormVersion !== undefined) {
        return 'User form güncellendi'
      }
      return 'Fiyat güncelleme gerekli (sebep belirtilmemiş)'
    }
    
    // Use recent changes if no historical data
    return formatRecentChanges(recentChanges, getFieldLabel)
  }
  
  const reasons = []
  
  allChanges.forEach(change => {
    switch (change.type) {
      case 'form_field':
        switch (change.field) {
          case 'qty':
            reasons.push(`Adet değişti: ${change.from} → ${change.to}`)
            break
          case 'thickness':
            reasons.push(`Kalınlık değişti: ${change.from} → ${change.to}`)
            break
          case 'material':
            reasons.push(`Malzeme değişti: ${change.from} → ${change.to}`)
            break
          case 'process':
            const fromProcess = Array.isArray(change.from) ? change.from.join(', ') : change.from
            const toProcess = Array.isArray(change.to) ? change.to.join(', ') : change.to
            reasons.push(`İşlem türü değişti: ${fromProcess} → ${toProcess}`)
            break
          case 'finish':
            reasons.push(`Yüzey işlemi değişti: ${change.from} → ${change.to}`)
            break
          case 'dims':
            reasons.push(`Boyutlar değişti: ${change.from} → ${change.to}`)
            break
          default:
            const fieldLabel = getFieldLabel(change.field)
            if (change.from !== undefined && change.to !== undefined) {
              reasons.push(`${fieldLabel} değişti: ${change.from} → ${change.to}`)
            } else {
              reasons.push(`${fieldLabel} değişti`)
            }
        }
        break
        
      case 'custom_field':
        const fieldLabel = change.fieldLabel || getFieldLabel(change.field)
        if (change.from !== undefined && change.to !== undefined) {
          reasons.push(`${fieldLabel} değişti: ${change.from} → ${change.to}`)
        } else if (change.from === undefined) {
          reasons.push(`${fieldLabel} eklendi: ${change.to}`)
        } else if (change.to === undefined) {
          reasons.push(`${fieldLabel} kaldırıldı: ${change.from}`)
        }
        break
        
      case 'formula':
        if (change.from && change.to) {
          reasons.push(`Fiyat formülü değişti: ${change.from} → ${change.to}`)
        } else {
          reasons.push('Fiyat formülü güncellendi')
        }
        break
        
      case 'parameter':
        const paramLabel = change.fieldLabel || change.field
        if (change.changeType === 'added') {
          reasons.push(`Parametre eklendi '${paramLabel}': ${formatParameterValue(change.to)}`)
        } else if (change.changeType === 'removed') {
          reasons.push(`Parametre kaldırıldı '${paramLabel}': ${formatParameterValue(change.from)}`)
        } else if (change.changeType === 'modified') {
          reasons.push(`Parametre değişti '${paramLabel}': ${formatParameterValue(change.from)} → ${formatParameterValue(change.to)}`)
        }
        break
        
      case 'price':
        reasons.push(`Fiyat değişti: ${change.from.toFixed(2)} → ${change.to.toFixed(2)}`)
        break
        
      default:
        if (change.from !== undefined && change.to !== undefined) {
          reasons.push(`${change.field} değişti: ${change.from} → ${change.to}`)
        } else {
          reasons.push(`${change.field} değişti`)
        }
    }
  })
  
  return reasons.length > 0 ? reasons.join('; ') : 'Değişiklik tespit edilemedi'
}

// Helper function to format recent changes (fallback)
function formatRecentChanges(changes, getFieldLabel) {
  const reasons = []
  
  changes.forEach(change => {
    switch (change.field) {
      case 'qty':
        reasons.push(`Adet değişti: ${change.from} → ${change.to}`)
        break
      case 'thickness':
        reasons.push(`Kalınlık değişti: ${change.from} → ${change.to}`)
        break
      case 'material':
        reasons.push(`Malzeme değişti: ${change.from} → ${change.to}`)
        break
      case 'process':
        const fromProcess = Array.isArray(change.from) ? change.from.join(', ') : change.from
        const toProcess = Array.isArray(change.to) ? change.to.join(', ') : change.to
        reasons.push(`İşlem türü değişti: ${fromProcess} → ${toProcess}`)
        break
      case 'finish':
        reasons.push(`Yüzey işlemi değişti: ${change.from} → ${change.to}`)
        break
      case 'dims':
        reasons.push(`Boyutlar değişti: ${change.from} → ${change.to}`)
        break
      case 'formula':
        if (change.from && change.to) {
          reasons.push(`Fiyat formülü değişti: ${change.from} → ${change.to}`)
        } else {
          reasons.push('Fiyat formülü güncellendi')
        }
        break
      case 'parameters':
        const paramChanges = getParameterChanges(change.from, change.to)
        if (paramChanges.length > 0) {
          reasons.push(`Fiyat parametreleri değişti: ${paramChanges.join(', ')}`)
        } else {
          reasons.push('Fiyat parametreleri güncellendi')
        }
        break
      default:
        // For custom form fields, use their labels
        const fieldLabel = getFieldLabel(change.field)
        if (change.from !== undefined && change.to !== undefined) {
          reasons.push(`${fieldLabel} değişti: ${change.from} → ${change.to}`)
        } else {
          reasons.push(`${fieldLabel} değişti`)
        }
    }
  })
  
  return reasons.join('; ')
}

export async function applyNewPrice(item, API, showNotification) {
  try {
    const updatedQuote = await API.applyNewPrice(item.id)
    
    if (updatedQuote) {
      showNotification('Fiyat güncellendi!', 'success')
      return updatedQuote
    } else {
      showNotification('Fiyat güncellenirken hata oluştu', 'error')
      return null
    }
  } catch (error) {
    console.error('Price update error:', error)
    showNotification('Fiyat güncellenirken hata oluştu', 'error')
    return null
  }
}
