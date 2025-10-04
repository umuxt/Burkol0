// Price Update Manager - Event-based price update system
// Replaces the old reactive mass-update system

import PriceStatus from './PriceStatus.js'
import { calculatePriceServer } from '../priceCalculator.js'

class PriceUpdateManager {
  constructor(jsondb) {
    this.jsondb = jsondb
    this.currentSettingsVersion = null
    this.currentSettingsVersionId = null
    this.isInitialized = false
  }

  // Initialize manager with current settings
  async initialize() {
    try {
      const settings = this.jsondb.getPriceSettings()
      this.currentSettingsVersion = settings?.version || null
      this.currentSettingsVersionId = settings?.versionId || null
      this.isInitialized = true
      console.log('🔧 PriceUpdateManager initialized with settings version:', this.currentSettingsVersion)
    } catch (error) {
      console.error('❌ Failed to initialize PriceUpdateManager:', error)
      this.isInitialized = false
    }
  }

  // Called when price settings change
  onPriceSettingsChange(newSettings) {
    console.log('🔧 Price settings changed from version', this.currentSettingsVersion, 'to', newSettings.version)
    
    const oldVersion = this.currentSettingsVersion
    const oldVersionId = this.currentSettingsVersionId

    this.currentSettingsVersion = newSettings.version
    this.currentSettingsVersionId = newSettings.versionId || null

    // Mark all quotes as potentially outdated (lazy evaluation)
    this.markQuotesAsOutdated({
      oldVersion,
      oldVersionId,
      newVersion: newSettings.version,
      newVersionId: newSettings.versionId || null
    })
    
    return {
      oldVersion,
      oldVersionId,
      newVersion: newSettings.version,
      newVersionId: newSettings.versionId || null,
      message: 'Price settings updated. Quotes will be recalculated when viewed.'
    }
  }

  // Mark quotes as outdated without calculating
  markQuotesAsOutdated({ oldVersion = null, oldVersionId = null, newVersion = null, newVersionId = null } = {}) {
    try {
      console.log(`🔧 markQuotesAsOutdated called: ${oldVersion} (${oldVersionId || 'no-id'}) → ${newVersion} (${newVersionId || 'no-id'})`)
      const quotes = this.jsondb.listQuotes()
      console.log(`🔧 Found ${quotes.length} quotes to check`)
      let markedCount = 0

      quotes.forEach(quote => {
        console.log(`🔧 Checking quote ${quote.id}: currentVersion=${quote.priceStatus?.settingsVersion}, currentVersionId=${quote.priceStatus?.settingsVersionId}, targetOldVersion=${oldVersion}`)
        const currentStatus = PriceStatus.fromJSON(quote.priceStatus)
        
        // Only mark as outdated if it was using the old version
        const matchesOldVersion = (oldVersion !== null && currentStatus.settingsVersion === oldVersion) ||
          (oldVersionId && currentStatus.settingsVersionId && currentStatus.settingsVersionId === oldVersionId)

        if (matchesOldVersion) {
          console.log(`🔧 Marking quote ${quote.id} as outdated`)
          const updatedStatus = currentStatus
            .setVersionInfo({ settingsVersionId: oldVersionId })
            .markOutdated('Price settings updated')
          
          this.jsondb.patchQuote(quote.id, {
            priceStatus: updatedStatus.toJSON()
          })
          markedCount++
        } else {
          console.log(`🔧 Skipping quote ${quote.id}: version mismatch`)
        }
      })

      console.log(`🔧 Marked ${markedCount} quotes as outdated (version ${oldVersion} → ${newVersion})`)
      return markedCount
    } catch (error) {
      console.error('❌ Failed to mark quotes as outdated:', error)
      return 0
    }
  }

