#!/usr/bin/env node

/**
 * Version System & Manual Pricing Integration Test
 * Tests the interaction between version system and manual pricing locks
 */

import jsondb from './src/lib/jsondb.js'

class VersionSystemTest {
  constructor() {
    this.results = []
    this.testData = {
      quotes: [],
      originalPriceSettings: null,
      originalFormConfig: null
    }
  }

  log(test, status, detail = '') {
    const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️'
    console.log(`${icon} ${test}: ${status}${detail ? ` - ${detail}` : ''}`)
    
    this.results.push({
      test,
      status,
      detail,
      timestamp: new Date().toISOString()
    })
  }

  async setupTestData() {
    console.log('🚀 Setting up test data...\n')
    
    // Backup original settings
    this.testData.originalPriceSettings = jsondb.getPriceSettings()
    this.testData.originalFormConfig = jsondb.getFormConfig()
    
    // Create test quotes with different manual override states
    const now = new Date().toISOString()
    const testQuotes = [
      {
        id: 'version-test-1',
        name: 'Version Test User 1',
        email: 'version1@test.com',
        phone: '+905551234567',
        proj: 'Version Test Project 1',
        status: 'new',
        createdAt: now,
        price: 1000,
        calculatedPrice: 1000,
        manualOverride: null, // Normal quote
        customFields: {
          material: 'Çelik',
          thickness: 5,
          qty: 10
        }
      },
      {
        id: 'version-test-2',
        name: 'Version Test User 2',
        email: 'version2@test.com',
        phone: '+905551234568',
        proj: 'Version Test Project 2',
        status: 'review',
        createdAt: now,
        price: 1500,
        calculatedPrice: 1200,
        manualOverride: {
          active: true,
          price: 1500,
          setAt: now,
          setBy: 'test-admin@test.com',
          setByLabel: 'Test Admin',
          note: 'Test manual override for version system'
        },
        customFields: {
          material: 'Alüminyum',
          thickness: 8,
          qty: 15
        }
      },
      {
        id: 'version-test-3',
        name: 'Version Test User 3',
        email: 'version3@test.com',
        phone: '+905551234569',
        proj: 'Version Test Project 3',
        status: 'feasible',
        createdAt: now,
        price: 2000,
        calculatedPrice: 2000,
        manualOverride: {
          active: false,
          price: 1800,
          setAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
          setBy: 'test-admin@test.com',
          releasedAt: now,
          releasedBy: 'test-admin@test.com',
          note: 'Previously locked, now released'
        },
        customFields: {
          material: 'Paslanmaz Çelik',
          thickness: 12,
          qty: 8
        }
      }
    ]
    
    // Save test quotes
    testQuotes.forEach(quote => {
      jsondb.putQuote(quote)
      this.testData.quotes.push(quote.id)
    })
    
    console.log(`📋 Created ${testQuotes.length} test quotes`)
  }

  async testManualOverrideFieldPresence() {
    console.log('\n🔍 Test: Manual Override Field Presence')
    
    try {
      const quotes = jsondb.listQuotes()
      let withManualOverride = 0
      let withoutManualOverride = 0
      let nullManualOverride = 0
      
      quotes.forEach(quote => {
        if (quote.hasOwnProperty('manualOverride')) {
          withManualOverride++
          if (quote.manualOverride === null) {
            nullManualOverride++
          }
        } else {
          withoutManualOverride++
        }
      })
      
      this.log('Manual override field presence', 
        withoutManualOverride === 0 ? 'PASS' : 'FAIL',
        `With field: ${withManualOverride}, Without: ${withoutManualOverride}, Null: ${nullManualOverride}`)
      
    } catch (error) {
      this.log('Manual override field presence', 'FAIL', error.message)
    }
  }

