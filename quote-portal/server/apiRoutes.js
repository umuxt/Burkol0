// Server API Routes - Express route handlers for legacy features
import jsondb from '../src/lib/jsondb.js'
import { requireAuth } from './auth.js'
import { persistFilesForQuote } from './fileHandler.js'
import { calculatePriceServer } from './priceCalculator.js'
import PriceStatus from './models/PriceStatus.js'
import auditSessionActivity from './auditTrail.js'

// Data Access Helpers
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
  const cleanedPatch = filterUndefinedValues(patch)
  const success = jsondb.patchQuote(id, cleanedPatch)
  return success ? jsondb.getQuote(id) : null
}

// Recursively filter undefined values from objects
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
  
  // Static quote fields for backward compatibility - only add if they exist
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
  app.post('/api/price-settings', requireAuth, async (req, res) => {
    try {
      const oldSettings = jsondb.getPriceSettings() || { parameters: [], formula: '' }
      const incoming = req.body || {}
      
      // Get user info for versioning
      const userInfo = {
        userId: req.user?.id || 'unknown',
        username: req.user?.username || 'admin',
        timestamp: new Date().toISOString()
      }
      
      // Save with versioning system
      const versionResult = await jsondb.savePriceSettingsWithVersioning(incoming, userInfo)
      const newSettings = versionResult.settings

      console.log('✅ Price settings saved with version:', versionResult.version)

      // Compute impact and mark quotes
      const quotes = readAll()
      let affectedCount = 0
      const versionCache = new Map()

      const versionKey = (snapshot = {}) => snapshot.versionId || `number:${snapshot.versionNumber}`

      const versionRequests = new Map()
      quotes.forEach(q => {
        const applied = q.priceVersionApplied || q.priceVersion || null
        const original = q.priceVersionOriginal || null
        ;[applied, original].forEach(snapshot => {
          if (!snapshot) return
          const versionId = snapshot.versionId || null
          const versionNumber = snapshot.versionNumber ?? null
          if (!versionId && (versionNumber === null || versionNumber === undefined)) return
          const key = versionKey({ versionId, versionNumber })
          if (!versionRequests.has(key)) {
            versionRequests.set(key, { versionId, versionNumber })
          }
        })
      })

      const loadedSnapshots = await Promise.all(Array.from(versionRequests.entries()).map(async ([key, req]) => {
        const data = await jsondb.getPriceSettingsVersionSnapshot(req)
        return [key, data]
      }))
      loadedSnapshots.forEach(([key, data]) => {
        versionCache.set(key, data)
      })

      async function loadVersionSnapshot(snapshot) {
        if (!snapshot || (!snapshot.versionId && snapshot.versionNumber === undefined)) {
          return null
        }

        const cacheKey = versionKey(snapshot)
        if (versionCache.has(cacheKey)) {
          return versionCache.get(cacheKey)
        }

        const loaded = await jsondb.getPriceSettingsVersionSnapshot({
          versionId: snapshot.versionId || null,
          versionNumber: snapshot.versionNumber ?? null
        })
        versionCache.set(cacheKey, loaded)
        return loaded
      }

      for (const q of quotes) {
        try {
          const evaluationTimestamp = new Date().toISOString()

          const appliedVersion = q.priceVersionApplied || q.priceVersion || null
          const baselineSnapshot = appliedVersion || q.priceVersionOriginal || null

          const baselineSettings = baselineSnapshot ? await loadVersionSnapshot({
            versionId: baselineSnapshot.versionId || null,
            versionNumber: baselineSnapshot.versionNumber ?? null
          }) : null

          const resolvedBaselineSettings = baselineSettings || oldSettings || {}

          const oldPrice = calculatePriceServer(q, resolvedBaselineSettings)
          const newPrice = calculatePriceServer(q, newSettings)
          const priceDiff = Number(((newPrice || 0) - (oldPrice || 0)).toFixed(2))

          const differences = jsondb.findPriceSettingsDifferences(resolvedBaselineSettings || {}, newSettings || {})
          const hasPriceChange = Math.abs(priceDiff) > 0.01
          const hasContentChange = differences.reasons.length > 0
          const hasVersionChange = (baselineSnapshot?.versionNumber !== newSettings.version) || (baselineSnapshot?.versionId !== newSettings.versionId)

          const currentStatus = PriceStatus.fromJSON(q.priceStatus)
          const previousVersionNumber = baselineSnapshot?.versionNumber || currentStatus.settingsVersion || oldSettings.version || null
          const previousVersionId = baselineSnapshot?.versionId || currentStatus.settingsVersionId || null

          const differenceSummary = {
            priceDiff,
            oldPrice: oldPrice ?? null,
            newPrice: newPrice ?? null,
            evaluatedAt: evaluationTimestamp,
            comparisonBaseline: baselineSnapshot ? 'applied' : 'original',
            reasons: differences.reasons,
            parameterChanges: {
              added: differences.parameters.added,
              removed: differences.parameters.removed,
              modified: differences.parameters.modified
            },
            formulaChanged: differences.formula.changed,
            previousVersion: previousVersionNumber,
            previousVersionId,
            originalVersion: q.priceVersionOriginal?.versionNumber || null,
            originalVersionId: q.priceVersionOriginal?.versionId || null,
            nextVersion: newSettings.version,
            nextVersionId: newSettings.versionId || null
          }

          currentStatus.updateCalculation(
            newPrice,
            newSettings.version,
            null,
            {
              settingsVersionId: newSettings.versionId || null,
              differenceSummary
            }
          )

          if (hasPriceChange) {
            currentStatus.markPriceDrift(differenceSummary)
          } else if (hasContentChange) {
            currentStatus.markContentDrift(differenceSummary)
          } else {
            currentStatus.markOutdated('Price settings updated')
          }

          if (hasPriceChange || hasContentChange || hasVersionChange) {
            affectedCount++
          }

          const patchPayload = {
            priceStatus: currentStatus.toJSON(),
            pendingPriceVersion: {
              versionId: newSettings.versionId || null,
              versionNumber: newSettings.version,
              evaluatedAt: evaluationTimestamp,
              priceDiff,
              comparisonBaseline: differenceSummary.comparisonBaseline,
              reasons: differences.reasons,
              parameterChanges: differenceSummary.parameterChanges,
              formulaChanged: differences.formula.changed,
              differenceSummary
            },
            priceVersionLatest: {
              versionId: newSettings.versionId || null,
              versionNumber: newSettings.version,
              evaluatedAt: evaluationTimestamp
            }
          }

          if (!q.priceVersionOriginal && (q.priceVersion || q.priceCalculation)) {
            patchPayload.priceVersionOriginal = q.priceVersion || (q.priceCalculation ? {
              versionId: q.priceCalculation.versionId || null,
              versionNumber: q.priceCalculation.version || null,
              capturedAt: q.priceCalculation.timestamp || q.createdAt || evaluationTimestamp
            } : null)
          }

          if (!q.priceVersionApplied && q.priceVersion) {
            patchPayload.priceVersionApplied = q.priceVersion
          }

          update(q.id, patchPayload)
        } catch (e) {
          console.error('Price mark error for quote', q.id, e)
        }
      }

      const priceDiffSummary = jsondb.findPriceSettingsDifferences(oldSettings || {}, newSettings || {})
      const highlightParts = []
      const addedCount = priceDiffSummary.parameters?.added?.length || 0
      const removedCount = priceDiffSummary.parameters?.removed?.length || 0
      const modifiedCount = priceDiffSummary.parameters?.modified?.length || 0

      if (addedCount) highlightParts.push(`${addedCount} parametre eklendi`)
      if (removedCount) highlightParts.push(`${removedCount} parametre kaldırıldı`)
      if (modifiedCount) highlightParts.push(`${modifiedCount} parametre güncellendi`)
      if (priceDiffSummary.formula?.changed) highlightParts.push('Fiyat formülü güncellendi')
      if (affectedCount) highlightParts.push(`${affectedCount} teklif yeniden değerlendirilecek`)

      auditSessionActivity(req, {
        type: 'price-settings',
        action: 'update',
        scope: 'pricing',
        title: `Fiyat ayarları güncellendi (v${versionResult.version})`,
        description: highlightParts.length ? highlightParts.join(', ') : null,
        metadata: {
          version: versionResult.version,
          versionId: versionResult.versionId,
          affectedQuotes: affectedCount,
          differences: priceDiffSummary
        }
      })

      res.json({ 
        success: true, 
        version: versionResult.version,
        versionId: versionResult.versionId,
        affected: affectedCount,
        message: `Version ${versionResult.version} created successfully`
      })
    } catch (error) {
      console.error('Price settings save error:', error)
      res.status(500).json({ error: 'Failed to save price settings' })
    }
  })

  // VERSION MANAGEMENT API ROUTES

  // Get all price settings versions
  app.get('/api/price-settings/versions', requireAuth, async (req, res) => {
    try {
      const { versions } = await jsondb.getPriceSettingsVersions()
      res.json({ success: true, versions })
    } catch (error) {
      console.error('Failed to get versions:', error)
      res.status(500).json({ error: 'Failed to get versions' })
    }
  })

  // Restore a specific version
  app.post('/api/price-settings/restore/:versionId', requireAuth, async (req, res) => {
    try {
      const { versionId } = req.params
      const userInfo = {
        userId: req.user?.id || 'unknown',
        username: req.user?.username || 'admin',
        timestamp: new Date().toISOString(),
        action: 'restore'
      }
      
      const result = await jsondb.restorePriceSettingsVersion(versionId)
      
      auditSessionActivity(req, {
        type: 'price-settings',
        action: 'restore',
        scope: 'pricing',
        title: `Fiyat ayarları versiyonu geri yüklendi (${versionId})`,
        description: result?.restoredVersion
          ? `Yeni aktif versiyon: v${result.restoredVersion}`
          : 'Fiyat ayarları geçmiş versiyondan geri alındı',
        metadata: {
          requestedVersion: versionId,
          restoredVersion: result?.restoredVersion || null,
          restoredVersionId: result?.restoredVersionId || null,
          originalVersion: result?.originalVersion || null,
          originalVersionId: result?.originalVersionId || null
        }
      })

      res.json({ 
        success: true, 
        restoredVersion: result.restoredVersion,
        restoredVersionId: result.restoredVersionId,
        originalVersion: result.originalVersion,
        originalVersionId: result.originalVersionId,
        message: `Version restored successfully as v${result.restoredVersion}`
      })
    } catch (error) {
      console.error('Version restore failed:', error)
      res.status(500).json({ error: 'Failed to restore version' })
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

  // Quote price version comparison
  app.get('/api/quotes/:quoteId/price-comparison', async (req, res) => {
    try {
      const { quoteId } = req.params
      const comparison = await jsondb.compareQuotePriceVersions(quoteId)

      const quote = jsondb.getQuote(quoteId)
      if (quote) {
        const status = PriceStatus.fromJSON(quote.priceStatus)
        const latestVersion = comparison.versions.latest || {}
        const diffSummary = comparison.differenceSummary || {}
        const evaluatedAt = diffSummary.evaluatedAt || new Date().toISOString()

        status.updateCalculation(
          comparison.quote.latestPrice,
          latestVersion.version,
          null,
          {
            settingsVersionId: latestVersion.versionId,
            differenceSummary: diffSummary
          }
        )

        if (comparison.quote.priceChanged) {
          status.markPriceDrift(diffSummary)
        } else if ((diffSummary.reasons || []).length > 0) {
          status.markContentDrift(diffSummary)
        } else {
          status.markOutdated('Price settings updated')
        }

        const versionSnapshot = (ver) => (
          ver && (ver.versionId || ver.version)
            ? {
                versionId: ver.versionId || null,
                versionNumber: ver.version || null,
                capturedAt: ver.timestamp || evaluatedAt
              }
            : null
        )

        const patch = {
          priceStatus: status.toJSON(),
          pendingPriceVersion: {
            versionId: latestVersion.versionId || null,
            versionNumber: latestVersion.version || null,
            evaluatedAt,
            priceDiff: diffSummary.priceDiff || 0,
            comparisonBaseline: diffSummary.comparisonBaseline || 'applied',
            reasons: diffSummary.reasons || [],
            parameterChanges: diffSummary.parameterChanges || {
              added: [],
              removed: [],
              modified: []
            },
            formulaChanged: !!diffSummary.formulaChanged,
            differenceSummary: diffSummary
          },
          priceVersionLatest: {
            versionId: latestVersion.versionId || null,
            versionNumber: latestVersion.version || null,
            evaluatedAt
          }
        }

        if (!quote.priceVersionOriginal && comparison.versions.original) {
          const originalSnap = versionSnapshot(comparison.versions.original)
          if (originalSnap) {
            patch.priceVersionOriginal = originalSnap
          }
        }

        if (comparison.versions.applied) {
          const appliedSnap = versionSnapshot(comparison.versions.applied)
          if (appliedSnap) {
            patch.priceVersionApplied = appliedSnap
            patch.priceVersion = appliedSnap
          }
        }

        jsondb.patchQuote(quoteId, patch)
        comparison.quote.priceStatus = patch.priceStatus
      }
      res.json(comparison)
    } catch (error) {
      console.error('Quote price comparison error:', error)
      if (error && error.status === 404) {
        return res.status(404).json({ error: 'Quote not found' })
      }
      res.status(500).json({ error: 'Failed to compare quote price versions' })
    }
  })

  // Apply current price version to quote
  app.post('/api/quotes/:quoteId/apply-current-price', requireAuth, async (req, res) => {
    try {
      const { quoteId } = req.params
      const existingQuote = jsondb.getQuote(quoteId)

      const userInfo = {
        ...req.user,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
        action: 'apply-current-price'
      }
      
      // Get comparison first
      const comparison = await jsondb.compareQuotePriceVersions(quoteId)

      const updateResult = await jsondb.updateQuotePrice(quoteId, comparison.quote.latestPrice, userInfo)
      const updatedQuote = updateResult.quote || jsondb.getQuote(quoteId)

      const responsePayload = {
        success: true, 
        updatedPrice: updateResult.updatedPrice,
        calculatedPrice: updateResult.calculatedPrice,
        appliedVersion: (comparison.versions.latest && comparison.versions.latest.version) || null,
        quote: updatedQuote,
        comparisonBaseline: comparison.comparisonBaseline,
        differenceSummary: comparison.differenceSummary
      }

      if (existingQuote) {
        const previousPriceNum = Number(existingQuote.price)
        const newPriceNum = Number(updateResult.updatedPrice)
        const previousPriceDisplay = Number.isFinite(previousPriceNum)
          ? previousPriceNum.toFixed(2)
          : String(existingQuote.price ?? '—')
        const newPriceDisplay = Number.isFinite(newPriceNum)
          ? newPriceNum.toFixed(2)
          : String(updateResult.updatedPrice ?? '—')

        auditSessionActivity(req, {
          type: 'quote',
          action: 'apply-price-current',
          scope: 'pricing',
          title: `Teklif fiyatı güncellendi (#${quoteId})`,
          description: `₺${previousPriceDisplay} → ₺${newPriceDisplay}`,
          metadata: {
            quoteId,
            previousPrice: existingQuote.price ?? null,
            newPrice: updateResult.updatedPrice ?? null,
            appliedVersion: responsePayload.appliedVersion,
            comparisonBaseline: comparison.comparisonBaseline || null
          }
        })
      }

      res.json(responsePayload)
    } catch (error) {
      console.error('Apply current price error:', error)
      res.status(500).json({ error: 'Failed to apply current price to quote' })
    }
  })

  // Price calculation preview endpoint
  app.post('/api/calculate-price', async (req, res) => {
    try {
      const { quote, priceSettings } = req.body
      
      if (!quote || !priceSettings) {
        return res.status(400).json({ error: 'Quote and priceSettings are required' })
      }

      const calculatedPrice = calculatePriceServer(quote, priceSettings)
      
      res.json({ 
        success: true,
        calculatedPrice: calculatedPrice || 0,
        quote: { ...quote, calculatedPrice }
      })
    } catch (error) {
      console.error('Price calculation error:', error)
      res.status(500).json({ error: 'Price calculation failed' })
    }
  })
}

// Setup form configuration routes
export function setupFormConfigRoutes(app) {
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
  app.post('/api/form-config', requireAuth, async (req, res) => {
    try {
      const config = req.body
      const currentConfig = jsondb.getFormConfig()

      const isStructuralChange = !currentConfig ||
        JSON.stringify(currentConfig.formStructure?.fields) !== JSON.stringify(config.formStructure?.fields)

      const result = await jsondb.putFormConfig(config, {
        userId: req.user?.id,
        username: req.user?.username
      })

      let formChanges = []
      let quotesMarked = 0

      if (isStructuralChange) {
        const getFormChanges = (oldConfig, newConfig) => {
          const changes = []
          const oldFields = oldConfig?.formStructure?.fields || []
          const newFields = newConfig?.formStructure?.fields || []

          oldFields.forEach(oldField => {
            const stillExists = newFields.find(f => f.id === oldField.id)
            if (!stillExists) {
              changes.push(`Alan kaldırıldı: ${oldField.label || oldField.id}`)
            }
          })

          newFields.forEach(newField => {
            const existed = oldFields.find(f => f.id === newField.id)
            if (!existed) {
              changes.push(`Yeni alan: ${newField.label || newField.id}`)
            } else {
              const oldField = oldFields.find(f => f.id === newField.id)
              if (oldField.type !== newField.type) {
                changes.push(`Alan tipi değişti: ${newField.label || newField.id} (${oldField.type} → ${newField.type})`)
              }
            }
          })

          return changes
        }

        formChanges = getFormChanges(currentConfig, config)

        try {
          const quotes = await jsondb.getAllQuotes()
          for (const quote of quotes) {
            if (quote.formVersion !== result?.version) {
              await jsondb.updateQuote(quote.id, {
                needsFormUpdate: true,
                lastFormVersion: quote.formVersion,
                currentFormVersion: result?.version
              })
              quotesMarked++
            }
          }
        } catch (error) {
          console.warn('Failed to mark quotes for form update:', error)
        }
      }

      const descriptionText = formChanges.length > 0 
        ? `Değişiklikler: ${formChanges.join(', ')}`
        : 'Form yapılandırması güncellendi'

      await jsondb.addSystemLog({
        userId: req.user?.id,
        username: req.user?.username,
        action: 'form_config_update',
        scope: 'forms',
        title: result?.version ? `Form yapılandırması güncellendi (v${result.version})` : 'Form yapılandırması güncellendi',
        description: descriptionText,
        metadata: {
          structuralChange: isStructuralChange,
          version: result?.version || null,
          versionId: result?.versionId || null,
          changes: formChanges,
          quotesMarked
        }
      })

      res.json({
        success: true,
        structuralChange: isStructuralChange,
        version: result?.version || null,
        versionId: result?.versionId || null,
        quotesMarkedForUpdate: quotesMarked
      })
    } catch (error) {
      console.error('Form config save error:', error)
      res.status(500).json({ error: 'Failed to save form config', details: error.message })
    }
  })
}