  // Calculate price for single quote (lazy loading)
  async calculateQuotePrice(quoteId, forceRecalculate = false) {
    try {
      console.log('🔧 Starting calculateQuotePrice for:', quoteId)
      
      const quote = this.jsondb.getQuote(quoteId)
      if (!quote) {
        throw new Error(`Quote ${quoteId} not found`)
      }
      console.log('🔧 Quote found:', quote.id)

      const currentStatus = PriceStatus.fromJSON(quote.priceStatus)
      console.log('🔧 Current status:', currentStatus.status)
      
      // Check if calculation is needed
      if (!forceRecalculate && !currentStatus.needsUpdate(this.currentSettingsVersion, this.currentSettingsVersionId)) {
        console.log(`🔧 Quote ${quoteId} price is current, skipping calculation`)
        return {
          success: true,
          price: currentStatus.calculatedPrice,
          status: currentStatus.toJSON(),
          cached: true
        }
      }

      // Mark as calculating
      const calculatingStatus = currentStatus.markCalculating()
      this.jsondb.patchQuote(quoteId, {
        priceStatus: calculatingStatus.toJSON()
      })
      console.log('🔧 Marked as calculating')

      // Get current price settings
      console.log('🔧 Getting price settings...')
      const priceSettings = this.jsondb.getPriceSettings()
      if (!priceSettings) {
        throw new Error('Price settings not found')
      }
      console.log('🔧 Price settings found:', priceSettings.version, priceSettings.versionId || '')

      // Calculate price using unified engine
      console.log('🔧 Starting unified calculation...')
      const calculation = await this.calculatePriceUnified(quote, priceSettings)
      console.log('🔧 Unified calculation result:', calculation.success)
      
      if (!calculation.success) {
        // Mark as error
        const errorStatus = currentStatus.markError(calculation.error)
        this.jsondb.patchQuote(quoteId, {
          priceStatus: errorStatus.toJSON()
        })
        
        return {
          success: false,
          error: calculation.error,
          status: errorStatus.toJSON()
        }
      }

      // Update with successful calculation
      const updatedStatus = currentStatus.updateCalculation(
        calculation.price,
        priceSettings.version,
        calculation.breakdown,
        {
          settingsVersionId: priceSettings.versionId || null,
          formVersionId: quote.formVersion?.versionId || currentStatus.formVersionId || null
        }
      )

      this.jsondb.patchQuote(quoteId, {
        priceStatus: updatedStatus.toJSON()
      })

      console.log(`🔧 Quote ${quoteId} price calculated: ${calculation.price}`)
      
      return {
        success: true,
        price: calculation.price,
        breakdown: calculation.breakdown,
        status: updatedStatus.toJSON(),
        cached: false
      }

    } catch (error) {
      console.error(`❌ Failed to calculate price for quote ${quoteId}:`, error)
      
      // Mark as error in database
      try {
        const quote = this.jsondb.getQuote(quoteId)
        if (quote) {
          const currentStatus = PriceStatus.fromJSON(quote.priceStatus)
          const errorStatus = currentStatus.markError(error.message)
          this.jsondb.patchQuote(quoteId, {
            priceStatus: errorStatus.toJSON()
          })
        }
      } catch (dbError) {
        console.error('❌ Failed to update error status in database:', dbError)
      }

      return {
        success: false,
        error: error.message,
        status: PriceStatus.createOutdated().markError(error.message).toJSON()
      }
    }
  }

