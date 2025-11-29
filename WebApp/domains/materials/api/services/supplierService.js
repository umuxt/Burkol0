/**
 * Supplier Service
 * Handles supplier CRUD and material relationships
 */

import Suppliers from '#db/models/suppliers';

/**
 * Get all suppliers
 */
export async function getAllSuppliers() {
  return Suppliers.getAllSuppliers();
}

/**
 * Get supplier by ID
 */
export async function getSupplierById(id) {
  return Suppliers.getSupplierById(id);
}

/**
 * Get active suppliers
 */
export async function getActiveSuppliers() {
  return Suppliers.getActiveSuppliers();
}

/**
 * Create new supplier
 */
export async function createSupplier(data, suppliedMaterials = []) {
  const supplierData = {
    code: data.code,
    name: data.name,
    contactPerson: data.contactPerson || data.contact_person,
    email: data.email || data.email1,
    phone: data.phone || data.phone1,
    phone2: data.phone2,
    email2: data.email2,
    fax: data.fax,
    emergencyContact: data.emergencyContact || data.emergency_contact,
    emergencyPhone: data.emergencyPhone || data.emergency_phone,
    website: data.website,
    preferredCommunication: data.preferredCommunication || data.preferred_communication,
    address: data.address,
    city: data.city,
    state: data.state,
    postalCode: data.postalCode || data.postal_code,
    country: data.country,
    taxNumber: data.taxNumber || data.tax_number,
    taxOffice: data.taxOffice || data.tax_office,
    businessRegistrationNumber: data.businessRegistrationNumber || data.business_registration_number,
    currency: data.currency,
    creditLimit: data.creditLimit || data.credit_limit,
    creditRating: data.creditRating || data.credit_rating,
    paymentTerms: data.paymentTerms || data.payment_terms,
    paymentMethod: data.paymentMethod || data.payment_method,
    bankName: data.bankName || data.bank_name,
    bankAccount: data.bankAccount || data.bank_account,
    iban: data.iban,
    supplierType: data.supplierType || data.supplier_type,
    qualityCertification: data.qualityCertification || data.quality_certification,
    deliveryCapability: data.deliveryCapability || data.delivery_capability,
    leadTimeDays: data.leadTimeDays || data.lead_time_days || data.leadTime,
    minimumOrderQuantity: data.minimumOrderQuantity || data.minimum_order_quantity,
    yearEstablished: data.yearEstablished || data.year_established,
    employeeCount: data.employeeCount || data.employee_count,
    annualRevenue: data.annualRevenue || data.annual_revenue,
    complianceStatus: data.complianceStatus || data.compliance_status,
    riskLevel: data.riskLevel || data.risk_level,
    notes: data.notes,
    status: data.status || 'Aktif',
    isActive: data.isActive !== undefined ? data.isActive : (data.is_active !== false && data.status !== 'Pasif')
  };

  return Suppliers.createSupplier(supplierData, suppliedMaterials);
}

/**
 * Update supplier
 */
export async function updateSupplier(id, updates) {
  const updateData = {
    code: updates.code,
    name: updates.name,
    contactPerson: updates.contactPerson || updates.contact_person,
    email: updates.email || updates.email1,
    phone: updates.phone || updates.phone1,
    phone2: updates.phone2,
    email2: updates.email2,
    fax: updates.fax,
    emergencyContact: updates.emergencyContact || updates.emergency_contact,
    emergencyPhone: updates.emergencyPhone || updates.emergency_phone,
    website: updates.website,
    preferredCommunication: updates.preferredCommunication || updates.preferred_communication,
    address: updates.address,
    city: updates.city,
    state: updates.state,
    postalCode: updates.postalCode || updates.postal_code,
    country: updates.country,
    taxNumber: updates.taxNumber || updates.tax_number,
    taxOffice: updates.taxOffice || updates.tax_office,
    businessRegistrationNumber: updates.businessRegistrationNumber || updates.business_registration_number,
    currency: updates.currency,
    creditLimit: updates.creditLimit || updates.credit_limit,
    creditRating: updates.creditRating || updates.credit_rating,
    paymentTerms: updates.paymentTerms || updates.payment_terms,
    paymentMethod: updates.paymentMethod || updates.payment_method,
    bankName: updates.bankName || updates.bank_name,
    bankAccount: updates.bankAccount || updates.bank_account,
    iban: updates.iban,
    supplierType: updates.supplierType || updates.supplier_type,
    qualityCertification: updates.qualityCertification || updates.quality_certification,
    deliveryCapability: updates.deliveryCapability || updates.delivery_capability,
    leadTimeDays: updates.leadTimeDays || updates.lead_time_days || updates.leadTime,
    minimumOrderQuantity: updates.minimumOrderQuantity || updates.minimum_order_quantity,
    yearEstablished: updates.yearEstablished || updates.year_established,
    employeeCount: updates.employeeCount || updates.employee_count,
    annualRevenue: updates.annualRevenue || updates.annual_revenue,
    complianceStatus: updates.complianceStatus || updates.compliance_status,
    riskLevel: updates.riskLevel || updates.risk_level,
    notes: updates.notes,
    status: updates.status,
    isActive: updates.isActive !== undefined ? updates.isActive : (updates.is_active !== undefined ? updates.is_active : (updates.status !== 'Pasif'))
  };

  return Suppliers.updateSupplier(id, updateData);
}

/**
 * Delete supplier
 */
export async function deleteSupplier(id) {
  return Suppliers.deleteSupplier(id);
}

/**
 * Get suppliers by category (returns all active - legacy support)
 */
export async function getSuppliersByCategory(category) {
  return Suppliers.getActiveSuppliers();
}

/**
 * Add material to supplier relationship
 */
export async function addMaterialToSupplier(supplierId, materialId, options = {}) {
  const supplier = await Suppliers.getSupplierById(supplierId);
  if (!supplier) {
    const error = new Error('Supplier not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const MaterialSupplierRelation = (await import('#db/models/materialSupplierRelation')).default;

  const relation = await MaterialSupplierRelation.addSupplierToMaterial(
    materialId,
    parseInt(supplierId),
    {
      is_primary: options.isPrimary || false,
      cost_price: options.costPrice
    }
  );

  return {
    relation,
    supplier
  };
}

/**
 * Get suppliers for a material
 */
export async function getSuppliersForMaterial(materialId) {
  const MaterialSupplierRelation = (await import('#db/models/materialSupplierRelation')).default;
  return MaterialSupplierRelation.getSuppliersForMaterial(materialId);
}

/**
 * Get materials for a supplier
 */
export async function getMaterialsForSupplier(supplierId) {
  const MaterialSupplierRelation = (await import('#db/models/materialSupplierRelation')).default;
  return MaterialSupplierRelation.getMaterialsForSupplier(supplierId);
}
