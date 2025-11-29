/**
 * Materials Model
 * PostgreSQL data access layer for materials.materials table
 */

import db from '../connection.js'

// Table references with schema
const MATERIALS_TABLE = 'materials.materials'
const CATEGORIES_TABLE = 'materials.materials_categories'
const SUPPLIERS_TABLE = 'materials.suppliers'

/**
 * Get all materials (including inactive) with suppliers
 */
export async function getAllMaterials() {
  try {
    const materials = await db(MATERIALS_TABLE)
      .select('*')
      .orderBy('code', 'asc')
    
    // Get suppliers for each material
    const materialsWithSuppliers = await Promise.all(
      materials.map(async (material) => {
        const suppliers = await db('materials.material_supplier_relation')
          .select(
            'materials.suppliers.id',
            'materials.suppliers.code',
            'materials.suppliers.name',
            'materials.material_supplier_relation.isPrimary'
          )
          .join('materials.suppliers', 'materials.material_supplier_relation.supplierId', '=', 'materials.suppliers.id')
          .where('materials.material_supplier_relation.materialId', material.id)
          .orderBy('materials.material_supplier_relation.isPrimary', 'desc')
        
        return {
          ...material,
          suppliers: suppliers.map(s => s.name),
          supplier: suppliers.find(s => s.isPrimary)?.name || suppliers[0]?.name || ''
        }
      })
    )
    
    return materialsWithSuppliers
  } catch (error) {
    console.error('❌ Error getting all materials:', error)
    throw error
  }
}

/**
 * Get active materials only with suppliers
 */
export async function getActiveMaterials() {
  try {
    const materials = await db(MATERIALS_TABLE)
      .select('*')
      .where({ isActive: true })
      .orderBy('code', 'asc')
    
    // Get suppliers for each material
    const materialsWithSuppliers = await Promise.all(
      materials.map(async (material) => {
        const suppliers = await db('materials.material_supplier_relation')
          .select(
            'materials.suppliers.id',
            'materials.suppliers.code',
            'materials.suppliers.name',
            'materials.material_supplier_relation.isPrimary'
          )
          .join('materials.suppliers', 'materials.material_supplier_relation.supplierId', '=', 'materials.suppliers.id')
          .where('materials.material_supplier_relation.materialId', material.id)
          .orderBy('materials.material_supplier_relation.isPrimary', 'desc')
        
        return {
          ...material,
          suppliers: suppliers.map(s => s.name),
          supplier: suppliers.find(s => s.isPrimary)?.name || suppliers[0]?.name || ''
        }
      })
    )
    
    return materialsWithSuppliers
  } catch (error) {
    console.error('❌ Error getting active materials:', error)
    throw error
  }
}

/**
 * Get material by ID
 */
export async function getMaterialById(id) {
  try {
    const material = await db(MATERIALS_TABLE)
      .where({ id })
      .first()
    
    return material
  } catch (error) {
    console.error('❌ Error getting material by ID:', error)
    throw error
  }
}

/**
 * Get material by code
 */
export async function getMaterialByCode(code) {
  try {
    const material = await db(MATERIALS_TABLE)
      .where({ code })
      .first()
    
    return material
  } catch (error) {
    console.error('❌ Error getting material by code:', error)
    throw error
  }
}

/**
 * Get materials by category
 */
export async function getMaterialsByCategory(category) {
  try {
    const materials = await db(MATERIALS_TABLE)
      .where({ category, isActive: true })
      .orderBy('code', 'asc')
    
    return materials
  } catch (error) {
    console.error('❌ Error getting materials by category:', error)
    throw error
  }
}

/**
 * Get materials by supplier
 */
export async function getMaterialsBySupplier(supplierId) {
  try {
    const materials = await db(MATERIALS_TABLE)
      .where({ primarySupplierId: supplierId, isActive: true })
      .orderBy('code', 'asc')
    
    return materials
  } catch (error) {
    console.error('❌ Error getting materials by supplier:', error)
    throw error
  }
}

/**
 * Create new material
 */
export async function createMaterial(materialData) {
  try {
    const [material] = await db(MATERIALS_TABLE)
      .insert({
        code: materialData.code,
        name: materialData.name,
        description: materialData.description || null,
        type: materialData.type,
        category: materialData.category,
        subcategory: materialData.subcategory || null,
        stock: materialData.stock || 0,
        reserved: materialData.reserved || 0,
        wipReserved: materialData.wipReserved || 0,
        reorderPoint: materialData.reorderPoint || 0,
        maxStock: materialData.maxStock || null,
        unit: materialData.unit,
        costPrice: materialData.costPrice || null,
        averageCost: materialData.averageCost || null,
        currency: materialData.currency || 'TRY',
        primarySupplierId: materialData.primarySupplierId || null,
        barcode: materialData.barcode || null,
        qrCode: materialData.qrCode || null,
        status: materialData.status || 'active',
        isActive: materialData.isActive !== undefined ? materialData.isActive : true,
        scrapType: materialData.scrapType || null,
        parentMaterial: materialData.parentMaterial || null,
        specifications: materialData.specifications || null,
        storage: materialData.storage || null,
        productionHistory: materialData.productionHistory || null,
        suppliersData: materialData.suppliersData || null,
        createdBy: materialData.createdBy || null,
        createdAt: db.fn.now()
      })
      .returning('*')
    
    console.log('✅ Material created:', material.code)
    return material
  } catch (error) {
    console.error('❌ Error creating material:', error)
    throw error
  }
}

/**
 * Update material
 */
