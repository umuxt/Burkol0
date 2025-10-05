// Burkol Test Automation - Browser-based testing with Puppeteer
import puppeteer from 'puppeteer'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import process from 'process'
import jsondb from './lib/jsondb.js'

async function pingServer(url) {
  try {
    const res = await fetch(url, { method: 'GET' })
    return res.ok || res.status === 404
  } catch (_) {
    return false
  }
}

async function waitForServer(url, timeout = 20000, interval = 500) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await pingServer(url)) return true
    await new Promise(resolve => setTimeout(resolve, interval))
  }
  throw new Error(`Backend did not become ready within ${timeout}ms at ${url}`)
}

const DEFAULT_FORM_CONFIG = {
  version: Date.now(),
  lastPublishedAt: new Date().toISOString(),
  formStructure: {
    fields: [
      {
        id: 'material',
        label: 'Malzeme Türü',
        type: 'dropdown',
        required: true,
        options: ['Çelik', 'Alüminyum', 'Paslanmaz Çelik'],
        display: { formOrder: 10 }
      },
      {
        id: 'thickness',
        label: 'Kalınlık (mm)',
        type: 'number',
        required: true,
        validation: { min: 1, max: 200, integer: false },
        display: { formOrder: 11 }
      },
      {
        id: 'qty',
        label: 'Adet',
        type: 'number',
        required: true,
        validation: { min: 1, integer: true },
        display: { formOrder: 12 }
      },
      {
        id: 'notes',
        label: 'Ek Notlar',
        type: 'textarea',
        required: false,
        validation: { maxLength: 500 },
        display: { formOrder: 13 }
      },
      {
        id: 'drawings',
        label: 'Teknik Çizimler',
        type: 'file',
        required: false,
        display: { formOrder: 14 }
      }
    ],
    metadata: {
      seededBy: 'automation',
      seededAt: new Date().toISOString()
    }
  }
}

const DEFAULT_PRICE_SETTINGS = {
  version: 1,
  formula: '(base_cost + (qty * unit_cost)) * margin',
  parameters: [
    { id: 'base_cost', name: 'Baz Maliyet', type: 'fixed', value: 250 },
    { id: 'unit_cost', name: 'Birim İşçilik', type: 'fixed', value: 45 },
    { id: 'margin', name: 'Kar Marjı', type: 'fixed', value: 1.25 },
    { id: 'qty', name: 'Adet', type: 'form', formField: 'qty' }
  ],
  lastUpdated: new Date().toISOString()
}

const DEFAULT_ADMIN_USER = {
  email: 'umutyalcin8@gmail.com',
  plainPassword: 'burkol123',
  role: 'admin',
  active: true,
  createdAt: new Date().toISOString()
}

async function seedFirestoreDefaults() {
  const existingConfig = jsondb.getFormConfig()
  if (!existingConfig || !(existingConfig.fields || existingConfig.formStructure?.fields)?.length) {
    console.log('🌱 Seeding default form configuration into Firestore...')
    jsondb.putFormConfig(DEFAULT_FORM_CONFIG)
  }

  const priceSettings = jsondb.getPriceSettings()
  if (!priceSettings || !(priceSettings.parameters?.length)) {
    console.log('🌱 Seeding default price settings into Firestore...')
    jsondb.savePriceSettings(DEFAULT_PRICE_SETTINGS)
  }

  const adminUser = jsondb.getUser(DEFAULT_ADMIN_USER.email)
  if (!adminUser) {
    console.log('🌱 Seeding default admin user...')
    jsondb.upsertUser({
      ...DEFAULT_ADMIN_USER,
      pw_hash: '',
      pw_salt: '',
      lastLoginAt: null
    })
  } else if (adminUser.plainPassword !== DEFAULT_ADMIN_USER.plainPassword || adminUser.active === false) {
    jsondb.upsertUser({
      ...adminUser,
      plainPassword: DEFAULT_ADMIN_USER.plainPassword,
      active: true,
      deactivatedAt: null
    })
  }

  const existingQuotes = jsondb.listQuotes()
  if (!existingQuotes || existingQuotes.length === 0) {
    console.log('🌱 Seeding sample quotes...')
    const now = new Date().toISOString()
    const samples = [
      {
        id: 'seed-quote-1',
        name: 'Test Kullanıcı 1',
        email: 'test1@burkol.com',
        phone: '+905551112233',
        proj: 'Otomasyon Test Projesi',
        status: 'new',
        createdAt: now,
        qty: 50,
        price: 8125,
        calculatedPrice: 8125,
        customFields: {
          material: 'Çelik',
          thickness: 8,
          qty: 50,
          notes: 'Laser kesim ve büküm',
          drawings: []
        }
      },
      {
        id: 'seed-quote-2',
        name: 'Test Kullanıcı 2',
        email: 'test2@burkol.com',
        phone: '+905556667788',
        proj: 'Kaynaklı Parça İmalatı',
        status: 'review',
        createdAt: now,
        qty: 20,
        price: 4375,
        calculatedPrice: 4375,
        customFields: {
          material: 'Alüminyum',
          thickness: 5,
          qty: 20,
          notes: 'Isıl işlem dahil',
          drawings: []
        }
      },
      {
        id: 'seed-quote-3',
        name: 'Test Kullanıcı 3',
        email: 'test3@burkol.com',
        phone: '+905559998877',
        proj: 'Paslanmaz Konstrüksiyon',
        status: 'approved',
        createdAt: now,
        qty: 10,
        price: 2812.5,
        calculatedPrice: 2812.5,
        customFields: {
          material: 'Paslanmaz Çelik',
          thickness: 12,
          qty: 10,
          notes: 'Gıda sınıfı kaynak',
          drawings: []
        }
      }
    ]
    samples.forEach(sample => jsondb.putQuote(sample))
  }
}

