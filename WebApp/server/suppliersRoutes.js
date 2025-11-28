// Suppliers Routes - PostgreSQL Integration
import Suppliers from '../db/models/suppliers.js'

// ================================
// SUPPLIERS CRUD OPERATIONS
// ================================

export async function getAllSuppliers(req, res) {
    try {
        const suppliers = await Suppliers.getAllSuppliers()
        
        // Database already returns camelCase, no conversion needed
        res.json(suppliers)
    } catch (error) {
        console.error('Error getting all suppliers:', error)
        res.status(500).json({ error: 'Failed to get suppliers' })
    }
}

export async function addSupplier(req, res) {
    try {
        const supplierData = {
            code: req.body.code,
            name: req.body.name,
            contactPerson: req.body.contactPerson || req.body.contact_person,
            email: req.body.email || req.body.email1,
            phone: req.body.phone || req.body.phone1,
            phone2: req.body.phone2,
            email2: req.body.email2,
            fax: req.body.fax,
            emergencyContact: req.body.emergencyContact || req.body.emergency_contact,
            emergencyPhone: req.body.emergencyPhone || req.body.emergency_phone,
            website: req.body.website,
            preferredCommunication: req.body.preferredCommunication || req.body.preferred_communication,
            address: req.body.address,
            city: req.body.city,
            state: req.body.state,
            postalCode: req.body.postalCode || req.body.postal_code,
            country: req.body.country,
            taxNumber: req.body.taxNumber || req.body.tax_number,
            taxOffice: req.body.taxOffice || req.body.tax_office,
            businessRegistrationNumber: req.body.businessRegistrationNumber || req.body.business_registration_number,
            currency: req.body.currency,
            creditLimit: req.body.creditLimit || req.body.credit_limit,
            creditRating: req.body.creditRating || req.body.credit_rating,
            paymentTerms: req.body.paymentTerms || req.body.payment_terms,
            paymentMethod: req.body.paymentMethod || req.body.payment_method,
            bankName: req.body.bankName || req.body.bank_name,
            bankAccount: req.body.bankAccount || req.body.bank_account,
            iban: req.body.iban,
            supplierType: req.body.supplierType || req.body.supplier_type,
            qualityCertification: req.body.qualityCertification || req.body.quality_certification,
            deliveryCapability: req.body.deliveryCapability || req.body.delivery_capability,
            leadTimeDays: req.body.leadTimeDays || req.body.lead_time_days || req.body.leadTime,
            minimumOrderQuantity: req.body.minimumOrderQuantity || req.body.minimum_order_quantity,
            yearEstablished: req.body.yearEstablished || req.body.year_established,
            employeeCount: req.body.employeeCount || req.body.employee_count,
            annualRevenue: req.body.annualRevenue || req.body.annual_revenue,
            complianceStatus: req.body.complianceStatus || req.body.compliance_status,
            riskLevel: req.body.riskLevel || req.body.risk_level,
            notes: req.body.notes,
            status: req.body.status || 'Aktif',
            isActive: req.body.isActive !== undefined ? req.body.isActive : (req.body.is_active !== false && req.body.status !== 'Pasif')
        }
        
        // Extract suppliedMaterials if provided
        const suppliedMaterials = req.body.suppliedMaterials || []
        
        const newSupplier = await Suppliers.createSupplier(supplierData, suppliedMaterials)
        res.status(201).json(newSupplier)
    } catch (error) {
        console.error('Error adding supplier:', error)
        res.status(500).json({ error: 'Failed to add supplier' })
    }
}

