// Materials API Routes - Firebase Admin SDK kullanarak
import admin from 'firebase-admin'
import { requireAuth } from './auth.js'

const db = admin.firestore()

// Materials collection reference
const materialsCollection = db.collection('materials')
const categoriesCollection = db.collection('materials-categories')

// Helper function to generate next material code
async function generateNextMaterialCode() {
  try {
    const snapshot = await materialsCollection.get()
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

export function setupMaterialsRoutes(app) {
  
  // GET /api/materials - Tüm malzemeleri listele (kaldırılanlar hariç)
  app.get('/api/materials', requireAuth, async (req, res) => {
    try {
      console.log('📦 API: Materials listesi istendi')
      
      // Kaldırılan malzemeleri hariç tut - Firebase query ile filtrele
      const snapshot = await materialsCollection
        .where('status', '!=', 'Kaldırıldı')
        .get()
      
      const materials = []
      snapshot.forEach(doc => {
        materials.push({
          id: doc.id,
          ...doc.data()
        })
      })
      
      console.log(`✅ API: ${materials.length} malzeme döndürüldü (kaldırılanlar hariç)`)
      res.json(materials)
    } catch (error) {
      console.error('❌ API: Materials listesi alınırken hata:', error)
      res.status(500).json({ error: 'Materials listesi alınamadı' })
    }
  })

  // GET /api/materials/all - Tüm malzemeleri listele (kaldırılanlar dahil)
  app.get('/api/materials/all', requireAuth, async (req, res) => {
    try {
      console.log('📦 API: Tüm materials listesi istendi (kaldırılanlar dahil)')
      const snapshot = await materialsCollection.get()
      
      const materials = []
      snapshot.forEach(doc => {
        materials.push({
          id: doc.id,
          ...doc.data()
        })
      })
      
      console.log(`✅ API: ${materials.length} malzeme döndürüldü (tümü)`)
      res.json(materials)
    } catch (error) {
      console.error('❌ API: Tüm materials listesi alınırken hata:', error)
      res.status(500).json({ error: 'Tüm materials listesi alınamadı' })
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
      const docRef = materialsCollection.doc(customId)
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
      
      const updateData = {
        ...req.body,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }
      
      const docRef = materialsCollection.doc(id)
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
      res.json(updatedMaterial)
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
      
      const docRef = materialsCollection.doc(id)
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
      
      const docRef = materialsCollection.doc(id)
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
  app.get('/api/categories', requireAuth, async (req, res) => {
    try {
      console.log('🏷️ API: Kategoriler listesi istendi')
      const snapshot = await categoriesCollection.get()
      
      const categories = []
      snapshot.forEach(doc => {
        categories.push({
          id: doc.id,
          ...doc.data()
        })
      })
      
      console.log(`✅ API: ${categories.length} kategori döndürüldü`)
      res.json(categories)
    } catch (error) {
      console.error('❌ API: Kategoriler listesi alınırken hata:', error)
      res.status(500).json({ error: 'Kategoriler listesi alınamadı' })
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
      
      const docRef = await categoriesCollection.add(categoryData)
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
      
      const docRef = categoriesCollection.doc(id)
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
      
      const docRef = categoriesCollection.doc(id)
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

  console.log('✅ Materials API routes kuruldu')
}