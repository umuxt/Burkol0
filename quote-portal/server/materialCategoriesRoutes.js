// materialCategoriesRoutes.js - Firebase Admin SDK Integration (Backend Only)
import admin from 'firebase-admin';

// Lazy-initialized db instance
let db;
function getDb() {
  if (!db) {
    db = admin.firestore();
  }
  return db;
}

// ===============================
// MATERIAL CATEGORY MANAGEMENT (CRUD)
// ===============================

// GET all categories from the dedicated collection
export async function getMaterialCategories(req, res) {
    try {
        const snapshot = await getDb().collection('materials-categories').orderBy('name').get();
        const categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(categories);
    } catch (error) {
        console.error("Error fetching material categories:", error);
        res.status(500).send("Server error while fetching categories");
    }
}

// GET usage for a single category
export async function getMaterialCategoryUsage(req, res) {
    try {
        const { id } = req.params;
        const materialsRef = getDb().collection('materials');
        
        // İki farklı query - eski data categoryId, yeni data category kullanıyor olabilir
        let allMaterials = [];
        
        try {
            // Önce 'category' field ile dene (yeni format)
            const categoryQuery = materialsRef.where('category', '==', id);
            const categorySnapshot = await categoryQuery.get();
            allMaterials = categorySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (categoryError) {
            console.log('Category query failed, trying categoryId...', categoryError.message);
        }
        
        // Eğer 'category' ile hiç data gelmezse, 'categoryId' ile dene (eski format)
        if (allMaterials.length === 0) {
            try {
                const categoryIdQuery = materialsRef.where('categoryId', '==', id);
                const categoryIdSnapshot = await categoryIdQuery.get();
                allMaterials = categoryIdSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (categoryIdError) {
                console.log('CategoryId query also failed:', categoryIdError.message);
            }
        }
        
        // Backend'de status'a göre ayır
        const activeMaterials = allMaterials.filter(material => material.status !== 'Kaldırıldı');
        const removedMaterials = allMaterials.filter(material => material.status === 'Kaldırıldı');
        
        res.json({ 
            active: activeMaterials.length,
            removed: removedMaterials.length,
            activeMaterials,
            removedMaterials
        });
    } catch (error) {
        console.error(`Error checking category usage for ID ${req.params.id}:`, error);
        res.status(500).send("Server error while checking category usage");
    }
}

// POST a new category
export async function createMaterialCategory(req, res) {
    try {
        const { name } = req.body;
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).send("Category name is required and must be a string");
        }
        const newCategoryRef = await getDb().collection('materials-categories').add({ name });
        const newCategory = { id: newCategoryRef.id, name };
        res.status(201).json(newCategory);
    } catch (error) {
        console.error("Error adding material category:", error);
        res.status(500).send("Server error");
    }
}

// PUT/update a category
export async function updateMaterialCategory(req, res) {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).send("Category name is required");
        }
        await getDb().collection('materials-categories').doc(id).update({ name });
        res.json({ id, name });
    } catch (error) {
        console.error("Error updating material category:", error);
        res.status(500).send("Server error");
    }
}

// DELETE a category
export async function deleteMaterialCategory(req, res) {
    try {
        const { id } = req.params;
        const { updateRemoved } = req.query;
        console.log(`🗑️ Deleting category ${id}, updateRemoved: ${updateRemoved}`);

        // Use the same approach as getMaterialCategoryUsage to avoid index issues
        let categoryMaterials = [];
        
        try {
            // Try 'category' field first
            const categoryQuery = getDb().collection('materials').where('category', '==', id);
            const categorySnapshot = await categoryQuery.get();
            categoryMaterials = categorySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (categoryError) {
            console.log('Category field query failed, trying categoryId...', categoryError.message);
        }
        
        // If no results with 'category', try 'categoryId'
        if (categoryMaterials.length === 0) {
            try {
                const categoryIdQuery = getDb().collection('materials').where('categoryId', '==', id);
                const categoryIdSnapshot = await categoryIdQuery.get();
                categoryMaterials = categoryIdSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (categoryIdError) {
                console.log('CategoryId field query also failed:', categoryIdError.message);
            }
        }
        
        // Check for active materials
        const activeMaterials = categoryMaterials.filter(material => material.status !== 'Kaldırıldı');
        if (activeMaterials.length > 0) {
            const materialInUse = activeMaterials[0];
            return res.status(400).send(`Kullanımda olan kategoriler kaldırılamaz. ${materialInUse.name} malzemesi hala bu kategoriyi kullanıyor.`);
        }

        if (updateRemoved === 'true') {
            // Update removed materials - use the same materials we already fetched
            const removedMaterials = categoryMaterials.filter(material => material.status === 'Kaldırıldı');
            
            if (removedMaterials.length > 0) {
                const batch = getDb().batch();
                removedMaterials.forEach(material => {
                    const docRef = getDb().collection('materials').doc(material.id);
                    // Update whichever field exists
                    if (material.category === id) {
                        batch.update(docRef, { category: null });
                    } else if (material.categoryId === id) {
                        batch.update(docRef, { categoryId: null });
                    }
                });
                await batch.commit();
                console.log(`✅ Updated ${removedMaterials.length} removed materials`);
            }
        }

        await getDb().collection('materials-categories').doc(id).delete();
        console.log(`✅ Category ${id} deleted successfully`);
        res.status(204).send();

    } catch (error) {
        console.error("Error deleting material category:", error);
        console.error("Error details:", error.message, error.stack);
        res.status(500).json({ error: "Server error", details: error.message });
    }
}
