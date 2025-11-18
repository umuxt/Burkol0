// Suppliers Routes - PostgreSQL Integration
import Suppliers from '../db/models/suppliers.js'

// ================================
// SUPPLIERS CRUD OPERATIONS
// ================================

export async function getAllSuppliers(req, res) {
    try {
        const suppliers = await Suppliers.getAllSuppliers()
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
            contact_person: req.body.contact_person || req.body.contactPerson,
            email: req.body.email || req.body.email1,
            phone: req.body.phone || req.body.phone1,
            address: req.body.address,
            is_active: req.body.is_active !== false && req.body.status !== 'Pasif'
        }
        
        const newSupplier = await Suppliers.createSupplier(supplierData)
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
            contact_person: req.body.contact_person || req.body.contactPerson,
            email: req.body.email || req.body.email1,
            phone: req.body.phone || req.body.phone1,
            address: req.body.address,
            is_active: req.body.is_active !== undefined ? req.body.is_active : (req.body.status !== 'Pasif')
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
// In PostgreSQL, material-supplier relationship is via materials.primary_supplier_id

export async function addMaterialToSupplier(req, res) {
    try {
        // TODO: Implement after materials migration
        // This will update materials table, not suppliers table
        res.status(501).json({ 
            error: 'Not implemented yet',
            message: 'This will be implemented after materials migration'
        })
    } catch (error) {
        console.error('Error adding material to supplier:', error)
        res.status(500).json({ error: 'Failed to add material to supplier' })
    }
}

export async function getSuppliersForMaterial(req, res) {
    try {
        // TODO: Implement after materials migration
        // Query materials table for primary_supplier_id
        res.status(501).json({ 
            error: 'Not implemented yet',
            message: 'This will be implemented after materials migration'
        })
    } catch (error) {
        console.error('Error getting suppliers for material:', error)
        res.status(500).json({ error: 'Failed to get suppliers for material' })
    }
}

export async function getMaterialsForSupplier(req, res) {
    try {
        // TODO: Implement after materials migration
        // Query materials table WHERE primary_supplier_id = supplierId
        res.status(501).json({ 
            error: 'Not implemented yet',
            message: 'This will be implemented after materials migration'
        })
    } catch (error) {
        console.error('Error getting materials for supplier:', error)
        res.status(500).json({ error: 'Failed to get materials for supplier' })
    }
}
