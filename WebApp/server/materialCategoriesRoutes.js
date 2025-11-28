// materialCategoriesRoutes.js - PostgreSQL Integration
import MaterialCategories from '../db/models/materialCategories.js'
import db from '../db/connection.js'

// Table references
const MATERIALS_TABLE = 'materials.materials'

// ===============================
// MATERIAL CATEGORY MANAGEMENT (CRUD)
// ===============================

// GET all categories
export async function getMaterialCategories(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    try {
        const categories = await MaterialCategories.getAllCategories()
        res.json(categories)
    } catch (error) {
        console.error("Error fetching material categories:", error)
        res.status(500).send("Server error while fetching categories")
    }
}

// GET usage for a single category
export async function getMaterialCategoryUsage(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    try {
        const { id } = req.params
        
        // Get all materials in this category
        const allMaterials = await db(MATERIALS_TABLE)
            .where({ category: id })
            .select('*')
        
        // Separate by status
        const activeMaterials = allMaterials.filter(material => material.status !== 'Kaldırıldı')
        const removedMaterials = allMaterials.filter(material => material.status === 'Kaldırıldı')
        
        res.json({ 
            active: activeMaterials.length,
            removed: removedMaterials.length,
            activeMaterials,
            removedMaterials
        })
    } catch (error) {
        console.error(`Error checking category usage for ID ${req.params.id}:`, error)
        res.status(500).send("Server error while checking category usage")
    }
}

// POST a new category
export async function createMaterialCategory(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    try {
        const { name, id } = req.body
        
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).send("Category name is required and must be a string")
        }
        
        // Generate ID if not provided
        const categoryId = id || `cat_${Date.now()}`
        
        const newCategory = await MaterialCategories.createCategory({
            id: categoryId,
            name: name.trim(),
            description: req.body.description || null,
            parentCategory: req.body.parentCategory || req.body.parent_category || null,
            icon: req.body.icon || null,
            color: req.body.color || null,
            sortOrder: req.body.sortOrder || req.body.sort_order || 0
        })
        
        res.status(201).json(newCategory)
    } catch (error) {
        console.error("Error adding material category:", error)
        res.status(500).send("Server error")
    }
}

// PUT/update a category
export async function updateMaterialCategory(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    try {
        const { id } = req.params
        const { name } = req.body
        
        if (!name || name.trim() === '') {
            return res.status(400).send("Category name is required")
        }
        
        const updatedCategory = await MaterialCategories.updateCategory(id, {
            name: name.trim(),
            description: req.body.description,
            parentCategory: req.body.parentCategory || req.body.parent_category,
            icon: req.body.icon,
            color: req.body.color,
            sortOrder: req.body.sortOrder || req.body.sort_order
        })
        
        res.json(updatedCategory)
    } catch (error) {
        console.error("Error updating material category:", error)
        res.status(500).send("Server error")
    }
}

// DELETE a category
export async function deleteMaterialCategory(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    try {
        const { id } = req.params
        const { updateRemoved } = req.query
        console.log(`🗑️ Deleting category ${id}, updateRemoved: ${updateRemoved}`)

        // Get materials in this category
        const categoryMaterials = await db(MATERIALS_TABLE)
            .where({ category: id })
            .select('*')
        
        // Check for active materials
        const activeMaterials = categoryMaterials.filter(material => material.status !== 'Kaldırıldı')
        
        if (activeMaterials.length > 0) {
            const materialInUse = activeMaterials[0]
            return res.status(400).send(
                `Kullanımda olan kategoriler kaldırılamaz. ${materialInUse.name} malzemesi hala bu kategoriyi kullanıyor.`
            )
        }

        // Update removed materials if requested
        if (updateRemoved === 'true') {
            const removedMaterials = categoryMaterials.filter(material => material.status === 'Kaldırıldı')
            
            if (removedMaterials.length > 0) {
                await db(MATERIALS_TABLE)
                    .where({ category: id })
                    .whereIn('code', removedMaterials.map(m => m.code))
                    .update({ category: null })
                
                console.log(`✅ Updated ${removedMaterials.length} removed materials`)
            }
        }

        // Delete the category
        await MaterialCategories.deleteCategory(id)
        console.log(`✅ Category ${id} deleted successfully`)
        
        res.status(204).send()

    } catch (error) {
        console.error("Error deleting material category:", error)
        console.error("Error details:", error.message, error.stack)
        res.status(500).json({ error: "Server error", details: error.message })
    }
}
