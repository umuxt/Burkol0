// Suppliers Routes - Firebase Admin SDK Integration (Backend Only)
import admin from 'firebase-admin'
import { requireAuth } from './auth.js'

// Firebase Admin SDK helpers
const serverTimestamp = admin.firestore.FieldValue.serverTimestamp

let db
function getDb() {
  if (!db) {
    if (!admin.apps.length) {
      try { admin.initializeApp() } catch {}
    }
    db = admin.firestore()
  }
  return db
}

// Enhanced in-memory cache with rate limiting and quota protection
const cache = {
  suppliers: { data: null, ts: 0, etag: '', hits: 0 },
  supplierCategories: { data: null, ts: 0, etag: '', hits: 0 }
}
const TTL_MS = Number(process.env.SUPPLIERS_CACHE_TTL_MS || 300_000) // 5 dakika default
const QUOTA_PROTECTION_TTL_MS = Number(process.env.QUOTA_PROTECTION_TTL_MS || 600_000) // 10 dakika quota koruması

// Rate limiting için request tracking
const requestTracker = {
  lastRequest: 0,
  requestCount: 0,
  windowStart: Date.now()
}
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 dakika
const MAX_REQUESTS_PER_WINDOW = process.env.NODE_ENV === 'production' ? 60 : 500 // Production: 60, Development: 500

function buildEtag(items) {
  try {
    const base = items?.length ? `${items.length}:${items[0]?.id || ''}:${items[items.length - 1]?.id || ''}` : '0'
    return 'W/"' + Buffer.from(base).toString('base64').slice(0, 16) + '"'
  } catch { return 'W/"0"' }
}

// Rate limiting check
function checkRateLimit() {
  const now = Date.now()
  
  // Reset window if needed
  if (now - requestTracker.windowStart >= RATE_LIMIT_WINDOW_MS) {
    requestTracker.windowStart = now
    requestTracker.requestCount = 0
  }
  
  requestTracker.requestCount++
  requestTracker.lastRequest = now
  
  if (requestTracker.requestCount > MAX_REQUESTS_PER_WINDOW) {
    console.warn(`⚠️ Suppliers rate limit exceeded: ${requestTracker.requestCount} requests in current window`)
    return false
  }
  
  return true
}

// Enhanced cache check with quota protection
function getCachedData(cacheKey, quotaProtection = false) {
  const cached = cache[cacheKey]
  if (!cached || !cached.data) return null
  
  const now = Date.now()
  const ttl = quotaProtection ? QUOTA_PROTECTION_TTL_MS : TTL_MS
  
  if (now - cached.ts < ttl) {
    cached.hits = (cached.hits || 0) + 1
    console.log(`🎯 Suppliers cache hit for ${cacheKey} (hits: ${cached.hits})`)
    return cached
  }
  
  return null
}

// Safe Firestore query with retry and fallback
async function safeFirestoreQuery(collectionName, filters = [], retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      let query = getDb().collection(collectionName)
      
      // Apply filters
      filters.forEach(filter => {
        query = query.where(...filter)
      })
      
      const snapshot = await query.get()
      return snapshot
    } catch (error) {
      console.error(`❌ Suppliers Firestore query attempt ${attempt} failed:`, error.message)
      
      if (error.code === 8 || error.message.includes('Quota exceeded')) {
        console.warn('🚨 Suppliers quota exceeded detected, enabling quota protection mode')
        if (attempt === retries) {
          throw new Error('QUOTA_EXCEEDED')
        }
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000))
      } else if (attempt === retries) {
        throw error
      }
    }
  }
}

