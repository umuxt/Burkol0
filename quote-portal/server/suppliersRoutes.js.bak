// Suppliers Routes - Firebase Admin SDK Integration (Backend Only)
import admin from 'firebase-admin'

// Lazy-initialized db instance to prevent crash on startup
let db;
function getDb() {
  if (!db) {
    db = admin.firestore();
  }
  return db;
}

// ================================
// SUPPLIERS CRUD OPERATIONS (Existing functions)
// ================================

async function generateNextSupplierCode() {
    const snapshot = await getDb().collection('suppliers').orderBy('code', 'desc').limit(1).get();
    if (snapshot.empty) {
        return 'T-0001';
    }
    const lastCode = snapshot.docs[0].data().code || 'T-0000';
    const lastNumber = parseInt(lastCode.split('-')[1]);
    const nextNumber = lastNumber + 1;
    return `T-${String(nextNumber).padStart(4, '0')}`;
}

export async function getAllSuppliers(req, res) {
    try {
        const snapshot = await getDb().collection('suppliers').get();
        const suppliers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(suppliers);
    } catch (error) {
        console.error('Error getting all suppliers:', error);
        res.status(500).json({ error: 'Failed to get suppliers' });
    }
}

export async function addSupplier(req, res) {
  try {
      const { suppliedMaterials, ...supplierData } = req.body
      const customId = supplierData.code || await generateNextSupplierCode()
      if (!supplierData.code) {
        supplierData.code = customId
      }
      const finalSupplierData = {
        ...supplierData,
        suppliedMaterials: suppliedMaterials || [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: supplierData.status || 'active'
      }
      const docRef = getDb().collection('suppliers').doc(customId)
      await docRef.set(finalSupplierData)
      const newSupplier = {
        id: customId,
        ...finalSupplierData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      res.status(201).json(newSupplier)
  } catch (error) {
    console.error('Error adding supplier:', error)
    res.status(500).json({ error: 'Failed to add supplier' })
  }
}

export async function updateSupplier(req, res) {
    try {
        const { id } = req.params;
        const updateData = { ...req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        await getDb().collection('suppliers').doc(id).update(updateData);
        res.json({ id, ...updateData, updatedAt: new Date().toISOString() });
    } catch (error) {
        console.error('Error updating supplier:', error);
        res.status(500).json({ error: 'Failed to update supplier' });
    }
}

export async function deleteSupplier(req, res) {
  try {
    const { id } = req.params
    await getDb().collection('suppliers').doc(id).delete()
    res.json({ message: 'Supplier deleted successfully' })
  } catch (error) {
    console.error('Error deleting supplier:', error)
    res.status(500).json({ error: 'Failed to delete supplier' })
  }
}

// ================================
// MATERIAL-SUPPLIER OPERATIONS
// ================================

export async function addMaterialToSupplier(req, res) {
  try {
      const { supplierId } = req.params
      const { materialId, materialCode, materialName, price, deliveryTime, minQuantity } = req.body
      const supplierRef = getDb().collection('suppliers').doc(supplierId)
      const supplierDoc = await supplierRef.get()
      if (!supplierDoc.exists) {
        return res.status(404).json({ error: 'Supplier not found' })
      }
      const supplierData = supplierDoc.data()
      const currentMaterials = supplierData.suppliedMaterials || []
      const materialExists = currentMaterials.some(m => m.materialId === materialId)
      if (materialExists) {
        return res.status(400).json({ error: 'Material already added to supplier' })
      }
      let materialCategory = ''
      let materialUnit = ''
      const materialDoc = await getDb().collection('materials').doc(materialId).get()
      if (materialDoc.exists) {
          const materialData = materialDoc.data()
          materialCategory = materialData.category || ''
          materialUnit = materialData.unit || ''
      }
      const newMaterial = {
        materialId,
        materialCode,
        materialName,
        id: materialId,
        code: materialCode,
        name: materialName,
        category: materialCategory,
        unit: materialUnit,
        price: parseFloat(price) || 0,
        deliveryTime: deliveryTime || '',
        minQuantity: parseInt(minQuantity) || 1,
        addedAt: new Date().toISOString(),
        status: 'aktif'
      }
      await supplierRef.update({
        suppliedMaterials: admin.firestore.FieldValue.arrayUnion(newMaterial),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      })
      res.status(201).json(newMaterial)
  } catch (error) {
    console.error('Error adding material to supplier:', error)
    res.status(500).json({ error: 'Failed to add material to supplier' })
  }
}

export async function getSuppliersForMaterial(req, res) {
  try {
    const { materialId } = req.params
    const snapshot = await getDb().collection('suppliers').where('status', '==', 'active').where('suppliedMaterials', 'array-contains', { materialId }).get();
    const suppliers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(suppliers)
  } catch (error) {
    console.error('Error fetching suppliers for material:', error)
    res.status(500).json({ error: 'Failed to fetch suppliers for material' })
  }
}

export async function getMaterialsForSupplier(req, res) {
  try {
    const { supplierId } = req.params
    const supplierDoc = await getDb().collection('suppliers').doc(supplierId).get()
    if (!supplierDoc.exists) {
      return res.status(404).json({ error: 'Supplier not found' })
    }
    const materials = supplierDoc.data().suppliedMaterials || []
    res.json(materials)
  } catch (error) {
    console.error('Error fetching materials for supplier:', error)
    res.status(500).json({ error: 'Failed to fetch materials for supplier' })
  }
}

export async function getSuppliersByCategory(req, res) {
    // This function might need re-evaluation as categories are now static.
    // For now, it can remain as-is, but it's not efficient.
    try {
        const { category } = req.params;
        const snapshot = await getDb().collection('suppliers').where('categories', 'array-contains', category).get();
        const suppliers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(suppliers);
    } catch (error) {
        console.error('Error fetching suppliers by category:', error);
        res.status(500).json({ error: 'Failed to fetch suppliers by category' });
    }
}
