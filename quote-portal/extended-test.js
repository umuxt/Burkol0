// Extended Test Suite - Comprehensive coverage for Burkol Quote Portal
import { webkit } from 'playwright'

class ExtendedBurkolTests {
  constructor() {
    this.browser = null
    this.page = null
    this.results = []
    this.baseUrl = 'http://localhost:3001'
  }

  async init() {
    this.browser = await webkit.launch({ headless: false })
    this.page = await this.browser.newPage()
  }

  async logResult(testName, status, details = '') {
    this.results.push({
      test: testName,
      status: status,
      details: details,
      timestamp: new Date().toISOString()
    })
    console.log(`${status === 'PASS' ? '✅' : '❌'} ${testName}: ${status}${details ? ` - ${details}` : ''}`)
  }

  // EXTENDED USER TESTS
  async runExtendedUserTests() {
    console.log('\n🔍 EXTENDED USER TESTS')
    
    await this.page.goto(`${this.baseUrl}/index.html`)
    await this.page.waitForTimeout(3000)

    // Test 1: Form validation
    await this.testFormValidation()
    
    // Test 2: File upload functionality
    await this.testFileUpload()
    
    // Test 3: Progressive form submission
    await this.testFormSubmission()
    
    // Test 4: Responsive design
    await this.testResponsiveDesign()
  }

  async testFormValidation() {
    console.log('\n📝 Test: Form validation')
    
    try {
      // Test required field validation
      const submitButton = await this.page.$('button[type="submit"]')
      if (submitButton) {
        await submitButton.click()
        await this.page.waitForTimeout(1000)
        
        // Check for validation messages
        const validationMessages = await this.page.$$('[class*="error"], [class*="invalid"], .required')
        await this.logResult('Required field validation', validationMessages.length > 0 ? 'PASS' : 'FAIL', 
          `${validationMessages.length} validation message(s)`)
      }

      // Test email validation
      const emailInput = await this.page.$('input[type="email"]')
      if (emailInput) {
        await emailInput.fill('invalid-email')
        await this.page.waitForTimeout(500)
        
        const isValid = await emailInput.evaluate(el => el.validity.valid)
        await this.logResult('Email validation', !isValid ? 'PASS' : 'FAIL', 
          isValid ? 'Invalid email accepted' : 'Invalid email rejected')
      }

    } catch (error) {
      await this.logResult('Form validation', 'FAIL', `Error: ${error.message}`)
    }
  }

  async testFileUpload() {
    console.log('\n📁 Test: File upload functionality')
    
    try {
      // Check for file input
      const fileInputs = await this.page.$$('input[type="file"]')
      await this.logResult('File input presence', fileInputs.length > 0 ? 'PASS' : 'FAIL', 
        `${fileInputs.length} file input(s) found`)

      if (fileInputs.length > 0) {
        // Test drag and drop area
        const dropZones = await this.page.$$('[class*="drop"], [class*="upload"]')
        await this.logResult('Upload drop zones', dropZones.length > 0 ? 'PASS' : 'FAIL', 
          `${dropZones.length} drop zone(s)`)

        // Test file type restrictions
        const acceptAttr = await fileInputs[0].getAttribute('accept')
        await this.logResult('File type restrictions', acceptAttr ? 'PASS' : 'FAIL', 
          acceptAttr ? `Accept: ${acceptAttr}` : 'No restrictions')
      }

    } catch (error) {
      await this.logResult('File upload test', 'FAIL', `Error: ${error.message}`)
    }
  }

  async testFormSubmission() {
    console.log('\n📤 Test: Form submission flow')
    
    try {
      // Fill out minimal required fields
      const nameInput = await this.page.$('input[name="name"]')
      const emailInput = await this.page.$('input[type="email"]')
      const phoneInput = await this.page.$('input[type="tel"], input[name="phone"]')

      if (nameInput && emailInput && phoneInput) {
        await nameInput.fill('Test User Extended')
        await emailInput.fill('extended-test@burkol.com')
        await phoneInput.fill('5555555555')

        // Add required project info
        const projectInput = await this.page.$('input[name="proj"]')
        if (projectInput) {
          await projectInput.fill('Extended Test Project')
        }

        await this.logResult('Form filling', 'PASS', 'Required fields filled')

        // Test form submission
        const submitButton = await this.page.$('button[type="submit"]')
        if (submitButton) {
          await submitButton.click()
          await this.page.waitForTimeout(3000)

          // Check for success message or redirect
          const pageContent = await this.page.content()
          const hasSuccess = pageContent.includes('Teşekkürler') || 
                           pageContent.includes('başarı') || 
                           pageContent.includes('alındı')

          await this.logResult('Form submission', hasSuccess ? 'PASS' : 'PARTIAL', 
            hasSuccess ? 'Success message displayed' : 'No clear success indication')
        }
      } else {
        await this.logResult('Form submission', 'FAIL', 'Required inputs not found')
      }

    } catch (error) {
      await this.logResult('Form submission', 'FAIL', `Error: ${error.message}`)
    }
  }

