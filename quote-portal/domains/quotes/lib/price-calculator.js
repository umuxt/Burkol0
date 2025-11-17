// Quotes Price Calculator - Price calculation and update logic for quotes
import API from '../../../shared/lib/api.js'

export function calculatePrice(quote, priceSettings) {
  return API.calculatePriceLocal(quote, priceSettings)
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

  if (!quote || !priceSettings) return null

  if (quote.priceChangeType) return quote.priceChangeType

  try {
    const currentPrice = parseFloat(quote.calculatedPrice) || 0
    const newPrice = calculatePrice(quote, priceSettings)
    return Math.abs(currentPrice - newPrice) > 0.01 ? 'price-changed' : null
  } catch (e) {
    console.error('❌ Local price calculation failed:', e)
    return null
  }
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
