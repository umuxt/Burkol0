// Price calculation and update logic for quotes
// F1: Local calculation deprecated - all calculations now done via backend API
// F1: calculatePrice function kept for UI fallback only

/**
 * @deprecated F1: Use priceApi.calculatePrice() for actual calculations
 * This function now only returns the quote's existing price as fallback
 */
export function calculatePrice(quote, priceSettings) {
  // F1: Return existing price - actual calculation should be done via backend
  console.warn('⚠️ F1: calculatePrice() is deprecated. Use priceApi.calculatePrice() for actual calculations.')
  return parseFloat(quote?.calculatedPrice || quote?.finalPrice || quote?.price) || 0
}

export function needsPriceUpdate(quote) {
  const status = quote?.priceStatus?.status
  if (status) {
    return ['price-drift', 'content-drift', 'outdated', 'unknown', 'error'].includes(status)
  }

  if (quote?.needsPriceUpdate === true) return true

  if (quote?.pendingCalculatedPrice !== undefined) {
    const current = parseFloat(quote.calculatedPrice) || 0
    const pending = parseFloat(quote.pendingCalculatedPrice) || 0
    return Math.abs(current - pending) > 0.01
  }

  return false
}

export function getPriceChangeType(quote, priceSettings) {
  const status = quote?.priceStatus?.status
  const diff = quote?.priceStatus?.differenceSummary
  const priceDiff = diff && typeof diff.priceDiff === 'number' ? Math.abs(diff.priceDiff) : 0

  if (status === 'price-drift') return 'price-changed'
  if (status === 'content-drift') {
    return priceDiff > 0.01 ? 'price-changed' : 'formula-changed'
  }
  if (['outdated', 'unknown', 'error'].includes(status)) return 'formula-changed'

  if (!quote) return null

  if (quote.priceChangeType) return quote.priceChangeType

  // F1: Local calculation removed - rely on priceStatus from backend
  // If there's a pending calculated price, compare it
  if (quote.pendingCalculatedPrice !== undefined) {
    const currentPrice = parseFloat(quote.calculatedPrice) || 0
    const pendingPrice = parseFloat(quote.pendingCalculatedPrice) || 0
    return Math.abs(currentPrice - pendingPrice) > 0.01 ? 'price-changed' : null
  }

  return null
}

export function getChanges(quote) {
  const diff = quote?.priceStatus?.differenceSummary
  if (diff?.reasons && diff.reasons.length) return diff.reasons
  if (Array.isArray(quote?.changes)) return quote.changes
  return []
}

export function getChangeReason(quote) {
  const diff = quote?.priceStatus?.differenceSummary
  if (diff?.reasons && diff.reasons.length) return diff.reasons.join('; ')
  if (quote?.changeReason) return quote.changeReason
  return ''
}

export function applyNewPrice(quote, newPrice) {
  return {
    ...quote,
    calculatedPrice: newPrice,
    pendingCalculatedPrice: undefined,
    needsPriceUpdate: false,
    priceStatus: {
      ...(quote.priceStatus || {}),
      status: 'current',
      differenceSummary: null
    }
  }
}

export function getChangesFromOriginal(quote) {
  const diff = quote?.priceStatus?.differenceSummary
  if (diff?.reasons && diff.reasons.length) return diff.reasons
  if (Array.isArray(quote?.changesFromOriginal)) return quote.changesFromOriginal
  return []
}
