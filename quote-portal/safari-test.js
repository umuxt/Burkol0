// Burkol Test Automation - Safari + Konsol Hata Analizi
import { webkit } from 'playwright'
import fs from 'fs'
import path from 'path'

class BurkolSafariTestRunner {
  constructor() {
    this.browser = null
    this.page = null
    this.results = []
    this.consoleErrors = []
    this.networkErrors = []
    this.baseUrl = 'http://localhost:3001'
    this.testStartTime = new Date()
  }

  async init() {
    console.log('🦁 Burkol Safari Test Automation başlatılıyor...')
    this.browser = await webkit.launch({ 
      headless: false, // Görünür Safari
      //slowMo: 250 // Her aksiyon arası bekleme
    })
    
    this.page = await this.browser.newPage()
    
    // Console mesajlarını yakala ve analiz et
    this.page.on('console', msg => {
      const type = msg.type()
      const text = msg.text()
      const location = msg.location()
      
      console.log(`🦁 Safari Console [${type}]: ${text}`)
      
      // Hata tiplerini kategorize et
      if (type === 'error') {
        this.consoleErrors.push({
          type: 'console_error',
          message: text,
          location: location,
          timestamp: new Date().toISOString(),
          severity: this.categorizeSeverity(text)
        })
      }
      
      if (type === 'warning' && this.isImportantWarning(text)) {
        this.consoleErrors.push({
          type: 'important_warning',
          message: text,
          location: location,
          timestamp: new Date().toISOString(),
          severity: 'medium'
        })
      }
    })
    
    // Network hatalarını yakala
    this.page.on('response', response => {
      const url = response.url()
      const status = response.status()
      
      if (url.includes('/api/')) {
        console.log(`🌐 Safari API Response: ${status} ${url}`)
      }
      
      // 4xx, 5xx hatalarını kaydet
      if (status >= 400) {
        this.networkErrors.push({
          type: 'network_error',
          url: url,
          status: status,
          statusText: response.statusText(),
          timestamp: new Date().toISOString(),
          severity: status >= 500 ? 'high' : 'medium'
        })
      }
    })
    
    // Sayfa hataları yakala
    this.page.on('pageerror', error => {
      console.log(`💥 Safari Page Error: ${error.message}`)
      this.consoleErrors.push({
        type: 'page_error',
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        severity: 'high'
      })
    })
    
    // Request failure yakala
    this.page.on('requestfailed', request => {
      console.log(`🚫 Safari Request Failed: ${request.url()} - ${request.failure()?.errorText}`)
      this.networkErrors.push({
        type: 'request_failed',
        url: request.url(),
        error: request.failure()?.errorText,
        timestamp: new Date().toISOString(),
        severity: 'medium'
      })
    })
  }

  categorizeSeverity(errorMessage) {
    const highSeverityKeywords = ['cannot find module', 'syntaxerror', 'referenceerror', 'typeerror']
    const mediumSeverityKeywords = ['warning', 'deprecated', '404']
    
    const lowerMessage = errorMessage.toLowerCase()
    
    if (highSeverityKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return 'high'
    }
    if (mediumSeverityKeywords.some(keyword => lowerMessage.includes(keyword))) {
      return 'medium'
    }
    return 'low'
  }

  isImportantWarning(warningMessage) {
    const importantWarnings = [
      'deprecated',
      'manifest',
      'security',
      'performance',
      'accessibility'
    ]
    
    return importantWarnings.some(keyword => 
      warningMessage.toLowerCase().includes(keyword)
    )
  }

  async logResult(testName, status, details = '', consoleErrorCount = 0) {
    const result = {
      test: testName,
      status: status,
      details: details,
      consoleErrorCount: consoleErrorCount,
      timestamp: new Date().toISOString(),
      duration: Date.now() - this.testStartTime
    }
    
    this.results.push(result)
    
    const statusIcon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️'
    const errorInfo = consoleErrorCount > 0 ? ` (${consoleErrorCount} konsol hatası)` : ''
    console.log(`${statusIcon} ${testName}: ${status}${details ? ` - ${details}` : ''}${errorInfo}`)
  }

