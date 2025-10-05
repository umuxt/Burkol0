/**
 * Architecture API - Price Status Management
 * Handles price status display, actions, and business logic
 */

/**
 * Get display information for price status
 */
function getStatusDisplayInfo(priceStatus) {
  if (!priceStatus || typeof priceStatus !== 'object') {
    return null
  }

  const status = priceStatus.status
  
  switch (status) {
    case 'current':
      return {
        label: 'Güncel',
        icon: '✅',
        variant: 'current',
        action: null // No action needed for current prices
      }
      
    case 'outdated':
      return {
        label: 'Eski Sürüm',
        icon: '⏰',
        variant: 'outdated',
        action: async (quoteId) => {
          // Action to update price to current version
          const response = await fetch(`/api/quotes/${quoteId}/update-price`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update-to-current' })
          })
          if (!response.ok) {
            throw new Error('Fiyat güncelleme başarısız')
          }
        }
      }
      
    case 'drift':
      return {
        label: 'Değişiklik Var',
        icon: '⚠️',
        variant: 'drift',
        action: async (quoteId) => {
          // Action to recalculate and apply new price
          const response = await fetch(`/api/quotes/${quoteId}/recalculate-price`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'recalculate' })
          })
          if (!response.ok) {
            throw new Error('Fiyat yeniden hesaplama başarısız')
          }
        }
      }
      
    case 'pending':
      return {
        label: 'Beklemede',
        icon: '⏳',
        variant: 'pending',
        action: async (quoteId) => {
          // Action to apply pending calculation
          const response = await fetch(`/api/quotes/${quoteId}/apply-price`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'apply-pending' })
          })
          if (!response.ok) {
            throw new Error('Bekleyen fiyat uygulama başarısız')
          }
        }
      }
      
    case 'manual-override':
      return {
        label: 'Manuel',
        icon: '🔒',
        variant: 'manual',
        action: null // Manual overrides don't have automated actions
      }
      
    case 'error':
      return {
        label: 'Hata',
        icon: '❌',
        variant: 'error',
        action: async (quoteId) => {
          // Action to retry price calculation
          const response = await fetch(`/api/quotes/${quoteId}/recalculate-price`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'retry' })
          })
          if (!response.ok) {
            throw new Error('Fiyat hesaplama yeniden deneme başarısız')
          }
        }
      }
      
    default:
      return {
        label: 'Bilinmeyen',
        icon: '❓',
        variant: 'error',
        action: null
      }
  }
}

/**
 * Calculate price status for a quote
 */
function calculatePriceStatus(quote, currentPriceSettings, currentFormConfig) {
  if (!quote) {
    return { status: 'error', message: 'Quote not found' }
  }

  // Check for manual override first
  if (quote.manualOverride?.active) {
    return {
      status: 'manual-override',
      message: 'Manual price override active',
      setBy: quote.manualOverride.setBy,
      setAt: quote.manualOverride.setAt
    }
  }

  // Check if quote has price status
  if (!quote.priceStatus) {
    return { status: 'pending', message: 'Price calculation needed' }
  }

  const quoteStatus = quote.priceStatus
  
  // Check version compatibility
  if (currentPriceSettings?.version && quoteStatus.settingsVersion !== currentPriceSettings.version) {
    return { status: 'outdated', message: 'Price settings updated' }
  }

  if (currentFormConfig?.version && quoteStatus.formVersion !== currentFormConfig.version) {
    return { status: 'drift', message: 'Form configuration updated' }
  }

  // Check for calculation errors
  if (quoteStatus.error) {
    return { status: 'error', message: quoteStatus.error }
  }

  // Default to current if no issues found
  return { status: 'current', message: 'Price is up to date' }
}

/**
 * Batch update quotes based on their price status
 */
async function batchUpdateQuotes(quoteIds, action = 'update-to-current') {
  const results = []
  
  for (const quoteId of quoteIds) {
    try {
      const response = await fetch(`/api/quotes/${quoteId}/update-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })
      
      if (response.ok) {
        results.push({ quoteId, status: 'success' })
      } else {
        const error = await response.text()
        results.push({ quoteId, status: 'error', error })
      }
    } catch (error) {
      results.push({ quoteId, status: 'error', error: error.message })
    }
  }
  
  return results
}

/**
 * Get statistics for price statuses across quotes
 */
function getPriceStatusStatistics(quotes) {
  if (!quotes || quotes.length === 0) {
    return {}
  }

  return quotes.reduce((stats, quote) => {
    let status = 'unknown'
    
    if (quote.manualOverride?.active) {
      status = 'manual'
    } else if (quote.priceStatus?.status) {
      status = quote.priceStatus.status
    }
    
    stats[status] = (stats[status] || 0) + 1
    return stats
  }, {})
}

/**
 * Format price status for display
 */
function formatPriceStatus(priceStatus) {
  const statusInfo = getStatusDisplayInfo(priceStatus)
  if (!statusInfo) {
    return 'Bilinmeyen durumda'
  }
  
  return `${statusInfo.icon} ${statusInfo.label}`
}

/**
 * Check if a quote needs price update
 */
function needsPriceUpdate(quote, currentPriceSettings, currentFormConfig) {
  const status = calculatePriceStatus(quote, currentPriceSettings, currentFormConfig)
  return ['outdated', 'drift', 'pending', 'error'].includes(status.status)
}

// Export the architecture API
export const architectureAPI = {
  getStatusDisplayInfo,
  calculatePriceStatus,
  batchUpdateQuotes,
  getPriceStatusStatistics,
  formatPriceStatus,
  needsPriceUpdate
}

// Default export
export default architectureAPI