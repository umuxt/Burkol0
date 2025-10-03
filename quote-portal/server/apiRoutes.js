// Server API Routes - Express route handlers organized by functionality
import jsondb from '../src/lib/jsondb.js'
import { requireAuth } from './auth.js'
import { persistFilesForQuote } from './fileHandler.js'
import { calculatePriceServer } from './priceCalculator.js'

// Phase 1: Helper functions for unified price calculation
function createCalculationBreakdown(quote, priceSettings, finalPrice) {
  const breakdown = {
    finalPrice: parseFloat(finalPrice) || 0,
    formula: priceSettings.formula || '',
    parameters: {},
    steps: [],
    errors: []
  }

  try {
    // Extract parameter values used in calculation
    priceSettings.parameters?.forEach(param => {
      if (!param || !param.id) return

      let value = 0
      let source = 'unknown'

      if (param.type === 'fixed') {
        value = parseFloat(param.value) || 0
        source = 'fixed-value'
      } else if (param.type === 'form') {
        if (param.formField === 'qty') {
          value = parseFloat(quote.qty) || 0
          source = 'quote.qty'
        } else if (param.formField === 'thickness') {
          value = parseFloat(quote.thickness) || 0
          source = 'quote.thickness'
        } else if (param.formField === 'dimensions') {
          const l = parseFloat(quote.dimsL)
          const w = parseFloat(quote.dimsW)
          if (!isNaN(l) && !isNaN(w)) {
            value = l * w
            source = 'quote.dimsL * quote.dimsW'
          } else {
            const dims = quote.dims || ''
            const match = String(dims).match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i)
            if (match) {
              value = (parseFloat(match[1]) || 0) * (parseFloat(match[2]) || 0)
              source = 'quote.dims parsed'
            }
          }
        } else {
          // Custom form field
          let fieldValue = quote[param.formField]
          if (fieldValue === undefined && quote.customFields) {
            fieldValue = quote.customFields[param.formField]
          }
          
          if (param.lookupTable && Array.isArray(param.lookupTable)) {
            if (Array.isArray(fieldValue)) {
              value = fieldValue.reduce((sum, opt) => {
                const found = param.lookupTable.find(item => item.option === opt)
                return sum + (found ? (parseFloat(found.value) || 0) : 0)
              }, 0)
              source = 'lookup-table-array'
            } else {
              const lookupItem = param.lookupTable.find(item => item.option === fieldValue)
              value = lookupItem ? parseFloat(lookupItem.value) || 0 : 0
              source = 'lookup-table-single'
            }
          } else {
            value = parseFloat(fieldValue) || 0
            source = 'direct-form-value'
          }
        }
      }

      breakdown.parameters[param.id] = {
        name: param.name || param.id,
        type: param.type,
        value: value,
        source: source,
        formField: param.formField || null
      }
    })

    // Formula replacement simulation
    let formula = priceSettings.formula || ''
    const originalFormula = formula

    Object.keys(breakdown.parameters).forEach(paramId => {
      const paramValue = breakdown.parameters[paramId].value
      formula = formula.replace(new RegExp(`\\b${paramId}\\b`, 'g'), paramValue)
    })

    breakdown.steps = [
      { step: 'original-formula', value: originalFormula },
      { step: 'parameters-replaced', value: formula },
      { step: 'evaluated-result', value: finalPrice }
    ]

  } catch (error) {
    breakdown.errors.push(`Breakdown creation failed: ${error.message}`)
  }

  return breakdown
}

function extractUsedParameters(quote, priceSettings) {
  const usedParams = {}
  
  try {
    priceSettings.parameters?.forEach(param => {
      if (!param || !param.id) return
      
      usedParams[param.id] = {
        name: param.name || param.id,
        type: param.type,
        formField: param.formField || null,
        hasLookupTable: !!(param.lookupTable && param.lookupTable.length > 0)
      }
    })
  } catch (error) {
    console.error('Parameter extraction error:', error)
  }

  return usedParams
}

// --- Data Access Helpers powered by jsondb ---
export function readAll() {
  return jsondb.listQuotes()
}

export function readOne(id) {
  return jsondb.getQuote(id)
}

export function insert(obj) {
  return jsondb.putQuote(obj)
}

export function update(id, patch) {
  const success = jsondb.patchQuote(id, patch)
  return success ? jsondb.getQuote(id) : null
}

export function remove(id) {
  return jsondb.removeQuote(id)
}

export function updateOne(id, patch) {
  // Filter out undefined values recursively to prevent Firestore errors
  const cleanedPatch = filterUndefinedValues(patch)
  const success = jsondb.patchQuote(id, cleanedPatch)
  return success ? jsondb.getQuote(id) : null
}

// Helper function to recursively filter undefined values
function filterUndefinedValues(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj === undefined ? null : obj
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => filterUndefinedValues(item)).filter(item => item !== undefined)
  }
  
  const cleaned = {}
  Object.keys(obj).forEach(key => {
    const value = obj[key]
    if (value !== undefined) {
      if (value === null) {
        cleaned[key] = null
      } else if (typeof value === 'object') {
        const cleanedValue = filterUndefinedValues(value)
        if (cleanedValue !== undefined) {
          cleaned[key] = cleanedValue
        }
      } else {
        cleaned[key] = value
      }
    }
  })
  
  return cleaned
}

// Helper function to create a quote snapshot for history tracking
function createQuoteSnapshot(quote) {
  const snapshot = {
    // Core quote fields - only include if they exist
    name: quote.name || '',
    company: quote.company || '',
    proj: quote.proj || '',
    email: quote.email || '',
    phone: quote.phone || ''
  }
  
  // Legacy static fields - only add if they exist
  const staticFields = ['qty', 'thickness', 'material', 'process', 'finish', 'dims']
  staticFields.forEach(field => {
    if (quote[field] !== undefined) {
      snapshot[field] = quote[field]
    }
  })
  
  // Custom fields - only add if they exist and have values
  if (quote.customFields && typeof quote.customFields === 'object') {
    const cleanCustomFields = {}
    Object.keys(quote.customFields).forEach(key => {
      const value = quote.customFields[key]
      if (value !== undefined) {
        cleanCustomFields[key] = value
      }
    })
    
    if (Object.keys(cleanCustomFields).length > 0) {
      snapshot.customFields = cleanCustomFields
    }
  }
  
  return filterUndefinedValues(snapshot)
}