// Helper function to generate next supplier code
async function generateNextSupplierCode() {
  try {
    const snapshot = await getDb().collection('suppliers').get()
    const existingCodes = []
    
    snapshot.forEach(doc => {
      const data = doc.data()
      if (data.code && data.code.startsWith('T-')) {
        const number = parseInt(data.code.split('-')[1])
        if (!isNaN(number)) {
          existingCodes.push(number)
        }
      }
    })
    
    // En büyük sayıyı bul ve 1 ekle
    const maxNumber = existingCodes.length > 0 ? Math.max(...existingCodes) : 0
    const nextNumber = maxNumber + 1
    
    // T-0001 formatında döndür
    return `T-${String(nextNumber).padStart(4, '0')}`
  } catch (error) {
    console.error('❌ Supplier code oluşturulurken hata:', error)
    return `T-${String(Date.now()).slice(-4)}` // Fallback
  }
}

// ================================
// SUPPLIERS CRUD OPERATIONS
// ================================

// Get all suppliers
export async function getAllSuppliers(req, res) {
  try {
    console.log('📦 API: Suppliers listesi istendi')
    
    // Rate limiting check
    if (!checkRateLimit()) {
      return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: 60 })
    }
    
    const ifNoneMatch = req.headers['if-none-match']
    const forceRefresh = req.query._t // Cache bust parameter
    
    // Check cache first (unless force refresh is requested)
    if (!forceRefresh) {
      const cached = getCachedData('suppliers')
      if (cached) {
        if (ifNoneMatch && ifNoneMatch === cached.etag) {
          return res.status(304).end()
        }
        res.set('ETag', cached.etag)
        res.set('X-Cache', 'HIT')
        return res.json(cached.data)
      }
    } else {
      console.log('🔄 Force refresh requested, bypassing cache')
    }

    let suppliers
    try {
      // Get all suppliers using safe wrapper
      const snapshot = await safeFirestoreQuery('suppliers')
      suppliers = []
      snapshot.forEach(doc => { 
        suppliers.push({ id: doc.id, ...doc.data() }) 
      })
    } catch (error) {
      if (error.message === 'QUOTA_EXCEEDED') {
        // Check if we have any cached data to serve
        const cachedWithQuotaProtection = getCachedData('suppliers', true)
        if (cachedWithQuotaProtection) {
          console.warn('🚨 Serving cached suppliers due to quota exceeded')
          res.set('ETag', cachedWithQuotaProtection.etag)
          res.set('X-Cache', 'QUOTA-PROTECTED')
          return res.json(cachedWithQuotaProtection.data)
        }
      }
      throw error
    }

    // Update cache
    const now = Date.now()
    const etag = buildEtag(suppliers)
    cache.suppliers = { data: suppliers, ts: now, etag, hits: 0 }
    
    res.set('ETag', etag)
    res.set('X-Cache', forceRefresh ? 'FORCE-REFRESH' : 'MISS')
    console.log(`✅ API: ${suppliers.length} supplier döndürüldü ${forceRefresh ? '(force refresh)' : ''}`)
    res.json(suppliers)
  } catch (error) {
    console.error('❌ API: Suppliers listesi alınırken hata:', error)
    // Final fallback to any cached data
    if (cache.suppliers.data) {
      console.warn('⚠️  Serving stale cached suppliers due to error')
      res.set('ETag', cache.suppliers.etag)
      res.set('X-Cache', 'STALE')
      return res.json(cache.suppliers.data)
    }
    res.status(503).json({ error: 'Suppliers listesi alınamadı', reason: 'upstream_error' })
  }
}

