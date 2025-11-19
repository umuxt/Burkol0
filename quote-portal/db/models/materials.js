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
            'material_supplier_relation.is_primary'
          )
          .join('materials.suppliers', 'material_supplier_relation.supplier_id', 'materials.suppliers.id')
          .where('material_supplier_relation.material_id', material.id)
          .orderBy('material_supplier_relation.is_primary', 'desc')
        
        return {
          ...material,
          suppliers: suppliers.map(s => s.name),
          supplier: suppliers.find(s => s.is_primary)?.name || suppliers[0]?.name || ''
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
      .where({ is_active: true })
      .orderBy('code', 'asc')
    
    // Get suppliers for each material
    const materialsWithSuppliers = await Promise.all(
      materials.map(async (material) => {
        const suppliers = await db('materials.material_supplier_relation')
          .select(
            'materials.suppliers.id',
            'materials.suppliers.code',
            'materials.suppliers.name',
            'material_supplier_relation.is_primary'
          )
          .join('materials.suppliers', 'material_supplier_relation.supplier_id', 'materials.suppliers.id')
          .where('material_supplier_relation.material_id', material.id)
          .orderBy('material_supplier_relation.is_primary', 'desc')
        
        return {
          ...material,
          suppliers: suppliers.map(s => s.name),
          supplier: suppliers.find(s => s.is_primary)?.name || suppliers[0]?.name || ''
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
      .where({ category, is_active: true })
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
      .where({ primary_supplier_id: supplierId, is_active: true })
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
        wip_reserved: materialData.wip_reserved || 0,
        reorder_point: materialData.reorder_point || 0,
        max_stock: materialData.max_stock || null,
        unit: materialData.unit,
        cost_price: materialData.cost_price || null,
        average_cost: materialData.average_cost || null,
        currency: materialData.currency || 'TRY',
        primary_supplier_id: materialData.primary_supplier_id || null,
        barcode: materialData.barcode || null,
        qr_code: materialData.qr_code || null,
        status: materialData.status || 'active',
        is_active: materialData.is_active !== false,
        scrap_type: materialData.scrap_type || null,
        parent_material: materialData.parent_material || null,
        specifications: materialData.specifications || null,
        storage: materialData.storage || null,
        production_history: materialData.production_history || null,
        suppliers_data: materialData.suppliers_data || null,
        created_by: materialData.created_by || null,
        created_at: db.fn.now()
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
      updated_at: db.fn.now()
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
    if (updates.wip_reserved !== undefined) updateData.wip_reserved = updates.wip_reserved
    if (updates.reorder_point !== undefined) updateData.reorder_point = updates.reorder_point
    if (updates.max_stock !== undefined) updateData.max_stock = updates.max_stock
    if (updates.unit !== undefined) updateData.unit = updates.unit
    if (updates.cost_price !== undefined) updateData.cost_price = updates.cost_price
    if (updates.average_cost !== undefined) updateData.average_cost = updates.average_cost
    if (updates.currency !== undefined) updateData.currency = updates.currency
    if (updates.primary_supplier_id !== undefined) updateData.primary_supplier_id = updates.primary_supplier_id
    if (updates.barcode !== undefined) updateData.barcode = updates.barcode
    if (updates.qr_code !== undefined) updateData.qr_code = updates.qr_code
    if (updates.status !== undefined) updateData.status = updates.status
    if (updates.is_active !== undefined) updateData.is_active = updates.is_active
    if (updates.scrap_type !== undefined) updateData.scrap_type = updates.scrap_type
    if (updates.parent_material !== undefined) updateData.parent_material = updates.parent_material
    if (updates.specifications !== undefined) updateData.specifications = updates.specifications
    if (updates.storage !== undefined) updateData.storage = updates.storage
    if (updates.production_history !== undefined) updateData.production_history = updates.production_history
    if (updates.suppliers_data !== undefined) updateData.suppliers_data = updates.suppliers_data
    if (updates.updated_by !== undefined) updateData.updated_by = updates.updated_by
    
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
    const newWipReserved = parseFloat(material.wip_reserved || 0) + parseFloat(wipReservedChange || 0)
    
    const [updated] = await db(MATERIALS_TABLE)
      .where({ code })
      .update({
        stock: newStock,
        reserved: newReserved,
        wip_reserved: newWipReserved,
        updated_at: db.fn.now()
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
        is_active: false,
        updated_at: db.fn.now()
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
        db.raw('COUNT(*) FILTER (WHERE is_active = true) as active'),
        db.raw('COUNT(*) FILTER (WHERE is_active = false) as inactive'),
        db.raw('COUNT(*) FILTER (WHERE stock <= reorder_point) as low_stock'),
        db.raw('SUM(stock * cost_price) as total_inventory_value')
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
