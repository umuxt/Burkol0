// Migration API Routes - Phase C
// Provides controlled migration from legacy price system to new architecture

import LegacyQuoteMigrator from './models/LegacyQuoteMigrator.js'

export function addMigrationRoutes(app, jsondb) {
  const migrator = new LegacyQuoteMigrator(jsondb)
  
  // Get migration status
  app.get('/api/migration/status', (req, res) => {
    try {
      console.log('📊 Getting migration status')
      
      const status = migrator.getMigrationStatus()
      
      res.json({
        success: true,
        status,
        message: `Migration status: ${status.migrated} migrated, ${status.needsMigration} need migration`
      })
    } catch (error) {
      console.error('❌ Failed to get migration status:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })
  
  // Start migration process
  app.post('/api/migration/migrate', async (req, res) => {
    try {
      console.log('🔄 Starting migration process via API')
      
      const result = await migrator.migrateAllQuotes()
      
      if (result.success) {
        res.json({
          success: true,
          stats: result.stats,
          results: result.results,
          message: `Migration completed: ${result.stats.migrated} quotes migrated, ${result.stats.errors} errors`
        })
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
          stats: result.stats
        })
      }
    } catch (error) {
      console.error('❌ Migration API error:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })
  
  // Validate migration results
  app.get('/api/migration/validate', (req, res) => {
    try {
      console.log('🔍 Validating migration via API')
      
      const validation = migrator.validateMigration()
      
      res.json({
        success: true,
        validation,
        message: `Validation completed: ${validation.valid} valid, ${validation.invalid} invalid`
      })
    } catch (error) {
      console.error('❌ Validation API error:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })
  
  // Clean up legacy flags
  app.post('/api/migration/cleanup', async (req, res) => {
    try {
      console.log('🧹 Starting cleanup via API')
      
      const result = await migrator.cleanupLegacyFlags()
      
      if (result.success) {
        res.json({
          success: true,
          cleaned: result.cleaned,
          total: result.total,
          message: `Cleanup completed: ${result.cleaned} quotes cleaned`
        })
      } else {
        res.status(500).json({
          success: false,
          error: result.error
        })
      }
    } catch (error) {
      console.error('❌ Cleanup API error:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })
  
  // Get detailed migration report for admin
  app.get('/api/migration/report', (req, res) => {
    try {
      console.log('📄 Generating migration report')
      
      const allQuotes = jsondb.listQuotes()
      const status = migrator.getMigrationStatus()
      const validation = migrator.validateMigration()
      
      // Analyze migration patterns
      const migrationPatterns = {
        byStatus: {},
        byDate: {},
        errors: validation.issues
      }
      
      // Count by original status
      allQuotes.forEach(quote => {
        if (quote._legacyMigrated) {
          const originalStatus = quote._legacy_needsPriceUpdate ? 'needs-update' : 'current'
          migrationPatterns.byStatus[originalStatus] = (migrationPatterns.byStatus[originalStatus] || 0) + 1
        }
      })
      
      // Count by migration date
      allQuotes.forEach(quote => {
        if (quote._migrationDate) {
          const date = quote._migrationDate.split('T')[0] // Get date part
          migrationPatterns.byDate[date] = (migrationPatterns.byDate[date] || 0) + 1
        }
      })
      
      const report = {
        timestamp: new Date().toISOString(),
        overview: status,
        validation,
        patterns: migrationPatterns,
        recommendations: []
      }
      
      // Add recommendations based on status
      if (status.needsMigration > 0) {
        report.recommendations.push(`${status.needsMigration} quotes still need migration`)
      }
      
      if (validation.invalid > 0) {
        report.recommendations.push(`${validation.invalid} quotes have validation issues`)
      }
      
      if (status.migrated > 0 && validation.invalid === 0) {
        report.recommendations.push('Migration appears successful - consider running cleanup')
      }
      
      res.json({
        success: true,
        report
      })
    } catch (error) {
      console.error('❌ Report generation error:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })
  
  // Rollback migration (emergency only)
  app.post('/api/migration/rollback', async (req, res) => {
    try {
      console.log('⚠️  Starting migration rollback (EMERGENCY)')
      
      const allQuotes = jsondb.listQuotes()
      const migratedQuotes = allQuotes.filter(quote => quote._legacyMigrated)
      
      console.log(`⚠️  Rolling back ${migratedQuotes.length} migrated quotes`)
      
      let rolledBack = 0
      const rollbackResults = []
      
      for (const quote of migratedQuotes) {
        try {
          // Restore legacy flags from backup
          const restoredQuote = {
            ...quote,
            needsPriceUpdate: quote._legacy_needsPriceUpdate,
            pendingCalculatedPrice: quote._legacy_pendingCalculatedPrice,
            priceUpdateReasons: quote._legacy_priceUpdateReasons,
            formStructureChanged: quote._legacy_formStructureChanged
          }
          
          // Remove new architecture and migration markers
          delete restoredQuote.priceStatus
          delete restoredQuote._legacyMigrated
          delete restoredQuote._migrationDate
          delete restoredQuote._legacy_needsPriceUpdate
          delete restoredQuote._legacy_pendingCalculatedPrice
          delete restoredQuote._legacy_priceUpdateReasons
          delete restoredQuote._legacy_formStructureChanged
          
          jsondb.putQuote(restoredQuote)
          rolledBack++
          
          rollbackResults.push({
            quoteId: quote.id,
            status: 'success'
          })
          
        } catch (error) {
          console.error(`❌ Rollback failed for quote ${quote.id}:`, error)
          rollbackResults.push({
            quoteId: quote.id,
            status: 'error',
            error: error.message
          })
        }
      }
      
      console.log(`⚠️  Rollback completed: ${rolledBack} quotes restored`)
      
      res.json({
        success: true,
        rolledBack,
        total: migratedQuotes.length,
        results: rollbackResults,
        message: `Emergency rollback completed: ${rolledBack} quotes restored to legacy system`
      })
      
    } catch (error) {
      console.error('❌ Rollback failed:', error)
      res.status(500).json({
        success: false,
        error: error.message
      })
    }
  })
}

export default addMigrationRoutes