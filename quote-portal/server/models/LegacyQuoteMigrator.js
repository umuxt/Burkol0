// Legacy Quote Migration Utility - Phase C
// Converts quotes from old price flag system to new PriceStatus architecture

import PriceStatus from '../models/PriceStatus.js'

class LegacyQuoteMigrator {
  constructor(jsondb) {
    this.jsondb = jsondb
    this.migrationStats = {
      total: 0,
      migrated: 0,
      skipped: 0,
      errors: 0,
      startTime: null,
      endTime: null
    }
  }

  // Check if a quote needs migration
  needsMigration(quote) {
    // Quote needs migration if it has legacy flags but no priceStatus
    const hasLegacyFlags = (
      quote.needsPriceUpdate !== undefined ||
      quote.pendingCalculatedPrice !== undefined ||
      quote.priceUpdateReasons !== undefined ||
      quote.formStructureChanged !== undefined
    )
    
    const hasNewArchitecture = quote.priceStatus !== undefined
    
    return hasLegacyFlags && !hasNewArchitecture
  }

  // Migrate a single quote from legacy to new architecture
  migrateQuote(quote) {
    try {
      console.log(`🔄 Migrating quote ${quote.id} from legacy system`)
      
      // Create new PriceStatus based on legacy flags
      let priceStatus
      
      if (quote.needsPriceUpdate === true) {
        // Quote was marked for update in legacy system
        priceStatus = new PriceStatus({
          status: 'outdated',
          settingsVersion: quote.lastPriceSettingsVersionUsed || null,
          calculatedPrice: quote.pendingCalculatedPrice || null,
          appliedPrice: quote.price || null,
          lastCalculated: quote.priceUpdatedAt ? new Date(quote.priceUpdatedAt) : null,
          lastUpdated: quote.priceUpdatedAt ? new Date(quote.priceUpdatedAt) : null,
          updateReasons: quote.priceUpdateReasons || []
        })
        
        // If there's a pending calculated price, mark as calculated
        if (quote.pendingCalculatedPrice !== undefined) {
          priceStatus.updateCalculation(
            quote.pendingCalculatedPrice,
            quote.pendingCalculatedPrice
          )
        }
      } else {
        // Quote was current in legacy system
        priceStatus = new PriceStatus({
          status: 'current',
          settingsVersion: quote.lastPriceSettingsVersionUsed || null,
          calculatedPrice: quote.calculatedPrice || quote.price || null,
          appliedPrice: quote.price || null,
          lastCalculated: quote.priceUpdatedAt ? new Date(quote.priceUpdatedAt) : new Date(),
          lastUpdated: quote.priceUpdatedAt ? new Date(quote.priceUpdatedAt) : new Date(),
          updateReasons: []
        })
      }

      // Update quote with new architecture
      const migratedQuote = {
        ...quote,
        priceStatus: priceStatus.toJSON(),
        // Mark legacy fields for cleanup (don't delete yet for safety)
        _legacyMigrated: true,
        _migrationDate: new Date().toISOString(),
        // Keep legacy flags but mark them as migrated
        _legacy_needsPriceUpdate: quote.needsPriceUpdate,
        _legacy_pendingCalculatedPrice: quote.pendingCalculatedPrice,
        _legacy_priceUpdateReasons: quote.priceUpdateReasons,
        _legacy_formStructureChanged: quote.formStructureChanged
      }

      console.log(`✅ Quote ${quote.id} migrated successfully:`, {
        oldStatus: quote.needsPriceUpdate ? 'needs-update' : 'current',
        newStatus: priceStatus.status,
        hasCalculatedPrice: !!quote.pendingCalculatedPrice
      })

      return migratedQuote
    } catch (error) {
      console.error(`❌ Failed to migrate quote ${quote.id}:`, error)
      throw error
    }
  }

  // Migrate all quotes that need migration
  async migrateAllQuotes() {
    console.log('🔄 Starting legacy quote migration...')
    this.migrationStats.startTime = new Date()
    
    try {
      // Get all quotes
      const allQuotes = this.jsondb.listQuotes()
      this.migrationStats.total = allQuotes.length
      
      console.log(`📊 Found ${allQuotes.length} total quotes`)
      
      const quotesToMigrate = allQuotes.filter(quote => this.needsMigration(quote))
      console.log(`🔄 ${quotesToMigrate.length} quotes need migration`)
      
      const migrationResults = []
      
      for (const quote of quotesToMigrate) {
        try {
          const migratedQuote = this.migrateQuote(quote)
          
          // Save the migrated quote
          this.jsondb.putQuote(migratedQuote)
          
          migrationResults.push({
            quoteId: quote.id,
            status: 'success',
            oldFlags: {
              needsPriceUpdate: quote.needsPriceUpdate,
              pendingCalculatedPrice: quote.pendingCalculatedPrice
            },
            newStatus: migratedQuote.priceStatus.status
          })
          
          this.migrationStats.migrated++
        } catch (error) {
          console.error(`❌ Migration failed for quote ${quote.id}:`, error)
          
          migrationResults.push({
            quoteId: quote.id,
            status: 'error',
            error: error.message
          })
          
          this.migrationStats.errors++
        }
      }
      
      this.migrationStats.skipped = this.migrationStats.total - quotesToMigrate.length
      this.migrationStats.endTime = new Date()
      
      console.log('✅ Migration completed:', this.migrationStats)
      
      return {
        success: true,
        stats: this.migrationStats,
        results: migrationResults
      }
      
    } catch (error) {
      console.error('❌ Migration process failed:', error)
      this.migrationStats.endTime = new Date()
      
      return {
        success: false,
        error: error.message,
        stats: this.migrationStats
      }
    }
  }

