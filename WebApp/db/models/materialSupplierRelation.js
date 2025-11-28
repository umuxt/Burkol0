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
        materialId: materialId,
        supplierId: supplierId,
        isPrimary: options.isPrimary || false,
        costPrice: options.costPrice,
        leadTimeDays: options.leadTimeDays,
        minimumOrderQuantity: options.minimumOrderQuantity,
        supplierMaterialCode: options.supplierMaterialCode,
        notes: options.notes
      })
      .onConflict(['materialId', 'supplierId'])
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
    const suppliers = await db(RELATION_TABLE + ' as msr')
      .select(
        's.*',
        'msr.isPrimary',
        'msr.costPrice',
        'msr.leadTimeDays',
        'msr.minimumOrderQuantity',
        'msr.supplierMaterialCode',
        'msr.notes'
      )
      .join(SUPPLIERS_TABLE + ' as s', 'msr.supplierId', 's.id')
      .where('msr.materialId', materialId)
      .orderBy('msr.isPrimary', 'desc') // Primary first
    
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
    const materials = await db(RELATION_TABLE + ' as msr')
      .select(
        'm.*',
        'msr.isPrimary',
        'msr.costPrice',
        'msr.leadTimeDays'
      )
      .join(MATERIALS_TABLE + ' as m', 'msr.materialId', 'm.id')
      .where('msr.supplierId', supplierId)
      .orderBy('m.code', 'asc')
    
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
      .where({ materialId: materialId, supplierId: supplierId })
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
      .where('materialId', materialId)
      .update({ isPrimary: false })
    
    // Then set the new primary
    const updated = await db(RELATION_TABLE)
      .where({ materialId: materialId, supplierId: supplierId })
      .update({ isPrimary: true })
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
    const supplier = await db(RELATION_TABLE + ' as msr')
      .select('s.*')
      .join(SUPPLIERS_TABLE + ' as s', 'msr.supplierId', 's.id')
      .where({
        'msr.materialId': materialId,
        'msr.isPrimary': true
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