// Add new supplier
export async function addSupplier(req, res) {
  try {
      const { suppliedMaterials, ...supplierData } = req.body
      
      // Custom ID kullan - eğer code varsa onu ID olarak kullan
      const customId = supplierData.code || await generateNextSupplierCode()
      
      // Eğer code yok ise otomatik oluştur ve data'ya ekle
      if (!supplierData.code) {
        supplierData.code = customId
      }
      
      const finalSupplierData = {
        ...supplierData,
        suppliedMaterials: suppliedMaterials || [], // suppliedMaterials array'ini direkt supplier'a ekle
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: supplierData.status || 'active'
      }

      console.log('📦 API: Custom Supplier ID kullanılıyor:', customId)
      
      // Custom ID ile document oluştur
      const docRef = getDb().collection('suppliers').doc(customId)
      await docRef.set(finalSupplierData)
      
      console.log(`✅ Supplier ${customId} created with ${(suppliedMaterials || []).length} materials`)
      
      const newSupplier = {
        id: customId,
        ...finalSupplierData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      console.log('✅ New supplier added:', newSupplier.name || newSupplier.companyName)
      res.status(201).json(newSupplier)
  } catch (error) {
    console.error('Error adding supplier:', error)
    res.status(500).json({ error: 'Failed to add supplier' })
  }
}

// Update supplier
export async function updateSupplier(req, res) {
  try {
    const { id } = req.params
    const requestBody = req.body
      
      console.log('🔄 Updating supplier:', { id, updateData: requestBody })
      
      // Validate request data
      if (!id) {
        console.error('❌ Supplier ID missing')
        return res.status(400).json({ error: 'Supplier ID is required' })
      }
      
      if (!requestBody || Object.keys(requestBody).length === 0) {
        console.error('❌ Update data missing')
        return res.status(400).json({ error: 'Update data is required' })
      }
      
      // Check if supplier exists
      const supplierRef = getDb().collection('suppliers').doc(id)
      const supplierDoc = await supplierRef.get()
      
      console.log('🔍 Checking supplier existence:', {
        id,
        exists: supplierDoc.exists,
        data: supplierDoc.exists ? supplierDoc.data() : null
      })
      
      if (!supplierDoc.exists) {
        // Try to find all suppliers to see what IDs exist
        const allSnapshot = await getDb().collection('suppliers').get()
        const existingIds = []
        allSnapshot.forEach(doc => {
          existingIds.push(doc.id)
        })
        
        console.error('❌ Supplier not found:', id)
        console.error('📋 Existing supplier IDs:', existingIds)
        return res.status(404).json({ 
          error: 'Supplier not found',
          requestedId: id,
          existingIds: existingIds
        })
      }
      
      // Prepare update data
      const updateData = {
        ...requestBody,
        updatedAt: serverTimestamp()
      }
      
      // Remove any undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key]
        }
      })

      console.log('📝 Final update data:', updateData)
      
      await supplierRef.update(updateData)

      // Invalidate caches so subsequent GETs are fresh
      try {
        cache.suppliers = { data: null, ts: 0, etag: '', hits: 0 }
        cache.supplierCategories = { data: null, ts: 0, etag: '', hits: 0 }
      } catch {}

      console.log('✅ Supplier updated successfully:', id)
      res.json({ id, ...updateData, updatedAt: new Date().toISOString() })
  } catch (error) {
    console.error('❌ Error updating supplier:', {
      error: error.message,
      stack: error.stack,
      supplierId: req.params?.id,
      updateData: req.body
    })
    res.status(500).json({ 
      error: 'Failed to update supplier',
      details: error.message 
    })
  }
}

// Delete supplier
export async function deleteSupplier(req, res) {
  try {
    const { id } = req.params
    
    const supplierRef = getDb().collection('suppliers').doc(id)
    await supplierRef.delete()

    console.log('🗑️ Supplier deleted:', id)
    res.json({ message: 'Supplier deleted successfully' })
  } catch (error) {
    console.error('Error deleting supplier:', error)
    res.status(500).json({ error: 'Failed to delete supplier' })
  }
}

// ================================
// SUPPLIER CATEGORY MANAGEMENT
// ================================

// ================================
// MATERIAL-SUPPLIER OPERATIONS
// ================================