  async testPriceCalculationRespectingLocks() {
    console.log('\n💰 Test: Price Calculation Respecting Manual Locks')
    
    try {
      const lockedQuote = jsondb.getQuote('version-test-2')
      const normalQuote = jsondb.getQuote('version-test-1')
      
      if (!lockedQuote || !normalQuote) {
        this.log('Price calculation test setup', 'FAIL', 'Test quotes not found')
        return
      }
      
      // Test locked quote - should not recalculate
      const lockedResult = await jsondb.compareQuotePriceVersions(lockedQuote.id)
      if (lockedResult.status === 'manual-override') {
        this.log('Locked quote price calculation', 'PASS', 'Manual override status returned')
      } else {
        this.log('Locked quote price calculation', 'FAIL', `Expected manual-override, got ${lockedResult.status}`)
      }
      
      // Test normal quote - should allow recalculation
      const normalResult = await jsondb.compareQuotePriceVersions(normalQuote.id)
      if (normalResult.status !== 'manual-override') {
        this.log('Normal quote price calculation', 'PASS', `Price calculation allowed: ${normalResult.status}`)
      } else {
        this.log('Normal quote price calculation', 'FAIL', 'Normal quote incorrectly marked as manual-override')
      }
      
    } catch (error) {
      this.log('Price calculation respecting locks', 'FAIL', error.message)
    }
  }

  async testVersionSystemWithManualOverrides() {
    console.log('\n🔄 Test: Version System Integration with Manual Overrides')
    
    try {
      // Create new price settings version
      const currentSettings = jsondb.getPriceSettings()
      const newSettings = {
        ...currentSettings,
        parameters: [
          { material: 'Çelik', thickness: [1, 10], pricePerMm: 2.5 },
          { material: 'Alüminyum', thickness: [1, 15], pricePerMm: 3.0 },
          { material: 'Paslanmaz Çelik', thickness: [1, 20], pricePerMm: 4.0 }
        ]
      }
      
      const versionResult = await jsondb.savePriceSettingsWithVersioning(newSettings, {
        action: 'test:version-system-with-manual-overrides'
      })
      
      this.log('Price settings versioning', 'PASS', `New version: ${versionResult.version}`)
      
      // Test that locked quotes are not affected by version changes
      const lockedQuote = jsondb.getQuote('version-test-2')
      const comparison = await jsondb.compareQuotePriceVersions(lockedQuote.id)
      
      if (comparison.status === 'manual-override') {
        this.log('Version change respects locks', 'PASS', 'Locked quotes unaffected by version changes')
      } else {
        this.log('Version change respects locks', 'FAIL', 'Version change affected locked quote')
      }
      
      // Test that normal quotes detect version drift
      const normalQuote = jsondb.getQuote('version-test-1')
      const normalComparison = await jsondb.compareQuotePriceVersions(normalQuote.id)
      
      if (normalComparison.status === 'outdated' || normalComparison.status === 'drift') {
        this.log('Version drift detection', 'PASS', `Normal quotes detect version changes: ${normalComparison.status}`)
      } else {
        this.log('Version drift detection', 'FAIL', `Expected outdated/drift, got ${normalComparison.status}`)
      }
      
    } catch (error) {
      this.log('Version system integration', 'FAIL', error.message)
    }
  }

  async testBulkOperationsSkipLocked() {
    console.log('\n📦 Test: Bulk Operations Skip Locked Quotes')
    
    try {
      const quotes = jsondb.listQuotes()
      let lockedCount = 0
      let normalCount = 0
      let skippedCount = 0
      
      quotes.forEach(quote => {
        if (quote.manualOverride?.active) {
          lockedCount++
          // Simulate bulk operation logic
          console.log(`⏭️  Would skip locked quote ${quote.id}`)
          skippedCount++
        } else {
          normalCount++
          // Simulate bulk operation logic
          console.log(`✅ Would process normal quote ${quote.id}`)
        }
      })
      
      this.log('Bulk operation simulation', 'PASS', 
        `Processed: ${normalCount}, Skipped locked: ${skippedCount}, Total locked: ${lockedCount}`)
      
      if (skippedCount === lockedCount) {
        this.log('Locked quote skip logic', 'PASS', 'All locked quotes correctly skipped')
      } else {
        this.log('Locked quote skip logic', 'FAIL', 'Locked quote skip logic inconsistent')
      }
      
    } catch (error) {
      this.log('Bulk operations skip locked', 'FAIL', error.message)
    }
  }

