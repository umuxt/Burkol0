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
 * Create new supplier with material relations
 */
export async function createSupplier(supplierData, suppliedMaterials = []) {
  const trx = await db.transaction()
  
  try {
    // Generate code if not provided
    const code = supplierData.code || await generateSupplierCode()
    
    const [supplier] = await trx(SUPPLIERS_TABLE)
      .insert({
        code: code,
        name: supplierData.name,
        contact_person: supplierData.contact_person || supplierData.contactPerson || null,
        email: supplierData.email || null,
        phone: supplierData.phone || null,
        phone2: supplierData.phone2 || null,
        email2: supplierData.email2 || null,
        fax: supplierData.fax || null,
        emergency_contact: supplierData.emergency_contact || null,
        emergency_phone: supplierData.emergency_phone || null,
        website: supplierData.website || null,
        preferred_communication: supplierData.preferred_communication || null,
        address: supplierData.address || null,
        city: supplierData.city || null,
        state: supplierData.state || null,
        postal_code: supplierData.postal_code || null,
        country: supplierData.country || null,
        tax_number: supplierData.tax_number || null,
        tax_office: supplierData.tax_office || null,
        business_registration_number: supplierData.business_registration_number || null,
        currency: supplierData.currency || null,
        credit_limit: supplierData.credit_limit || null,
        credit_rating: supplierData.credit_rating || null,
        payment_terms: supplierData.payment_terms || null,
        payment_method: supplierData.payment_method || null,
        bank_name: supplierData.bank_name || null,
        bank_account: supplierData.bank_account || null,
        iban: supplierData.iban || null,
        supplier_type: supplierData.supplier_type || null,
        quality_certification: supplierData.quality_certification || null,
        delivery_capability: supplierData.delivery_capability || null,
        lead_time_days: supplierData.lead_time_days || null,
        minimum_order_quantity: supplierData.minimum_order_quantity || null,
        year_established: supplierData.year_established || null,
        employee_count: supplierData.employee_count || null,
        annual_revenue: supplierData.annual_revenue || null,
        compliance_status: supplierData.compliance_status || null,
        risk_level: supplierData.risk_level || null,
        notes: supplierData.notes || null,
        status: supplierData.status || 'Aktif',
        is_active: supplierData.is_active !== false,
        created_at: db.fn.now()
      })
      .returning('*')
    
    // Insert material-supplier relations
    if (suppliedMaterials && suppliedMaterials.length > 0) {
      const relations = suppliedMaterials.map(material => ({
        material_id: material.id,
        supplier_id: supplier.id,
        is_primary: material.is_primary || false,
        cost_price: material.cost_price || material.costPrice || null,
        lead_time_days: material.lead_time_days || material.leadTime || null,
        minimum_order_quantity: material.minimum_order_quantity || material.minimumOrderQuantity || null,
        supplier_material_code: material.supplier_material_code || material.supplierMaterialCode || null,
        notes: material.notes || null,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      }))
      
      await trx('materials.material_supplier_relation').insert(relations)
      console.log(`✅ Created ${relations.length} material relations for supplier ${supplier.code}`)
    }
    
    await trx.commit()
    console.log('✅ Supplier created:', supplier.code)
    return supplier
  } catch (error) {
    await trx.rollback()
    console.error('❌ Error creating supplier:', error)
    throw error
  }
}

/**
 * Update supplier with material relations
 */