  async waitForElement(selector, timeout = 10000) {
    try {
      await this.page.waitForSelector(selector, { timeout })
      return true
    } catch (error) {
      console.log(`⏰ Safari Element timeout: ${selector}`)
      return false
    }
  }

  async typeText(selector, text) {
    await this.page.waitForSelector(selector)
    await this.page.click(selector)
    await this.page.fill(selector, text)
  }

  async clickElement(selector) {
    await this.page.waitForSelector(selector)
    await this.page.click(selector)
  }

  // USER TESTLERİ - Safari Özel
  async runUserTests() {
    console.log('\n📋 USER TESTLERİ SAFARI\'DE BAŞLIYOR...')
    
    // Konsol hatalarını temizle
    this.consoleErrors = []
    this.networkErrors = []
    
    await this.page.goto(`${this.baseUrl}/index.html`)
    
    // Sayfa yüklenmesini bekle
    await this.page.waitForTimeout(5000)
    
    // Test 1: Sayfa yükleme ve konsol hataları analizi
    await this.testPageLoadAndConsoleErrors()
    
    // Test 2: Form görüntüleme
    await this.testFormDisplay()
    
    // Test 3: Form doldurma
    await this.testFormFilling()
    
    // Test 4: Dil değişimi
    await this.testLanguageChange()
    
    // Test 5: PWA özellikleri Safari'de
    await this.testPWAFeatures()
  }

  async testPageLoadAndConsoleErrors() {
    console.log('\n🔍 Test: Sayfa yükleme ve konsol hataları')
    
    // Sayfa başlığı kontrolü
    const title = await this.page.title()
    if (title.includes('Burkol')) {
      await this.logResult('Sayfa başlığı', 'PASS', `Başlık: ${title}`)
    } else {
      await this.logResult('Sayfa başlığı', 'FAIL', `Başlık: ${title}`)
    }

    // React yüklenmesi kontrolü
    const reactLoaded = await this.page.evaluate(() => {
      return typeof window.React !== 'undefined'
    })
    
    await this.logResult('React yükleme', reactLoaded ? 'PASS' : 'FAIL')

    // Konsol hatalarını analiz et
    const criticalErrors = this.consoleErrors.filter(e => e.severity === 'high')
    const mediumErrors = this.consoleErrors.filter(e => e.severity === 'medium')
    const totalErrors = this.consoleErrors.length
    
    if (criticalErrors.length === 0) {
      await this.logResult('Kritik konsol hataları', 'PASS', `${totalErrors} toplam hata`, totalErrors)
    } else {
      await this.logResult('Kritik konsol hataları', 'FAIL', `${criticalErrors.length} kritik hata`, totalErrors)
    }

    // Network hatalarını kontrol et
    const networkErrorCount = this.networkErrors.length
    if (networkErrorCount === 0) {
      await this.logResult('Network hataları', 'PASS', 'Hiç network hatası yok')
    } else {
      await this.logResult('Network hataları', 'FAIL', `${networkErrorCount} network hatası`)
    }
  }

  async testFormDisplay() {
    console.log('\n📝 Test: Form görüntüleme Safari\'de')
    
    const errorCountBefore = this.consoleErrors.length
    
    // Form container kontrolü
    const formExists = await this.waitForElement('form, .dynamic-form, .dynamic-form.two-col', 15000)
    
    if (formExists) {
      await this.logResult('Form container', 'PASS', 'Form elementi bulundu')
      
      // Input alanları kontrolü
      const inputs = await this.page.$$('input')
      const selects = await this.page.$$('select')
      const textareas = await this.page.$$('textarea')
      
      const totalFields = inputs.length + selects.length + textareas.length
      await this.logResult('Form alanları', totalFields > 0 ? 'PASS' : 'FAIL', 
        `${totalFields} alan (${inputs.length} input, ${selects.length} select, ${textareas.length} textarea)`)
      
    } else {
      await this.logResult('Form container', 'FAIL', 'Form elementi bulunamadı')
    }
    
    const newErrors = this.consoleErrors.length - errorCountBefore
    await this.logResult('Form yükleme hataları', newErrors === 0 ? 'PASS' : 'FAIL', 
      `${newErrors} yeni konsol hatası`, newErrors)
  }

