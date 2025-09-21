// Server API Routes - Express route handlers organized by functionality
import crypto from 'crypto'
import jsondb from '../lib/jsondb.js'
import { requireAuth } from './auth.js'
import { persistFilesForQuote } from './fileHandler.js'
import { calculatePriceServer } from './priceCalculator.js'

// Data access functions
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
  return jsondb.patchQuote(id, patch)
}

export function remove(id) {
  return jsondb.removeQuote(id)
}

export function updateOne(id, patch) {
  return jsondb.update(id, patch)
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
  // Get all quotes (admin only)
  app.get('/api/quotes', requireAuth, (req, res) => {
    return res.json(readAll())
  })

  // Create new quote
  app.post('/api/quotes', async (req, res) => {
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

      // Set defaults
      q.id = crypto.randomUUID()
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
        }
      } catch (priceError) {
        console.error('Price calculation failed:', priceError)
      }

      const result = insert(q)
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
    
    if (!['new', 'pending', 'approved', 'rejected', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' })
    }
    
    try {
      const updated = update(id, { status })
      res.json(updated)
    } catch (error) {
      res.status(500).json({ error: 'Status update failed' })
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

  // Apply new price to quote
  app.post('/api/quotes/:id/apply-price', requireAuth, async (req, res) => {
    const { id } = req.params
    
    try {
      const quote = readOne(id)
      if (!quote) {
        return res.status(404).json({ error: 'Quote not found' })
      }

      const priceSettings = jsondb.getPriceSettings()
      if (!priceSettings) {
        return res.status(400).json({ error: 'Price settings not configured' })
      }

      const newPrice = calculatePriceServer(quote, priceSettings)
      
      // Update quote with new price and create history entry
      const updated = updateOne(id, {
        price: newPrice,
        calculatedPrice: newPrice,
        originalPrice: quote.price || 0,
        needsPriceUpdate: false,
        priceUpdatedAt: new Date().toISOString()
      })

      res.json(updated)
    } catch (error) {
      console.error('Price application error:', error)
      res.status(500).json({ error: 'Price update failed' })
    }
  })
}

// Settings API routes
export function setupSettingsRoutes(app) {
  // Get price settings
  app.get('/api/price-settings', requireAuth, (req, res) => {
    try {
      const settings = jsondb.getPriceSettings()
      res.json(settings || { parameters: [], formula: '' })
    } catch (error) {
      res.status(500).json({ error: 'Failed to load price settings' })
    }
  })

  // Save price settings
  app.post('/api/price-settings', requireAuth, (req, res) => {
    try {
      const settings = req.body
      jsondb.savePriceSettings(settings)
      res.json({ success: true })
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
    try {
      const config = req.body
      const currentConfig = jsondb.getFormConfig()
      
      // Check if this is a significant form structure change
      const isStructuralChange = !currentConfig || 
        JSON.stringify(currentConfig.formStructure?.fields) !== JSON.stringify(config.formStructure?.fields)
      
      // Save the new form configuration
      jsondb.putFormConfig(config)
      
      if (isStructuralChange) {
        // Mark all existing quotes as needing price updates due to form changes
        const quotes = jsondb.listQuotes()
        quotes.forEach(quote => {
          jsondb.patchQuote(quote.id, {
            needsPriceUpdate: true,
            priceUpdateReason: 'Form structure changed',
            formStructureChanged: true,
            previousFormVersion: quote.formVersion,
            formVersion: config.version
          })
        })
        
        // Reset pricing configuration since form fields may have changed
        jsondb.resetPricingConfig('Form configuration updated')
        
        console.log(`Form structure updated. Marked ${quotes.length} quotes for price recalculation.`)
      }
      
      res.json({ 
        success: true, 
        structuralChange: isStructuralChange,
        quotesMarkedForUpdate: isStructuralChange ? jsondb.listQuotes().length : 0
      })
    } catch (error) {
      console.error('Form config save error:', error)
      res.status(500).json({ error: 'Failed to save form config' })
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
        txt += `Price: ${q.price ? `₺${q.price.toLocaleString('tr-TR')}` : 'N/A'}\n`
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
}