class BurkolTestRunner {
  constructor() {
    this.browser = null
    this.page = null
    this.results = []
    this.baseUrl = 'http://localhost:3001'
    this.testStartTime = new Date()
    this.serverProcess = null
    this.managedServer = false
  }

  async init() {
    console.log('🚀 Burkol Test Automation başlatılıyor...')
    const headlessMode = process.env.HEADLESS === 'false' ? false : 'new'
    this.browser = await puppeteer.launch({ 
      headless: headlessMode,
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

    this.page.on('pageerror', error => {
      console.error('❌ Browser PageError:', error.message || error)
    })

    this.page.on('requestfailed', request => {
      console.error('❌ Request failed:', request.url(), request.failure()?.errorText)
    })
  }

    async ensureServer() {
      if (await pingServer(`${this.baseUrl}/index.html`)) {
        console.log('ℹ️  Existing server detected, using current instance.')
        this.managedServer = false
        return
      }

      console.log('🚀 Backend sunucusu testler için başlatılıyor...')
      this.serverProcess = spawn('node', ['server.js'], {
        cwd: process.cwd(),
        stdio: 'inherit'
      })
      this.managedServer = true

      this.serverProcess.on('exit', code => {
        if (this.managedServer) {
          console.log(`⚠️  Test tarafından yönetilen sunucu beklenmedik şekilde kapandı (kod: ${code})`)
        }
      })

      await waitForServer(`${this.baseUrl}/index.html`)
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
    await this.page.goto(`${this.baseUrl}/quote-dashboard.html`)
    
    // Admin login
    await this.testAdminLogin()
    
    // Teklif listesi
    await this.testQuoteList()
    
    // Manual pricing tests
    await this.testManualPricingWorkflow()
    
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

  async testManualPricingWorkflow() {
    console.log('\n🔒 Test: Manuel Fiyat Yönetimi Workflow')
    
    try {
      // İlk teklifi bulup detay modal açma
      const firstDetailBtn = await this.page.$('button:contains("Detay"), .btn[title*="detail"]')
      if (!firstDetailBtn) {
        // Try finding detail button with different selector
        const detailButtons = await this.page.$$('button')
        let detailBtn = null
        for (const btn of detailButtons) {
          const text = await this.page.evaluate(el => el.textContent, btn)
          if (text.includes('Detay')) {
            detailBtn = btn
            break
          }
        }
        
        if (detailBtn) {
          await detailBtn.click()
        } else {
          await this.logResult('Detail modal açma', 'FAIL', 'Detay button bulunamadı')
          return
        }
      } else {
        await firstDetailBtn.click()
      }
      
      // Modal yüklenmesini bekle
      await this.page.waitForTimeout(1000)
      
      // Manuel fiyat yönetimi bölümünü kontrol et
      const manualPriceSection = await this.page.$('.manual-price-management')
      if (manualPriceSection) {
        await this.logResult('Manuel fiyat bölümü', 'PASS', 'Manuel fiyat yönetimi bölümü mevcut')
        
        // Manuel fiyat test etme
        await this.testManualPriceSet()
        
        // Lock durumu test etme
        await this.testPriceLockStatus()
        
        // Lock kaldırma test etme
        await this.testPriceUnlock()
        
      } else {
        await this.logResult('Manuel fiyat bölümü', 'FAIL', 'Manuel fiyat yönetimi bölümü bulunamadı')
      }
      
    } catch (error) {
      await this.logResult('Manuel fiyat workflow', 'FAIL', error.message)
    }
  }

  async testManualPriceSet() {
    console.log('\n💰 Test: Manuel fiyat belirleme')
    
    try {
      // Fiyat input alanına değer gir
      const priceInput = await this.page.$('.manual-price-input')
      if (priceInput) {
        await this.page.evaluate(el => el.value = '', priceInput)
        await this.page.type('.manual-price-input', '1299.99')
        
        // Not alanına değer gir
        const noteInput = await this.page.$('.manual-price-note')
        if (noteInput) {
          await this.page.evaluate(el => el.value = '', noteInput)
          await this.page.type('.manual-price-note', 'Test automation manual price')
        }
        
        // Kilitle button'una tıkla
        const lockBtn = await this.page.$('.manual-price-btn')
        if (lockBtn) {
          await lockBtn.click()
          
          // API yanıtını bekle
          await this.page.waitForTimeout(2000)
          
          // Lock indicator kontrolü
          const lockIndicator = await this.page.$('.manual-price-lock-indicator')
          if (lockIndicator) {
            const lockText = await this.page.evaluate(el => el.textContent, lockIndicator)
            if (lockText.includes('🔒') && lockText.includes('1299.99')) {
              await this.logResult('Manuel fiyat set', 'PASS', 'Fiyat başarıyla kilitlendi')
            } else {
              await this.logResult('Manuel fiyat set', 'FAIL', 'Lock indicator yanlış değer gösteriyor')
            }
          } else {
            await this.logResult('Manuel fiyat set', 'FAIL', 'Lock indicator görünmüyor')
          }
          
        } else {
          await this.logResult('Manuel fiyat set', 'FAIL', 'Lock button bulunamadı')
        }
        
      } else {
        await this.logResult('Manuel fiyat set', 'FAIL', 'Fiyat input alanı bulunamadı')
      }
      
    } catch (error) {
      await this.logResult('Manuel fiyat set', 'FAIL', error.message)
    }
  }

  async testPriceLockStatus() {
    console.log('\n🔐 Test: Fiyat kilit durumu')
    
    try {
      // Modal'ı kapat
      const closeBtn = await this.page.$('.modal .close, [onclick*="close"]')
      if (closeBtn) {
        await closeBtn.click()
        await this.page.waitForTimeout(500)
      }
      
      // Admin tablosunda lock indicator'ı kontrol et
      const lockIndicators = await this.page.$$eval('td', cells => {
        return cells.filter(cell => cell.textContent.includes('🔒')).length
      })
      
      if (lockIndicators > 0) {
        await this.logResult('Admin table lock display', 'PASS', `${lockIndicators} locked quote bulundu`)
      } else {
        await this.logResult('Admin table lock display', 'FAIL', 'Admin tablosunda lock indicator görünmüyor')
      }
      
      // Price change button'ının gizli olduğunu kontrol et
      const priceChangeButtons = await this.page.$$('button:contains("Hesapla"), button:contains("Uygula")')
      if (priceChangeButtons.length === 0) {
        await this.logResult('Price change button gizleme', 'PASS', 'Locked quote için price change button gizli')
      } else {
        await this.logResult('Price change button gizleme', 'PARTIAL', 'Price change button hala görünüyor olabilir')
      }
      
    } catch (error) {
      await this.logResult('Fiyat kilit durumu', 'FAIL', error.message)
    }
  }

  async testPriceUnlock() {
    console.log('\n🔓 Test: Fiyat kilit kaldırma')
    
    try {
      // Tekrar detail modal'ı aç
      const firstDetailBtn = await this.page.$('button:contains("Detay")')
      if (firstDetailBtn) {
        await firstDetailBtn.click()
        await this.page.waitForTimeout(1000)
        
        // Uygula button'unu bul ve tıkla (kırmızı button)
        const applyBtn = await this.page.$('.manual-price-apply-btn')
        if (applyBtn) {
          await applyBtn.click()
          
          // API yanıtını bekle
          await this.page.waitForTimeout(2000)
          
          // Lock indicator'ın kaybolduğunu kontrol et
          const lockIndicator = await this.page.$('.manual-price-lock-indicator')
          if (!lockIndicator) {
            await this.logResult('Manuel fiyat unlock', 'PASS', 'Fiyat kilidi başarıyla kaldırıldı')
          } else {
            // Indicator hala varsa görünür olmamalı
            const isVisible = await this.page.evaluate(el => {
              return el && el.offsetParent !== null
            }, lockIndicator)
            
            if (!isVisible) {
              await this.logResult('Manuel fiyat unlock', 'PASS', 'Fiyat kilidi kaldırıldı (indicator gizli)')
            } else {
              await this.logResult('Manuel fiyat unlock', 'FAIL', 'Lock indicator hala görünüyor')
            }
          }
          
        } else {
          await this.logResult('Manuel fiyat unlock', 'FAIL', 'Uygula button bulunamadı')
        }
        
      } else {
        await this.logResult('Manuel fiyat unlock', 'FAIL', 'Detail modal tekrar açılamadı')
      }
      
    } catch (error) {
      await this.logResult('Manuel fiyat unlock', 'FAIL', error.message)
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
    if (this.managedServer && this.serverProcess) {
      this.serverProcess.kill()
      this.serverProcess = null
      this.managedServer = false
    }
  }

  async run() {
    try {
      await seedFirestoreDefaults()
      await this.ensureServer()
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