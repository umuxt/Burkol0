import admin from 'firebase-admin'
import { requireAuth } from './auth.js'

// Firebase Admin SDK bağlantısı
const db = admin.firestore()

// Collections
const supplierCategoriesCollection = db.collection('suppliers-categories')

export function createSupplierCategoriesRoutes(app) {
  console.log('🔧 Supplier Categories API routes kuruluyor...')

  // GET /api/supplier-categories - Tüm tedarikçi kategorilerini listele
  app.get('/api/supplier-categories', requireAuth, async (req, res) => {
    try {
      console.log('📋 API: Tedarikçi kategorileri isteniyor...')
      const snapshot = await supplierCategoriesCollection.get()
      
      const categories = []
      snapshot.forEach(doc => {
        categories.push({
          id: doc.id,
          ...doc.data()
        })
      })

      console.log(`✅ API: ${categories.length} tedarikçi kategorisi döndürüldü`)
      res.json(categories)
    } catch (error) {
      console.error('❌ API: Tedarikçi kategorileri alınırken hata:', error)
      res.status(500).json({ error: 'Tedarikçi kategorileri alınamadı', details: error.message })
    }
  })

  // POST /api/supplier-categories - Yeni tedarikçi kategorisi ekle
  app.post('/api/supplier-categories', requireAuth, async (req, res) => {
    try {
      const categoryData = {
        name: req.body.name,
        description: req.body.description || '',
        color: req.body.color || '#6b7280',
        status: req.body.status || 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }

      console.log('📝 API: Yeni tedarikçi kategorisi ekleniyor:', categoryData.name)
      const docRef = await supplierCategoriesCollection.add(categoryData)
      
      const newCategory = {
        id: docRef.id,
        ...categoryData,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      console.log('✅ API: Tedarikçi kategorisi eklendi:', docRef.id)
      res.status(201).json(newCategory)
    } catch (error) {
      console.error('❌ API: Tedarikçi kategorisi eklenirken hata:', error)
      res.status(500).json({ error: 'Tedarikçi kategorisi eklenemedi', details: error.message })
    }
  })

  // PATCH /api/supplier-categories/:id - Tedarikçi kategorisi güncelle
  app.patch('/api/supplier-categories/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params
      const updates = {
        ...req.body,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }

      console.log(`📝 API: Tedarikçi kategorisi güncelleniyor: ${id}`)
      const docRef = supplierCategoriesCollection.doc(id)
      
      // Kategorinin var olup olmadığını kontrol et
      const doc = await docRef.get()
      if (!doc.exists) {
        return res.status(404).json({ error: 'Tedarikçi kategorisi bulunamadı' })
      }

      await docRef.update(updates)
      
      const updatedCategory = {
        id: id,
        ...doc.data(),
        ...updates,
        updatedAt: new Date()
      }

      console.log('✅ API: Tedarikçi kategorisi güncellendi:', id)
      res.json(updatedCategory)
    } catch (error) {
      console.error('❌ API: Tedarikçi kategorisi güncellenirken hata:', error)
      res.status(500).json({ error: 'Tedarikçi kategorisi güncellenemedi', details: error.message })
    }
  })

  // DELETE /api/supplier-categories/:id - Tedarikçi kategorisi sil
  app.delete('/api/supplier-categories/:id', requireAuth, async (req, res) => {
    try {
      const { id } = req.params

      console.log(`🗑️ API: Tedarikçi kategorisi siliniyor: ${id}`)
      const docRef = supplierCategoriesCollection.doc(id)
      
      // Kategorinin var olup olmadığını kontrol et
      const doc = await docRef.get()
      if (!doc.exists) {
        return res.status(404).json({ error: 'Tedarikçi kategorisi bulunamadı' })
      }

      await docRef.delete()

      console.log('✅ API: Tedarikçi kategorisi silindi:', id)
      res.json({ message: 'Tedarikçi kategorisi başarıyla silindi', id })
    } catch (error) {
      console.error('❌ API: Tedarikçi kategorisi silinirken hata:', error)
      res.status(500).json({ error: 'Tedarikçi kategorisi silinemedi', details: error.message })
    }
  })

  console.log('✅ Supplier Categories API routes kuruldu')
}