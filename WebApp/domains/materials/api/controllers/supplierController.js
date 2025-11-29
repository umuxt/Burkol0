/**
 * Supplier Controller
 * HTTP handlers for supplier CRUD operations
 */

import * as supplierService from '../services/supplierService.js';

export async function getAllSuppliers(req, res) {
  try {
    const suppliers = await supplierService.getAllSuppliers();
    res.json(suppliers);
  } catch (error) {
    console.error('Error getting all suppliers:', error);
    res.status(500).json({ error: 'Failed to get suppliers' });
  }
}

export async function addSupplier(req, res) {
  try {
    const suppliedMaterials = req.body.suppliedMaterials || [];
    const newSupplier = await supplierService.createSupplier(req.body, suppliedMaterials);
    res.status(201).json(newSupplier);
  } catch (error) {
    console.error('Error adding supplier:', error);
    res.status(500).json({ error: 'Failed to add supplier' });
  }
}

export async function updateSupplier(req, res) {
  try {
    const { id } = req.params;
    const updatedSupplier = await supplierService.updateSupplier(id, req.body);
    res.json(updatedSupplier);
  } catch (error) {
    console.error('Error updating supplier:', error);
    res.status(500).json({ error: 'Failed to update supplier' });
  }
}

export async function deleteSupplier(req, res) {
  try {
    const { id } = req.params;
    await supplierService.deleteSupplier(id);
    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    res.status(500).json({ error: 'Failed to delete supplier' });
  }
}

export async function getSuppliersByCategory(req, res) {
  try {
    const { category } = req.params;
    const suppliers = await supplierService.getSuppliersByCategory(category);
    res.json(suppliers);
  } catch (error) {
    console.error('Error getting suppliers by category:', error);
    res.status(500).json({ error: 'Failed to get suppliers' });
  }
}

export async function addMaterialToSupplier(req, res) {
  try {
    const { supplierId } = req.params;
    const { materialId, isPrimary, costPrice } = req.body;

    if (!materialId) {
      return res.status(400).json({ error: 'Material ID is required' });
    }

    const result = await supplierService.addMaterialToSupplier(supplierId, materialId, {
      isPrimary,
      costPrice
    });

    res.json({
      success: true,
      relation: result.relation,
      supplier: result.supplier
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    console.error('Error adding material to supplier:', error);
    res.status(500).json({ error: 'Failed to add material to supplier' });
  }
}

export async function getSuppliersForMaterial(req, res) {
  try {
    const { materialId } = req.params;
    const suppliers = await supplierService.getSuppliersForMaterial(materialId);
    res.json(suppliers);
  } catch (error) {
    console.error('Error getting suppliers for material:', error);
    res.status(500).json({ error: 'Failed to get suppliers for material' });
  }
}

export async function getMaterialsForSupplier(req, res) {
  try {
    const { supplierId } = req.params;
    const materials = await supplierService.getMaterialsForSupplier(supplierId);
    res.json(materials);
  } catch (error) {
    console.error('Error getting materials for supplier:', error);
    res.status(500).json({ error: 'Failed to get materials for supplier' });
  }
}