export async function updateMaterial(id, updates) {
  try {
    const updateData = {
      updatedAt: db.fn.now()
    }
    
    // Only update provided fields
    if (updates.code !== undefined) updateData.code = updates.code
    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.type !== undefined) updateData.type = updates.type
    if (updates.category !== undefined) updateData.category = updates.category
    if (updates.subcategory !== undefined) updateData.subcategory = updates.subcategory
    if (updates.stock !== undefined) updateData.stock = updates.stock
    if (updates.reserved !== undefined) updateData.reserved = updates.reserved
    if (updates.wipReserved !== undefined) updateData.wipReserved = updates.wipReserved
    if (updates.reorderPoint !== undefined) updateData.reorderPoint = updates.reorderPoint
    if (updates.maxStock !== undefined) updateData.maxStock = updates.maxStock
    if (updates.unit !== undefined) updateData.unit = updates.unit
    if (updates.costPrice !== undefined) updateData.costPrice = updates.costPrice
    if (updates.averageCost !== undefined) updateData.averageCost = updates.averageCost
    if (updates.currency !== undefined) updateData.currency = updates.currency
    if (updates.primarySupplierId !== undefined) updateData.primarySupplierId = updates.primarySupplierId
    if (updates.barcode !== undefined) updateData.barcode = updates.barcode
    if (updates.qrCode !== undefined) updateData.qrCode = updates.qrCode
    if (updates.status !== undefined) updateData.status = updates.status
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive
    if (updates.scrapType !== undefined) updateData.scrapType = updates.scrapType
    if (updates.parentMaterial !== undefined) updateData.parentMaterial = updates.parentMaterial
    if (updates.specifications !== undefined) updateData.specifications = updates.specifications
    if (updates.storage !== undefined) updateData.storage = updates.storage
    if (updates.productionHistory !== undefined) updateData.productionHistory = updates.productionHistory
    if (updates.suppliersData !== undefined) updateData.suppliersData = updates.suppliersData
    if (updates.updatedBy !== undefined) updateData.updatedBy = updates.updatedBy
    
    const [material] = await db(MATERIALS_TABLE)
      .where({ id })
      .update(updateData)
      .returning('*')
    
    if (!material) {
      throw new Error('Material not found')
    }
    
    console.log('✅ Material updated:', material.code)
    return material
  } catch (error) {
    console.error('❌ Error updating material:', error)
    throw error
  }
}

/**
 * Update material stock
 */
export async function updateMaterialStock(code, stockChange, reservedChange = 0, wipReservedChange = 0) {
  try {
    const material = await getMaterialByCode(code)
    if (!material) {
      throw new Error(`Material not found: ${code}`)
    }
    
    const newStock = parseFloat(material.stock || 0) + parseFloat(stockChange || 0)
    const newReserved = parseFloat(material.reserved || 0) + parseFloat(reservedChange || 0)
    const newWipReserved = parseFloat(material.wipReserved || 0) + parseFloat(wipReservedChange || 0)
    
    const [updated] = await db(MATERIALS_TABLE)
      .where({ code })
      .update({
        stock: newStock,
        reserved: newReserved,
        wipReserved: newWipReserved,
        updatedAt: db.fn.now()
      })
      .returning('*')
    
    console.log(`✅ Stock updated for ${code}: ${material.stock} → ${newStock}`)
    return updated
  } catch (error) {
    console.error('❌ Error updating material stock:', error)
    throw error
  }
}

/**
 * Delete material (soft delete)
 */
export async function deleteMaterial(id) {
  try {
    const [material] = await db(MATERIALS_TABLE)
      .where({ id })
      .update({
        isActive: false,
        updatedAt: db.fn.now()
      })
      .returning('*')
    
    if (!material) {
      throw new Error('Material not found')
    }
    
    console.log('✅ Material deactivated:', material.code)
    return material
  } catch (error) {
    console.error('❌ Error deleting material:', error)
    throw error
  }
}

/**
 * Hard delete material (permanent)
 */
export async function hardDeleteMaterial(id) {
  try {
    const deleted = await db(MATERIALS_TABLE)
      .where({ id })
      .del()
    
    console.log('✅ Material permanently deleted:', id)
    return deleted
  } catch (error) {
    console.error('❌ Error hard deleting material:', error)
    throw error
  }
}

/**
 * Get material statistics
 */
export async function getMaterialStats() {
  try {
    const stats = await db(MATERIALS_TABLE)
      .select(
        db.raw('COUNT(*) as total'),
        db.raw('COUNT(*) FILTER (WHERE "isActive" = true) as active'),
        db.raw('COUNT(*) FILTER (WHERE "isActive" = false) as inactive'),
        db.raw('COUNT(*) FILTER (WHERE stock <= "reorderPoint") as low_stock'),
        db.raw('SUM(stock * "costPrice") as total_inventory_value')
      )
      .first()
    
    return stats
  } catch (error) {
    console.error('❌ Error getting material stats:', error)
    throw error
  }
}
/**
 * Get all material categories
 */
export async function getAllCategories() {
  try {
    const categories = await db(CATEGORIES_TABLE)
      .select('*')
      .orderBy('name', 'asc')
    
    return categories
  } catch (error) {
    console.error('❌ Error getting categories:', error)
    throw error
  }
}

export default {
  getAllMaterials,
  getActiveMaterials,
  getMaterialById,
  getMaterialByCode,
  getMaterialsByCategory,
  getMaterialsBySupplier,
  createMaterial,
  updateMaterial,
  updateMaterialStock,
  deleteMaterial,
  hardDeleteMaterial,
  getMaterialStats,
  getAllCategories
}