// Add material to supplier's suppliedMaterials array
export async function addMaterialToSupplier(req, res) {
  try {
    requireAuth(req, res, async () => {
      const { supplierId } = req.params
      const { materialId, materialCode, materialName, price, deliveryTime, minQuantity } = req.body

      // Supplier dokümanını al
      const supplierRef = getDb().collection('suppliers').doc(supplierId)
      const supplierDoc = await supplierRef.get()
      
      if (!supplierDoc.exists) {
        return res.status(404).json({ error: 'Supplier not found' })
      }

      const supplierData = supplierDoc.data()
      const currentMaterials = supplierData.suppliedMaterials || []
      
      // Malzeme zaten ekli mi kontrol et
      const materialExists = currentMaterials.some(m => 
        (m.materialId === materialId) || (m.id === materialId)
      )
      if (materialExists) {
        return res.status(400).json({ error: 'Material already added to supplier' })
      }

      // Malzeme detaylarını materials koleksiyonundan al
      let materialCategory = ''
      let materialUnit = ''
      
      try {
        const materialDoc = await getDb().collection('materials').doc(materialId).get()
        if (materialDoc.exists) {
          const materialData = materialDoc.data()
          materialCategory = materialData.category || ''
          materialUnit = materialData.unit || ''
        }
      } catch (materialError) {
        console.warn('Could not fetch material details:', materialError)
      }

      // Yeni malzemeyi ekle - hem eski hem yeni field isimleri ile uyumluluk
      const newMaterial = {
        // Backend field names
        materialId,
        materialCode,
        materialName,
        // Frontend compatible field names
        id: materialId,
        code: materialCode,
        name: materialName,
        // Additional details
        category: materialCategory,
        unit: materialUnit,
        price: parseFloat(price) || 0,
        deliveryTime: deliveryTime || '',
        minQuantity: parseInt(minQuantity) || 1,
        addedAt: new Date().toISOString(),
        status: 'aktif' // Default status
      }

      const updatedMaterials = [...currentMaterials, newMaterial]
      
      await supplierRef.update({
        suppliedMaterials: updatedMaterials,
        updatedAt: serverTimestamp()
      })

      // Invalidate caches so subsequent GETs are fresh
      try {
        cache.suppliers = { data: null, ts: 0, etag: '', hits: 0 }
        cache.supplierCategories = { data: null, ts: 0, etag: '', hits: 0 }
      } catch {}

      console.log(`✅ Material ${materialCode} added to supplier ${supplierId}`)
      res.status(201).json(newMaterial)
    })
  } catch (error) {
    console.error('Error adding material to supplier:', error)
    res.status(500).json({ error: 'Failed to add material to supplier' })
  }
}

// Get suppliers that supply a specific material
export async function getSuppliersForMaterial(req, res) {
  try {
    const { materialId } = req.params
    
    const snapshot = await getDb().collection('suppliers').get()
    
    const suppliers = []
    snapshot.forEach((doc) => {
      const data = doc.data()
      // Filter by status client-side
      if (data.status === 'active') {
        const suppliedMaterials = data.suppliedMaterials || []
        
        // Bu supplier bu malzemeyi sağlıyor mu?
        const suppliesMaterial = suppliedMaterials.some(m => m.materialId === materialId)
        if (suppliesMaterial) {
          suppliers.push({
            id: doc.id,
            ...data
          })
        }
      }
    })

    console.log(`📋 Found ${suppliers.length} suppliers for material ${materialId}`)
    res.json(suppliers)
  } catch (error) {
    console.error('Error fetching suppliers for material:', error)
    res.status(500).json({ error: 'Failed to fetch suppliers for material' })
  }
}

// Get materials supplied by a specific supplier
export async function getMaterialsForSupplier(req, res) {
  try {
    const { supplierId } = req.params
      
    const supplierRef = getDb().collection('suppliers').doc(supplierId)
    const supplierDoc = await supplierRef.get()
    
    if (!supplierDoc.exists) {
      return res.status(404).json({ error: 'Supplier not found' })
    }

    const supplierData = supplierDoc.data()
    const materials = supplierData.suppliedMaterials || []

    console.log(`📋 Found ${materials.length} materials for supplier ${supplierId}`)
    res.json(materials)
  } catch (error) {
    console.error('Error fetching materials for supplier:', error)
    res.status(500).json({ error: 'Failed to fetch materials for supplier' })
  }
}

// ================================
// DYNAMIC SUPPLIER CATEGORIES
// ================================