  // Get migration status for all quotes
  getMigrationStatus() {
    const allQuotes = this.jsondb.listQuotes()
    
    const status = {
      total: allQuotes.length,
      migrated: 0,
      needsMigration: 0,
      alreadyNewArchitecture: 0,
      legacy: 0
    }
    
    allQuotes.forEach(quote => {
      if (quote._legacyMigrated) {
        status.migrated++
      } else if (quote.priceStatus) {
        status.alreadyNewArchitecture++
      } else if (this.needsMigration(quote)) {
        status.needsMigration++
      } else {
        status.legacy++
      }
    })
    
    return status
  }

  // Clean up legacy flags after successful migration verification
  async cleanupLegacyFlags() {
    console.log('🧹 Starting legacy flag cleanup...')
    
    try {
      const allQuotes = this.jsondb.listQuotes()
      const migratedQuotes = allQuotes.filter(quote => quote._legacyMigrated)
      
      console.log(`🧹 Cleaning up ${migratedQuotes.length} migrated quotes`)
      
      let cleanedCount = 0
      
      for (const quote of migratedQuotes) {
        try {
          // Remove legacy flags and migration markers
          const cleanedQuote = { ...quote }
          
          // Remove legacy price flags
          delete cleanedQuote.needsPriceUpdate
          delete cleanedQuote.pendingCalculatedPrice
          delete cleanedQuote.priceUpdateReasons
          delete cleanedQuote.formStructureChanged
          delete cleanedQuote.lastPriceSettingsVersionUsed
          delete cleanedQuote.pendingPriceSettingsVersion
          
          // Remove migration tracking (keep backup flags for now)
          delete cleanedQuote._legacyMigrated
          
          // Save cleaned quote
          this.jsondb.putQuote(cleanedQuote)
          cleanedCount++
          
        } catch (error) {
          console.error(`❌ Failed to clean quote ${quote.id}:`, error)
        }
      }
      
      console.log(`✅ Cleaned up ${cleanedCount} quotes`)
      
      return {
        success: true,
        cleaned: cleanedCount,
        total: migratedQuotes.length
      }
      
    } catch (error) {
      console.error('❌ Cleanup process failed:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  // Validate migration results
  validateMigration() {
    console.log('🔍 Validating migration results...')
    
    const allQuotes = this.jsondb.listQuotes()
    const validation = {
      total: allQuotes.length,
      valid: 0,
      invalid: 0,
      issues: []
    }
    
    allQuotes.forEach(quote => {
      const issues = []
      
      // Check if quote has proper price status
      if (!quote.priceStatus) {
        issues.push('Missing priceStatus object')
      } else {
        try {
          // Validate price status structure
          const priceStatus = PriceStatus.fromJSON(quote.priceStatus)
          
          // Basic validation
          if (!['unknown', 'outdated', 'calculated', 'current'].includes(priceStatus.status)) {
            issues.push(`Invalid status: ${priceStatus.status}`)
          }
          
          if (priceStatus.appliedPrice !== null && typeof priceStatus.appliedPrice !== 'number') {
            issues.push('Invalid appliedPrice type')
          }
          
        } catch (error) {
          issues.push(`Invalid priceStatus structure: ${error.message}`)
        }
      }
      
      // Check for remaining legacy flags (should be cleaned up)
      if (quote.needsPriceUpdate !== undefined) {
        issues.push('Legacy needsPriceUpdate flag still present')
      }
      
      if (quote.pendingCalculatedPrice !== undefined) {
        issues.push('Legacy pendingCalculatedPrice flag still present')
      }
      
      if (issues.length === 0) {
        validation.valid++
      } else {
        validation.invalid++
        validation.issues.push({
          quoteId: quote.id,
          issues
        })
      }
    })
    
    console.log('🔍 Validation completed:', {
      valid: validation.valid,
      invalid: validation.invalid,
      issues: validation.issues.length
    })
    
    return validation
  }
}

export default LegacyQuoteMigrator