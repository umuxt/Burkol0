// Architecture API client for the PriceStatus and PriceUpdateManager stack
// Centralizes admin-side calls for price status inspection and recovery flows

import { fetchWithTimeout } from './api.js'

class ArchitectureAPI {
  constructor() {
    this.baseUrl = '/api'
  }

  // Get authorization header
  getAuthHeaders() {
    const token = localStorage.getItem('bk_admin_token')
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : ''
    }
  }

  // Create quote with new architecture
  async createQuoteWithStatus(quoteData) {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/quotes/create-with-status`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(quoteData)
      })

      if (!response.ok) {
        throw new Error(`Failed to create quote: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('🏗️ Architecture API: Create quote error:', error)
      throw error
    }
  }

  // Trigger price settings change event
  async triggerPriceSettingsChange() {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/price-settings/changed`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      })

      if (!response.ok) {
        throw new Error(`Failed to trigger price settings change: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('🏗️ Architecture API: Price settings change error:', error)
      throw error
    }
  }

  // Get price status for a quote
  async getPriceStatus(quoteId) {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/quotes/${quoteId}/price-status`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      })

      if (!response.ok) {
        throw new Error(`Failed to get price status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('🏗️ Architecture API: Get price status error:', error)
      throw error
    }
  }

  // Get detailed price change reasons for a quote
  async getPriceChangeReasons(quoteId) {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/quotes/${quoteId}/price-change-reasons`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      })

      if (!response.ok) {
        throw new Error(`Failed to get price change reasons: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('🏗️ Architecture API: Price change reasons error:', error)
      throw error
    }
  }

  // Calculate price for a quote using new architecture
  async calculateQuotePrice(quoteId) {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/quotes/${quoteId}/price-comparison`, {
        method: 'GET',
        headers: this.getAuthHeaders()
      })

      if (!response.ok) {
        throw new Error(`Failed to calculate price: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('🏗️ Architecture API: Calculate price error:', error)
      throw error
    }
  }

  // Apply calculated price to a quote using new architecture
  async applyQuotePrice(quoteId) {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/quotes/${quoteId}/apply-current-price`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      })

      if (!response.ok) {
        throw new Error(`Failed to apply price: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('🏗️ Architecture API: Apply price error:', error)
      throw error
    }
  }

  // Batch calculate multiple quotes
  async batchCalculateQuotes(quoteIds) {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl}/quotes/batch-calculate`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify({ quoteIds })
      })

      if (!response.ok) {
        throw new Error(`Failed to batch calculate: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('🏗️ Architecture API: Batch calculate error:', error)
      throw error
    }
  }

  // Get price status summary for multiple quotes
  async getQuotePriceStatuses(quoteIds) {
    try {
      const promises = quoteIds.map(id => this.getPriceStatus(id))
      const results = await Promise.allSettled(promises)
      
      return results.map((result, index) => ({
        quoteId: quoteIds[index],
        status: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason.message : null
      }))
    } catch (error) {
      console.error('🏗️ Architecture API: Get price statuses error:', error)
      throw error
    }
  }

  // Check if quote needs price update using new architecture
  async needsPriceUpdate(quote) {
    try {
      if (quote.priceStatus) {
        // Quote has new architecture status
        const status = quote.priceStatus.status
        return ['outdated', 'unknown', 'price-drift', 'content-drift', 'error'].includes(status)
      } else {
        // Legacy quote - check using old flags
        return quote.needsPriceUpdate === true
      }
    } catch (error) {
      console.error('🏗️ Architecture API: Needs price update check error:', error)
      return false
    }
  }

  // Get display-friendly status information with change reasons
  getStatusDisplayInfo(quote) {
    try {
      if (quote.priceStatus) {
        const status = quote.priceStatus.status || 'unknown'
        const displayMapping = this.getStatusDisplayMapping()[status] || this.getStatusDisplayMapping().unknown

        const diffSource = quote.priceStatus.differenceSummary
          || quote.pendingPriceVersion?.differenceSummary
          || quote.pendingPriceVersion
          || quote.pendingFormVersion
          || {}

        const priceChange = typeof diffSource.priceDiff === 'number' && !Number.isNaN(diffSource.priceDiff) && (diffSource.oldPrice !== undefined || diffSource.newPrice !== undefined)
          ? {
              difference: diffSource.priceDiff,
              old: diffSource.oldPrice ?? quote.price ?? quote.priceStatus.appliedPrice ?? 0,
              new: diffSource.newPrice ?? quote.priceStatus.calculatedPrice ?? quote.price ?? 0
            }
          : null

        const parameterChanges = () => {
          const list = []
          const changes = diffSource.parameterChanges || {}

          const formatValue = (value) => {
            if (value === null || value === undefined || value === '') return '—'
            return typeof value === 'number' ? value : String(value)
          }

          if (Array.isArray(changes.added)) {
            changes.added.forEach(change => {
              const label = change?.name || change?.id || 'Parametre'
              const val = formatValue(change?.newValue)
              list.push(`Yeni parametre: ${label}${val !== '—' ? ` = ${val}` : ''}`)
            })
          }
          if (Array.isArray(changes.removed)) {
            changes.removed.forEach(change => {
              const label = change?.name || change?.id || 'Parametre'
              const val = formatValue(change?.oldValue)
              list.push(`Parametre kaldırıldı: ${label}${val !== '—' ? ` (eski: ${val})` : ''}`)
            })
          }
          if (Array.isArray(changes.modified)) {
            changes.modified.forEach(change => {
              const label = change?.name || change?.id || 'Parametre'
              const oldVal = formatValue(change?.oldValue)
              const newVal = formatValue(change?.newValue)
              list.push(`${label}: ${oldVal} → ${newVal}`)
            })
          }
          return list
        }

        const settingsVersionChange = diffSource.nextVersion !== undefined ? {
          previous: diffSource.previousVersion ?? quote.priceStatus.settingsVersion,
          next: diffSource.nextVersion,
          baseline: diffSource.comparisonBaseline || 'applied'
        } : null

        const action = this.getRecommendedAction(status, quote.priceStatus)
        const hasUpdate = action !== null

        const priceDiffValue = priceChange ? priceChange.difference : 0
        let statusColor = displayMapping.color
        if (status === 'content-drift' && Math.abs(priceDiffValue) <= 0.01) {
          statusColor = '#ffc107'
        }

        return {
          label: displayMapping.label,
          color: statusColor,
          icon: displayMapping.icon,
          action,
          hasUpdate,
          calculatedPrice: quote.priceStatus.calculatedPrice,
          lastCalculated: quote.priceStatus.lastCalculated,
          lastUpdated: quote.priceStatus.lastApplied || quote.priceStatus.lastUpdated,
          changeDetails: {
            reasons: Array.isArray(diffSource.reasons) ? diffSource.reasons : [],
            parameterChanges: parameterChanges(),
            priceChange,
            settingsVersionChange,
            comparisonBaseline: diffSource.comparisonBaseline || 'applied',
            differenceSummary: diffSource
          }
        }
      } else {
        // Legacy system
        if (quote.needsPriceUpdate) {
        return {
            label: 'Güncelleme Gerekli',
            color: '#ff6b35',
            icon: '⚠️',
            action: 'update',
            hasUpdate: true,
            calculatedPrice: quote.pendingCalculatedPrice,
            lastCalculated: null,
            lastUpdated: quote.priceUpdatedAt,
            changeDetails: null
          }
        } else {
          return {
            label: 'Güncel',
            color: '#28a745',
            icon: '✅',
            action: null,
            hasUpdate: false,
            calculatedPrice: quote.price,
            lastCalculated: null,
            lastUpdated: quote.priceUpdatedAt,
            changeDetails: null
          }
        }
      }
    } catch (error) {
      console.error('🏗️ Architecture API: Get status display info error:', error)
      return {
        label: 'Hata',
        color: '#dc3545',
        icon: '❌',
        action: null,
        hasUpdate: false,
        changeDetails: null
      }
    }
  }

  getRecommendedAction(status, priceStatus = {}) {
    switch (status) {
      case 'price-drift':
        return 'apply'
      case 'content-drift':
        return 'apply'
      case 'outdated':
      case 'unknown':
      case 'error':
        return 'calculate'
      case 'calculating':
      case 'current':
        return null
      default:
        return null
    }
  }

  // Status display mapping
  getStatusDisplayMapping() {
    return {
      'unknown': {
        label: 'Bilinmiyor',
        color: '#6c757d',
        icon: '❓',
        action: 'calculate'
      },
      'outdated': {
        label: 'Güncelleme Gerekli',
        color: '#ff6b35',
        icon: '⚠️',
        action: 'calculate'
      },
      'price-drift': {
        label: 'Fiyat Değişti',
        color: '#dc3545',
        icon: '📉',
        action: 'apply'
      },
      'content-drift': {
        label: 'İçerik Güncellendi',
        color: '#ffc107',
        icon: '🔄',
        action: 'apply'
      },
      'current': {
        label: 'Güncel',
        color: '#28a745',
        icon: '✅',
        action: null
      },
      'calculating': {
        label: 'Hesaplanıyor',
        color: '#17a2b8',
        icon: '⏳',
        action: null
      },
      'error': {
        label: 'Hata',
        color: '#ff4d4f',
        icon: '❌',
        action: 'calculate'
      }
    }
  }
}

// Create singleton instance
const architectureAPI = new ArchitectureAPI()

export default architectureAPI
