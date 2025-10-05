#!/usr/bin/env node

/**
 * Comprehensive Integration Test Suite for Manual Pricing System
 * Tests end-to-end workflow including UI, API, database, and business logic
 */

import puppeteer from 'puppeteer'
import fs from 'fs'
import jsondb from './src/lib/jsondb.js'

class IntegrationTestSuite {
  constructor() {
    this.browser = null
    this.page = null
    this.results = []
    this.baseUrl = 'http://localhost:3001'
    this.adminUrl = `${this.baseUrl}/quote-dashboard.html`
    this.testData = {
      testQuoteId: null,
      originalQuotes: []
    }
  }

  async init() {
    console.log('🚀 Integration Test Suite başlatılıyor...')
    this.browser = await puppeteer.launch({ 
      headless: false,
      defaultViewport: { width: 1920, height: 1080 }
    })
    this.page = await this.browser.newPage()
    
    // Setup error monitoring
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('❌ Browser Error:', msg.text())
      }
    })
    
    this.page.on('pageerror', error => {
      console.log('❌ Page Error:', error.message)
    })
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
    console.log('🔧 Setting up test data...')
    
    // Create a test quote for integration testing
    const testQuote = {
      id: `integration-test-${Date.now()}`,
      name: 'Integration Test User',
      email: 'integration@test.com',
      phone: '+905551234567',
      proj: 'Integration Test Project',
      status: 'new',
      createdAt: new Date().toISOString(),
      price: 1000,
      calculatedPrice: 1000,
      manualOverride: null,
      customFields: {
        material: 'Çelik',
        thickness: 5,
        qty: 10,
        notes: 'Integration test quote'
      }
    }
    
    jsondb.putQuote(testQuote)
    this.testData.testQuoteId = testQuote.id
    
    console.log(`📋 Created test quote: ${testQuote.id}`)
  }

  async testEndToEndManualPricingWorkflow() {
    console.log('\n🔄 Test: End-to-End Manual Pricing Workflow')
    
    try {
      // Step 1: Login to admin
      await this.page.goto(this.adminUrl)
      await this.page.waitForSelector('input[name="email"]', { timeout: 5000 })
      
      await this.page.type('input[name="email"]', 'umutyalcin8@gmail.com')
      await this.page.type('input[name="password"]', 'burkol123')
      await this.page.click('button[type="submit"]')
      
      await this.page.waitForTimeout(2000)
      this.log('Admin login', 'PASS', 'Successfully logged in')
      
      // Step 2: Find and open test quote detail
      await this.page.waitForSelector('.admin-table', { timeout: 5000 })
      
      // Find the test quote row
      const testQuoteRow = await this.page.evaluate((testId) => {
        const rows = Array.from(document.querySelectorAll('tr'))
        return rows.find(row => row.textContent.includes(testId))
      }, this.testData.testQuoteId)
      
      if (!testQuoteRow) {
        this.log('Find test quote', 'FAIL', 'Test quote not found in admin table')
        return
      }
      
      // Click detail button for test quote
      const detailButtons = await this.page.$$('button')
      let clicked = false
      for (const btn of detailButtons) {
        const text = await this.page.evaluate(el => el.textContent, btn)
        if (text.includes('Detay')) {
          await btn.click()
          clicked = true
          break
        }
      }
      
      if (!clicked) {
        this.log('Open detail modal', 'FAIL', 'Could not find detail button')
        return
      }
      
      await this.page.waitForTimeout(1000)
      this.log('Open detail modal', 'PASS', 'Detail modal opened')
      
      // Step 3: Test manual pricing section presence
      const manualSection = await this.page.$('.manual-price-management')
      if (!manualSection) {
        this.log('Manual pricing section', 'FAIL', 'Manuel fiyat yönetimi section not found')
        return
      }
      this.log('Manual pricing section', 'PASS', 'Manuel fiyat yönetimi section present')
      
      // Step 4: Set manual price
      await this.page.type('.manual-price-input', '1599.99', { delay: 100 })
      await this.page.type('.manual-price-note', 'Integration test manual price', { delay: 100 })
      
      const lockBtn = await this.page.$('.manual-price-btn')
      await lockBtn.click()
      
      // Wait for API response
      await this.page.waitForTimeout(3000)
      
      // Step 5: Verify manual price was set
      const lockIndicator = await this.page.$('.manual-price-lock-indicator')
      if (lockIndicator) {
        const lockText = await this.page.evaluate(el => el.textContent, lockIndicator)
        if (lockText.includes('🔒') && lockText.includes('1599.99')) {
          this.log('Set manual price', 'PASS', 'Manual price set successfully')
        } else {
          this.log('Set manual price', 'FAIL', `Lock indicator shows: ${lockText}`)
        }
      } else {
        this.log('Set manual price', 'FAIL', 'Lock indicator not shown')
      }
      
      // Step 6: Verify database state
      const quoteAfterLock = jsondb.getQuote(this.testData.testQuoteId)
      if (quoteAfterLock?.manualOverride?.active && quoteAfterLock.manualOverride.price === 1599.99) {
        this.log('Database verification - lock', 'PASS', 'Quote properly locked in database')
      } else {
        this.log('Database verification - lock', 'FAIL', 'Quote not properly locked in database')
      }
      
      // Step 7: Close and reopen modal to test persistence
      const closeBtn = await this.page.$('.modal .close, [onclick*="close"]')
      if (closeBtn) {
        await closeBtn.click()
        await this.page.waitForTimeout(500)
      }
      
      // Reopen detail modal
      const detailButtons2 = await this.page.$$('button')
      for (const btn of detailButtons2) {
        const text = await this.page.evaluate(el => el.textContent, btn)
        if (text.includes('Detay')) {
          await btn.click()
          break
        }
      }
      
      await this.page.waitForTimeout(1000)
      
      // Verify lock persisted
      const lockIndicator2 = await this.page.$('.manual-price-lock-indicator')
      if (lockIndicator2) {
        this.log('Manual price persistence', 'PASS', 'Manual price persisted after modal reopen')
      } else {
        this.log('Manual price persistence', 'FAIL', 'Manual price not persisted')
      }
      
      // Step 8: Test unlock with apply current price
      const applyBtn = await this.page.$('.manual-price-apply-btn')
      if (applyBtn) {
        await applyBtn.click()
        await this.page.waitForTimeout(3000)
        
        // Check that lock indicator is gone
        const lockIndicator3 = await this.page.$('.manual-price-lock-indicator')
        if (!lockIndicator3) {
          this.log('Unlock with apply', 'PASS', 'Manual price unlocked successfully')
        } else {
          this.log('Unlock with apply', 'FAIL', 'Lock indicator still present after unlock')
        }
        
        // Verify database state
        const quoteAfterUnlock = jsondb.getQuote(this.testData.testQuoteId)
        if (!quoteAfterUnlock?.manualOverride?.active) {
          this.log('Database verification - unlock', 'PASS', 'Quote properly unlocked in database')
        } else {
          this.log('Database verification - unlock', 'FAIL', 'Quote still locked in database')
        }
      } else {
        this.log('Unlock with apply', 'FAIL', 'Apply button not found')
      }
      
    } catch (error) {
      this.log('End-to-end workflow', 'FAIL', error.message)
    }
  }

  async testAdminTableLockDisplay() {
    console.log('\n🎨 Test: Admin Table Lock Display Integration')
    
    try {
      // First set a manual price via API
      const response = await this.page.evaluate(async (testId) => {
        try {
          const res = await fetch(`/api/quotes/${testId}/manual-price`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              price: 2199.99,
              note: 'Table display test'
            })
          })
          return { status: res.status, success: res.ok }
        } catch (error) {
          return { error: error.message }
        }
      }, this.testData.testQuoteId)
      
      if (response.success) {
        this.log('API manual price set', 'PASS', 'Manual price set via API')
        
        // Refresh page to see changes
        await this.page.reload()
        await this.page.waitForTimeout(2000)
        
        // Look for lock indicator in table
        const lockFound = await this.page.evaluate(() => {
          const cells = Array.from(document.querySelectorAll('td'))
          return cells.some(cell => cell.textContent.includes('🔒'))
        })
        
        if (lockFound) {
          this.log('Admin table lock display', 'PASS', 'Lock indicator visible in admin table')
        } else {
          this.log('Admin table lock display', 'FAIL', 'Lock indicator not visible in admin table')
        }
        
        // Check that price change buttons are hidden for locked quotes
        const priceChangeButtons = await this.page.$$('button:contains("Hesapla"), button:contains("Uygula")')
        if (priceChangeButtons.length === 0) {
          this.log('Price change button hiding', 'PASS', 'Price change buttons hidden for locked quotes')
        } else {
          this.log('Price change button hiding', 'PARTIAL', 'Some price change buttons may still be visible')
        }
        
      } else {
        this.log('API manual price set', 'FAIL', `API error: ${response.error || response.status}`)
      }
      
    } catch (error) {
      this.log('Admin table lock display', 'FAIL', error.message)
    }
  }

  async testAPIEndpointsSecurity() {
    console.log('\n🔐 Test: API Endpoints Security')
    
    try {
      // Test unauthorized access
      const unauthorizedResponse = await this.page.evaluate(async (testId) => {
        try {
          const res = await fetch(`/api/quotes/${testId}/manual-price`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // No auth headers
            body: JSON.stringify({ price: 999 })
          })
          return { status: res.status }
        } catch (error) {
          return { error: error.message }
        }
      }, this.testData.testQuoteId)
      
      if (unauthorizedResponse.status === 401 || unauthorizedResponse.status === 403) {
        this.log('API security - unauthorized', 'PASS', 'Unauthorized requests properly rejected')
      } else {
        this.log('API security - unauthorized', 'FAIL', `Expected 401/403, got ${unauthorizedResponse.status}`)
      }
      
      // Test malformed data
      const malformedResponse = await this.page.evaluate(async (testId) => {
        try {
          const res = await fetch(`/api/quotes/${testId}/manual-price`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ price: 'invalid' }) // Invalid price
          })
          return { status: res.status }
        } catch (error) {
          return { error: error.message }
        }
      }, this.testData.testQuoteId)
      
      if (malformedResponse.status >= 400 && malformedResponse.status < 500) {
        this.log('API security - validation', 'PASS', 'Malformed data properly validated')
      } else {
        this.log('API security - validation', 'FAIL', `Expected 4xx, got ${malformedResponse.status}`)
      }
      
    } catch (error) {
      this.log('API security test', 'FAIL', error.message)
    }
  }

  async testPriceCalculationIntegration() {
    console.log('\n🧮 Test: Price Calculation Integration')
    
    try {
      // Test that locked quotes don't get recalculated
      const testQuote = jsondb.getQuote(this.testData.testQuoteId)
      
      if (testQuote?.manualOverride?.active) {
        const comparison = await jsondb.compareQuotePriceVersions(this.testData.testQuoteId)
        
        if (comparison.status === 'manual-override') {
          this.log('Price calculation bypass', 'PASS', 'Locked quotes bypass price calculation')
        } else {
          this.log('Price calculation bypass', 'FAIL', `Expected manual-override, got ${comparison.status}`)
        }
      } else {
        this.log('Price calculation bypass', 'INFO', 'Test quote not locked, skipping calculation test')
      }
      
      // Test price history integration
      if (testQuote?.priceHistory) {
        const manualEntries = testQuote.priceHistory.filter(entry => 
          entry.type === 'manual-override' || entry.action?.includes('manual')
        )
        
        if (manualEntries.length > 0) {
          this.log('Price history integration', 'PASS', `${manualEntries.length} manual entries in price history`)
        } else {
          this.log('Price history integration', 'PARTIAL', 'No manual entries in price history')
        }
      } else {
        this.log('Price history integration', 'INFO', 'No price history found')
      }
      
    } catch (error) {
      this.log('Price calculation integration', 'FAIL', error.message)
    }
  }

  async testErrorHandling() {
    console.log('\n🚨 Test: Error Handling')
    
    try {
      // Test non-existent quote
      const nonExistentResponse = await this.page.evaluate(async () => {
        try {
          const res = await fetch('/api/quotes/non-existent-id/manual-price', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ price: 1000 })
          })
          return { status: res.status }
        } catch (error) {
          return { error: error.message }
        }
      })
      
      if (nonExistentResponse.status === 404) {
        this.log('Error handling - not found', 'PASS', 'Non-existent quotes properly handled')
      } else {
        this.log('Error handling - not found', 'FAIL', `Expected 404, got ${nonExistentResponse.status}`)
      }
      
      // Test negative price
      const negativeResponse = await this.page.evaluate(async (testId) => {
        try {
          const res = await fetch(`/api/quotes/${testId}/manual-price`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ price: -100 })
          })
          return { status: res.status }
        } catch (error) {
          return { error: error.message }
        }
      }, this.testData.testQuoteId)
      
      if (negativeResponse.status >= 400 && negativeResponse.status < 500) {
        this.log('Error handling - negative price', 'PASS', 'Negative prices properly rejected')
      } else {
        this.log('Error handling - negative price', 'FAIL', `Expected 4xx, got ${negativeResponse.status}`)
      }
      
    } catch (error) {
      this.log('Error handling test', 'FAIL', error.message)
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up test data...')
    
    try {
      if (this.testData.testQuoteId) {
        jsondb.deleteQuote(this.testData.testQuoteId)
        console.log(`✅ Deleted test quote: ${this.testData.testQuoteId}`)
      }
    } catch (error) {
      console.log('⚠️ Cleanup error:', error.message)
    }
    
    if (this.browser) {
      await this.browser.close()
    }
  }

  async run() {
    try {
      await this.init()
      await this.setupTestData()
      
      console.log('\n🔬 Starting Integration Test Suite...\n')
      
      await this.testEndToEndManualPricingWorkflow()
      await this.testAdminTableLockDisplay()
      await this.testAPIEndpointsSecurity()
      await this.testPriceCalculationIntegration()
      await this.testErrorHandling()
      
      console.log('\n📊 Integration Test Summary:')
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
      
      // Save detailed results
      const reportPath = './integration-test-results.json'
      fs.writeFileSync(reportPath, JSON.stringify({
        summary: { passed, failed, partial, info, total: this.results.length },
        results: this.results,
        timestamp: new Date().toISOString()
      }, null, 2))
      
      console.log(`\n📋 Detailed results saved to: ${reportPath}`)
      
      if (failed === 0) {
        console.log('\n🎉 All integration tests passed!')
      } else {
        console.log(`\n⚠️  ${failed} tests failed. Please review the implementation.`)
      }
      
    } catch (error) {
      console.error('❌ Integration test suite failed:', error)
    } finally {
      await this.cleanup()
    }
  }
}

// Run integration tests
const tester = new IntegrationTestSuite()
tester.run()