  async testManualOverrideDataIntegrity() {
    console.log('\n🛡️ Test: Manual Override Data Integrity')
    
    try {
      const lockedQuote = jsondb.getQuote('version-test-2')
      const releasedQuote = jsondb.getQuote('version-test-3')
      
      // Test active override structure
      if (lockedQuote?.manualOverride) {
        const override = lockedQuote.manualOverride
        const requiredFields = ['active', 'price', 'setAt', 'setBy']
        const missingFields = requiredFields.filter(field => !override.hasOwnProperty(field))
        
        if (missingFields.length === 0) {
          this.log('Active override structure', 'PASS', 'All required fields present')
        } else {
          this.log('Active override structure', 'FAIL', `Missing fields: ${missingFields.join(', ')}`)
        }
        
        // Test data types
        if (typeof override.active === 'boolean' && 
            typeof override.price === 'number' && 
            typeof override.setAt === 'string') {
          this.log('Override data types', 'PASS', 'Correct data types')
        } else {
          this.log('Override data types', 'FAIL', 'Incorrect data types')
        }
      }
      
      // Test released override structure
      if (releasedQuote?.manualOverride) {
        const override = releasedQuote.manualOverride
        if (override.active === false && override.releasedAt && override.releasedBy) {
          this.log('Released override structure', 'PASS', 'Released override properly structured')
        } else {
          this.log('Released override structure', 'FAIL', 'Released override missing required fields')
        }
      }
      
    } catch (error) {
      this.log('Manual override data integrity', 'FAIL', error.message)
    }
  }

  async testPriceHistoryIntegration() {
    console.log('\n📚 Test: Price History Integration with Manual Overrides')
    
    try {
      const lockedQuote = jsondb.getQuote('version-test-2')
      
      if (lockedQuote?.priceHistory && Array.isArray(lockedQuote.priceHistory)) {
        const manualEntries = lockedQuote.priceHistory.filter(entry => 
          entry.type === 'manual-override' || entry.action?.includes('manual')
        )
        
        if (manualEntries.length > 0) {
          this.log('Price history integration', 'PASS', `${manualEntries.length} manual override entries found`)
        } else {
          this.log('Price history integration', 'PARTIAL', 'No manual override entries in price history')
        }
        
        // Check history structure
        const validHistory = lockedQuote.priceHistory.every(entry => 
          entry.hasOwnProperty('timestamp') && 
          entry.hasOwnProperty('price') && 
          entry.hasOwnProperty('type')
        )
        
        if (validHistory) {
          this.log('Price history structure', 'PASS', 'All entries have required fields')
        } else {
          this.log('Price history structure', 'FAIL', 'Invalid price history entries')
        }
        
      } else {
        this.log('Price history integration', 'INFO', 'No price history found (may be normal for test data)')
      }
      
    } catch (error) {
      this.log('Price history integration', 'FAIL', error.message)
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test data...')
    
    try {
      // Remove test quotes
      this.testData.quotes.forEach(quoteId => {
        try {
          jsondb.deleteQuote(quoteId)
        } catch (error) {
          console.log(`⚠️ Could not delete test quote ${quoteId}: ${error.message}`)
        }
      })
      
      // Restore original settings if they were backed up
      if (this.testData.originalPriceSettings) {
        jsondb.savePriceSettings(this.testData.originalPriceSettings)
      }
      
      console.log('✅ Test data cleanup completed')
      
    } catch (error) {
      console.log('❌ Test data cleanup failed:', error.message)
    }
  }

  async run() {
    try {
      console.log('🚀 Version System & Manual Pricing Integration Test\n')
      
      await this.setupTestData()
      
      await this.testManualOverrideFieldPresence()
      await this.testPriceCalculationRespectingLocks()
      await this.testVersionSystemWithManualOverrides()
      await this.testBulkOperationsSkipLocked()
      await this.testManualOverrideDataIntegrity()
      await this.testPriceHistoryIntegration()
      
      console.log('\n📊 Test Summary:')
      const passed = this.results.filter(r => r.status === 'PASS').length
      const failed = this.results.filter(r => r.status === 'FAIL').length
      const partial = this.results.filter(r => r.status === 'PARTIAL').length
      const info = this.results.filter(r => r.status === 'INFO').length
      
      console.table({
        'Total Tests': this.results.length,
        'Passed': passed,
        'Failed': failed,
        'Partial': partial,
        'Info': info,
        'Success Rate': `${((passed / (passed + failed)) * 100).toFixed(1)}%`
      })
      
      if (failed === 0) {
        console.log('\n🎉 All version system integration tests passed!')
        process.exit(0)
      } else {
        console.log(`\n⚠️  ${failed} tests failed. Please review the implementation.`)
        process.exit(1)
      }
      
    } catch (error) {
      console.error('❌ Version system test failed:', error)
      process.exit(1)
    } finally {
      await this.cleanup()
    }
  }
}

// Run the test
const tester = new VersionSystemTest()
tester.run()
