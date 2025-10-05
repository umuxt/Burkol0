#!/usr/bin/env node

/**
 * Test script for manual pricing workflow
 * Tests manual price lock/unlock operations and verifies behavior
 */

import puppeteer from 'puppeteer'
import fs from 'fs'

class ManualPricingTest {
  constructor() {
    this.browser = null
    this.page = null
    this.results = []
    this.baseUrl = 'http://localhost:3001'
    this.adminUrl = `${this.baseUrl}/panel-gizli.html`
  }

  async init() {
    console.log('🚀 Manual Pricing Test başlatılıyor...')
    this.browser = await puppeteer.launch({ 
      headless: false,
      defaultViewport: { width: 1920, height: 1080 }
    })
    this.page = await this.browser.newPage()
    
    // Setup error handling
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('❌ Console Error:', msg.text())
      }
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

  async testManualPricingAPI() {
    console.log('\n🔧 API Test - Manual Pricing Endpoints:')
    
    try {
      // Test setting manual price
      const setResponse = await this.page.evaluate(async () => {
        try {
          const quotes = await (await fetch('/api/quotes')).json()
          if (quotes.length === 0) return { error: 'No quotes found' }
          
          const testQuote = quotes[0]
          const response = await fetch(`/api/quotes/${testQuote.id}/manual-price`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              price: 1500.75,
              note: 'Test manuel fiyat'
            })
          })
          
          return {
            status: response.status,
            data: await response.json(),
            quoteId: testQuote.id
          }
        } catch (error) {
          return { error: error.message }
        }
      })
      
      if (setResponse.error) {
        this.log('Manuel fiyat API - Set', 'FAIL', setResponse.error)
      } else if (setResponse.status === 200) {
        this.log('Manuel fiyat API - Set', 'PASS', `Quote ${setResponse.quoteId} locked`)
        
        // Test clearing manual price
        const clearResponse = await this.page.evaluate(async (quoteId) => {
          try {
            const response = await fetch(`/api/quotes/${quoteId}/manual-price`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                note: 'Test kilit kaldırma'
              })
            })
            
            return {
              status: response.status,
              data: await response.json()
            }
          } catch (error) {
            return { error: error.message }
          }
        }, setResponse.quoteId)
        
        if (clearResponse.error) {
          this.log('Manuel fiyat API - Clear', 'FAIL', clearResponse.error)
        } else if (clearResponse.status === 200) {
          this.log('Manuel fiyat API - Clear', 'PASS', `Quote ${setResponse.quoteId} unlocked`)
        } else {
          this.log('Manuel fiyat API - Clear', 'FAIL', `Status: ${clearResponse.status}`)
        }
      } else {
        this.log('Manuel fiyat API - Set', 'FAIL', `Status: ${setResponse.status}`)
      }
      
    } catch (error) {
      this.log('Manuel fiyat API Test', 'FAIL', error.message)
    }
  }

  async testAdminTableLockDisplay() {
    console.log('\n🎨 UI Test - Admin Table Lock Display:')
    
    try {
      await this.page.goto(this.adminUrl)
      await this.page.waitForSelector('.admin-table', { timeout: 5000 })
      
      // Check for lock indicators
      const lockIndicators = await this.page.evaluate(() => {
        const rows = document.querySelectorAll('.admin-table tr')
        const locks = []
        
        rows.forEach((row, index) => {
          const priceCell = row.querySelector('td:nth-child(6)') // Assuming price is 6th column
          if (priceCell && priceCell.textContent.includes('🔒')) {
            locks.push({
              row: index,
              text: priceCell.textContent.trim()
            })
          }
        })
        
        return locks
      })
      
      if (lockIndicators.length > 0) {
        this.log('Admin table lock display', 'PASS', `${lockIndicators.length} locked quotes found`)
      } else {
        this.log('Admin table lock display', 'INFO', 'No locked quotes found')
      }
      
    } catch (error) {
      this.log('Admin table lock display', 'FAIL', error.message)
    }
  }

  async testDetailModalManualPricing() {
    console.log('\n🔧 UI Test - Detail Modal Manual Pricing:')
    
    try {
      await this.page.goto(this.adminUrl)
      await this.page.waitForSelector('.admin-table', { timeout: 5000 })
      
      // Click on first detail button
      const detailButton = await this.page.$('.btn:contains("Detay")')
      if (!detailButton) {
        this.log('Detail modal açma', 'FAIL', 'Detay button bulunamadı')
        return
      }
      
      await detailButton.click()
      await this.page.waitForSelector('.manual-price-management', { timeout: 3000 })
      
      // Check if manual pricing section exists
      const manualSection = await this.page.$('.manual-price-management')
      if (manualSection) {
        this.log('Manuel fiyat bölümü', 'PASS', 'Manuel fiyat yönetimi bölümü bulundu')
        
        // Test manual price input
        const priceInput = await this.page.$('.manual-price-input')
        const noteInput = await this.page.$('.manual-price-note')
        const lockButton = await this.page.$('.manual-price-btn')
        
        if (priceInput && noteInput && lockButton) {
          this.log('Manuel fiyat kontrolleri', 'PASS', 'Tüm input alanları mevcut')
          
          // Test interaction
          await this.page.type('.manual-price-input', '999.99')
          await this.page.type('.manual-price-note', 'Test lock note')
          
          this.log('Manuel fiyat input test', 'PASS', 'Input alanları çalışıyor')
        } else {
          this.log('Manuel fiyat kontrolleri', 'FAIL', 'Eksik input alanları')
        }
        
      } else {
        this.log('Manuel fiyat bölümü', 'FAIL', 'Manuel fiyat yönetimi bölümü bulunamadı')
      }
      
    } catch (error) {
      this.log('Detail modal manual pricing', 'FAIL', error.message)
    }
  }

  async testPriceStatusIntegration() {
    console.log('\n⚙️ Integration Test - Price Status System:')
    
    try {
      // Test that locked quotes have correct status
      const statusCheck = await this.page.evaluate(async () => {
        try {
          const quotes = await (await fetch('/api/quotes')).json()
          const results = {
            total: quotes.length,
            locked: 0,
            unlocked: 0,
            statusConsistency: true
          }
          
          quotes.forEach(quote => {
            if (quote.manualOverride?.active) {
              results.locked++
              // Check if status is manual-override
              if (quote.priceStatus?.status !== 'manual-override') {
                results.statusConsistency = false
              }
            } else {
              results.unlocked++
            }
          })
          
          return results
        } catch (error) {
          return { error: error.message }
        }
      })
      
      if (statusCheck.error) {
        this.log('Price status consistency', 'FAIL', statusCheck.error)
      } else {
        this.log('Quote status overview', 'INFO', 
          `Total: ${statusCheck.total}, Locked: ${statusCheck.locked}, Unlocked: ${statusCheck.unlocked}`)
        
        if (statusCheck.statusConsistency) {
          this.log('Price status consistency', 'PASS', 'Manuel override status tutarlı')
        } else {
          this.log('Price status consistency', 'FAIL', 'Status tutarsızlığı bulundu')
        }
      }
      
    } catch (error) {
      this.log('Price status integration', 'FAIL', error.message)
    }
  }

  async runAllTests() {
    try {
      await this.init()
      
      await this.testManualPricingAPI()
      await this.testAdminTableLockDisplay()
      await this.testDetailModalManualPricing()
      await this.testPriceStatusIntegration()
      
      console.log('\n📊 Test Summary:')
      const passed = this.results.filter(r => r.status === 'PASS').length
      const failed = this.results.filter(r => r.status === 'FAIL').length
      const info = this.results.filter(r => r.status === 'INFO').length
      
      console.table({
        'Total Tests': this.results.length,
        'Passed': passed,
        'Failed': failed,
        'Info': info,
        'Success Rate': `${((passed / (passed + failed)) * 100).toFixed(1)}%`
      })
      
      // Save detailed results
      const reportPath = './manual-pricing-test-results.json'
      fs.writeFileSync(reportPath, JSON.stringify({
        summary: { passed, failed, info, total: this.results.length },
        results: this.results,
        timestamp: new Date().toISOString()
      }, null, 2))
      
      console.log(`\n📋 Detailed results saved to: ${reportPath}`)
      
      if (failed === 0) {
        console.log('\n🎉 All manual pricing tests passed!')
      } else {
        console.log(`\n⚠️  ${failed} tests failed. Please review.`)
      }
      
    } catch (error) {
      console.error('❌ Test suite failed:', error)
    } finally {
      if (this.browser) {
        await this.browser.close()
      }
    }
  }
}

// Run tests
const tester = new ManualPricingTest()
tester.runAllTests()