  async testFormFilling() {
    console.log('\n✏️ Test: Form doldurma Safari\'de')
    
    try {
      const errorCountBefore = this.consoleErrors.length

      // İsim alanı bulma - farklı selector'ları dene
      const nameSelectors = [
        'input[name="name"]',
        'input[placeholder*="isim"]',
        'input[placeholder*="İsim"]',
        'input[id*="name"]'
      ]
      
      let nameInput = null
      for (const selector of nameSelectors) {
        const element = await this.page.$(selector)
        if (element) {
          nameInput = element
          break
        }
      }

      if (nameInput) {
        await this.typeText(nameSelectors.find(async s => await this.page.$(s)), 'Safari Test Kullanıcısı')
        await this.logResult('İsim alanı doldurma', 'PASS', 'İsim girişi başarılı')
      } else {
        await this.logResult('İsim alanı doldurma', 'FAIL', 'İsim alanı bulunamadı')
      }

      // Email alanı
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[placeholder*="email"]'
      ]
      
      let emailInput = null
      for (const selector of emailSelectors) {
        const element = await this.page.$(selector)
        if (element) {
          emailInput = element
          break
        }
      }

      if (emailInput) {
        await this.typeText(emailSelectors.find(async s => await this.page.$(s)), 'safari-test@burkol.com')
        await this.logResult('Email alanı doldurma', 'PASS', 'Email girişi başarılı')
      } else {
        await this.logResult('Email alanı doldurma', 'FAIL', 'Email alanı bulunamadı')
      }

      const newErrors = this.consoleErrors.length - errorCountBefore
      await this.logResult('Form doldurma hataları', newErrors === 0 ? 'PASS' : 'FAIL', 
        `${newErrors} yeni konsol hatası`, newErrors)

    } catch (error) {
      await this.logResult('Form doldurma', 'FAIL', `Hata: ${error.message}`)
    }
  }

  async testLanguageChange() {
    console.log('\n🌍 Test: Dil değişimi Safari\'de')
    
    try {
      const errorCountBefore = this.consoleErrors.length

      // Dil seçici bulma
      const langSelect = await this.page.$('select')
      
      if (langSelect) {
        // Mevcut dil değerini al
        const currentValue = await langSelect.evaluate(el => el.value)
        
        // İngilizce'ye geç
        await this.page.selectOption('select', 'en')
        await this.page.waitForTimeout(2000)
        
        // Değişiklik kontrolü
        const newValue = await langSelect.evaluate(el => el.value)
        
        if (newValue === 'en') {
          await this.logResult('Dil seçimi', 'PASS', 'İngilizce seçildi')
          
          // Sayfa içeriği değişimi kontrolü
          const pageContent = await this.page.content()
          const hasEnglish = pageContent.includes('Submit') || pageContent.includes('English')
          
          await this.logResult('Dil çevirisi', hasEnglish ? 'PASS' : 'PARTIAL', 
            hasEnglish ? 'İngilizce metinler görülüyor' : 'Çeviri sınırlı')
          
        } else {
          await this.logResult('Dil seçimi', 'FAIL', 'Dil değişimi çalışmadı')
        }
      } else {
        await this.logResult('Dil seçimi', 'FAIL', 'Dil seçici bulunamadı')
      }

      const newErrors = this.consoleErrors.length - errorCountBefore
      await this.logResult('Dil değişimi hataları', newErrors === 0 ? 'PASS' : 'FAIL', 
        `${newErrors} yeni konsol hatası`, newErrors)

    } catch (error) {
      await this.logResult('Dil değişimi', 'FAIL', `Hata: ${error.message}`)
    }
  }

  async testPWAFeatures() {
    console.log('\n📱 Test: PWA özellikleri Safari\'de')
    
    // Service Worker kontrolü
    const swRegistered = await this.page.evaluate(() => {
      return 'serviceWorker' in navigator
    })
    
    await this.logResult('Service Worker desteği', swRegistered ? 'PASS' : 'FAIL')

    // Manifest kontrolü
    const manifestExists = await this.page.$('link[rel="manifest"]') !== null
    await this.logResult('PWA Manifest', manifestExists ? 'PASS' : 'FAIL')

    // Viewport meta kontrolü
    const viewportMeta = await this.page.$('meta[name="viewport"]') !== null
    await this.logResult('Responsive viewport', viewportMeta ? 'PASS' : 'FAIL')
  }

  // ADMIN TESTLERİ - Safari Özel
  async runAdminTests() {
    console.log('\n🔐 ADMIN TESTLERİ SAFARI\'DE BAŞLIYOR...')
    
    // Konsol hatalarını temizle
    this.consoleErrors = []
    this.networkErrors = []
    
    await this.page.goto(`${this.baseUrl}/panel-gizli.html`)
    await this.page.waitForTimeout(3000)
    
    // Admin sayfası yükleme ve hatalar
    await this.testAdminPageLoad()
    
    // Admin giriş testi
    await this.testAdminLogin()
    
    // Admin panel işlevleri
    await this.testAdminFunctionality()
  }

  async testAdminPageLoad() {
    console.log('\n🔍 Test: Admin sayfa yükleme Safari\'de')
    
    const errorCountBefore = this.consoleErrors.length
    
    // Sayfa başlığı
    const title = await this.page.title()
    await this.logResult('Admin sayfa başlığı', title.includes('Admin') ? 'PASS' : 'FAIL', title)

    // Login form kontrolü
    const emailInput = await this.page.$('input[type="email"], input[name="email"]')
    const passwordInput = await this.page.$('input[type="password"], input[name="password"]')
    const submitBtn = await this.page.$('button[type="submit"]')
    
    await this.logResult('Admin login form', 
      (emailInput && passwordInput && submitBtn) ? 'PASS' : 'FAIL',
      'Email, şifre ve submit buton kontrolü')

    const newErrors = this.consoleErrors.length - errorCountBefore
    await this.logResult('Admin sayfa yükleme hataları', newErrors === 0 ? 'PASS' : 'FAIL', 
      `${newErrors} yeni konsol hatası`, newErrors)
  }

  async testAdminLogin() {
    console.log('\n🔑 Test: Admin giriş Safari\'de')
    
    try {
      const errorCountBefore = this.consoleErrors.length

      // Login bilgileri girme
      await this.typeText('input[type="email"], input[name="email"]', 'umutyalcin8@gmail.com')
      await this.typeText('input[type="password"], input[name="password"]', 'burkol123')
      
      // Submit
      await this.clickElement('button[type="submit"]')
      
      // Login sonrası bekleme
      await this.page.waitForTimeout(5000)
      
      // Login başarı kontrolü
      const currentUrl = this.page.url()
      const pageContent = await this.page.content()
      
      const loginSuccess = pageContent.includes('Admin Panel') && !pageContent.includes('Şifre')
      
      if (loginSuccess) {
        await this.logResult('Admin login', 'PASS', 'Başarıyla giriş yapıldı')
      } else {
        await this.logResult('Admin login', 'FAIL', 'Giriş başarısız')
      }

      const newErrors = this.consoleErrors.length - errorCountBefore
      await this.logResult('Admin login hataları', newErrors === 0 ? 'PASS' : 'FAIL', 
        `${newErrors} yeni konsol hatası`, newErrors)

    } catch (error) {
      await this.logResult('Admin login', 'FAIL', `Hata: ${error.message}`)
    }
  }

  async testAdminFunctionality() {
    console.log('\n📊 Test: Admin panel işlevleri Safari\'de')
    
    try {
      const errorCountBefore = this.consoleErrors.length

      // Tablo kontrolü
      const tables = await this.page.$$('table')
      await this.logResult('Admin tabloları', tables.length > 0 ? 'PASS' : 'FAIL', 
        `${tables.length} tablo bulundu`)

      // Buton kontrolü
      const buttons = await this.page.$$('button')
      await this.logResult('Admin butonları', buttons.length > 0 ? 'PASS' : 'FAIL', 
        `${buttons.length} buton bulundu`)

      // Settings modal test
      const settingsBtn = await this.page.$('button:has-text("Ayarlar"), button[onclick*="settings"]')
      if (settingsBtn) {
        await settingsBtn.click()
        await this.page.waitForTimeout(2000)
        
        const modalExists = await this.page.$('.modal, [role="dialog"]') !== null
        await this.logResult('Settings modal', modalExists ? 'PASS' : 'FAIL')
        
        // Modal kapatma
        const closeBtn = await this.page.$('.modal .close, .modal button:has-text("Kapat")')
        if (closeBtn) {
          await closeBtn.click()
        }
      }

      const newErrors = this.consoleErrors.length - errorCountBefore
      await this.logResult('Admin işlevsellik hataları', newErrors === 0 ? 'PASS' : 'FAIL', 
        `${newErrors} yeni konsol hatası`, newErrors)

    } catch (error) {
      await this.logResult('Admin işlevsellik', 'FAIL', `Hata: ${error.message}`)
    }
  }

  async generateDetailedReport() {
    console.log('\n📊 DETAYLI TEST RAPORU GENERATİNG...')
    
    const totalTests = this.results.length
    const passedTests = this.results.filter(r => r.status === 'PASS').length
    const failedTests = this.results.filter(r => r.status === 'FAIL').length
    const partialTests = this.results.filter(r => r.status === 'PARTIAL').length
    
    // Hata analizi
    const criticalErrors = this.consoleErrors.filter(e => e.severity === 'high')
    const mediumErrors = this.consoleErrors.filter(e => e.severity === 'medium')
    const lowErrors = this.consoleErrors.filter(e => e.severity === 'low')
    
    const report = {
      summary: {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        partial: partialTests,
        successRate: ((passedTests + partialTests) / totalTests * 100).toFixed(2),
        duration: Date.now() - this.testStartTime,
        browser: 'Safari WebKit'
      },
      consoleAnalysis: {
        totalConsoleErrors: this.consoleErrors.length,
        criticalErrors: criticalErrors.length,
        mediumErrors: mediumErrors.length,
        lowErrors: lowErrors.length,
        errorDetails: this.consoleErrors
      },
      networkAnalysis: {
        totalNetworkErrors: this.networkErrors.length,
        errorDetails: this.networkErrors
      },
      results: this.results
    }

    // JSON rapor kaydet
    fs.writeFileSync('safari-test-results.json', JSON.stringify(report, null, 2))
    
    // Console rapor
    console.log('\n🦁 SAFARI TEST SONUÇLARI:')
    console.log(`📊 Toplam Test: ${totalTests}`)
    console.log(`✅ Başarılı: ${passedTests}`)
    console.log(`❌ Başarısız: ${failedTests}`)
    console.log(`⚠️ Kısmi: ${partialTests}`)
    console.log(`🎯 Başarı Oranı: %${report.summary.successRate}`)
    console.log(`⏱️ Test Süresi: ${report.summary.duration}ms`)
    
    console.log('\n🔍 KONSOL HATA ANALİZİ:')
    console.log(`💥 Toplam Konsol Hatası: ${this.consoleErrors.length}`)
    console.log(`🔴 Kritik: ${criticalErrors.length}`)
    console.log(`🟡 Orta: ${mediumErrors.length}`)
    console.log(`🟢 Düşük: ${lowErrors.length}`)
    
    if (criticalErrors.length > 0) {
      console.log('\n❗ KRİTİK HATALAR:')
      criticalErrors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error.message}`)
      })
    }
    
    console.log('\n🌐 NETWORK HATA ANALİZİ:')
    console.log(`📡 Toplam Network Hatası: ${this.networkErrors.length}`)
    
    if (this.networkErrors.length > 0) {
      console.log('\n📋 NETWORK HATALAR:')
      this.networkErrors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error.status} - ${error.url}`)
      })
    }
    
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
      
      const report = await this.generateDetailedReport()
      
      return report
      
    } catch (error) {
      console.error('❌ Safari test automation hatası:', error)
    } finally {
      await this.cleanup()
    }
  }
}

// Export for npm script usage
export default BurkolSafariTestRunner

// Direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new BurkolSafariTestRunner()
  runner.run()
}