// Materials API Routes - Firebase Admin SDK kullanarak
import admin from 'firebase-admin'
import { requireAuth } from './auth.js'

const db = admin.firestore()

// Materials collection reference
const materialsCollection = db.collection('materials')
const categoriesCollection = db.collection('categories')

export function setupMaterialsRoutes(app) {
  
  // GET /api/materials - Tüm malzemeleri listele
  app.get('/api/materials', requireAuth, async (req, res) => {
    try {
      console.log('📦 API: Materials listesi istendi')
      const snapshot = await materialsCollection.get()
      
      const materials = []
      snapshot.forEach(doc => {
        materials.push({
          id: doc.id,
          ...doc.data()
        })
      })
      
      console.log(`✅ API: ${materials.length} malzeme döndürüldü`)
      res.json(materials)
    } catch (error) {
      console.error('❌ API: Materials listesi alınırken hata:', error)
      res.status(500).json({ error: 'Materials listesi alınamadı' })
    }
  })

  // POST /api/materials - Yeni malzeme ekle
  app.post('/api/materials', requireAuth, async (req, res) => {
    try {
      console.log('📦 API: Yeni malzeme ekleniyor:', req.body)
      
      const materialData = {
        ...req.body,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }
      
      const docRef = await materialsCollection.add(materialData)
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

  // DELETE /api/materials/:id - Malzeme sil
  app.delete('/api/materials/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params
      console.log('📦 API: Malzeme siliniyor:', id)
      
      const docRef = materialsCollection.doc(id)
      const doc = await docRef.get()
      
      if (!doc.exists) {
        return res.status(404).json({ error: 'Malzeme bulunamadı' })
      }
      
      await docRef.delete()
      
      console.log('✅ API: Malzeme silindi:', id)
      res.json({ success: true, id })
    } catch (error) {
      console.error('❌ API: Malzeme silinirken hata:', error)
      res.status(500).json({ error: 'Malzeme silinemedi' })
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