export function deleteOne(id) {
  return jsondb.delete(id)
}

// Input validation and sanitization
export function sanitizeInput(input) {
  if (typeof input === 'string') {
    return input.trim().replace(/<script[^>]*>.*?<\/script>/gi, '')
  }
  return input
}

export function validateQuoteData(q) {
  const errors = []
  
  if (!q.name || q.name.trim().length < 2) {
    errors.push('İsim en az 2 karakter olmalıdır')
  }
  
  if (!q.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.email)) {
    errors.push('Geçerli bir email adresi giriniz')
  }
  
  if (!q.phone || q.phone.length < 10) {
    errors.push('Geçerli bir telefon numarası giriniz')
  }
  
  if (!q.proj || q.proj.trim().length < 2) {
    errors.push('Proje adı en az 2 karakter olmalıdır')
  }
  
  return errors
}

// Dynamic validation based on form configuration
export function validateQuoteDataDynamic(q, formConfig) {
  const errors = []
  
  if (!formConfig || !formConfig.fields) {
    // Fallback to static validation if no form config
    return validateQuoteData(q)
  }
  
  formConfig.fields.forEach(field => {
    const fieldValue = q[field.id] || (q.customFields && q.customFields[field.id])
    
    // Check required fields
    if (field.required && (!fieldValue || (typeof fieldValue === 'string' && fieldValue.trim().length === 0))) {
      errors.push(`${field.label} alanı zorunludur`)
      return
    }
    
    // Skip validation if field is empty and not required
    if (!fieldValue) return
    
    // Type-specific validation
    switch (field.type) {
      case 'email':
        // Enhanced email validation
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
        if (!emailRegex.test(fieldValue)) {
          errors.push(`${field.label} geçerli bir email adresi olmalıdır`)
        }
        
        // Domain validation if specified
        if (field.validation?.allowedDomains && field.validation.allowedDomains.length > 0) {
          const domain = fieldValue.split('@')[1]
          if (!field.validation.allowedDomains.includes(domain)) {
            errors.push(`${field.label} sadece şu domainler kabul edilir: ${field.validation.allowedDomains.join(', ')}`)
          }
        }
        break
        
      case 'phone':
        // Enhanced Turkish phone number validation
        const cleanPhone = fieldValue.replace(/[\s\-\(\)]/g, '')
        const phonePatterns = [
          /^(\+90|90)?[5][0-9]{9}$/, // Turkish mobile
          /^(\+90|90|0)?[2-4][0-9]{9}$/, // Turkish landline
        ]
        
        const isValidPhone = phonePatterns.some(pattern => pattern.test(cleanPhone))
        if (!isValidPhone) {
          errors.push(`${field.label} geçerli bir telefon numarası olmalıdır`)
        }
        break
        
      case 'number':
        const num = parseFloat(fieldValue)
        if (isNaN(num)) {
          errors.push(`${field.label} geçerli bir sayı olmalıdır`)
        } else if (field.validation) {
          if (field.validation.min !== undefined && num < field.validation.min) {
            errors.push(`${field.label} en az ${field.validation.min} olmalıdır`)
          }
          if (field.validation.max !== undefined && num > field.validation.max) {
            errors.push(`${field.label} en fazla ${field.validation.max} olmalıdır`)
          }
          if (field.validation.integer && !Number.isInteger(num)) {
            errors.push(`${field.label} tam sayı olmalıdır`)
          }
          if (field.validation.positive && num <= 0) {
            errors.push(`${field.label} pozitif bir sayı olmalıdır`)
          }
        }
        break
        
      case 'text':
        if (typeof fieldValue === 'string') {
          if (field.validation) {
            if (field.validation.minLength !== undefined && fieldValue.length < field.validation.minLength) {
              errors.push(`${field.label} en az ${field.validation.minLength} karakter olmalıdır`)
            }
            if (field.validation.maxLength !== undefined && fieldValue.length > field.validation.maxLength) {
              errors.push(`${field.label} en fazla ${field.validation.maxLength} karakter olmalıdır`)
            }
            if (field.validation.onlyLetters && !/^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]+$/.test(fieldValue)) {
              errors.push(`${field.label} sadece harf içerebilir`)
            }
            if (field.validation.noNumbers && /\d/.test(fieldValue)) {
              errors.push(`${field.label} sayı içeremez`)
            }
            if (field.validation.alphanumeric && !/^[a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s]+$/.test(fieldValue)) {
              errors.push(`${field.label} sadece harf ve sayı içerebilir`)
            }
            if (field.validation.pattern) {
              const regex = new RegExp(field.validation.pattern)
              if (!regex.test(fieldValue)) {
                errors.push(field.validation.patternMessage || `${field.label} geçersiz format`)
              }
            }
          }
        }
        break
        
      case 'textarea':
        if (typeof fieldValue === 'string') {
          if (field.validation) {
            if (field.validation.minLength !== undefined && fieldValue.length < field.validation.minLength) {
              errors.push(`${field.label} en az ${field.validation.minLength} karakter olmalıdır`)
            }
            if (field.validation.maxLength !== undefined && fieldValue.length > field.validation.maxLength) {
              errors.push(`${field.label} en fazla ${field.validation.maxLength} karakter olmalıdır`)
            }
            if (field.validation.minWords) {
              const wordCount = fieldValue.trim().split(/\s+/).length
              if (wordCount < field.validation.minWords) {
                errors.push(`${field.label} en az ${field.validation.minWords} kelime içermelidir`)
              }
            }
            if (field.validation.maxWords) {
              const wordCount = fieldValue.trim().split(/\s+/).length
              if (wordCount > field.validation.maxWords) {
                errors.push(`${field.label} en fazla ${field.validation.maxWords} kelime içerebilir`)
              }
            }
          }
        }
        break
        
      case 'date':
        const dateValue = new Date(fieldValue)
        if (isNaN(dateValue.getTime())) {
          errors.push(`${field.label} geçerli bir tarih olmalıdır`)
        } else if (field.validation) {
          if (field.validation.futureOnly && dateValue <= new Date()) {
            errors.push(`${field.label} gelecekteki bir tarih olmalıdır`)
          }
          if (field.validation.pastOnly && dateValue >= new Date()) {
            errors.push(`${field.label} geçmişteki bir tarih olmalıdır`)
          }
          if (field.validation.minDate && dateValue < new Date(field.validation.minDate)) {
            errors.push(`${field.label} en erken ${field.validation.minDate} tarihi olmalıdır`)
          }
          if (field.validation.maxDate && dateValue > new Date(field.validation.maxDate)) {
            errors.push(`${field.label} en geç ${field.validation.maxDate} tarihi olmalıdır`)
          }
        }
        break
        
      case 'dropdown':
      case 'radio':
        if (field.options && !field.options.includes(fieldValue)) {
          errors.push(`${field.label} geçerli bir seçenek olmalıdır`)
        }
        break
        
      case 'multiselect':
      case 'checkbox':
        if (Array.isArray(fieldValue) && field.validation) {
          if (field.validation.minSelections && fieldValue.length < field.validation.minSelections) {
            errors.push(`${field.label} en az ${field.validation.minSelections} seçenek içermelidir`)
          }
          if (field.validation.maxSelections && fieldValue.length > field.validation.maxSelections) {
            errors.push(`${field.label} en fazla ${field.validation.maxSelections} seçenek içerebilir`)
          }
        }
        break
    }
  })
  
  return errors
}

