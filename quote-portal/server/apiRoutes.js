// Server API Routes - Express route handlers organized by functionality
import jsondb from '../lib/jsondb.js'
import { requireAuth } from './auth.js'
import { persistFilesForQuote } from './fileHandler.js'
import { calculatePriceServer } from './priceCalculator.js'

// Data access functions
export function readAll() {
  return jsondb.read()
}

export function readOne(id) {
  return jsondb.readOne(id)
}

export function insertOne(obj) {
  return jsondb.insert(obj)
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

// Quote API routes
export function setupQuoteRoutes(app, uploadsDir) {
  // Get all quotes (admin only)
  app.get('/api/quotes', requireAuth, (req, res) => {
    return res.json(readAll())
  })

  // Create new quote
  app.post('/api/quotes', async (req, res) => {
    const q = req.body
    
    // Validate input
    const validationErrors = validateQuoteData(q)
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: validationErrors })
    }

    // Sanitize input
    Object.keys(q).forEach(key => {
      if (typeof q[key] === 'string') {
        q[key] = sanitizeInput(q[key])
      }
    })

    try {
      // Set defaults
      q.id = crypto.randomUUID()
      q.createdAt = new Date().toISOString()
      q.status = 'new'

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

      const result = insertOne(q)
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
      const updated = updateOne(id, { status })
      res.json(updated)
    } catch (error) {
      res.status(500).json({ error: 'Status update failed' })
    }
  })

  // Delete quote
  app.delete('/api/quotes/:id', requireAuth, (req, res) => {
    const { id } = req.params
    
    try {
      deleteOne(id)
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

  // Get form configuration
  app.get('/api/form-config', requireAuth, (req, res) => {
    try {
      const config = jsondb.getFormConfig()
      res.json(config || { formConfig: null })
    } catch (error) {
      res.status(500).json({ error: 'Failed to load form config' })
    }
  })

  // Save form configuration
  app.post('/api/form-config', requireAuth, (req, res) => {
    try {
      const config = req.body
      jsondb.saveFormConfig(config)
      res.json({ success: true })
    } catch (error) {
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