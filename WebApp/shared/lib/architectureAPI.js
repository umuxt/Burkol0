/**
 * Architecture API - Price Status Management
 * Handles price status display, actions, and business logic
 * 
 * F1: Removed dead endpoint references - actions now handled by components directly
 */

/**
 * Get display information for price status
 * F1: Removed action functions that called non-existent endpoints
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
        action: null
      }
      
    case 'outdated':
      return {
        label: 'Eski Sürüm',
        icon: '⏰',
        variant: 'outdated',
        action: null // F1: Action handled by QuoteDetailsPanel
      }
      
    case 'drift':
      return {
        label: 'Değişiklik Var',
        icon: '⚠️',
        variant: 'drift',
        action: null // F1: Action handled by QuoteDetailsPanel
      }
      
    case 'pending':
      return {
        label: 'Beklemede',
        icon: '⏳',
        variant: 'pending',
        action: null // F1: Action handled by QuoteDetailsPanel
      }
      
    case 'manual-override':
      return {
        label: 'Manuel',
        icon: '🔒',
        variant: 'manual',
        action: null
      }
      
    case 'error':
      return {
        label: 'Hata',
        icon: '❌',
        variant: 'error',
        action: null // F1: Action handled by QuoteDetailsPanel
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

// F1: batchUpdateQuotes removed - endpoint never existed

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
// F1: batchUpdateQuotes removed
export const architectureAPI = {
  getStatusDisplayInfo,
  calculatePriceStatus,
  getPriceStatusStatistics,
  formatPriceStatus,
  needsPriceUpdate
}

// Default export
export default architectureAPI