export async function updateSupplier(id, updates, suppliedMaterials = null) {
  const trx = await db.transaction()
  
  try {
    const updateData = {
      updated_at: db.fn.now()
    }
    
    // Update all fields if provided
    if (updates.code !== undefined) updateData.code = updates.code
    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.contact_person !== undefined) updateData.contact_person = updates.contact_person
    if (updates.email !== undefined) updateData.email = updates.email
    if (updates.phone !== undefined) updateData.phone = updates.phone
    if (updates.phone2 !== undefined) updateData.phone2 = updates.phone2
    if (updates.email2 !== undefined) updateData.email2 = updates.email2
    if (updates.fax !== undefined) updateData.fax = updates.fax
    if (updates.emergency_contact !== undefined) updateData.emergency_contact = updates.emergency_contact
    if (updates.emergency_phone !== undefined) updateData.emergency_phone = updates.emergency_phone
    if (updates.website !== undefined) updateData.website = updates.website
    if (updates.preferred_communication !== undefined) updateData.preferred_communication = updates.preferred_communication
    if (updates.address !== undefined) updateData.address = updates.address
    if (updates.city !== undefined) updateData.city = updates.city
    if (updates.state !== undefined) updateData.state = updates.state
    if (updates.postal_code !== undefined) updateData.postal_code = updates.postal_code
    if (updates.country !== undefined) updateData.country = updates.country
    if (updates.tax_number !== undefined) updateData.tax_number = updates.tax_number
    if (updates.tax_office !== undefined) updateData.tax_office = updates.tax_office
    if (updates.business_registration_number !== undefined) updateData.business_registration_number = updates.business_registration_number
    if (updates.currency !== undefined) updateData.currency = updates.currency
    if (updates.credit_limit !== undefined) updateData.credit_limit = updates.credit_limit
    if (updates.credit_rating !== undefined) updateData.credit_rating = updates.credit_rating
    if (updates.payment_terms !== undefined) updateData.payment_terms = updates.payment_terms
    if (updates.payment_method !== undefined) updateData.payment_method = updates.payment_method
    if (updates.bank_name !== undefined) updateData.bank_name = updates.bank_name
    if (updates.bank_account !== undefined) updateData.bank_account = updates.bank_account
    if (updates.iban !== undefined) updateData.iban = updates.iban
    if (updates.supplier_type !== undefined) updateData.supplier_type = updates.supplier_type
    if (updates.quality_certification !== undefined) updateData.quality_certification = updates.quality_certification
    if (updates.delivery_capability !== undefined) updateData.delivery_capability = updates.delivery_capability
    if (updates.lead_time_days !== undefined) updateData.lead_time_days = updates.lead_time_days
    if (updates.minimum_order_quantity !== undefined) updateData.minimum_order_quantity = updates.minimum_order_quantity
    if (updates.year_established !== undefined) updateData.year_established = updates.year_established
    if (updates.employee_count !== undefined) updateData.employee_count = updates.employee_count
    if (updates.annual_revenue !== undefined) updateData.annual_revenue = updates.annual_revenue
    if (updates.compliance_status !== undefined) updateData.compliance_status = updates.compliance_status
    if (updates.risk_level !== undefined) updateData.risk_level = updates.risk_level
    if (updates.notes !== undefined) updateData.notes = updates.notes
    if (updates.status !== undefined) updateData.status = updates.status
    if (updates.is_active !== undefined) updateData.is_active = updates.is_active
    
    const [supplier] = await trx(SUPPLIERS_TABLE)
      .where({ id })
      .update(updateData)
      .returning('*')
    
    if (!supplier) {
      throw new Error('Supplier not found')
    }
    
    // Update material relations if provided
    if (suppliedMaterials !== null) {
      // Delete existing relations
      await trx('materials.material_supplier_relation')
        .where({ supplier_id: id })
        .delete()
      
      // Insert new relations
      if (suppliedMaterials.length > 0) {
        const relations = suppliedMaterials.map(material => ({
          material_id: material.id,
          supplier_id: id,
          is_primary: material.is_primary || false,
          cost_price: material.cost_price || material.costPrice || null,
          lead_time_days: material.lead_time_days || material.leadTime || null,
          minimum_order_quantity: material.minimum_order_quantity || material.minimumOrderQuantity || null,
          supplier_material_code: material.supplier_material_code || material.supplierMaterialCode || null,
          notes: material.notes || null,
          created_at: db.fn.now(),
          updated_at: db.fn.now()
        }))
        
        await trx('materials.material_supplier_relation').insert(relations)
        console.log(`✅ Updated ${relations.length} material relations for supplier ${supplier.code}`)
      }
    }
    
    await trx.commit()
    console.log('✅ Supplier updated:', supplier.code)
    return supplier
  } catch (error) {
    await trx.rollback()
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
