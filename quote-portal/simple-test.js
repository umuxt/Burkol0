// Basit Test Runner - HTML element ve API testleri
import puppeteer from 'puppeteer'
import fs from 'fs'

class SimpleBurkolTest {
  constructor() {
    this.browser = null
    this.page = null
    this.results = []
    this.baseUrl = 'http://localhost:3001'
  }

  async init() {
    console.log('🚀 Burkol Simple Test başlatılıyor...')
    this.browser = await puppeteer.launch({ 
      headless: false,
      defaultViewport: { width: 1920, height: 1080 }
    })
    this.page = await this.browser.newPage()
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

  async testServerConnection() {
    console.log('\n🌐 Server Bağlantı Testleri:')
    
    try {
      // Ana sayfa testi
      const userResponse = await this.page.goto(`${this.baseUrl}/index.html`)
      this.log('User sayfası yükleme', userResponse.status() === 200 ? 'PASS' : 'FAIL', `Status: ${userResponse.status()}`)
      
      // Admin sayfa testi  
      const adminResponse = await this.page.goto(`${this.baseUrl}/quote-dashboard.html`)
      this.log('Admin sayfası yükleme', adminResponse.status() === 200 ? 'PASS' : 'FAIL', `Status: ${adminResponse.status()}`)
      
      // API health check
      const apiResponse = await this.page.evaluate(async () => {
        try {
          const response = await fetch('/api/quotes', {
            headers: { 'Authorization': 'Bearer invalid-token' }
          })
          return { status: response.status, ok: response.ok }
        } catch (error) {
          return { error: error.message }
        }
      })
      
      this.log('API erişimi', apiResponse.status === 401 ? 'PASS' : 'FAIL', `API yanıt: ${apiResponse.status}`)
      
    } catch (error) {
      this.log('Server bağlantı', 'FAIL', error.message)
    }
  }

  async testUserPage() {
    console.log('\n👤 User Sayfa Testleri:')
    
    await this.page.goto(`${this.baseUrl}/index.html`)
    
    // Sayfa yükleme bekle
    await this.page.waitForTimeout(3000)
    
    // Temel HTML elementleri
    const title = await this.page.title()
    this.log('Sayfa başlığı', title.includes('Burkol') ? 'PASS' : 'FAIL', title)
    
    // React root element
    const rootExists = await this.page.$('#root') !== null
    this.log('React root element', rootExists ? 'PASS' : 'FAIL')
    
    // Form elementleri (React yüklenme beklenmeden)
    await this.page.waitForTimeout(5000) // React load bekle
    
    const inputs = await this.page.$$('input')
    this.log('Input alanları', inputs.length > 0 ? 'PASS' : 'FAIL', `${inputs.length} input bulundu`)
    
    const selects = await this.page.$$('select')
    this.log('Select alanları', selects.length > 0 ? 'PASS' : 'FAIL', `${selects.length} select bulundu`)
    
    // Dil seçici test
    if (selects.length > 0) {
      try {
        await this.page.select('select', 'en')
        await this.page.waitForTimeout(1000)
        this.log('Dil değişimi', 'PASS', 'İngilizce seçildi')
      } catch (error) {
        this.log('Dil değişimi', 'FAIL', error.message)
      }
    }
  }

  async testAdminPage() {
    console.log('\n🔐 Admin Sayfa Testleri:')
    
    await this.page.goto(`${this.baseUrl}/quote-dashboard.html`)
    await this.page.waitForTimeout(3000)
    
    // Login form test
    const emailInput = await this.page.$('input[type="email"], input[name="email"]')
    const passwordInput = await this.page.$('input[type="password"], input[name="password"]')
    
    this.log('Login form', (emailInput && passwordInput) ? 'PASS' : 'FAIL')
    
    if (emailInput && passwordInput) {
      // Login deneme
      await this.page.type('input[type="email"], input[name="email"]', 'umutyalcin8@gmail.com')
      await this.page.type('input[type="password"], input[name="password"]', 'burkol123')
      
      const submitBtn = await this.page.$('button[type="submit"]')
      if (submitBtn) {
        await submitBtn.click()
        await this.page.waitForTimeout(3000)
        
        // Login sonrası kontrol
        const currentUrl = this.page.url()
        const pageContent = await this.page.content()
        
        if (pageContent.includes('Admin') && !pageContent.includes('Login')) {
          this.log('Admin login', 'PASS', 'Başarıyla giriş yapıldı')
          
          // Admin panel elementi kontrolü
          const tables = await this.page.$$('table')
          this.log('Admin tablo', tables.length > 0 ? 'PASS' : 'FAIL', `${tables.length} tablo bulundu`)
          
          const buttons = await this.page.$$('button')
          this.log('Admin butonları', buttons.length > 0 ? 'PASS' : 'FAIL', `${buttons.length} buton bulundu`)
          
        } else {
          this.log('Admin login', 'FAIL', 'Giriş başarısız')
        }
      }
    }
  }

  async testAPIEndpoints() {
    console.log('\n📡 API Endpoint Testleri:')
    
    // Login API test
    const loginResult = await this.page.evaluate(async () => {
      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'umutyalcin8@gmail.com',
            password: 'burkol123'
          })
        })
        
        const data = await response.json()
        return { status: response.status, success: response.ok, data }
      } catch (error) {
        return { error: error.message }
      }
    })
    
    this.log('Login API', loginResult.success ? 'PASS' : 'FAIL', `Status: ${loginResult.status}`)
    
    if (loginResult.success && loginResult.data.token) {
      // Authenticated API test
      const quotesResult = await this.page.evaluate(async (token) => {
        try {
          const response = await fetch('/api/quotes', {
            headers: { 'Authorization': `Bearer ${token}` }
          })
          
          const data = await response.json()
          return { status: response.status, success: response.ok, count: Array.isArray(data) ? data.length : 0 }
        } catch (error) {
          return { error: error.message }
        }
      }, loginResult.data.token)
      
      this.log('Quotes API', quotesResult.success ? 'PASS' : 'FAIL', `${quotesResult.count} teklif bulundu`)
    }
  }

  async generateReport() {
    const total = this.results.length
    const passed = this.results.filter(r => r.status === 'PASS').length
    const failed = this.results.filter(r => r.status === 'FAIL').length
    
    console.log('\n📊 TEST SONUÇLARI:')
    console.log(`📋 Toplam: ${total}`)
    console.log(`✅ Başarılı: ${passed}`)
    console.log(`❌ Başarısız: ${failed}`)
    console.log(`🎯 Başarı Oranı: %${(passed/total*100).toFixed(1)}`)
    
    // Detaylı rapor
    console.log('\n📝 Detaylı Sonuçlar:')
    this.results.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : '❌'
      console.log(`  ${icon} ${result.test}${result.detail ? ` - ${result.detail}` : ''}`)
    })
    
    // JSON kaydet
    fs.writeFileSync('simple-test-results.json', JSON.stringify({
      summary: { total, passed, failed, successRate: passed/total*100 },
      results: this.results
    }, null, 2))
    
    return { total, passed, failed }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close()
    }
  }

  async run() {
    try {
      await this.init()
      
      await this.testServerConnection()
      await this.testUserPage()
      await this.testAdminPage()
      await this.testAPIEndpoints()
      
      return await this.generateReport()
      
    } catch (error) {
      console.error('❌ Test hatası:', error)
    } finally {
      await this.cleanup()
    }
  }
}

// Çalıştır
const tester = new SimpleBurkolTest()
tester.run()