// Get supplier categories dynamically from supplied materials
export async function getSupplierCategories(req, res) {
  try {
    requireAuth(req, res, async () => {
      const now = Date.now()
      const ifNoneMatch = req.headers['if-none-match']
      if (cache.supplierCategories.data && now - cache.supplierCategories.ts < TTL_MS) {
        if (ifNoneMatch && ifNoneMatch === cache.supplierCategories.etag) return res.status(304).end()
        res.set('ETag', cache.supplierCategories.etag)
        return res.json(cache.supplierCategories.data)
      }
      // Önce tüm materyalleri çek
      const materialsSnapshot = await getDb().collection('materials').get()
      
      const materialCategories = new Map()
      materialsSnapshot.forEach((doc) => {
        const material = doc.data()
        if (material.category) {
          materialCategories.set(doc.id, material.category)
        }
      })

      // Tüm supplier'ları çek
      const suppliersSnapshot = await getDb().collection('suppliers').get()
      
      const categoryCount = new Map()
      
      suppliersSnapshot.forEach((doc) => {
        const supplier = doc.data()
        const suppliedMaterials = supplier.suppliedMaterials || []
        
        // Bu supplier'ın sağladığı malzemelerin kategorilerini bul
        const supplierCategories = new Set()
        suppliedMaterials.forEach(material => {
          const category = materialCategories.get(material.materialId)
          if (category) {
            supplierCategories.add(category)
          }
        })
        
        // Her kategori için sayacı artır
        supplierCategories.forEach(category => {
          categoryCount.set(category, (categoryCount.get(category) || 0) + 1)
        })
      })

      // Kategorileri array olarak döndür
      const categories = Array.from(categoryCount.entries()).map(([category, count]) => ({
        id: category.toLowerCase().replace(/\s+/g, '-'),
        name: category,
        count: count
      }))

      console.log(`📋 Found ${categories.length} dynamic supplier categories`)
      cache.supplierCategories = { data: categories, ts: now, etag: buildEtag(categories) }
      res.set('ETag', cache.supplierCategories.etag)
      res.json(categories)
    })
  } catch (error) {
    console.error('Error fetching supplier categories:', error)
    if (cache.supplierCategories.data) {
      console.warn('⚠️  Serving cached supplier categories due to error')
      res.set('ETag', cache.supplierCategories.etag)
      return res.json(cache.supplierCategories.data)
    }
    if ((process.env.NODE_ENV || 'development') !== 'production') {
      return res.json([])
    }
    res.status(503).json({ error: 'Failed to fetch supplier categories', reason: 'upstream_error' })
  }
}

// Get suppliers by category (dinamik olarak malzeme kategorilerine göre)
export async function getSuppliersByCategory(req, res) {
  try {
    requireAuth(req, res, async () => {
      const { category } = req.params
      
      // Önce bu kategorideki materyalleri bul
      const materialsSnapshot = await getDb().collection('materials').get()
      
      const materialIds = []
      materialsSnapshot.forEach((doc) => {
        const materialData = doc.data()
        // Filter by category client-side
        if (materialData.category === category) {
          materialIds.push(doc.id)
        }
      })

      if (materialIds.length === 0) {
        return res.json([])
      }

      // Bu materyalleri sağlayan supplier'ları bul
      const suppliersSnapshot = await getDb().collection('suppliers').get()
      
      const suppliers = []
      suppliersSnapshot.forEach((doc) => {
        const supplier = doc.data()
        const suppliedMaterials = supplier.suppliedMaterials || []
        
        // Bu supplier bu kategoriden malzeme sağlıyor mu?
        const suppliesCategory = suppliedMaterials.some(material => 
          materialIds.includes(material.materialId)
        )
        
        if (suppliesCategory) {
          suppliers.push({
            id: doc.id,
            ...supplier
          })
        }
      })

      console.log(`📋 Found ${suppliers.length} suppliers for category ${category}`)
      res.json(suppliers)
    })
  } catch (error) {
    console.error('Error fetching suppliers by category:', error)
    res.status(500).json({ error: 'Failed to fetch suppliers by category' })
  }
}