// Quote API routes
export function setupQuoteRoutes(app, uploadsDir) {
  // Get all quotes (admin only, but allow in development)
  app.get('/api/quotes', (req, res, next) => {
    // In development mode, bypass authentication
    if (process.env.NODE_ENV === 'development') {
      req.user = { email: 'dev@burkol.com', role: 'admin' };
      next();
    } else {
      requireAuth(req, res, next);
    }
  }, (req, res) => {
    try {
      console.log('🔧 DEBUG: GET /api/quotes called');
      const quotes = jsondb.listQuotes();
      console.log('🔧 DEBUG: Returning', quotes.length, 'quotes');
      return res.json(quotes);
    } catch (error) {
      console.error('Error fetching quotes:', error);
      res.status(500).json({ error: 'Failed to fetch quotes' });
    }
  })

  // Create new quote
  app.post('/api/quotes', async (req, res) => {
    console.log('🔧 DEBUG: POST /api/quotes called')
    console.log('🔧 DEBUG: Request body:', JSON.stringify(req.body, null, 2))
    
    const q = req.body
    
    try {
    // Get current form configuration for dynamic validation
    const formConfig = jsondb.getFormConfig()
      
      // Use dynamic validation if form config is available
      const validationErrors = formConfig ? 
        validateQuoteDataDynamic(q, formConfig) : 
        validateQuoteData(q)
        
      if (validationErrors.length > 0) {
        return res.status(400).json({ error: 'Validation failed', details: validationErrors })
      }

      // Sanitize input for both direct fields and customFields
      Object.keys(q).forEach(key => {
        if (typeof q[key] === 'string') {
          q[key] = sanitizeInput(q[key])
        }
      })
      
      // Sanitize customFields if present
      if (q.customFields && typeof q.customFields === 'object') {
        Object.keys(q.customFields).forEach(key => {
          if (typeof q.customFields[key] === 'string') {
            q.customFields[key] = sanitizeInput(q.customFields[key])
          }
        })
      }

      // Set defaults - ID will be auto-generated by putQuote function
      q.createdAt = new Date().toISOString()
      q.status = 'new'
      
      // Track form version for price recalculation purposes
      if (formConfig) {
        q.formVersion = formConfig.version
        q.formStructureSnapshot = formConfig.formStructure
      }

      // Handle file uploads if present
      if (q.files && Array.isArray(q.files)) {
        q.uploadedFiles = await persistFilesForQuote(q.id, q.files, uploadsDir)
        delete q.files // Remove data URLs after persistence
      }

      // Calculate initial price if settings available
      try {
        const priceSettings = jsondb.getPriceSettings()
        if (priceSettings) {
          q.calculatedPrice = calculatePriceServer(q, priceSettings)
          q.price = q.calculatedPrice
          
          // Initialize price history with original state
          q.priceHistory = [{
            timestamp: q.createdAt,
            price: q.price,
            calculatedPrice: q.calculatedPrice,
            priceSettings: JSON.parse(JSON.stringify(priceSettings)), // Deep copy
            quoteSnapshot: createQuoteSnapshot(q),
            changeReason: 'İlk kayıt oluşturuldu'
          }]
        }
      } catch (priceError) {
        console.error('Price calculation failed:', priceError)
      }

      const result = jsondb.putQuote(q)
      res.json({ success: true, quote: result })
    } catch (error) {
      console.error('Quote creation error:', error)
      res.status(500).json({ error: 'Quote creation failed' })
    }
  })

  // Update quote status
  app.patch('/api/quotes/:id/status', requireAuth, (req, res) => {
    const { id } = req.params
    const { status } = req.body
    
    if (!['new', 'review', 'feasible', 'not', 'quoted', 'approved', 'pending', 'rejected', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }
    
    try {
      const updated = update(id, { status })
      res.json(updated)
    } catch (error) {
      res.status(500).json({ error: 'Status update failed' })
    }
  })

  // Update quote (general PATCH)
  app.patch('/api/quotes/:id', requireAuth, (req, res) => {
    const { id } = req.params
    const updateData = req.body
    
    try {
      const updated = update(id, updateData)
      res.json(updated)
    } catch (error) {
      res.status(500).json({ error: 'Quote update failed' })
    }
  })

  // Delete quote
  app.delete('/api/quotes/:id', requireAuth, (req, res) => {
    const { id } = req.params
    
    try {
      remove(id)
      res.json({ success: true })
    } catch (error) {
      res.status(500).json({ error: 'Delete failed' })
    }
  })

  // Get quote as TXT export
  app.get('/api/quotes/:id/txt', requireAuth, (req, res) => {
    const { id } = req.params
    
    try {
      const quote = readAll().find(q => q.id === id)
      if (!quote) {
        return res.status(404).json({ error: 'Quote not found' })
      }
      
      // Generate TXT content (simplified version)
      const txtContent = `Burkol Metal — Teklif Özeti
Tarih: ${new Date(quote.createdAt || Date.now()).toLocaleString()}
ID: ${quote.id}

[Genel]
Durum: ${quote.status || ''}
Proje: ${quote.proj || ''}
Açıklama: ${quote.desc || ''}

[Müşteri]
Ad Soyad: ${quote.name || ''}
Firma: ${quote.company || ''}
E‑posta: ${quote.email || ''}
Telefon: ${quote.phone || ''}

[Fiyat]
Toplam: ₺${(parseFloat(quote.price) || 0).toFixed(2)}
`
      
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="teklif-${id}.txt"`)
      res.send(txtContent)
    } catch (error) {
      res.status(500).json({ error: 'TXT export failed' })
    }
  })

  // Apply new price to quote
  app.post('/api/quotes/:id/apply-price', requireAuth, async (req, res) => {
    const { id } = req.params
    
    try {
      console.log('🔧 DEBUG: Single price update started for ID:', id)
      
      const quote = readOne(id)
      if (!quote) {
        console.error('🔧 ERROR: Quote not found:', id)
        return res.status(404).json({ error: 'Quote not found' })
      }

      console.log('🔧 DEBUG: Quote loaded:', quote.name || 'unnamed')

      const priceSettings = jsondb.getPriceSettings()
      if (!priceSettings) {
        console.error('🔧 ERROR: Price settings not available')
        return res.status(400).json({ error: 'Price settings not configured' })
      }

      console.log('🔧 DEBUG: Price settings loaded')

      const newPrice = calculatePriceServer(quote, priceSettings)
      console.log('🔧 DEBUG: New price calculated:', newPrice)
      
      // Create history entry before updating
      const historyEntry = {
        timestamp: new Date().toISOString(),
        price: newPrice,
        calculatedPrice: newPrice,
        priceSettings: JSON.parse(JSON.stringify(priceSettings)), // Deep copy
        quoteSnapshot: createQuoteSnapshot(quote),
        changeReason: 'Fiyat güncellendi'
      }
      
      console.log('🔧 DEBUG: History entry created')
      
      // Update quote with new price and add to history
      const updated = updateOne(id, {
        price: newPrice,
        calculatedPrice: newPrice,
        originalPrice: quote.price || 0,
        needsPriceUpdate: false,
        formStructureChanged: false,
        priceUpdatedAt: new Date().toISOString(),
        priceUpdateReasons: [], // Clear update reasons
        pendingCalculatedPrice: undefined, // Clear pending price
        priceHistory: [...(quote.priceHistory || []), historyEntry]
      })

      console.log('✅ Price applied successfully:', {
        id,
        oldPrice: quote.price,
        newPrice,
        needsPriceUpdate: false
      })

      res.json(updated)
    } catch (error) {
      console.error('🔧 ERROR: Price application error:', error)
      console.error('🔧 ERROR: Stack trace:', error.stack)
      res.status(500).json({ error: 'Price update failed', details: error.message })
    }
  })

  // Bulk apply price to selected quotes
  app.post('/api/quotes/apply-price-bulk', requireAuth, (req, res) => {
    try {
      console.log('🔧 DEBUG: Bulk price update started')
      const { ids } = req.body || {}
      console.log('🔧 DEBUG: IDs to update:', ids)
      
      if (!Array.isArray(ids) || ids.length === 0) {
        console.log('🔧 DEBUG: No valid IDs provided')
        return res.json({ updated: 0 })
      }
      
      const priceSettings = jsondb.getPriceSettings()
      console.log('🔧 DEBUG: Price settings loaded:', !!priceSettings)
      
      if (!priceSettings) {
        console.error('🔧 ERROR: No price settings available')
        return res.status(400).json({ error: 'Price settings not configured' })
      }
      
      let updatedCount = 0
      const errors = []
      
      ids.forEach((id, index) => {
        try {
          console.log(`🔧 DEBUG: Processing quote ${index + 1}/${ids.length} - ID: ${id}`)
          
          const q = readOne(id)
          if (!q) {
            console.warn(`🔧 WARN: Quote not found: ${id}`)
            errors.push(`Quote not found: ${id}`)
            return
          }
          
          console.log(`🔧 DEBUG: Quote loaded: ${q.name || 'unnamed'}`)
          
          const np = calculatePriceServer(q, priceSettings)
          console.log(`🔧 DEBUG: Price calculated: ${np}`)
          
        // Create history entry
        const historyEntry = {
          timestamp: new Date().toISOString(),
          price: np,
          calculatedPrice: np,
          priceSettings: JSON.parse(JSON.stringify(priceSettings)),
          quoteSnapshot: createQuoteSnapshot(q),
          changeReason: 'Toplu fiyat güncellendi'
        }
        
        console.log(`🔧 DEBUG: History entry created for: ${id}`)
          
          const updateResult = updateOne(id, {
            price: np,
            calculatedPrice: np,
            originalPrice: q.price || 0,
            needsPriceUpdate: false,
            formStructureChanged: false,
            priceUpdatedAt: new Date().toISOString(),
            priceUpdateReasons: [],
            pendingCalculatedPrice: undefined,
            priceHistory: [...(q.priceHistory || []), historyEntry]
          })
          
          if (updateResult) {
            console.log(`🔧 DEBUG: Quote updated successfully: ${id}`)
            updatedCount++
          } else {
            console.error(`🔧 ERROR: Failed to update quote: ${id}`)
            errors.push(`Failed to update quote: ${id}`)
          }
          
        } catch (itemError) {
          console.error(`🔧 ERROR: Error processing quote ${id}:`, itemError)
          errors.push(`Error processing ${id}: ${itemError.message}`)
        }
      })
      
      console.log('✅ Bulk price update completed:', updatedCount, 'quotes updated')
      if (errors.length > 0) {
        console.warn('🔧 WARN: Some errors occurred:', errors)
      }
      
      res.json({ 
        updated: updatedCount,
        errors: errors.length > 0 ? errors : undefined
      })
    } catch (e) {
      console.error('🔧 ERROR: Bulk price apply error:', e)
      console.error('🔧 ERROR: Stack trace:', e.stack)
      res.status(500).json({ error: 'Bulk price update failed', details: e.message })
    }
  })

    // Apply price to all flagged quotes
  app.post('/api/quotes/apply-price-all', requireAuth, (req, res) => {
    try {
      const priceSettings = jsondb.getPriceSettings()
      const quotes = readAll().filter(q => q.needsPriceUpdate)
      let updatedCount = 0
      quotes.forEach(q => {
        const np = calculatePriceServer(q, priceSettings)
        
        // Create history entry
        const historyEntry = {
          timestamp: new Date().toISOString(),
          price: np,
          calculatedPrice: np,
          priceSettings: JSON.parse(JSON.stringify(priceSettings)),
          quoteSnapshot: createQuoteSnapshot(q),
          changeReason: 'Tümü fiyat güncellendi'
        }
        
        updateOne(q.id, {
          price: np,
          calculatedPrice: np,
          originalPrice: q.price || 0,
          needsPriceUpdate: false,
          formStructureChanged: false,
          priceUpdatedAt: new Date().toISOString(),
          priceUpdateReasons: [],
          pendingCalculatedPrice: undefined,
          priceHistory: [...(q.priceHistory || []), historyEntry]
        })
        updatedCount++
      })
      console.log('✅ Apply-all price update completed:', updatedCount, 'quotes updated')
      res.json({ updated: updatedCount })
    } catch (e) {
      console.error('Apply all price error:', e)
      res.status(500).json({ error: 'Apply all price update failed' })
    }
  })

  // Calculate price endpoint (for real-time price calculation)
  app.post('/api/calculate-price', (req, res) => {
    try {
      const { customFields } = req.body || {}
      
      if (!customFields) {
        return res.status(400).json({ error: 'customFields required' })
      }

      // Get current price settings
      const priceSettings = jsondb.getPriceSettings()
      if (!priceSettings) {
        return res.status(400).json({ error: 'Price settings not configured' })
      }

      // Create a temporary quote object for calculation
      const tempQuote = {
        id: 'temp-calc',
        customFields: customFields,
        qty: customFields.qty || 0
      }

      // Calculate price with validation
      const calculatedPrice = calculatePriceServer(tempQuote, priceSettings)
      
      res.json({ 
        price: calculatedPrice,
        formula: priceSettings.formula,
        parameters: priceSettings.parameters
      })
    } catch (error) {
      console.error('❌ Price calculation error:', error.message)
      
      // Handle validation errors with specific HTTP status codes
      if (error.message.includes('must be a valid number') ||
          error.message.includes('cannot be negative') ||
          error.message.includes('must be at least 1') ||
          error.message.includes('exceeds maximum limit')) {
        return res.status(400).json({ 
          error: 'Invalid input data',
          details: error.message 
        })
      }
      
      if (error.message.includes('unauthorized functions')) {
        return res.status(403).json({ 
          error: 'Security violation',
          details: 'Formula contains unauthorized functions' 
        })
      }
      
      if (error.message.includes('exceeds reasonable business limits')) {
        return res.status(422).json({ 
          error: 'Business rule violation',
          details: error.message 
        })
      }
      
      // Generic server error for unexpected issues
      res.status(500).json({ 
        error: 'Price calculation failed',
        details: 'An unexpected error occurred during price calculation'
      })
    }
  })
}

// Settings API routes
export function setupSettingsRoutes(app) {
  // Get general settings
  app.get('/api/settings', requireAuth, (req, res) => {
    try {
      const settings = jsondb.getSettings()
      res.json(settings || {})
    } catch (error) {
      res.status(500).json({ error: 'Failed to load settings' })
    }
  })

  // Save general settings
  app.post('/api/settings', requireAuth, (req, res) => {
    try {
      const settings = req.body || {}
      jsondb.putSettings(settings)
      res.json({ success: true, settings })
    } catch (error) {
      res.status(500).json({ error: 'Failed to save settings' })
    }
  })

  // Get price settings
  app.get('/api/price-settings', requireAuth, (req, res) => {
    try {
      const settings = jsondb.getPriceSettings()
      res.json(settings || { parameters: [], formula: '' })
    } catch (error) {
      res.status(500).json({ error: 'Failed to load price settings' })
    }
  })

  // Save price settings with versioning and mark affected quotes
  app.post('/api/price-settings', requireAuth, (req, res) => {
    try {
      const oldSettings = jsondb.getPriceSettings() || { parameters: [], formula: '' }
      const incoming = req.body || {}
      const newSettings = {
        ...incoming,
        version: (oldSettings.version || 0) + 1,
        lastUpdated: new Date().toISOString()
      }
      jsondb.savePriceSettings(newSettings)

      // Compute impact and mark quotes
      const quotes = readAll()
      let affectedCount = 0

      function findParam(arr, id) { return (arr || []).find(p => p && p.id === id) }

      quotes.forEach(q => {
        try {
          const oldPrice = calculatePriceServer(q, oldSettings)
          const newPrice = calculatePriceServer(q, newSettings)
          const diff = Math.abs((newPrice || 0) - (oldPrice || 0))
          const reasons = []

          if ((newSettings.formula || '') !== (oldSettings.formula || '')) {
            reasons.push('Formül değişti')
          }

          const oldParams = oldSettings.parameters || []
          const newParams = newSettings.parameters || []

          newParams.forEach(np => {
            const op = findParam(oldParams, np.id)
            if (!op) return
            if (np.type === 'fixed') {
              const ov = parseFloat(op.value) || 0
              const nv = parseFloat(np.value) || 0
              if (ov !== nv) {
                reasons.push(`Sabit fiyat '${np.name || np.id}': ${ov.toFixed(2)} → ${nv.toFixed(2)}`)
              }
            } else if (np.type === 'form') {
              // Check if this is a form field parameter (either with or without lookupTable)
              if (Array.isArray(np.lookupTable)) {
                // Handle lookup table parameters
                const fieldId = np.formField
                const fv = (q[fieldId] !== undefined ? q[fieldId] : (q.customFields && q.customFields[fieldId]))
                const collect = (opt) => {
                  const nItem = np.lookupTable.find(it => it.option === opt)
                  const oItem = op.lookupTable ? op.lookupTable.find(it => it.option === opt) : null
                  const ov = oItem ? (parseFloat(oItem.value) || 0) : 0
                  const nv = nItem ? (parseFloat(nItem.value) || 0) : 0
                  if (ov !== nv) {
                    const paramName = np.name || fieldId
                    reasons.push(`${paramName} [${opt}]: ${ov.toFixed(2)} → ${nv.toFixed(2)}`)
                  }
                }
                if (Array.isArray(fv)) fv.forEach(collect)
                else if (fv !== undefined && fv !== null) collect(fv)
              } else {
                // For direct form field parameters (no lookup table)
                // These parameters use the raw form field values in calculations
                // Any change in parameter definition means recalculation needed
                if (np.formField !== op.formField) {
                  reasons.push(`Form parametresi '${np.name || np.id}' alan değişikliği: ${op.formField} → ${np.formField}`)
                }
                // Check for multiplier changes
                const oldMult = parseFloat(op.multiplier) || 1
                const newMult = parseFloat(np.multiplier) || 1
                if (oldMult !== newMult) {
                  reasons.push(`Parametre çarpanı '${np.name || np.id}': ${oldMult} → ${newMult}`)
                }
              }
            } else if (np.type === 'currency') {
              // Handle currency parameter changes
              const oldRate = parseFloat(op.rate) || 1
              const newRate = parseFloat(np.rate) || 1
              if (oldRate !== newRate) {
                reasons.push(`Döviz kuru '${np.name || np.id}': ${oldRate.toFixed(4)} → ${newRate.toFixed(4)}`)
              }
              if (op.enabled !== np.enabled) {
                const status = np.enabled ? 'aktif' : 'pasif'
                reasons.push(`Döviz durumu '${np.name || np.id}': ${status}`)
              }
            }
          })

          // Check for formula changes
          if (oldSettings.formula !== newSettings.formula) {
            reasons.push(`Fiyat formülü değişti: ${oldSettings.formula} → ${newSettings.formula}`)
          }

          // Only mark for update if price actually changed
          if (diff > 0.01) {
            affectedCount++
            update(q.id, {
              needsPriceUpdate: true,
              priceUpdateReasons: reasons.length > 0 ? reasons : [`Fiyat değişti: ${oldPrice.toFixed(2)} → ${newPrice.toFixed(2)}`],
              pendingCalculatedPrice: newPrice,
              lastPriceSettingsVersionUsed: oldSettings.version || 0,
              pendingPriceSettingsVersion: newSettings.version
            })
          } else {
            // Always clear update flags when price hasn't changed
            // even if parameters changed but didn't affect final price
            update(q.id, {
              needsPriceUpdate: false,
              priceUpdateReasons: [],
              pendingCalculatedPrice: undefined,
              pendingPriceSettingsVersion: undefined
            })
          }
        } catch (e) {
          console.error('Price mark error for quote', q.id, e)
        }
      })

      res.json({ success: true, version: newSettings.version, affected: affectedCount })
    } catch (error) {
      res.status(500).json({ error: 'Failed to save price settings' })
    }
  })

  // Get form configuration - PUBLIC ACCESS for user form
  app.get('/api/form-config', (req, res) => {
    try {
      const config = jsondb.getFormConfig()
      res.json({ formConfig: config })
    } catch (error) {
      res.status(500).json({ error: 'Failed to load form config' })
    }
  })

  // Get form fields for pricing configuration - PUBLIC ACCESS
  app.get('/api/form-fields', (req, res) => {
    try {
      const config = jsondb.getFormConfig()
      const fields = []
      
      if (config && config.formStructure && config.formStructure.fields) {
        config.formStructure.fields.forEach(field => {
          fields.push({
            id: field.id,
            label: field.label,
            type: field.type,
            hasOptions: field.options && field.options.length > 0,
            options: field.options || []
          })
        })
      }
      
      res.json({ fields })
    } catch (error) {
      res.status(500).json({ error: 'Failed to load form fields' })
    }
  })

  // Save form configuration - ADMIN ONLY
  app.post('/api/form-config', requireAuth, (req, res) => {
    console.log('🔧 DEBUG: POST /api/form-config called')
    console.log('🔧 DEBUG: Request body:', JSON.stringify(req.body, null, 2))
    
    try {
      const config = req.body
      console.log('🔧 DEBUG: Getting current config...')
      const currentConfig = jsondb.getFormConfig()
      console.log('🔧 DEBUG: Current config:', !!currentConfig)
      
      // Check if this is a significant form structure change
      const isStructuralChange = !currentConfig || 
        JSON.stringify(currentConfig.formStructure?.fields) !== JSON.stringify(config.formStructure?.fields)
      console.log('🔧 DEBUG: Is structural change:', isStructuralChange)
      
      // Save the new form configuration
      console.log('🔧 DEBUG: Saving form config...')
      const result = jsondb.putFormConfig(config)
      console.log('🔧 DEBUG: Form config saved:', !!result)
      
      if (isStructuralChange) {
        console.log('🔧 DEBUG: Processing structural change...')
        
        // Analyze specific changes in form structure
        const getFormChanges = (oldConfig, newConfig) => {
          const changes = []
          const oldFields = oldConfig?.formStructure?.fields || []
          const newFields = newConfig?.formStructure?.fields || []
          
          // Check for removed fields
          oldFields.forEach(oldField => {
            const stillExists = newFields.find(f => f.id === oldField.id)
            if (!stillExists) {
              changes.push(`Alan kaldırıldı: ${oldField.label || oldField.id}`)
            }
          })
          
          // Check for added fields  
          newFields.forEach(newField => {
            const existed = oldFields.find(f => f.id === newField.id)
            if (!existed) {
              changes.push(`Yeni alan eklendi: ${newField.label || newField.id}`)
            } else {
              // Check for field changes
              if (existed.label !== newField.label) {
                changes.push(`Alan etiketi değişti: ${existed.label} → ${newField.label}`)
              }
              if (existed.type !== newField.type) {
                changes.push(`Alan tipi değişti: ${existed.type} → ${newField.type}`)
              }
              if (JSON.stringify(existed.options) !== JSON.stringify(newField.options)) {
                changes.push(`Alan seçenekleri değişti: ${newField.label || newField.id}`)
              }
            }
          })
          
          return changes
        }
        
        const formChanges = getFormChanges(currentConfig, config)
        const changeReason = formChanges.length > 0 
          ? `Form değişiklikleri: ${formChanges.join('; ')}`
          : 'User form güncellendi'
        
        // Mark all existing quotes as needing price updates due to form changes
        const quotes = jsondb.listQuotes()
        console.log('🔧 DEBUG: Found', quotes.length, 'quotes to update')
        
        quotes.forEach(quote => {
          // Create patch object with only defined values
          const patch = {
            needsPriceUpdate: true,
            priceUpdateReason: 'Form structure changed',
            priceUpdateReasons: [changeReason],
            formStructureChanged: true,
            formVersion: config.version
          }
          
          // Only add previousFormVersion if it exists
          if (quote.formVersion !== undefined && quote.formVersion !== null) {
            patch.previousFormVersion = quote.formVersion
          }
          
          jsondb.patchQuote(quote.id, patch)
        })
        
        // Reset pricing configuration since form fields may have changed
        console.log('🔧 DEBUG: Resetting pricing config...')
        jsondb.resetPricingConfig('Form configuration updated')
        
        console.log(`Form structure updated. Marked ${quotes.length} quotes for price recalculation.`)
      }
      
      console.log('🔧 DEBUG: Sending success response...')
      res.json({ 
        success: true, 
        structuralChange: isStructuralChange,
        quotesMarkedForUpdate: isStructuralChange ? jsondb.listQuotes().length : 0
      })
    } catch (error) {
      console.error('🔧 DEBUG: Form config save error:', error)
      console.error('🔧 DEBUG: Error stack:', error.stack)
      res.status(500).json({ error: 'Failed to save form config', details: error.message })
    }
  })
}

// Export API routes
export function setupExportRoutes(app) {
  // Export to TXT
  app.get('/api/export/txt', requireAuth, (req, res) => {
    try {
      const quotes = readAll()
      
      let txt = 'BURKOL QUOTE EXPORT\n'
      txt += '==================\n\n'
      
      quotes.forEach(q => {
        txt += `Quote ID: ${q.id}\n`
        txt += `Date: ${q.createdAt?.slice(0, 10) || 'N/A'}\n`
        txt += `Customer: ${q.name || 'N/A'}\n`
        txt += `Company: ${q.company || 'N/A'}\n`
        txt += `Email: ${q.email || 'N/A'}\n`
        txt += `Phone: ${q.phone || 'N/A'}\n`
        txt += `Project: ${q.proj || 'N/A'}\n`
        txt += `Status: ${q.status || 'N/A'}\n`
        // Use dot decimal, no grouping for exported price
        const pr = Number(q.price)
        txt += `Price: ${Number.isFinite(pr) ? `₺${pr.toFixed(2)}` : 'N/A'}\n`
        txt += `Material: ${q.material || 'N/A'}\n`
        txt += `Process: ${Array.isArray(q.process) ? q.process.join(', ') : (q.process || 'N/A')}\n`
        txt += `Quantity: ${q.qty || 'N/A'}\n`
        txt += `Dimensions: ${q.dims || 'N/A'}\n`
        txt += `Description: ${q.desc || 'N/A'}\n`
        txt += '\n' + '-'.repeat(50) + '\n\n'
      })
      
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="burkol-quotes.txt"')
      res.send(txt)
    } catch (error) {
      console.error('Export error:', error)
      res.status(500).json({ error: 'Export failed' })
    }
  })

  // Phase 1: Unified Price Calculation API (Phase 3: Enhanced with Advanced Rules)
  app.post('/api/quotes/calculate-preview', async (req, res) => {
    try {
      const { quote, priceSettingsOverride } = req.body
      
      if (!quote) {
        return res.status(400).json({ error: 'Quote data required' })
      }

      // Use provided settings or get current system settings
      const priceSettings = priceSettingsOverride || jsondb.getPriceSettings()
      
      if (!priceSettings || !priceSettings.parameters || !priceSettings.formula) {
        return res.json({ 
          calculatedPrice: quote.price || 0,
          breakdown: { error: 'No price settings configured' },
          usedParameters: {},
          source: 'fallback'
        })
      }

      // Phase 3: Calculate with advanced rules
      const result = await calculatePriceWithAdvancedRules(quote, priceSettings)
      
      res.json(result)
    } catch (error) {
      console.error('❌ Server price calculation error:', error)
      res.status(500).json({ error: 'Price calculation failed', details: error.message })
    }
  })

  // Phase 3: Advanced price calculation with rules
  async function calculatePriceWithAdvancedRules(quote, priceSettings) {
    // Step 1: Calculate base price
    const basePrice = calculatePriceServer(quote, priceSettings)
    const breakdown = createCalculationBreakdown(quote, priceSettings, basePrice)
    const usedParameters = extractUsedParameters(quote, priceSettings)
    
    // Step 2: Load advanced rules from settings
    const advancedRules = await getAdvancedPriceRules()
    
    // Step 3: Apply advanced rules
    const rulesResult = applyAdvancedPriceRules(basePrice, quote, advancedRules)
    
    return {
      calculatedPrice: rulesResult.finalPrice,
      basePrice: basePrice,
      breakdown,
      usedParameters,
      rulesApplied: rulesResult.rulesApplied,
      source: 'server-calculation-with-advanced-rules',
      timestamp: new Date().toISOString(),
      settingsVersion: priceSettings.version || 0
    }
  }

  // Phase 3: Get advanced price rules from settings
  async function getAdvancedPriceRules() {
    try {
      const settings = jsondb.getDocument('settings', 'app-settings')
      return settings?.advancedPriceRules || {
        quantityDiscounts: [],
        materialMultipliers: [],
        conditionalRules: [],
        priceHistory: { enabled: true, retentionDays: 90 }
      }
    } catch (error) {
      console.error('Advanced rules load error:', error)
      return {
        quantityDiscounts: [],
        materialMultipliers: [],
        conditionalRules: [],
        priceHistory: { enabled: true, retentionDays: 90 }
      }
    }
  }

  // Phase 3: Apply advanced price rules to base price
  function applyAdvancedPriceRules(basePrice, quote, advancedRules) {
    let finalPrice = basePrice
    const rulesApplied = []
    
    try {
      // Apply quantity discounts
      if (advancedRules.quantityDiscounts?.length > 0 && quote.qty) {
        const qty = parseFloat(quote.qty) || (quote.customFields?.qty ? parseFloat(quote.customFields.qty) : 0)
        const applicableDiscount = findApplicableQuantityDiscount(qty, advancedRules.quantityDiscounts)
        
        if (applicableDiscount) {
          const discountedPrice = applyQuantityDiscount(finalPrice, applicableDiscount)
          rulesApplied.push({
            type: 'quantity-discount',
            rule: applicableDiscount.name,
            originalPrice: finalPrice,
            newPrice: discountedPrice,
            discount: finalPrice - discountedPrice
          })
          finalPrice = discountedPrice
        }
      }

      // Apply material multipliers
      if (advancedRules.materialMultipliers?.length > 0) {
        const applicableMultipliers = findApplicableMaterialMultipliers(quote, advancedRules.materialMultipliers)
        
        applicableMultipliers.forEach(multiplier => {
          const multipliedPrice = finalPrice * multiplier.multiplier
          rulesApplied.push({
            type: 'material-multiplier',
            rule: multiplier.name,
            fieldId: multiplier.fieldId,
            fieldValue: multiplier.fieldValue,
            multiplier: multiplier.multiplier,
            originalPrice: finalPrice,
            newPrice: multipliedPrice
          })
          finalPrice = multipliedPrice
        })
      }

      // Apply conditional rules (sorted by priority)
      if (advancedRules.conditionalRules?.length > 0) {
        const sortedRules = advancedRules.conditionalRules
          .filter(rule => rule.enabled)
          .sort((a, b) => (a.priority || 1) - (b.priority || 1))
        
        sortedRules.forEach(rule => {
          if (evaluateConditionalRule(quote, rule)) {
            const adjustedPrice = applyConditionalRuleAction(finalPrice, rule.action)
            rulesApplied.push({
              type: 'conditional-rule',
              rule: rule.name,
              action: rule.action,
              originalPrice: finalPrice,
              newPrice: adjustedPrice
            })
            finalPrice = adjustedPrice
          }
        })
      }

    } catch (error) {
      console.error('Advanced rules application error:', error)
      rulesApplied.push({
        type: 'error',
        message: `Rules application failed: ${error.message}`
      })
    }

    return {
      finalPrice: Math.max(0, finalPrice), // Ensure price is not negative
      rulesApplied
    }
  }

  // Helper functions for advanced rules
  function findApplicableQuantityDiscount(qty, discounts) {
    return discounts
      .filter(d => d.enabled)
      .find(d => qty >= d.minQuantity && (d.maxQuantity === null || qty <= d.maxQuantity))
  }

  function applyQuantityDiscount(price, discount) {
    switch (discount.discountType) {
      case 'percentage':
        return price * (1 - discount.discountValue / 100)
      case 'fixed':
        return Math.max(0, price - discount.discountValue)
      case 'multiplier':
        return price * discount.discountValue
      default:
        return price
    }
  }

  function findApplicableMaterialMultipliers(quote, multipliers) {
    return multipliers
      .filter(m => m.enabled && m.fieldId && m.fieldValue)
      .filter(m => {
        const fieldValue = quote[m.fieldId] || quote.customFields?.[m.fieldId]
        return fieldValue === m.fieldValue
      })
  }

  function evaluateConditionalRule(quote, rule) {
    // Simple condition evaluation - can be expanded
    return rule.conditions?.length === 0 || true // For now, accept all rules
  }

  function applyConditionalRuleAction(price, action) {
    switch (action.type) {
      case 'multiply':
        return price * action.value
      case 'add':
        return price + action.value
      case 'subtract':
        return Math.max(0, price - action.value)
      case 'setFixed':
        return action.value
      default:
        return price
    }
  }
}