export async function updateSupplier(req, res) {
    try {
        const { id } = req.params
        const updates = {
            code: req.body.code,
            name: req.body.name,
            contactPerson: req.body.contactPerson || req.body.contact_person,
            email: req.body.email || req.body.email1,
            phone: req.body.phone || req.body.phone1,
            phone2: req.body.phone2,
            email2: req.body.email2,
            fax: req.body.fax,
            emergencyContact: req.body.emergencyContact || req.body.emergency_contact,
            emergencyPhone: req.body.emergencyPhone || req.body.emergency_phone,
            website: req.body.website,
            preferredCommunication: req.body.preferredCommunication || req.body.preferred_communication,
            address: req.body.address,
            city: req.body.city,
            state: req.body.state,
            postalCode: req.body.postalCode || req.body.postal_code,
            country: req.body.country,
            taxNumber: req.body.taxNumber || req.body.tax_number,
            taxOffice: req.body.taxOffice || req.body.tax_office,
            businessRegistrationNumber: req.body.businessRegistrationNumber || req.body.business_registration_number,
            currency: req.body.currency,
            creditLimit: req.body.creditLimit || req.body.credit_limit,
            creditRating: req.body.creditRating || req.body.credit_rating,
            paymentTerms: req.body.paymentTerms || req.body.payment_terms,
            paymentMethod: req.body.paymentMethod || req.body.payment_method,
            bankName: req.body.bankName || req.body.bank_name,
            bankAccount: req.body.bankAccount || req.body.bank_account,
            iban: req.body.iban,
            supplierType: req.body.supplierType || req.body.supplier_type,
            qualityCertification: req.body.qualityCertification || req.body.quality_certification,
            deliveryCapability: req.body.deliveryCapability || req.body.delivery_capability,
            leadTimeDays: req.body.leadTimeDays || req.body.lead_time_days || req.body.leadTime,
            minimumOrderQuantity: req.body.minimumOrderQuantity || req.body.minimum_order_quantity,
            yearEstablished: req.body.yearEstablished || req.body.year_established,
            employeeCount: req.body.employeeCount || req.body.employee_count,
            annualRevenue: req.body.annualRevenue || req.body.annual_revenue,
            complianceStatus: req.body.complianceStatus || req.body.compliance_status,
            riskLevel: req.body.riskLevel || req.body.risk_level,
            notes: req.body.notes,
            status: req.body.status,
            isActive: req.body.isActive !== undefined ? req.body.isActive : (req.body.is_active !== undefined ? req.body.is_active : (req.body.status !== 'Pasif'))
        }
        
        const updatedSupplier = await Suppliers.updateSupplier(id, updates)
        res.json(updatedSupplier)
    } catch (error) {
        console.error('Error updating supplier:', error)
        res.status(500).json({ error: 'Failed to update supplier' })
    }
}

export async function deleteSupplier(req, res) {
    try {
        const { id } = req.params
        await Suppliers.deleteSupplier(id)
        res.json({ message: 'Supplier deleted successfully' })
    } catch (error) {
        console.error('Error deleting supplier:', error)
        res.status(500).json({ error: 'Failed to delete supplier' })
    }
}

// ================================
// ADDITIONAL ENDPOINTS
// ================================

// Get suppliers by category (deprecated - suppliers don't have categories directly)
export async function getSuppliersByCategory(req, res) {
    try {
        // This was used in Firebase for filtering
        // In PostgreSQL, we'd join with materials table
        // For now, return all active suppliers
        const suppliers = await Suppliers.getActiveSuppliers()
        res.json(suppliers)
    } catch (error) {
        console.error('Error getting suppliers by category:', error)
        res.status(500).json({ error: 'Failed to get suppliers' })
    }
}

// Material-Supplier relationships
// Note: These functions are placeholders until materials table is migrated
// In PostgreSQL, material-supplier relationship is via material_supplier_relation junction table

export async function addMaterialToSupplier(req, res) {
    try {
        const { supplierId } = req.params
        const { materialId, isPrimary, costPrice } = req.body
        
        if (!materialId) {
            return res.status(400).json({ error: 'Material ID is required' })
        }
        
        // Use junction table
        const MaterialSupplierRelation = (await import('../db/models/materialSupplierRelation.js')).default
        
        // First verify supplier exists
        const supplier = await Suppliers.getSupplierById(supplierId)
        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found' })
        }
        
        // Add relation (or update if exists)
        const relation = await MaterialSupplierRelation.addSupplierToMaterial(
            materialId,
            parseInt(supplierId),
            {
                is_primary: isPrimary || false,
                cost_price: costPrice
            }
        )
        
        res.json({
            success: true,
            relation: relation,
            supplier: supplier
        })
    } catch (error) {
        console.error('Error adding material to supplier:', error)
        res.status(500).json({ error: 'Failed to add material to supplier' })
    }
}

export async function getSuppliersForMaterial(req, res) {
    try {
        const { materialId } = req.params
        
        // Use junction table to get all suppliers
        const MaterialSupplierRelation = (await import('../db/models/materialSupplierRelation.js')).default
        const suppliers = await MaterialSupplierRelation.getSuppliersForMaterial(materialId)
        
        res.json(suppliers)
    } catch (error) {
        console.error('Error getting suppliers for material:', error)
        res.status(500).json({ error: 'Failed to get suppliers for material' })
    }
}

export async function getMaterialsForSupplier(req, res) {
    try {
        const { supplierId } = req.params
        
        // Use junction table to get all materials
        const MaterialSupplierRelation = (await import('../db/models/materialSupplierRelation.js')).default
        const materials = await MaterialSupplierRelation.getMaterialsForSupplier(supplierId)
        
        res.json(materials)
    } catch (error) {
        console.error('Error getting materials for supplier:', error)
        res.status(500).json({ error: 'Failed to get materials for supplier' })
    }
}
