/**
 * Suppliers Model
 * PostgreSQL data access layer for materials.suppliers table
 */

import db from '../connection.js'

// Table reference with schema
const SUPPLIERS_TABLE = 'materials.suppliers'

/**
 * Get all suppliers with material count and materials list
 */
export async function getAllSuppliers() {
  try {
    // First get all suppliers with counts
    const suppliers = await db(SUPPLIERS_TABLE)
      .select(
        'materials.suppliers.*',
        db.raw('COUNT(DISTINCT material_supplier_relation.material_id) as supplied_materials_count')
      )
      .leftJoin('materials.material_supplier_relation', 'materials.suppliers.id', 'material_supplier_relation.supplier_id')
      .groupBy('materials.suppliers.id')
      .orderBy('materials.suppliers.code', 'asc')
    
    // Then get materials for each supplier
    const suppliersWithMaterials = await Promise.all(
      suppliers.map(async (supplier) => {
        const materials = await db('materials.material_supplier_relation')
          .select(
            'materials.materials.id',
            'materials.materials.code',
            'materials.materials.name',
            'materials.materials.category',
            'materials.materials.unit',
            'material_supplier_relation.is_primary',
            'material_supplier_relation.cost_price'
          )
          .join('materials.materials', 'material_supplier_relation.material_id', 'materials.materials.id')
          .where('material_supplier_relation.supplier_id', supplier.id)
          .orderBy('materials.materials.code', 'asc')
        
        return {
          ...supplier,
          supplied_materials_count: parseInt(supplier.supplied_materials_count) || 0,
          supplied_materials: materials // Frontend expects this field
        }
      })
    )
    
    return suppliersWithMaterials
  } catch (error) {
    console.error('❌ Error getting all suppliers:', error)
    throw error
  }
}

/**
 * Get active suppliers only
 */
export async function getActiveSuppliers() {
  try {
    const suppliers = await db(SUPPLIERS_TABLE)
      .select('*')
      .where({ is_active: true })
      .orderBy('code', 'asc')
    
    return suppliers
  } catch (error) {
    console.error('❌ Error getting active suppliers:', error)
    throw error
  }
}

/**
 * Get supplier by ID
 */
export async function getSupplierById(id) {
  try {
    const supplier = await db(SUPPLIERS_TABLE)
      .where({ id })
      .first()
    
    return supplier || null
  } catch (error) {
    console.error('❌ Error getting supplier by ID:', error)
    throw error
  }
}

/**
 * Get supplier by code
 */
export async function getSupplierByCode(code) {
  try {
    const supplier = await db(SUPPLIERS_TABLE)
      .where({ code })
      .first()
    
    return supplier || null
  } catch (error) {
    console.error('❌ Error getting supplier by code:', error)
    throw error
  }
}

/**
 * Generate next supplier code
 */
export async function generateSupplierCode() {
  try {
    const lastSupplier = await db(SUPPLIERS_TABLE)
      .select('code')
      .whereNotNull('code')
      .where('code', 'like', 'T-%')
      .orderBy('code', 'desc')
      .first()
    
    if (!lastSupplier || !lastSupplier.code) {
      return 'T-0001'
    }
    
    // Extract number from code (e.g., "T-0001" -> 1)
    const match = lastSupplier.code.match(/T-(\d+)/)
    if (match) {
      const nextNum = parseInt(match[1]) + 1
      return `T-${String(nextNum).padStart(4, '0')}`
    }
    
    return 'T-0001'
  } catch (error) {
    console.error('❌ Error generating supplier code:', error)
    return 'T-0001'
  }
}

/**
 * Create new supplier
 */
export async function createSupplier(supplierData) {
  try {
    // Generate code if not provided
    const code = supplierData.code || await generateSupplierCode()
    
    const [supplier] = await db(SUPPLIERS_TABLE)
      .insert({
        code: code,
        name: supplierData.name,
        contact_person: supplierData.contact_person || supplierData.contactPerson || null,
        email: supplierData.email || null,
        phone: supplierData.phone || null,
        address: supplierData.address || null,
        is_active: supplierData.is_active !== false,
        created_at: db.fn.now()
      })
      .returning('*')
    
    console.log('✅ Supplier created:', supplier.code)
    return supplier
  } catch (error) {
    console.error('❌ Error creating supplier:', error)
    throw error
  }
}

/**
 * Update supplier
 */
export async function updateSupplier(id, updates) {
  try {
    const updateData = {
      updated_at: db.fn.now()
    }
    
    if (updates.code !== undefined) updateData.code = updates.code
    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.contact_person !== undefined) updateData.contact_person = updates.contact_person
    if (updates.email !== undefined) updateData.email = updates.email
    if (updates.phone !== undefined) updateData.phone = updates.phone
    if (updates.address !== undefined) updateData.address = updates.address
    if (updates.is_active !== undefined) updateData.is_active = updates.is_active
    
    const [supplier] = await db(SUPPLIERS_TABLE)
      .where({ id })
      .update(updateData)
      .returning('*')
    
    if (!supplier) {
      throw new Error('Supplier not found')
    }
    
    console.log('✅ Supplier updated:', supplier.code)
    return supplier
  } catch (error) {
    console.error('❌ Error updating supplier:', error)
    throw error
  }
}

/**
 * Delete supplier (soft delete)
 */
export async function deleteSupplier(id) {
  try {
    const [supplier] = await db(SUPPLIERS_TABLE)
      .where({ id })
      .update({
        is_active: false,
        updated_at: db.fn.now()
      })
      .returning('*')
    
    if (!supplier) {
      throw new Error('Supplier not found')
    }
    
    console.log('✅ Supplier deactivated:', supplier.code)
    return supplier
  } catch (error) {
    console.error('❌ Error deleting supplier:', error)
    throw error
  }
}

/**
 * Hard delete supplier (permanent)
 */
export async function hardDeleteSupplier(id) {
  try {
    const deleted = await db(SUPPLIERS_TABLE)
      .where({ id })
      .delete()
    
    if (deleted === 0) {
      throw new Error('Supplier not found')
    }
    
    console.log('✅ Supplier permanently deleted:', id)
    return true
  } catch (error) {
    console.error('❌ Error hard deleting supplier:', error)
    throw error
  }
}

export default {
  getAllSuppliers,
  getActiveSuppliers,
  getSupplierById,
  getSupplierByCode,
  generateSupplierCode,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  hardDeleteSupplier
}
