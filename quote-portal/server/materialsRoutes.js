// Materials API Routes - Firebase Admin SDK kullanarak
import admin from 'firebase-admin'
import { requireAuth } from './auth.js'

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
  materialsActive: { data: null, ts: 0, etag: '', hits: 0 },
  materialsAll: { data: null, ts: 0, etag: '', hits: 0 },
  categories: { data: null, ts: 0, etag: '', hits: 0 },
  suppliers: { data: null, ts: 0, etag: '', hits: 0 }
}
const TTL_MS = Number(process.env.MATERIALS_CACHE_TTL_MS || 300_000) // 5 dakika default
const QUOTA_PROTECTION_TTL_MS = Number(process.env.QUOTA_PROTECTION_TTL_MS || 600_000) // 10 dakika quota koruması

// Rate limiting için request tracking
const requestTracker = {
  lastRequest: 0,
  requestCount: 0,
  windowStart: Date.now()
}
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 dakika
const MAX_REQUESTS_PER_WINDOW = process.env.NODE_ENV === 'production' ? 100 : 1000 // Production: 100, Development: 1000

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
    console.warn(`⚠️ Rate limit exceeded: ${requestTracker.requestCount} requests in current window`)
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
    console.log(`🎯 Cache hit for ${cacheKey} (hits: ${cached.hits})`)
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
      console.error(`❌ Firestore query attempt ${attempt} failed:`, error.message)
      
      if (error.code === 8 || error.message.includes('Quota exceeded')) {
        console.warn('🚨 Quota exceeded detected, enabling quota protection mode')
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

// Helper function to generate next material code
async function generateNextMaterialCode() {
  try {
    const snapshot = await getDb().collection('materials').get()
    const existingCodes = []
    
    snapshot.forEach(doc => {
      const data = doc.data()
      if (data.code && data.code.startsWith('M-')) {
        const number = parseInt(data.code.split('-')[1])
        if (!isNaN(number)) {
          existingCodes.push(number)
        }
      }
    })
    
    // En büyük sayıyı bul ve 1 ekle
    const maxNumber = existingCodes.length > 0 ? Math.max(...existingCodes) : 0
    const nextNumber = maxNumber + 1
    
    // M-001 formatında döndür
    return `M-${String(nextNumber).padStart(3, '0')}`
  } catch (error) {
    console.error('❌ Material code oluşturulurken hata:', error)
    return `M-${String(Date.now()).slice(-3)}` // Fallback
  }
}

// Propagate material name changes to embedded order items
async function propagateMaterialNameToOrders(materialCode, newName) {
  try {
    if (!materialCode || !newName) return { updatedOrders: 0, updatedItems: 0 }
    console.log('🔄 Propagating material name to orders:', { materialCode, newName })
    const ordersRef = getDb().collection('orders')
    const snapshot = await ordersRef.get()
    let updatedOrders = 0
    let updatedItems = 0
    for (const doc of snapshot.docs) {
      const data = doc.data() || {}
      const items = Array.isArray(data.items) ? data.items : []
      if (!items.length) continue
      let changed = false
      const nextItems = items.map(it => {
        if ((it.materialCode || it.code) === materialCode && it.materialName !== newName) {
          changed = true
          updatedItems += 1
          return { ...it, materialName: newName, updatedAt: admin.firestore.FieldValue.serverTimestamp() }
        }
        return it
      })
      if (changed) {
        await ordersRef.doc(doc.id).update({
          items: nextItems,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        })
        updatedOrders += 1
      }
    }
    console.log(`✅ Propagation finished. Orders updated: ${updatedOrders}, Items updated: ${updatedItems}`)
    return { updatedOrders, updatedItems }
  } catch (e) {
    console.error('❌ Propagate material name error:', e)
    return { updatedOrders: 0, updatedItems: 0, error: e.message }
  }
}

export function setupMaterialsRoutes(app) {
  
  // GET /api/materials - Tüm malzemeleri listele (kaldırılanlar hariç)
  app.get('/api/materials', requireAuth, async (req, res) => {
    try {
      console.log('📦 API: Materials listesi istendi')
      
      // Rate limiting check
      if (!checkRateLimit()) {
        return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: 60 })
      }
      
      // Check for cache busting parameter
      const forceRefresh = req.query._t !== undefined
      if (forceRefresh) {
        console.log('🔄 API: Force refresh requested via _t parameter')
      }
      
      const ifNoneMatch = req.headers['if-none-match']
      
      // Check cache first (skip if force refresh)
      if (!forceRefresh) {
        const cached = getCachedData('materialsActive')
        if (cached) {
          if (ifNoneMatch && ifNoneMatch === cached.etag) {
            return res.status(304).end()
          }
          res.set('ETag', cached.etag)
          res.set('X-Cache', 'HIT')
          return res.json(cached.data)
        }
      }

      let materials
      try {
        // Get all materials and filter client-side (more reliable than != query)
        const snapshot = await safeFirestoreQuery('materials')
        const allMaterials = []
        snapshot.forEach(doc => { allMaterials.push({ id: doc.id, ...doc.data() }) })
        
        // Filter out removed materials client-side
        materials = allMaterials.filter(m => m.status !== 'Kaldırıldı')
        console.log(`📊 Filtered ${materials.length} active materials from ${allMaterials.length} total`)
      } catch (error) {
        if (error.message === 'QUOTA_EXCEEDED') {
          // Check if we have any cached data to serve
          const cachedWithQuotaProtection = getCachedData('materialsActive', true)
          if (cachedWithQuotaProtection) {
            console.warn('🚨 Serving cached data due to quota exceeded')
            res.set('ETag', cachedWithQuotaProtection.etag)
            res.set('X-Cache', 'QUOTA-PROTECTED')
            return res.json(cachedWithQuotaProtection.data)
          }
          
          // No cache available, return empty list with quota protection headers
          console.warn('🚨 Quota exceeded and no cache available, returning empty list')
          res.set('X-Cache', 'QUOTA-EXCEEDED')
          res.set('Retry-After', '300') // 5 dakika sonra tekrar dene
          return res.json([])
        }
        throw error
      }

      // Update cache
      const now = Date.now()
      const etag = buildEtag(materials)
      cache.materialsActive = { data: materials, ts: now, etag, hits: 0 }
      
      res.set('ETag', etag)
      res.set('X-Cache', 'MISS')
      console.log(`✅ API: ${materials.length} malzeme döndürüldü (kaldırılanlar hariç)`)
      res.json(materials)
    } catch (error) {
      console.error('❌ API: Materials listesi alınırken hata:', error)
      
      // Check if it's a quota exceeded error
      if (error.message && error.message.includes('Quota exceeded')) {
        console.warn('🚨 Quota exceeded in final catch - returning empty list')
        res.set('X-Cache', 'QUOTA-EXCEEDED-FINAL')
        res.set('Retry-After', '300')
        return res.json([])
      }
      
      // Final fallback to any cached data
      if (cache.materialsActive.data) {
        console.warn('⚠️  Serving stale cached materials due to error')
        res.set('ETag', cache.materialsActive.etag)
        res.set('X-Cache', 'STALE')
        return res.json(cache.materialsActive.data)
      }
      
      // Last resort: return empty list instead of error
      console.warn('⚠️  No cache available, returning empty materials list')
      res.set('X-Cache', 'FALLBACK')
      res.json([])
    }
  })

  // GET /api/materials/all - Tüm malzemeleri listele (kaldırılanlar dahil)
  app.get('/api/materials/all', requireAuth, async (req, res) => {
    try {
      console.log('📦 API: Tüm materials listesi istendi (kaldırılanlar dahil)')
      
      // Rate limiting check
      if (!checkRateLimit()) {
        return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: 60 })
      }
      
      // Check for cache busting parameter
      const forceRefresh = req.query._t !== undefined
      if (forceRefresh) {
        console.log('🔄 API: Force refresh requested via _t parameter for /all endpoint')
      }
      
      const ifNoneMatch = req.headers['if-none-match']
      
      // Check cache first (skip if force refresh)
      if (!forceRefresh) {
        const cached = getCachedData('materialsAll')
        if (cached) {
          if (ifNoneMatch && ifNoneMatch === cached.etag) {
            return res.status(304).end()
          }
          res.set('ETag', cached.etag)
          res.set('X-Cache', 'HIT')
          return res.json(cached.data)
        }
      }

      let materials
      try {
        // Try Firestore query with safe wrapper
        const snapshot = await safeFirestoreQuery('materials')
        materials = []
        snapshot.forEach(doc => { materials.push({ id: doc.id, ...doc.data() }) })
      } catch (error) {
        if (error.message === 'QUOTA_EXCEEDED') {
          // Check if we have any cached data to serve
          const cachedWithQuotaProtection = getCachedData('materialsAll', true)
          if (cachedWithQuotaProtection) {
            console.warn('🚨 Serving cached all materials due to quota exceeded')
            res.set('ETag', cachedWithQuotaProtection.etag)
            res.set('X-Cache', 'QUOTA-PROTECTED')
            return res.json(cachedWithQuotaProtection.data)
          }
          
          // No cache available, return empty list with quota protection headers
          console.warn('🚨 All materials quota exceeded and no cache available, returning empty list')
          res.set('X-Cache', 'QUOTA-EXCEEDED')
          res.set('Retry-After', '300') // 5 dakika sonra tekrar dene
          return res.json([])
        }
        throw error
      }

      // Update cache
      const now = Date.now()
      const etag = buildEtag(materials)
      cache.materialsAll = { data: materials, ts: now, etag, hits: 0 }
      
      res.set('ETag', etag)
      res.set('X-Cache', 'MISS')
      console.log(`✅ API: ${materials.length} malzeme döndürüldü (tümü)`)
      res.json(materials)
    } catch (error) {
      console.error('❌ API: Tüm materials listesi alınırken hata:', error)
      if (cache.materialsAll.data) {
        console.warn('⚠️  Serving stale cached all-materials due to error')
        res.set('ETag', cache.materialsAll.etag)
        res.set('X-Cache', 'STALE')
        return res.json(cache.materialsAll.data)
      }
      res.status(503).json({ error: 'Tüm materials listesi alınamadı', reason: 'upstream_error' })
    }
  })

  // POST /api/materials - Yeni malzeme ekle
  app.post('/api/materials', requireAuth, async (req, res) => {
    try {
      console.log('📦 API: Yeni malzeme ekleniyor:', req.body)
      
      const materialData = {
        ...req.body,
        status: req.body.status || 'Aktif', // Varsayılan status 'Aktif'
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }
      
      // Custom ID kullan - eğer code varsa onu ID olarak kullan
      const customId = materialData.code || await generateNextMaterialCode()
      
      // Eğer code yok ise otomatik oluştur ve data'ya ekle
      if (!materialData.code) {
        materialData.code = customId
      }
      
      console.log('📦 API: Custom ID kullanılıyor:', customId)
      
      // Custom ID ile document oluştur
      const docRef = getDb().collection('materials').doc(customId)
      await docRef.set(materialData)
      
      const newDoc = await docRef.get()
      const newMaterial = {
        id: newDoc.id,
        ...newDoc.data()
      }
      
      console.log('✅ API: Malzeme eklendi:', newMaterial.id)
      res.status(201).json(newMaterial)
    } catch (error) {
      console.error('❌ API: Malzeme eklenirken hata:', error)
      res.status(500).json({ error: 'Malzeme eklenemedi' })
    }
  })

  // PATCH /api/materials/:id - Malzeme güncelle
  app.patch('/api/materials/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params
      console.log('📦 API: Malzeme güncelleniyor:', id, req.body)
      
      // Stok güncelleme kontrolü - eğer stock değişiyorsa transaction kullan
      if (req.body.stock !== undefined) {
        console.log('⚠️ API: Stok değişikliği tespit edildi, transaction başlatılıyor...')
        
        const materialRef = getDb().collection('materials').doc(id)
        
        const result = await getDb().runTransaction(async (transaction) => {
          const materialDoc = await transaction.get(materialRef)
          
          if (!materialDoc.exists) {
            throw new Error('Malzeme bulunamadı')
          }
          
          const currentData = materialDoc.data()
          const oldStock = currentData.stock || 0
          const newStock = parseInt(req.body.stock) || 0
          const stockDifference = newStock - oldStock
          
          // Update malzeme with new stock
          const updateData = {
            ...req.body,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            available: newStock - (currentData.reserved || 0)
          }
          
          transaction.update(materialRef, updateData)
          
          // Log stock movement if there's a difference
          if (stockDifference !== 0) {
            const stockMovementRef = getDb().collection('stockMovements').doc()
            transaction.set(stockMovementRef, {
              materialId: id,
              materialCode: currentData.code,
              materialName: currentData.name || '',
              type: stockDifference > 0 ? 'in' : 'out',
              subType: 'manual_adjustment',
              quantity: Math.abs(stockDifference),
              unit: currentData.unit || 'Adet',
              stockBefore: oldStock,
              stockAfter: newStock,
              unitCost: currentData.costPrice || null,
              totalCost: currentData.costPrice ? currentData.costPrice * Math.abs(stockDifference) : null,
              currency: 'TRY',
              reference: `Material Edit: ${id}`,
              referenceType: 'manual_edit',
              warehouse: null,
              location: null,
              notes: `Manuel stok düzenleme: ${oldStock} → ${newStock}`,
              reason: 'Admin tarafından manuel güncelleme',
              movementDate: admin.firestore.FieldValue.serverTimestamp(),
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              userId: req.user?.uid || 'system',
              userName: req.user?.name || 'Admin',
              approved: true,
              approvedBy: req.user?.uid || 'system',
              approvedAt: admin.firestore.FieldValue.serverTimestamp()
            })
            
            // Audit log oluştur
            const auditLogRef = getDb().collection('auditLogs').doc()
            transaction.set(auditLogRef, {
              type: 'STOCK_UPDATE',
              action: 'MANUAL_EDIT',
              materialCode: currentData.code,
              materialId: id,
              materialName: currentData.name || '',
              oldStock: oldStock,
              newStock: newStock,
              difference: stockDifference,
              userId: req.user?.uid || 'system',
              userName: req.user?.name || 'Admin',
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              details: {
                operation: 'overwrite',
                editSource: 'edit_modal',
                userAgent: req.headers['user-agent'] || 'Unknown'
              }
            })
          }
          
          return {
            id: id,
            ...currentData,
            ...updateData,
            stock: newStock
          }
        })
        
        console.log(`✅ API: Malzeme güncellendi (transaction): ${id}`)
        // Optional name propagation if name also changed in same request
        if (req.body.name && req.body.name !== result.name) {
          await propagateMaterialNameToOrders(result.code || id, req.body.name)
        }
        res.json(result)
        
      } else {
        // Normal güncelleme (stok değişmiyorsa)
        const updateData = {
          ...req.body,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }
        
        const docRef = getDb().collection('materials').doc(id)
        await docRef.update(updateData)
        
        const updatedDoc = await docRef.get()
        if (!updatedDoc.exists) {
          return res.status(404).json({ error: 'Malzeme bulunamadı' })
        }
        
        const updatedMaterial = {
          id: updatedDoc.id,
          ...updatedDoc.data()
        }
        
        console.log('✅ API: Malzeme güncellendi:', id)
        // If name changed, propagate to orders' embedded items
        if (req.body.name && req.body.name !== (materialData?.name || '')) {
          await propagateMaterialNameToOrders(updatedMaterial.code || id, req.body.name)
        }
        res.json(updatedMaterial)
      }
      
    } catch (error) {
      console.error('❌ API: Malzeme güncellenirken hata:', error)
      res.status(500).json({ error: 'Malzeme güncellenemedi' })
    }
  })

  // DELETE /api/materials/:id - Malzeme sil (Soft Delete)
  app.delete('/api/materials/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params
      console.log('📦 API: Malzeme soft delete yapılıyor:', id)
      
      const docRef = getDb().collection('materials').doc(id)
      const doc = await docRef.get()
      
      if (!doc.exists) {
        return res.status(404).json({ error: 'Malzeme bulunamadı' })
      }
      
      const materialData = doc.data()
      
      // Zaten kaldırılmış malzemeyi tekrar kaldırmaya çalışılıyorsa
      if (materialData.status === 'Kaldırıldı') {
        console.log('⚠️ API: Malzeme zaten kaldırılmış, işlem atlanıyor:', id)
        return res.json({ success: true, id, action: 'already_removed', message: 'Malzeme zaten kaldırılmış' })
      }
      
      // Hard delete yerine soft delete - status'u 'Kaldırıldı' yap
      await docRef.update({
        status: 'Kaldırıldı',
        removedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      })
      
      console.log('✅ API: Malzeme soft delete edildi:', id)
      res.json({ success: true, id, action: 'soft_delete' })
    } catch (error) {
      console.error('❌ API: Malzeme soft delete edilirken hata:', error)
      res.status(500).json({ error: 'Malzeme silinemedi' })
    }
  })

  // DELETE /api/materials/:id/permanent - Malzeme kalıcı sil (Hard Delete - Admin Only)
  app.delete('/api/materials/:id/permanent', requireAuth, async (req, res) => {
    try {
      const { id } = req.params
      console.log('📦 API: Malzeme kalıcı siliniyor (HARD DELETE):', id)
      
      const docRef = getDb().collection('materials').doc(id)
      const doc = await docRef.get()
      
      if (!doc.exists) {
        return res.status(404).json({ error: 'Malzeme bulunamadı' })
      }
      
      // Hard delete - gerçekten sil
      await docRef.delete()
      
      console.log('✅ API: Malzeme kalıcı silindi (HARD DELETE):', id)
      res.json({ success: true, id, action: 'hard_delete' })
    } catch (error) {
      console.error('❌ API: Malzeme kalıcı silinirken hata:', error)
      res.status(500).json({ error: 'Malzeme kalıcı silinemedi' })
    }
  })

  // GET /api/categories - Tüm kategorileri listele
  // Simple cache for categories
  const categoriesCache = { data: null, ts: 0, etag: '' }
  const CAT_TTL_MS = Number(process.env.CATEGORIES_CACHE_TTL_MS || 60_000)
  function buildEtag(items) {
    try { const base = items?.length ? `${items.length}:${items[0]?.id || ''}:${items[items.length-1]?.id || ''}` : '0'; return 'W/"' + Buffer.from(base).toString('base64').slice(0,16) + '"' } catch { return 'W/"0"' }
  }

  app.get('/api/categories', requireAuth, async (req, res) => {
    try {
      console.log('🏷️ API: Kategoriler listesi istendi')
      const now = Date.now()
      const ifNoneMatch = req.headers['if-none-match']
      if (categoriesCache.data && now - categoriesCache.ts < CAT_TTL_MS) {
        if (ifNoneMatch && ifNoneMatch === categoriesCache.etag) return res.status(304).end()
        res.set('ETag', categoriesCache.etag)
        return res.json(categoriesCache.data)
      }

      const snapshot = await getDb().collection('materials-categories').get()
      
      const categories = []
      snapshot.forEach(doc => {
        categories.push({
          id: doc.id,
          ...doc.data()
        })
      })
      
      categoriesCache.data = categories
      categoriesCache.ts = now
      categoriesCache.etag = buildEtag(categories)
      res.set('ETag', categoriesCache.etag)
      console.log(`✅ API: ${categories.length} kategori döndürüldü`)
      res.json(categories)
    } catch (error) {
      console.error('❌ API: Kategoriler listesi alınırken hata:', error)
      if (categoriesCache.data) {
        console.warn('⚠️  Serving cached categories due to error')
        res.set('ETag', categoriesCache.etag)
        return res.json(categoriesCache.data)
      }
      if ((process.env.NODE_ENV || 'development') !== 'production') {
        return res.json([])
      }
      res.status(503).json({ error: 'Kategoriler listesi alınamadı', reason: 'upstream_error' })
    }
  })

  // POST /api/categories - Yeni kategori ekle
  app.post('/api/categories', requireAuth, async (req, res) => {
    try {
      console.log('🏷️ API: Yeni kategori ekleniyor:', req.body)
      
      const categoryData = {
        ...req.body,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }
      
      const docRef = await getDb().collection('materials-categories').add(categoryData)
      const newDoc = await docRef.get()
      
      const newCategory = {
        id: newDoc.id,
        ...newDoc.data()
      }
      
      console.log('✅ API: Kategori eklendi:', newCategory.id)
      res.status(201).json(newCategory)
    } catch (error) {
      console.error('❌ API: Kategori eklenirken hata:', error)
      res.status(500).json({ error: 'Kategori eklenemedi' })
    }
  })

  // PATCH /api/categories/:id - Kategori güncelle
  app.patch('/api/categories/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params
      console.log('🏷️ API: Kategori güncelleniyor:', id, req.body)
      
      const updateData = {
        ...req.body,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }
      
      const docRef = getDb().collection('materials-categories').doc(id)
      await docRef.update(updateData)
      
      const updatedDoc = await docRef.get()
      if (!updatedDoc.exists) {
        return res.status(404).json({ error: 'Kategori bulunamadı' })
      }
      
      const updatedCategory = {
        id: updatedDoc.id,
        ...updatedDoc.data()
      }
      
      console.log('✅ API: Kategori güncellendi:', id)
      res.json(updatedCategory)
    } catch (error) {
      console.error('❌ API: Kategori güncellenirken hata:', error)
      res.status(500).json({ error: 'Kategori güncellenemedi' })
    }
  })

  // DELETE /api/categories/:id - Kategori sil
  app.delete('/api/categories/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params
      console.log('🏷️ API: Kategori siliniyor:', id)
      
      const docRef = getDb().collection('materials-categories').doc(id)
      const doc = await docRef.get()
      
      if (!doc.exists) {
        return res.status(404).json({ error: 'Kategori bulunamadı' })
      }
      
      await docRef.delete()
      
      console.log('✅ API: Kategori silindi:', id)
      res.json({ success: true, id })
    } catch (error) {
      console.error('❌ API: Kategori silinirken hata:', error)
      res.status(500).json({ error: 'Kategori silinemedi' })
    }
  })

  // GET /api/stock - Tüm malzeme stok durumu
  app.get('/api/stock', async (req, res) => {
    try {
      console.log('📦 API: Stok durumu istendi')
      
      const snapshot = await getDb().collection('materials').get()
      const stockData = []
      
      snapshot.forEach(doc => {
        const data = doc.data()
        stockData.push({
          id: doc.id,
          code: data.code,
          name: data.name,
          stock: data.stock || 0,
          available: data.available || 0,
          reserved: data.reserved || 0,
          unit: data.unit || 'Adet',
          reorderPoint: data.reorderPoint || 0,
          category: data.category || 'Diğer',
          supplier: data.supplier || '',
          costPrice: data.costPrice || null,
          lastUpdated: data.updatedAt
        })
      })
      
      console.log(`✅ API: ${stockData.length} malzeme stok durumu döndürüldü`)
      res.json(stockData)
    } catch (error) {
      console.error('❌ API: Stok durumu alınırken hata:', error)
      res.status(500).json({ error: 'Stok durumu alınamadı', details: error.message })
    }
  })

  // PATCH /api/materials/:code/stock - Malzeme stok güncelleme (sipariş teslimi için)
  app.patch('/api/materials/:code/stock', requireAuth, async (req, res) => {
    try {
      const { code } = req.params
      const { quantity, operation = 'add', orderId, itemId, movementType = 'delivery', notes = '' } = req.body
      
      console.log(`📦 API: Stok güncelleme istendi - ${code}: ${operation} ${quantity}`)
      
      // Validation
      if (!quantity || isNaN(quantity) || quantity <= 0) {
        return res.status(400).json({ error: 'Geçerli bir miktar belirtilmelidir' })
      }
      
      if (!['add', 'subtract'].includes(operation)) {
        return res.status(400).json({ error: 'İşlem türü "add" veya "subtract" olmalıdır' })
      }
      
      // Malzemeyi kod ile bul
      const materialQuery = await getDb().collection('materials').where('code', '==', code).get()
      
      if (materialQuery.empty) {
        return res.status(404).json({ error: `Malzeme bulunamadı: ${code}` })
      }
      
      const materialDoc = materialQuery.docs[0]
      const materialData = materialDoc.data()
      const currentStock = materialData.stock || 0
      
      // Yeni stok miktarını hesapla
      const adjustmentQuantity = operation === 'add' ? quantity : -quantity
      const newStock = currentStock + adjustmentQuantity
      
      // Negatif stok kontrolü
      if (newStock < 0) {
        return res.status(400).json({ 
          error: `Stok miktarı negatif olamaz. Mevcut: ${currentStock}, İstenilen: ${adjustmentQuantity}` 
        })
      }
      
      // Batch transaction başlat
      const batch = getDb().batch()
      
      // Malzeme stokunu güncelle
      const materialRef = getDb().collection('materials').doc(materialDoc.id)
      batch.update(materialRef, {
        stock: newStock,
        available: newStock - (materialData.reserved || 0),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastStockUpdate: {
          orderId: orderId || '',
          itemId: itemId || '',
          quantity: adjustmentQuantity,
          previousStock: currentStock,
          newStock: newStock,
          operation: operation,
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        }
      })
      
      // Stock movement kaydı oluştur
      const stockMovementRef = getDb().collection('stockMovements').doc()
      batch.set(stockMovementRef, {
        materialId: materialDoc.id,
        materialCode: code,
        materialName: materialData.name || '',
        type: operation === 'add' ? 'in' : 'out',
        subType: movementType,
        quantity: Math.abs(adjustmentQuantity),
        unit: materialData.unit || 'Adet',
        stockBefore: currentStock,
        stockAfter: newStock,
        unitCost: materialData.costPrice || null,
        totalCost: materialData.costPrice ? materialData.costPrice * Math.abs(adjustmentQuantity) : null,
        currency: 'TRY',
        reference: orderId || itemId || '',
        referenceType: orderId ? 'purchase_order' : 'manual',
        warehouse: null,
        location: null,
        notes: notes || `${operation === 'add' ? 'Stok girişi' : 'Stok çıkışı'} - Backend API`,
        reason: movementType === 'delivery' ? 'Sipariş teslimi' : 'Manuel güncelleme',
        movementDate: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        userId: req.user?.uid || 'system',
        userName: req.user?.name || 'System',
        approved: true,
        approvedBy: req.user?.uid || 'system',
        approvedAt: admin.firestore.FieldValue.serverTimestamp()
      })
      
      // Audit log oluştur
      const auditLogRef = getDb().collection('auditLogs').doc()
      batch.set(auditLogRef, {
        type: 'STOCK_UPDATE',
        action: `STOCK_${operation.toUpperCase()}_API`,
        materialCode: code,
        materialId: materialDoc.id,
        materialName: materialData.name || '',
        orderId: orderId || '',
        itemId: itemId || '',
        quantity: adjustmentQuantity,
        previousStock: currentStock,
        newStock: newStock,
        userId: req.user?.uid || 'system',
        userName: req.user?.name || 'System API',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        details: {
          operation: operation,
          movementType: movementType,
          notes: notes,
          userAgent: req.headers['user-agent'] || 'Unknown'
        }
      })
      
      // Batch commit
      await batch.commit()
      
      console.log(`✅ API: Stok güncellendi - ${code}: ${currentStock} → ${newStock}`)
      
      // Response
      res.json({
        success: true,
        materialCode: code,
        materialName: materialData.name || '',
        previousStock: currentStock,
        newStock: newStock,
        adjustment: adjustmentQuantity,
        operation: operation,
        timestamp: new Date().toISOString()
      })
      
    } catch (error) {
      console.error('❌ API: Stok güncellenirken hata:', error)
      res.status(500).json({ 
        error: 'Stok güncellenemedi', 
        details: error.message 
      })
    }
  })

  console.log('✅ Materials API routes kuruldu')
}