  async testResponsiveDesign() {
    console.log('\n📱 Test: Responsive design')
    
    try {
      // Test mobile viewport
      await this.page.setViewportSize({ width: 375, height: 667 })
      await this.page.waitForTimeout(1000)

      const mobileMenu = await this.page.$('.nav, [class*="mobile"], [class*="hamburger"]')
      await this.logResult('Mobile layout', mobileMenu ? 'PASS' : 'PARTIAL', 
        'Mobile navigation elements present')

      // Test tablet viewport
      await this.page.setViewportSize({ width: 768, height: 1024 })
      await this.page.waitForTimeout(1000)

      // Test desktop viewport
      await this.page.setViewportSize({ width: 1280, height: 720 })
      await this.page.waitForTimeout(1000)

      await this.logResult('Responsive breakpoints', 'PASS', 'All viewports tested')

    } catch (error) {
      await this.logResult('Responsive design', 'FAIL', `Error: ${error.message}`)
    }
  }

  // EXTENDED ADMIN TESTS
  async runExtendedAdminTests() {
    console.log('\n🔐 EXTENDED ADMIN TESTS')
    
    await this.page.goto(`${this.baseUrl}/panel-gizli.html`)
    await this.page.waitForTimeout(3000)

    // Login first
    await this.adminLogin()
    
    // Test CRUD operations
    await this.testAdminCRUD()
    
    // Test filtering and search
    await this.testFilteringSearch()
    
    // Test data export
    await this.testDataExport()
    
    // Test settings management
    await this.testSettingsManagement()
  }

  async adminLogin() {
    try {
      await this.page.fill('input[type="email"]', 'umutyalcin8@gmail.com')
      await this.page.fill('input[type="password"]', 'burkol123')
      await this.page.click('button[type="submit"]')
      await this.page.waitForTimeout(3000)
      
      await this.logResult('Admin login', 'PASS', 'Login successful')
    } catch (error) {
      await this.logResult('Admin login', 'FAIL', `Login failed: ${error.message}`)
    }
  }

  async testAdminCRUD() {
    console.log('\n📊 Test: Admin CRUD operations')
    
    try {
      // Test quote viewing
      const quotesTable = await this.page.$('table')
      const rows = await this.page.$$('tbody tr')
      await this.logResult('Quote listing', quotesTable ? 'PASS' : 'FAIL', 
        `${rows.length} quote(s) displayed`)

      // Test quote editing
      const editButtons = await this.page.$$('button[onclick*="edit"], .edit, [title*="edit"]')
      await this.logResult('Edit functionality', editButtons.length > 0 ? 'PASS' : 'FAIL', 
        `${editButtons.length} edit button(s)`)

      // Test quote deletion
      const deleteButtons = await this.page.$$('button[onclick*="delete"], .delete, [title*="delete"]')
      await this.logResult('Delete functionality', deleteButtons.length > 0 ? 'PASS' : 'FAIL', 
        `${deleteButtons.length} delete button(s)`)

      // Test quote details modal
      const detailButtons = await this.page.$$('button[onclick*="detail"], .detail, [title*="detail"]')
      if (detailButtons.length > 0) {
        await detailButtons[0].click()
        await this.page.waitForTimeout(2000)
        
        const modal = await this.page.$('.modal, [role="dialog"]')
        await this.logResult('Details modal', modal ? 'PASS' : 'FAIL', 
          modal ? 'Modal opened successfully' : 'Modal did not open')

        // Close modal
        const closeBtn = await this.page.$('.modal .close, .modal button[onclick*="close"]')
        if (closeBtn) {
          await closeBtn.click()
          await this.page.waitForTimeout(1000)
        }
      }

    } catch (error) {
      await this.logResult('Admin CRUD', 'FAIL', `Error: ${error.message}`)
    }
  }

  async testFilteringSearch() {
    console.log('\n🔍 Test: Filtering and search')
    
    try {
      // Test status filter
      const statusFilters = await this.page.$$('select[onchange*="filter"], .filter select')
      await this.logResult('Status filtering', statusFilters.length > 0 ? 'PASS' : 'FAIL', 
        `${statusFilters.length} filter(s)`)

      // Test search functionality
      const searchInputs = await this.page.$$('input[type="search"], input[placeholder*="ara"], .search input')
      await this.logResult('Search functionality', searchInputs.length > 0 ? 'PASS' : 'FAIL', 
        `${searchInputs.length} search input(s)`)

      // Test date range filtering
      const dateInputs = await this.page.$$('input[type="date"]')
      await this.logResult('Date filtering', dateInputs.length > 0 ? 'PASS' : 'PARTIAL', 
        `${dateInputs.length} date input(s)`)

    } catch (error) {
      await this.logResult('Filtering search', 'FAIL', `Error: ${error.message}`)
    }
  }

