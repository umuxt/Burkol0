// Suppliers Routes - Firebase Firestore Integration
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, serverTimestamp } from 'firebase/firestore'
import { requireAuth } from './auth.js'

const SUPPLIERS_COLLECTION = 'suppliers'
const SUPPLIER_CATEGORIES_COLLECTION = 'supplierCategories'

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
      const supplierData = {
        ...req.body,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: req.body.status || 'active'
      }

      const docRef = await addDoc(collection(db, SUPPLIERS_COLLECTION), supplierData)
      
      const newSupplier = {
        id: docRef.id,
        ...supplierData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      console.log('✅ New supplier added:', newSupplier.companyName)
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
      const updateData = {
        ...req.body,
        updatedAt: serverTimestamp()
      }

      const supplierRef = doc(db, SUPPLIERS_COLLECTION, id)
      await updateDoc(supplierRef, updateData)

      console.log('✅ Supplier updated:', id)
      res.json({ id, ...updateData, updatedAt: new Date().toISOString() })
    })
  } catch (error) {
    console.error('Error updating supplier:', error)
    res.status(500).json({ error: 'Failed to update supplier' })
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

// Get suppliers by category
export async function getSuppliersByCategory(req, res) {
  try {
    requireAuth(req, res, async () => {
      const { category } = req.params
      
      const suppliersRef = collection(db, SUPPLIERS_COLLECTION)
      const q = query(
        suppliersRef, 
        where('category', '==', category),
        orderBy('companyName', 'asc')
      )
      const snapshot = await getDocs(q)
      
      const suppliers = []
      snapshot.forEach((doc) => {
        suppliers.push({
          id: doc.id,
          ...doc.data()
        })
      })

      console.log(`📋 Fetched ${suppliers.length} suppliers for category: ${category}`)
      res.json(suppliers)
    })
  } catch (error) {
    console.error('Error fetching suppliers by category:', error)
    res.status(500).json({ error: 'Failed to fetch suppliers by category' })
  }
}

// ================================
// SUPPLIER CATEGORIES OPERATIONS
// ================================

// Get all supplier categories
export async function getSupplierCategories(req, res) {
  try {
    requireAuth(req, res, async () => {
      const categoriesRef = collection(db, SUPPLIER_CATEGORIES_COLLECTION)
      const q = query(categoriesRef, orderBy('name', 'asc'))
      const snapshot = await getDocs(q)
      
      const categories = []
      snapshot.forEach((doc) => {
        categories.push({
          id: doc.id,
          ...doc.data()
        })
      })

      console.log(`📋 Fetched ${categories.length} supplier categories`)
      res.json(categories)
    })
  } catch (error) {
    console.error('Error fetching supplier categories:', error)
    res.status(500).json({ error: 'Failed to fetch supplier categories' })
  }
}

// Add new supplier category
export async function addSupplierCategory(req, res) {
  try {
    requireAuth(req, res, async () => {
      const categoryData = {
        ...req.body,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }

      const docRef = await addDoc(collection(db, SUPPLIER_CATEGORIES_COLLECTION), categoryData)
      
      const newCategory = {
        id: docRef.id,
        ...categoryData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      console.log('✅ New supplier category added:', newCategory.name)
      res.status(201).json(newCategory)
    })
  } catch (error) {
    console.error('Error adding supplier category:', error)
    res.status(500).json({ error: 'Failed to add supplier category' })
  }
}

// ================================
// MATERIAL-SUPPLIER RELATIONS
// ================================

// Add material to supplier
export async function addMaterialToSupplier(req, res) {
  try {
    requireAuth(req, res, async () => {
      const { supplierId } = req.params
      const { materialId, price, deliveryTime, minQuantity } = req.body

      const relationData = {
        supplierId,
        materialId,
        price: parseFloat(price) || 0,
        deliveryTime: deliveryTime || '',
        minQuantity: parseInt(minQuantity) || 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isActive: true
      }

      const docRef = await addDoc(collection(db, 'materialSupplierRelations'), relationData)
      
      const newRelation = {
        id: docRef.id,
        ...relationData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      console.log('✅ Material-supplier relation added:', newRelation)
      res.status(201).json(newRelation)
    })
  } catch (error) {
    console.error('Error adding material to supplier:', error)
    res.status(500).json({ error: 'Failed to add material to supplier' })
  }
}

// Get suppliers for a material
export async function getSuppliersForMaterial(req, res) {
  try {
    requireAuth(req, res, async () => {
      const { materialId } = req.params
      
      const relationsRef = collection(db, 'materialSupplierRelations')
      const q = query(
        relationsRef, 
        where('materialId', '==', materialId),
        where('isActive', '==', true)
      )
      const snapshot = await getDocs(q)
      
      const relations = []
      snapshot.forEach((doc) => {
        relations.push({
          id: doc.id,
          ...doc.data()
        })
      })

      console.log(`📋 Fetched ${relations.length} suppliers for material: ${materialId}`)
      res.json(relations)
    })
  } catch (error) {
    console.error('Error fetching suppliers for material:', error)
    res.status(500).json({ error: 'Failed to fetch suppliers for material' })
  }
}