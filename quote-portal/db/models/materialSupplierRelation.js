/**
 * Material-Supplier Relation Model
 * PostgreSQL data access layer for materials.material_supplier_relation table
 */

import db from '../connection.js'

const RELATION_TABLE = 'materials.material_supplier_relation'
const MATERIALS_TABLE = 'materials.materials'
const SUPPLIERS_TABLE = 'materials.suppliers'

/**
 * Add supplier to material
 */
export async function addSupplierToMaterial(materialId, supplierId, options = {}) {
  try {
    const relation = await db(RELATION_TABLE)
      .insert({
        material_id: materialId,
        supplier_id: supplierId,
        is_primary: options.is_primary || false,
        cost_price: options.cost_price,
        lead_time_days: options.lead_time_days,
        minimum_order_quantity: options.minimum_order_quantity,
        supplier_material_code: options.supplier_material_code,
        notes: options.notes
      })
      .onConflict(['material_id', 'supplier_id'])
      .merge() // Update if exists
      .returning('*')
    
    return relation[0]
  } catch (error) {
    console.error('❌ Error adding supplier to material:', error)
    throw error
  }
}

/**
 * Get all suppliers for a material
 */
export async function getSuppliersForMaterial(materialId) {
  try {
    const suppliers = await db(RELATION_TABLE)
      .select(
        'materials.suppliers.*',
        'material_supplier_relation.is_primary',
        'material_supplier_relation.cost_price',
        'material_supplier_relation.lead_time_days',
        'material_supplier_relation.minimum_order_quantity',
        'material_supplier_relation.supplier_material_code',
        'material_supplier_relation.notes'
      )
      .join(SUPPLIERS_TABLE, 'material_supplier_relation.supplier_id', 'materials.suppliers.id')
      .where('material_supplier_relation.material_id', materialId)
      .orderBy('material_supplier_relation.is_primary', 'desc') // Primary first
    
    return suppliers
  } catch (error) {
    console.error('❌ Error getting suppliers for material:', error)
    throw error
  }
}

/**
 * Get all materials for a supplier
 */
export async function getMaterialsForSupplier(supplierId) {
  try {
    const materials = await db(RELATION_TABLE)
      .select(
        'materials.materials.*',
        'material_supplier_relation.is_primary',
        'material_supplier_relation.cost_price',
        'material_supplier_relation.lead_time_days'
      )
      .join(MATERIALS_TABLE, 'material_supplier_relation.material_id', 'materials.materials.id')
      .where('material_supplier_relation.supplier_id', supplierId)
      .orderBy('materials.materials.code', 'asc')
    
    return materials
  } catch (error) {
    console.error('❌ Error getting materials for supplier:', error)
    throw error
  }
}

/**
 * Remove supplier from material
 */
export async function removeSupplierFromMaterial(materialId, supplierId) {
  try {
    const deleted = await db(RELATION_TABLE)
      .where({ material_id: materialId, supplier_id: supplierId })
      .del()
    
    return deleted > 0
  } catch (error) {
    console.error('❌ Error removing supplier from material:', error)
    throw error
  }
}

/**
 * Set primary supplier for material
 */
export async function setPrimarySupplier(materialId, supplierId) {
  try {
    // First, unset all primary flags for this material
    await db(RELATION_TABLE)
      .where('material_id', materialId)
      .update({ is_primary: false })
    
    // Then set the new primary
    const updated = await db(RELATION_TABLE)
      .where({ material_id: materialId, supplier_id: supplierId })
      .update({ is_primary: true })
      .returning('*')
    
    return updated[0]
  } catch (error) {
    console.error('❌ Error setting primary supplier:', error)
    throw error
  }
}

/**
 * Get primary supplier for material
 */
export async function getPrimarySupplier(materialId) {
  try {
    const supplier = await db(RELATION_TABLE)
      .select('materials.suppliers.*')
      .join(SUPPLIERS_TABLE, 'material_supplier_relation.supplier_id', 'materials.suppliers.id')
      .where({
        'material_supplier_relation.material_id': materialId,
        'material_supplier_relation.is_primary': true
      })
      .first()
    
    return supplier
  } catch (error) {
    console.error('❌ Error getting primary supplier:', error)
    throw error
  }
}

export default {
  addSupplierToMaterial,
  getSuppliersForMaterial,
  getMaterialsForSupplier,
  removeSupplierFromMaterial,
  setPrimarySupplier,
  getPrimarySupplier
}