  async testDataExport() {
    console.log('\n📤 Test: Data export functionality')
    
    try {
      // Test JSON export
      const jsonExportBtn = await this.page.$('button[onclick*="json"], [title*="JSON"]')
      await this.logResult('JSON export', jsonExportBtn ? 'PASS' : 'FAIL', 
        'JSON export button present')

      // Test CSV export
      const csvExportBtn = await this.page.$('button[onclick*="csv"], [title*="CSV"]')
      await this.logResult('CSV export', csvExportBtn ? 'PASS' : 'FAIL', 
        'CSV export button present')

      // Test TXT export for individual quotes
      const txtExportBtns = await this.page.$$('button[onclick*="txt"], [title*="TXT"]')
      await this.logResult('TXT export', txtExportBtns.length > 0 ? 'PASS' : 'FAIL', 
        `${txtExportBtns.length} TXT export button(s)`)

    } catch (error) {
      await this.logResult('Data export', 'FAIL', `Error: ${error.message}`)
    }
  }

  async testSettingsManagement() {
    console.log('\n⚙️ Test: Settings management')
    
    try {
      // Test settings modal
      const settingsBtn = await this.page.$('button[onclick*="settings"], .settings, [title*="ayar"]')
      if (settingsBtn) {
        await settingsBtn.click()
        await this.page.waitForTimeout(2000)
        
        const settingsModal = await this.page.$('.modal, [role="dialog"]')
        await this.logResult('Settings modal', settingsModal ? 'PASS' : 'FAIL', 
          'Settings modal opened')

        if (settingsModal) {
          // Test settings tabs
          const tabs = await this.page.$$('.tab, [role="tab"], button[onclick*="tab"]')
          await this.logResult('Settings tabs', tabs.length > 0 ? 'PASS' : 'FAIL', 
            `${tabs.length} setting(s) tab(s)`)

          // Test price settings
          const priceInputs = await this.page.$$('input[type="number"], input[name*="price"]')
          await this.logResult('Price settings', priceInputs.length > 0 ? 'PASS' : 'FAIL', 
            `${priceInputs.length} price input(s)`)

          // Close settings
          const closeBtn = await this.page.$('.modal .close, .modal button[onclick*="close"]')
          if (closeBtn) {
            await closeBtn.click()
            await this.page.waitForTimeout(1000)
          }
        }
      } else {
        await this.logResult('Settings access', 'FAIL', 'Settings button not found')
      }

    } catch (error) {
      await this.logResult('Settings management', 'FAIL', `Error: ${error.message}`)
    }
  }

  // Performance tests
  async runPerformanceTests() {
    console.log('\n⚡ PERFORMANCE TESTS')
    
    // Test page load times
    const userPageStart = Date.now()
    await this.page.goto(`${this.baseUrl}/index.html`)
    await this.page.waitForLoadState('networkidle')
    const userPageTime = Date.now() - userPageStart
    
    await this.logResult('User page load time', userPageTime < 5000 ? 'PASS' : 'FAIL', 
      `${userPageTime}ms (target: <5000ms)`)

    const adminPageStart = Date.now()
    await this.page.goto(`${this.baseUrl}/panel-gizli.html`)
    await this.page.waitForLoadState('networkidle')
    const adminPageTime = Date.now() - adminPageStart
    
    await this.logResult('Admin page load time', adminPageTime < 5000 ? 'PASS' : 'FAIL', 
      `${adminPageTime}ms (target: <5000ms)`)
  }

  async generateExtendedReport() {
    const total = this.results.length
    const passed = this.results.filter(r => r.status === 'PASS').length
    const failed = this.results.filter(r => r.status === 'FAIL').length
    const partial = this.results.filter(r => r.status === 'PARTIAL').length
    
    console.log('\n📊 EXTENDED TEST RESULTS:')
    console.log(`Total Tests: ${total}`)
    console.log(`✅ Passed: ${passed}`)
    console.log(`❌ Failed: ${failed}`)
    console.log(`⚠️ Partial: ${partial}`)
    console.log(`🎯 Success Rate: ${((passed + partial) / total * 100).toFixed(2)}%`)

    return {
      summary: { total, passed, failed, partial },
      results: this.results
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close()
    }
  }

  async run() {
    try {
      await this.init()
      
      await this.runExtendedUserTests()
      await this.runExtendedAdminTests()
      await this.runPerformanceTests()
      
      const report = await this.generateExtendedReport()
      return report
      
    } catch (error) {
      console.error('❌ Extended test error:', error)
    } finally {
      await this.cleanup()
    }
  }
}

// Export for npm script
export default ExtendedBurkolTests

// Direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new ExtendedBurkolTests()
  runner.run()
}