  // Apply calculated price to quote
  async applyQuotePrice(quoteId) {
    try {
      const quote = this.jsondb.getQuote(quoteId)
      if (!quote) {
        throw new Error(`Quote ${quoteId} not found`)
      }

      const currentStatus = PriceStatus.fromJSON(quote.priceStatus)
      
      if (!currentStatus.hasPendingUpdate()) {
        return {
          success: false,
          error: 'No pending price update to apply'
        }
      }

      // Apply the calculated price
      const appliedStatus = currentStatus.applyPrice()
      
      // Update quote with applied price and new status
      this.jsondb.patchQuote(quoteId, {
        price: appliedStatus.appliedPrice,
        priceStatus: appliedStatus.toJSON(),
        priceUpdatedAt: new Date().toISOString()
      })

      console.log(`🔧 Quote ${quoteId} price applied: ${appliedStatus.appliedPrice}`)
      
      return {
        success: true,
        appliedPrice: appliedStatus.appliedPrice,
        status: appliedStatus.toJSON()
      }

    } catch (error) {
      console.error(`❌ Failed to apply price for quote ${quoteId}:`, error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Batch calculate multiple quotes
  async batchCalculateQuotes(quoteIds, forceRecalculate = false) {
    const results = []
    
    for (const quoteId of quoteIds) {
      const result = await this.calculateQuotePrice(quoteId, forceRecalculate)
      results.push({
        quoteId,
        ...result
      })
    }

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    
    console.log(`🔧 Batch calculation completed: ${successful} successful, ${failed} failed`)
    
    return {
      results,
      summary: {
        total: quoteIds.length,
        successful,
        failed
      }
    }
  }

  // Batch apply prices for multiple quotes
  async batchApplyPrices(quoteIds) {
    const results = []
    
    for (const quoteId of quoteIds) {
      const result = await this.applyQuotePrice(quoteId)
      results.push({
        quoteId,
        ...result
      })
    }

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    
    console.log(`🔧 Batch apply completed: ${successful} successful, ${failed} failed`)
    
    return {
      results,
      summary: {
        total: quoteIds.length,
        successful,
        failed
      }
    }
  }

  // Unified calculation engine (server-only)
  async calculatePriceUnified(quote, priceSettings) {
    try {
      console.log('🔧 Starting unified calculation for quote:', quote.id)
      console.log('🔧 Price settings version:', priceSettings.version)
      
      const price = calculatePriceServer(quote, priceSettings)
      console.log('🔧 Calculated price:', price)
      
      if (typeof price !== 'number' || isNaN(price)) {
        throw new Error('Invalid price calculation result')
      }

      // Create detailed breakdown
      const breakdown = this.createCalculationBreakdown(quote, priceSettings, price)
      
      return {
        success: true,
        price: parseFloat(price.toFixed(2)),
        breakdown
      }

    } catch (error) {
      console.error('❌ Unified price calculation failed:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Create calculation breakdown
  createCalculationBreakdown(quote, priceSettings, finalPrice) {
    return {
      finalPrice: parseFloat(finalPrice) || 0,
      formula: priceSettings.formula || '',
      settingsVersion: priceSettings.version,
      calculatedAt: new Date().toISOString(),
      parameters: this.extractUsedParameters(quote, priceSettings)
    }
  }

  // Extract parameters used in calculation
  extractUsedParameters(quote, priceSettings) {
    const usedParams = {}
    
    try {
      if (priceSettings.parameters) {
        priceSettings.parameters.forEach(param => {
          if (param.type === 'fixed') {
            usedParams[param.id] = {
              name: param.name,
              value: parseFloat(param.value) || 0,
              type: 'fixed'
            }
          } else if (param.type === 'form') {
            const fieldValue = quote.customFields?.[param.formField] || quote[param.formField]
            usedParams[param.id] = {
              name: param.name,
              value: parseFloat(fieldValue) || 0,
              type: 'form',
              formField: param.formField
            }
          }
        })
      }
    } catch (error) {
      console.error('❌ Failed to extract parameters:', error)
    }

    return usedParams
  }

  // Get status summary for all quotes
  getStatusSummary() {
    try {
      const quotes = this.jsondb.listQuotes()
      const summary = {
        total: quotes.length,
        current: 0,
        outdated: 0,
        calculating: 0,
        error: 0,
        unknown: 0,
        pendingUpdates: 0
      }

      quotes.forEach(quote => {
        const status = PriceStatus.fromJSON(quote.priceStatus)
        summary[status.status]++
        if (status.hasPendingUpdate()) {
          summary.pendingUpdates++
        }
      })

      return summary
    } catch (error) {
      console.error('❌ Failed to get status summary:', error)
      return null
    }
  }

  // Calculate change reasons for a quote
  async calculateChangeReasons(quoteId) {
    try {
      const quote = this.jsondb.getQuote(quoteId)
      if (!quote) {
        throw new Error(`Quote ${quoteId} not found`)
      }

      const currentStatus = PriceStatus.fromJSON(quote.priceStatus)
      const currentSettings = this.jsondb.getPriceSettings()
      
      if (!currentSettings) {
        throw new Error('Price settings not found')
      }

      // Get current calculated price
      const currentCalculation = await this.calculateQuotePrice(quoteId, false)
      if (!currentCalculation.success) {
        return {
          success: false,
          error: currentCalculation.error
        }
      }

      // Get last applied price information  
      const lastAppliedPrice = parseFloat(currentStatus.appliedPrice) || parseFloat(quote.price) || 0
      const newPrice = currentCalculation.price
      const priceChange = newPrice - lastAppliedPrice

      // Find last price history entry
      const lastPriceHistory = quote.priceHistory?.[quote.priceHistory.length - 1]
      const oldSettings = lastPriceHistory?.priceSettings || {}

      const reasons = []
      const parameterChanges = []

      // Check formula change
      if (currentSettings.formula !== oldSettings.formula) {
        reasons.push('Formül güncellendi')
      }

      // Check parameter changes
      const oldParams = oldSettings.parameters || []
      const newParams = currentSettings.parameters || []

      newParams.forEach(newParam => {
        const oldParam = oldParams.find(p => p.id === newParam.id)
        
        if (!oldParam) {
          if (newParam.type === 'fixed') {
            parameterChanges.push(`Yeni parametre eklendi: ${newParam.name} = ${newParam.value}`)
          }
        } else if (newParam.type === 'fixed' && oldParam.type === 'fixed') {
          const oldValue = parseFloat(oldParam.value) || 0
          const newValue = parseFloat(newParam.value) || 0
          
          if (oldValue !== newValue) {
            parameterChanges.push(`${newParam.name}: ${oldValue} → ${newValue}`)
          }
        }
      })

      // Check for removed parameters
      oldParams.forEach(oldParam => {
        const newParam = newParams.find(p => p.id === oldParam.id)
        if (!newParam && oldParam.type === 'fixed') {
          parameterChanges.push(`Parametre kaldırıldı: ${oldParam.name}`)
        }
      })

      return {
        success: true,
        data: {
          priceChange: {
            old: lastAppliedPrice,
            new: newPrice,
            difference: priceChange,
            percentage: lastAppliedPrice > 0 ? (priceChange / lastAppliedPrice) * 100 : 0
          },
          reasons,
          parameterChanges,
          settingsVersionChange: {
            old: oldSettings.version || 0,
            new: currentSettings.version
          },
          lastUpdate: currentStatus.lastCalculated,
          hasSignificantChange: Math.abs(priceChange) > 0.01, // 1 kuruş üzeri değişiklik
          changeIntensity: this.calculateChangeIntensity(priceChange, lastAppliedPrice, reasons.length + parameterChanges.length)
        }
      }

    } catch (error) {
      console.error(`❌ Failed to calculate change reasons for quote ${quoteId}:`, error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Calculate change intensity for UI color coding
  calculateChangeIntensity(priceChange, originalPrice, changeCount) {
    const absChange = Math.abs(priceChange)
    
    // No price change - even if parameters changed
    if (absChange < 0.01) {
      if (changeCount > 0) {
        return {
          level: 'parameters-only',
          color: '#ffc107', // Yellow - parameters changed but price stayed same
          description: 'Parametreler değişti, fiyat aynı kaldı'
        }
      } else {
        return {
          level: 'none',
          color: '#28a745', // Green - no changes at all
          description: 'Değişiklik yok'
        }
      }
    }
    
    // Price changed - always red regardless of amount
    return {
      level: 'price-changed',
      color: '#dc3545', // Red - price changed
      description: 'Fiyat değişti'
    }
  }
}

export default PriceUpdateManager
