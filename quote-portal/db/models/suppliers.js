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
        db.raw('COUNT(DISTINCT material_supplier_relation."materialId") as "suppliedMaterialsCount"')
      )
      .leftJoin('materials.material_supplier_relation', 'materials.suppliers.id', 'material_supplier_relation.supplierId')
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
            'material_supplier_relation.isPrimary',
            'material_supplier_relation.costPrice'
          )
          .join('materials.materials', 'material_supplier_relation.materialId', 'materials.materials.id')
          .where('material_supplier_relation.supplierId', supplier.id)
          .orderBy('materials.materials.code', 'asc')
        
        return {
          ...supplier,
          suppliedMaterialsCount: parseInt(supplier.suppliedMaterialsCount) || 0,
          suppliedMaterials: materials // Frontend expects this field
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
      .where({ isActive: true })
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
        contactPerson: supplierData.contact_person || supplierData.contactPerson || null,
        email: supplierData.email || null,
        phone: supplierData.phone || null,
        phone2: supplierData.phone2 || null,
        email2: supplierData.email2 || null,
        fax: supplierData.fax || null,
        emergencyContact: supplierData.emergency_contact || supplierData.emergencyContact || null,
        emergencyPhone: supplierData.emergency_phone || supplierData.emergencyPhone || null,
        website: supplierData.website || null,
        preferredCommunication: supplierData.preferred_communication || supplierData.preferredCommunication || null,
        address: supplierData.address || null,
        city: supplierData.city || null,
        state: supplierData.state || null,
        postalCode: supplierData.postal_code || supplierData.postalCode || null,
        country: supplierData.country || null,
        taxNumber: supplierData.tax_number || supplierData.taxNumber || null,
        taxOffice: supplierData.tax_office || supplierData.taxOffice || null,
        businessRegistrationNumber: supplierData.business_registration_number || supplierData.businessRegistrationNumber || null,
        currency: supplierData.currency || null,
        creditLimit: supplierData.credit_limit || supplierData.creditLimit || null,
        creditRating: supplierData.credit_rating || supplierData.creditRating || null,
        paymentTerms: supplierData.payment_terms || supplierData.paymentTerms || null,
        paymentMethod: supplierData.payment_method || supplierData.paymentMethod || null,
        bankName: supplierData.bank_name || supplierData.bankName || null,
        bankAccount: supplierData.bank_account || supplierData.bankAccount || null,
        iban: supplierData.iban || null,
        supplierType: supplierData.supplier_type || supplierData.supplierType || null,
        qualityCertification: supplierData.quality_certification || supplierData.qualityCertification || null,
        deliveryCapability: supplierData.delivery_capability || supplierData.deliveryCapability || null,
        leadTimeDays: supplierData.lead_time_days || supplierData.leadTimeDays || null,
        minimumOrderQuantity: supplierData.minimum_order_quantity || supplierData.minimumOrderQuantity || null,
        yearEstablished: supplierData.year_established || supplierData.yearEstablished || null,
        employeeCount: supplierData.employee_count || supplierData.employeeCount || null,
        annualRevenue: supplierData.annual_revenue || supplierData.annualRevenue || null,
        complianceStatus: supplierData.compliance_status || supplierData.complianceStatus || null,
        riskLevel: supplierData.risk_level || supplierData.riskLevel || null,
        notes: supplierData.notes || null,
        status: supplierData.status || 'Aktif',
        isActive: supplierData.is_active !== false,
        createdAt: db.fn.now()
      })
      .returning('*')
    
    // Insert material-supplier relations
    if (suppliedMaterials && suppliedMaterials.length > 0) {
      const relations = suppliedMaterials.map(material => ({
        materialId: material.id,
        supplierId: supplier.id,
        isPrimary: material.is_primary || material.isPrimary || false,
        costPrice: material.cost_price || material.costPrice || null,
        leadTimeDays: material.lead_time_days || material.leadTime || material.leadTimeDays || null,
        minimumOrderQuantity: material.minimum_order_quantity || material.minimumOrderQuantity || null,
        supplierMaterialCode: material.supplier_material_code || material.supplierMaterialCode || null,
        notes: material.notes || null,
        createdAt: db.fn.now(),
        updatedAt: db.fn.now()
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
      updatedAt: db.fn.now()
    }
    
    // Update all fields if provided
    if (updates.code !== undefined) updateData.code = updates.code
    if (updates.name !== undefined) updateData.name = updates.name
    if (updates.contact_person !== undefined) updateData.contactPerson = updates.contact_person
    if (updates.contactPerson !== undefined) updateData.contactPerson = updates.contactPerson
    if (updates.email !== undefined) updateData.email = updates.email
    if (updates.phone !== undefined) updateData.phone = updates.phone
    if (updates.phone2 !== undefined) updateData.phone2 = updates.phone2
    if (updates.email2 !== undefined) updateData.email2 = updates.email2
    if (updates.fax !== undefined) updateData.fax = updates.fax
    if (updates.emergency_contact !== undefined) updateData.emergencyContact = updates.emergency_contact
    if (updates.emergencyContact !== undefined) updateData.emergencyContact = updates.emergencyContact
    if (updates.emergency_phone !== undefined) updateData.emergencyPhone = updates.emergency_phone
    if (updates.emergencyPhone !== undefined) updateData.emergencyPhone = updates.emergencyPhone
    if (updates.website !== undefined) updateData.website = updates.website
    if (updates.preferred_communication !== undefined) updateData.preferredCommunication = updates.preferred_communication
    if (updates.preferredCommunication !== undefined) updateData.preferredCommunication = updates.preferredCommunication
    if (updates.address !== undefined) updateData.address = updates.address
    if (updates.city !== undefined) updateData.city = updates.city
    if (updates.state !== undefined) updateData.state = updates.state
    if (updates.postal_code !== undefined) updateData.postalCode = updates.postal_code
    if (updates.postalCode !== undefined) updateData.postalCode = updates.postalCode
    if (updates.country !== undefined) updateData.country = updates.country
    if (updates.tax_number !== undefined) updateData.taxNumber = updates.tax_number
    if (updates.taxNumber !== undefined) updateData.taxNumber = updates.taxNumber
    if (updates.tax_office !== undefined) updateData.taxOffice = updates.tax_office
    if (updates.taxOffice !== undefined) updateData.taxOffice = updates.taxOffice
    if (updates.business_registration_number !== undefined) updateData.businessRegistrationNumber = updates.business_registration_number
    if (updates.businessRegistrationNumber !== undefined) updateData.businessRegistrationNumber = updates.businessRegistrationNumber
    if (updates.currency !== undefined) updateData.currency = updates.currency
    if (updates.credit_limit !== undefined) updateData.creditLimit = updates.credit_limit
    if (updates.creditLimit !== undefined) updateData.creditLimit = updates.creditLimit
    if (updates.credit_rating !== undefined) updateData.creditRating = updates.credit_rating
    if (updates.creditRating !== undefined) updateData.creditRating = updates.creditRating
    if (updates.payment_terms !== undefined) updateData.paymentTerms = updates.payment_terms
    if (updates.paymentTerms !== undefined) updateData.paymentTerms = updates.paymentTerms
    if (updates.payment_method !== undefined) updateData.paymentMethod = updates.payment_method
    if (updates.paymentMethod !== undefined) updateData.paymentMethod = updates.paymentMethod
    if (updates.bank_name !== undefined) updateData.bankName = updates.bank_name
    if (updates.bankName !== undefined) updateData.bankName = updates.bankName
    if (updates.bank_account !== undefined) updateData.bankAccount = updates.bank_account
    if (updates.bankAccount !== undefined) updateData.bankAccount = updates.bankAccount
    if (updates.iban !== undefined) updateData.iban = updates.iban
    if (updates.supplier_type !== undefined) updateData.supplierType = updates.supplier_type
    if (updates.supplierType !== undefined) updateData.supplierType = updates.supplierType
    if (updates.quality_certification !== undefined) updateData.qualityCertification = updates.quality_certification
    if (updates.qualityCertification !== undefined) updateData.qualityCertification = updates.qualityCertification
    if (updates.delivery_capability !== undefined) updateData.deliveryCapability = updates.delivery_capability
    if (updates.deliveryCapability !== undefined) updateData.deliveryCapability = updates.deliveryCapability
    if (updates.lead_time_days !== undefined) updateData.leadTimeDays = updates.lead_time_days
    if (updates.leadTimeDays !== undefined) updateData.leadTimeDays = updates.leadTimeDays
    if (updates.minimum_order_quantity !== undefined) updateData.minimumOrderQuantity = updates.minimum_order_quantity
    if (updates.minimumOrderQuantity !== undefined) updateData.minimumOrderQuantity = updates.minimumOrderQuantity
    if (updates.year_established !== undefined) updateData.yearEstablished = updates.year_established
    if (updates.yearEstablished !== undefined) updateData.yearEstablished = updates.yearEstablished
    if (updates.employee_count !== undefined) updateData.employeeCount = updates.employee_count
    if (updates.employeeCount !== undefined) updateData.employeeCount = updates.employeeCount
    if (updates.annual_revenue !== undefined) updateData.annualRevenue = updates.annual_revenue
    if (updates.annualRevenue !== undefined) updateData.annualRevenue = updates.annualRevenue
    if (updates.compliance_status !== undefined) updateData.complianceStatus = updates.compliance_status
    if (updates.complianceStatus !== undefined) updateData.complianceStatus = updates.complianceStatus
    if (updates.risk_level !== undefined) updateData.riskLevel = updates.risk_level
    if (updates.riskLevel !== undefined) updateData.riskLevel = updates.riskLevel
    if (updates.notes !== undefined) updateData.notes = updates.notes
    if (updates.status !== undefined) updateData.status = updates.status
    if (updates.is_active !== undefined) updateData.isActive = updates.is_active
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive
    
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
        .where({ supplierId: id })
        .delete()
      
      // Insert new relations
      if (suppliedMaterials.length > 0) {
        const relations = suppliedMaterials.map(material => ({
          materialId: material.id,
          supplierId: id,
          isPrimary: material.is_primary || material.isPrimary || false,
          costPrice: material.cost_price || material.costPrice || null,
          leadTimeDays: material.lead_time_days || material.leadTime || material.leadTimeDays || null,
          minimumOrderQuantity: material.minimum_order_quantity || material.minimumOrderQuantity || null,
          supplierMaterialCode: material.supplier_material_code || material.supplierMaterialCode || null,
          notes: material.notes || null,
          createdAt: db.fn.now(),
          updatedAt: db.fn.now()
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
        isActive: false,
        updatedAt: db.fn.now()
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
