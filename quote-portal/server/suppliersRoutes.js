// Suppliers Routes - Firebase Firestore Integration
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, query, where, orderBy, serverTimestamp, setDoc } from 'firebase/firestore'
import { requireAuth } from './auth.js'

const SUPPLIERS_COLLECTION = 'suppliers'

// Initialize Firestore
let db
try {
  const { initializeApp } = await import('firebase/app')
  const firebaseConfig = {
    apiKey: "AIzaSyCjk0dG1CjZECHzwT9cr9S19XhnMnTYgmI",
    authDomain: "burkolmetal-726f3.firebaseapp.com",
    projectId: "burkolmetal-726f3",
    storageBucket: "burkolmetal-726f3.appspot.com",
    messagingSenderId: "271422310075",
    appId: "1:271422310075:web:0f466fc8deeed58f4d4b9e",
    measurementId: "G-25LT6XSH60"
  }
  const app = initializeApp(firebaseConfig)
  db = getFirestore(app)
} catch (error) {
  console.error('Firebase initialization error:', error)
}

// Helper function to generate next supplier code
async function generateNextSupplierCode() {
  try {
    const suppliersRef = collection(db, SUPPLIERS_COLLECTION)
    const snapshot = await getDocs(suppliersRef)
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
    requireAuth(req, res, async () => {
      const suppliersRef = collection(db, SUPPLIERS_COLLECTION)
      const q = query(suppliersRef, orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      
      const suppliers = []
      snapshot.forEach((doc) => {
        suppliers.push({
          id: doc.id,
          ...doc.data()
        })
      })

      console.log(`📋 Fetched ${suppliers.length} suppliers from Firestore`)
      res.json(suppliers)
    })
  } catch (error) {
    console.error('Error fetching suppliers:', error)
    res.status(500).json({ error: 'Failed to fetch suppliers' })
  }
}

// Add new supplier
export async function addSupplier(req, res) {
  try {
    requireAuth(req, res, async () => {
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
      const docRef = doc(db, SUPPLIERS_COLLECTION, customId)
      await setDoc(docRef, finalSupplierData)
      
      console.log(`✅ Supplier ${customId} created with ${(suppliedMaterials || []).length} materials`)
      
      const newSupplier = {
        id: customId,
        ...finalSupplierData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      console.log('✅ New supplier added:', newSupplier.name || newSupplier.companyName)
      res.status(201).json(newSupplier)
    })
  } catch (error) {
    console.error('Error adding supplier:', error)
    res.status(500).json({ error: 'Failed to add supplier' })
  }
}

// Update supplier
export async function updateSupplier(req, res) {
  try {
    requireAuth(req, res, async () => {
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
      const supplierRef = doc(db, SUPPLIERS_COLLECTION, id)
      const supplierDoc = await getDoc(supplierRef)
      
      console.log('🔍 Checking supplier existence:', {
        id,
        exists: supplierDoc.exists(),
        data: supplierDoc.exists() ? supplierDoc.data() : null
      })
      
      if (!supplierDoc.exists()) {
        // Try to find all suppliers to see what IDs exist
        const allSuppliersRef = collection(db, SUPPLIERS_COLLECTION)
        const allSnapshot = await getDocs(allSuppliersRef)
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
      
      await updateDoc(supplierRef, updateData)

      console.log('✅ Supplier updated successfully:', id)
      res.json({ id, ...updateData, updatedAt: new Date().toISOString() })
    })
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
    requireAuth(req, res, async () => {
      const { id } = req.params
      
      const supplierRef = doc(db, SUPPLIERS_COLLECTION, id)
      await deleteDoc(supplierRef)

      console.log('🗑️ Supplier deleted:', id)
      res.json({ message: 'Supplier deleted successfully' })
    })
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
      const supplierRef = doc(db, SUPPLIERS_COLLECTION, supplierId)
      const supplierDoc = await getDoc(supplierRef)
      
      if (!supplierDoc.exists()) {
        return res.status(404).json({ error: 'Supplier not found' })
      }

      const supplierData = supplierDoc.data()
      const currentMaterials = supplierData.suppliedMaterials || []
      
      // Malzeme zaten ekli mi kontrol et
      const materialExists = currentMaterials.some(m => m.materialId === materialId)
      if (materialExists) {
        return res.status(400).json({ error: 'Material already added to supplier' })
      }

      // Yeni malzemeyi ekle
      const newMaterial = {
        materialId,
        materialCode,
        materialName,
        price: parseFloat(price) || 0,
        deliveryTime: deliveryTime || '',
        minQuantity: parseInt(minQuantity) || 1,
        addedAt: new Date().toISOString()
      }

      const updatedMaterials = [...currentMaterials, newMaterial]
      
      await updateDoc(supplierRef, {
        suppliedMaterials: updatedMaterials,
        updatedAt: serverTimestamp()
      })

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
    requireAuth(req, res, async () => {
      const { materialId } = req.params
      
      const suppliersRef = collection(db, SUPPLIERS_COLLECTION)
      const q = query(suppliersRef, where('status', '==', 'active'))
      const snapshot = await getDocs(q)
      
      const suppliers = []
      snapshot.forEach((doc) => {
        const data = doc.data()
        const suppliedMaterials = data.suppliedMaterials || []
        
        // Bu supplier bu malzemeyi sağlıyor mu?
        const suppliesMaterial = suppliedMaterials.some(m => m.materialId === materialId)
        if (suppliesMaterial) {
          suppliers.push({
            id: doc.id,
            ...data
          })
        }
      })

      console.log(`📋 Found ${suppliers.length} suppliers for material ${materialId}`)
      res.json(suppliers)
    })
  } catch (error) {
    console.error('Error fetching suppliers for material:', error)
    res.status(500).json({ error: 'Failed to fetch suppliers for material' })
  }
}

// Get materials supplied by a specific supplier
export async function getMaterialsForSupplier(req, res) {
  try {
    requireAuth(req, res, async () => {
      const { supplierId } = req.params
      
      const supplierRef = doc(db, SUPPLIERS_COLLECTION, supplierId)
      const supplierDoc = await getDoc(supplierRef)
      
      if (!supplierDoc.exists()) {
        return res.status(404).json({ error: 'Supplier not found' })
      }

      const supplierData = supplierDoc.data()
      const materials = supplierData.suppliedMaterials || []

      console.log(`📋 Found ${materials.length} materials for supplier ${supplierId}`)
      res.json(materials)
    })
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
      // Önce tüm materyalleri çek
      const materialsRef = collection(db, 'materials')
      const materialsSnapshot = await getDocs(materialsRef)
      
      const materialCategories = new Map()
      materialsSnapshot.forEach((doc) => {
        const material = doc.data()
        if (material.category) {
          materialCategories.set(doc.id, material.category)
        }
      })

      // Tüm supplier'ları çek
      const suppliersRef = collection(db, SUPPLIERS_COLLECTION)
      const suppliersSnapshot = await getDocs(suppliersRef)
      
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
      res.json(categories)
    })
  } catch (error) {
    console.error('Error fetching supplier categories:', error)
    res.status(500).json({ error: 'Failed to fetch supplier categories' })
  }
}

// Get suppliers by category (dinamik olarak malzeme kategorilerine göre)
export async function getSuppliersByCategory(req, res) {
  try {
    requireAuth(req, res, async () => {
      const { category } = req.params
      
      // Önce bu kategorideki materyalleri bul
      const materialsRef = collection(db, 'materials')
      const materialsQuery = query(materialsRef, where('category', '==', category))
      const materialsSnapshot = await getDocs(materialsQuery)
      
      const materialIds = []
      materialsSnapshot.forEach((doc) => {
        materialIds.push(doc.id)
      })

      if (materialIds.length === 0) {
        return res.json([])
      }

      // Bu materyalleri sağlayan supplier'ları bul
      const suppliersRef = collection(db, SUPPLIERS_COLLECTION)
      const suppliersSnapshot = await getDocs(suppliersRef)
      
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