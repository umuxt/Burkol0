// Admin Price Calculator - Price calculation and update logic

export function calculatePrice(quote, priceSettings) {
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
          // For fields with lookup table or arrays
          const fieldValue = quote[param.formField]
          
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

    // Safely evaluate formula
    // Replace parameter IDs with their values
    let formula = priceSettings.formula
    
    // Sort parameters by ID length (descending) to avoid partial replacements
    const sortedParams = Object.keys(paramValues).sort((a, b) => b.length - a.length)
    
    sortedParams.forEach(paramId => {
      const regex = new RegExp('\\b' + paramId + '\\b', 'g')
      formula = formula.replace(regex, paramValues[paramId])
    })

    // Validate formula contains only numbers and basic operators
    if (!/^[\d\s+\-*/().]+$/.test(formula)) {
      console.warn('Invalid formula characters detected:', formula)
      return quote.calculatedPrice || quote.price || 0
    }

    // Evaluate the formula
    const result = Function('"use strict"; return (' + formula + ')')()
    
    return isNaN(result) ? 0 : Math.max(0, result) // Ensure non-negative
    
  } catch (e) {
    console.error('Price calculation error:', e)
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

export function getPriceChangeType(quote, priceSettings) {
  try {
    const currentPrice = quote.price || 0
    const calculatedPrice = calculatePrice(quote, priceSettings)
    const priceDifference = Math.abs(calculatedPrice - currentPrice)
    
    // First check if price actually changed (most important)
    if (priceDifference > 0.01) {
      return 'price-changed' // Price actually changed - show red
    }
    
    // If price is same but server indicates formula/settings changed
    if (quote.needsPriceUpdate === true) {
      return 'formula-changed' // Formula/params changed but price stayed same - show yellow
    }
    
    // Also check if calculated differs from stored calculatedPrice (server-side calculation)
    if (quote.calculatedPrice !== undefined && Math.abs(calculatedPrice - quote.calculatedPrice) > 0.01) {
      return 'formula-changed' // Server calculation differs from client calculation
    }
    
    return 'no-change' // No changes - no button
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

export function getChangeReason(item, priceSettings) {
  // Prefer server-provided reasons when available
  if (Array.isArray(item.priceUpdateReasons) && item.priceUpdateReasons.length > 0) {
    return item.priceUpdateReasons.join('; ')
  }
  const changes = getChanges(item, priceSettings)
  
  if (changes.length === 0) {
    return 'Fiyat güncelleme gerekli (sebep belirtilmemiş)'
  }
  
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
        reasons.push('Fiyat formülü güncellendi')
        break
      case 'parameters':
        reasons.push('Fiyat parametreleri güncellendi')
        break
      default:
        reasons.push(`${change.field} değişti`)
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
