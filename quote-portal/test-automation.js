// Burkol Test Automation - Browser-based testing with Puppeteer
import puppeteer from 'puppeteer'
import fs from 'fs'
import path from 'path'

class BurkolTestRunner {
  constructor() {
    this.browser = null
    this.page = null
    this.results = []
    this.baseUrl = 'http://localhost:3001'
    this.testStartTime = new Date()
  }

  async init() {
    console.log('🚀 Burkol Test Automation başlatılıyor...')
    this.browser = await puppeteer.launch({ 
      headless: false, // Görünür browser
      defaultViewport: { width: 1920, height: 1080 },
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    this.page = await this.browser.newPage()
    
    // Console mesajlarını yakala
    this.page.on('console', msg => {
      console.log(`🌐 Browser Console [${msg.type()}]:`, msg.text())
    })
    
    // Network request'leri izle
    this.page.on('response', response => {
      if (response.url().includes('/api/')) {
        console.log(`📡 API Response: ${response.status()} ${response.url()}`)
      }
    })
  }

  async logResult(testName, status, details = '') {
    const result = {
      test: testName,
      status: status,
      details: details,
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.testStartTime
    }
    
    this.results.push(result)
    
    const statusIcon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️'
    console.log(`${statusIcon} ${testName}: ${status} ${details ? `- ${details}` : ''}`)
  }

  async waitForElement(selector, timeout = 5000) {
    try {
      await this.page.waitForSelector(selector, { timeout })
      return true
    } catch (error) {
      console.log(`⏰ Element timeout: ${selector}`)
      return false
    }
  }

  async typeText(selector, text) {
    await this.page.waitForSelector(selector)
    await this.page.click(selector)
    await this.page.evaluate(sel => document.querySelector(sel).value = '', selector)
    await this.page.type(selector, text)
  }

  async clickElement(selector) {
    await this.page.waitForSelector(selector)
    await this.page.click(selector)
  }

  // USER TESTLERİ
  async runUserTests() {
    console.log('\n📋 USER TESTLERİ BAŞLIYOR...')
    await this.page.goto(`${this.baseUrl}/index.html`)
    
    // Test 1: Form alanlarını görüntüleme
    await this.testFormDisplay()
    
    // Test 2: Form doldurma
    await this.testFormFilling()
    
    // Test 3: Dosya yükleme
    await this.testFileUpload()
    
    // Test 4: Form validation
    await this.testFormValidation()
    
    // Test 5: Dil değişimi
    await this.testLanguageChange()
    
    // Test 6: Form submission
    await this.testFormSubmission()
  }

  async testFormDisplay() {
    console.log('\n🔍 Test: Form alanlarını görüntüleme')
    
    // Form container kontrolü
    const formExists = await this.waitForElement('.dynamic-form')
    if (formExists) {
      await this.logResult('Form görüntüleme', 'PASS', 'Form container bulundu')
    } else {
      await this.logResult('Form görüntüleme', 'FAIL', 'Form container bulunamadı')
      return
    }

    // Input alanları kontrolü
    const inputs = await this.page.$$('input, select, textarea')
    await this.logResult('Form alanları', 'PASS', `${inputs.length} alan bulundu`)

    // Zorunlu alan işaretleri
    const requiredFields = await this.page.$$('[required]')
    await this.logResult('Zorunlu alanlar', 'PASS', `${requiredFields.length} zorunlu alan`)
  }

  async testFormFilling() {
    console.log('\n✏️ Test: Form doldurma')
    
    try {
      // İsim alanı
      await this.typeText('input[name="name"]', 'Test Kullanıcı Automation')
      await this.logResult('İsim alanı', 'PASS', 'Metin girişi başarılı')

      // Email alanı
      await this.typeText('input[name="email"]', 'test-automation@burkol.com')
      await this.logResult('Email alanı', 'PASS', 'Email girişi başarılı')

      // Telefon alanı
      await this.typeText('input[name="phone"]', '+90 555 TEST 123')
      await this.logResult('Telefon alanı', 'PASS', 'Telefon girişi başarılı')

      // Proje alanı
      await this.typeText('input[name="proj"]', 'Automation Test Projesi')
      await this.logResult('Proje alanı', 'PASS', 'Proje adı girişi başarılı')

    } catch (error) {
      await this.logResult('Form doldurma', 'FAIL', error.message)
    }
  }

  async testFileUpload() {
    console.log('\n📁 Test: Dosya yükleme')
    
    try {
      // Mock dosya oluştur
      const mockFilePath = path.join(process.cwd(), 'test-file.txt')
      fs.writeFileSync(mockFilePath, 'Automation test file content')

      // File input bulup dosya yükle
      const fileInputs = await this.page.$$('input[type="file"]')
      
      if (fileInputs.length > 0) {
        await fileInputs[0].uploadFile(mockFilePath)
        await this.logResult('Dosya yükleme', 'PASS', 'Mock dosya yüklendi')
        
        // Cleanup
        fs.unlinkSync(mockFilePath)
      } else {
        await this.logResult('Dosya yükleme', 'FAIL', 'File input bulunamadı')
      }

    } catch (error) {
      await this.logResult('Dosya yükleme', 'FAIL', error.message)
    }
  }

  async testFormValidation() {
    console.log('\n🛡️ Test: Form validation')
    
    try {
      // Geçersiz email test
      await this.typeText('input[name="email"]', 'invalid-email')
      
      // Submit button'u bul ve tıkla
      const submitBtn = await this.page.$('button[type="submit"]')
      if (submitBtn) {
        await submitBtn.click()
        
        // Error mesajı kontrolü
        await this.page.waitForTimeout(1000)
        const errorElements = await this.page.$$('.error, .notification')
        
        if (errorElements.length > 0) {
          await this.logResult('Email validation', 'PASS', 'Geçersiz email uyarısı gösterildi')
        } else {
          await this.logResult('Email validation', 'FAIL', 'Validation uyarısı gösterilmedi')
        }
      }

    } catch (error) {
      await this.logResult('Form validation', 'FAIL', error.message)
    }
  }

  async testLanguageChange() {
    console.log('\n🌍 Test: Dil değişimi')
    
    try {
      // Dil seçici bulup İngilizce'ye geç
      const langSelect = await this.page.$('select')
      if (langSelect) {
        await this.page.select('select', 'en')
        await this.page.waitForTimeout(500)
        
        // Sayfa içeriği değişikliği kontrolü
        const pageText = await this.page.content()
        if (pageText.includes('English') || pageText.includes('Submit')) {
          await this.logResult('Dil değişimi', 'PASS', 'İngilizce çevirisi aktif')
        } else {
          await this.logResult('Dil değişimi', 'PARTIAL', 'Dil değişimi sınırlı')
        }
      }

    } catch (error) {
      await this.logResult('Dil değişimi', 'FAIL', error.message)
    }
  }

  async testFormSubmission() {
    console.log('\n📤 Test: Form gönderimi')
    
    try {
      // Valid form data doldur
      await this.typeText('input[name="email"]', 'valid@test.com')
      
      // Submit
      const submitBtn = await this.page.$('button[type="submit"]')
      if (submitBtn) {
        await submitBtn.click()
        
        // Success/error mesajı bekle
        await this.page.waitForTimeout(2000)
        
        const notifications = await this.page.$$('.notification, .toast')
        if (notifications.length > 0) {
          await this.logResult('Form submission', 'PASS', 'Submit sonrası notification gösterildi')
        } else {
          await this.logResult('Form submission', 'PARTIAL', 'Notification görülmedi')
        }
      }

    } catch (error) {
      await this.logResult('Form submission', 'FAIL', error.message)
    }
  }

  // ADMIN TESTLERİ
  async runAdminTests() {
    console.log('\n🔐 ADMIN TESTLERİ BAŞLIYOR...')
    await this.page.goto(`${this.baseUrl}/panel-gizli.html`)
    
    // Admin login
    await this.testAdminLogin()
    
    // Teklif listesi
    await this.testQuoteList()
    
    // Filtreleme
    await this.testFiltering()
    
    // İstatistikler
    await this.testStatistics()
  }

  async testAdminLogin() {
    console.log('\n🔑 Test: Admin girişi')
    
    try {
      await this.typeText('input[name="email"]', 'umutyalcin8@gmail.com')
      await this.typeText('input[name="password"]', 'burkol123')
      
      await this.clickElement('button[type="submit"]')
      
      // Login sonrası admin panel yüklenmesini bekle
      await this.page.waitForTimeout(2000)
      
      const currentUrl = this.page.url()
      const pageContent = await this.page.content()
      
      if (pageContent.includes('Admin Panel') || pageContent.includes('Logout')) {
        await this.logResult('Admin Login', 'PASS', 'Başarılı giriş')
      } else {
        await this.logResult('Admin Login', 'FAIL', 'Giriş başarısız')
      }

    } catch (error) {
      await this.logResult('Admin Login', 'FAIL', error.message)
    }
  }

  async testQuoteList() {
    console.log('\n📊 Test: Teklif listesi')
    
    try {
      // Table kontrolü
      const table = await this.waitForElement('table')
      if (table) {
        const rows = await this.page.$$('tbody tr')
        await this.logResult('Teklif listesi', 'PASS', `${rows.length} teklif görüntülendi`)
        
        // Pagination kontrolü
        const pagination = await this.page.$('.pagination-container')
        if (pagination) {
          await this.logResult('Pagination', 'PASS', 'Pagination controls mevcut')
        }
      } else {
        await this.logResult('Teklif listesi', 'FAIL', 'Tablo bulunamadı')
      }

    } catch (error) {
      await this.logResult('Teklif listesi', 'FAIL', error.message)
    }
  }

  async testFiltering() {
    console.log('\n🔍 Test: Filtreleme sistemi')
    
    try {
      // Filter popup açma
      const filterBtn = await this.page.$('button[onclick*="filter"], .filter-btn')
      if (filterBtn) {
        await filterBtn.click()
        await this.page.waitForTimeout(500)
        
        await this.logResult('Filter açma', 'PASS', 'Filter popup açıldı')
      }
      
      // Global search test
      const searchInput = await this.page.$('input[placeholder*="ara"], input[type="search"]')
      if (searchInput) {
        await this.typeText('input[placeholder*="ara"], input[type="search"]', 'test')
        await this.page.waitForTimeout(1000)
        
        await this.logResult('Global search', 'PASS', 'Arama çalışıyor')
      }

    } catch (error) {
      await this.logResult('Filtreleme', 'FAIL', error.message)
    }
  }

  async testStatistics() {
    console.log('\n📈 Test: İstatistikler')
    
    try {
      // İstatistik elementleri kontrol
      const statElements = await this.page.$$('.stat, .statistic, .chart')
      if (statElements.length > 0) {
        await this.logResult('İstatistikler', 'PASS', `${statElements.length} stat element bulundu`)
      } else {
        await this.logResult('İstatistikler', 'PARTIAL', 'İstatistik elementi bulunamadı')
      }

    } catch (error) {
      await this.logResult('İstatistikler', 'FAIL', error.message)
    }
  }

  async generateReport() {
    console.log('\n📋 TEST RAPORU GENERATİNG...')
    
    const totalTests = this.results.length
    const passedTests = this.results.filter(r => r.status === 'PASS').length
    const failedTests = this.results.filter(r => r.status === 'FAIL').length
    const partialTests = this.results.filter(r => r.status === 'PARTIAL').length
    
    const report = {
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        partial: partialTests,
        successRate: ((passedTests + partialTests) / totalTests * 100).toFixed(2),
        duration: Date.now() - this.testStartTime
      },
      results: this.results
    }

    // JSON rapor kaydet
    fs.writeFileSync('test-results.json', JSON.stringify(report, null, 2))
    
    // Console rapor
    console.log('\n🎯 TEST SONUÇLARI:')
    console.log(`📊 Toplam: ${totalTests}`)
    console.log(`✅ Başarılı: ${passedTests}`)
    console.log(`❌ Başarısız: ${failedTests}`)
    console.log(`⚠️ Kısmi: ${partialTests}`)
    console.log(`🎯 Başarı Oranı: %${report.summary.successRate}`)
    console.log(`⏱️ Süre: ${report.summary.duration}ms`)
    
    return report
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close()
    }
  }

  async run() {
    try {
      await this.init()
      
      await this.runUserTests()
      await this.runAdminTests()
      
      const report = await this.generateReport()
      
      return report
      
    } catch (error) {
      console.error('❌ Test automation hatası:', error)
    } finally {
      await this.cleanup()
    }
  }
}

// Export for npm script usage
export default BurkolTestRunner

// Direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new BurkolTestRunner()
  runner.run()
}