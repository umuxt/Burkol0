/**
 * Material Service
 * Handles material CRUD operations
 */

import Materials from '#db/models/materials';
import db from '#db/connection';

/**
 * Get active materials
 */
export async function getMaterials() {
  return Materials.getActiveMaterials();
}

/**
 * Get all materials including inactive
 */
export async function getAllMaterials() {
  return Materials.getAllMaterials();
}

/**
 * Get active materials (alias)
 */
export async function getActiveMaterials() {
  return Materials.getActiveMaterials();
}

/**
 * Get material by code
 */
export async function getMaterialByCode(code) {
  return Materials.getMaterialByCode(code);
}

/**
 * Create new material
 */
export async function createMaterial(data, createdBy) {
  const materialData = {
    code: data.code,
    name: data.name,
    description: data.description,
    type: data.type,
    category: data.category,
    subcategory: data.subcategory,
    stock: data.stock,
    reserved: data.reserved,
    wipReserved: data.wipReserved || data.wip_reserved,
    reorderPoint: data.reorderPoint || data.reorder_point,
    maxStock: data.maxStock || data.max_stock,
    unit: data.unit,
    costPrice: data.costPrice || data.cost_price,
    averageCost: data.averageCost || data.average_cost,
    currency: data.currency,
    primarySupplierId: data.primarySupplierId || data.primary_supplier_id || data.supplier,
    barcode: data.barcode,
    qrCode: data.qrCode || data.qr_code,
    status: data.status,
    isActive: data.isActive !== undefined ? data.isActive : true,
    scrapType: data.scrapType,
    parentMaterial: data.parentMaterial,
    specifications: data.specifications,
    storage: data.storage,
    productionHistory: data.productionHistory,
    suppliersData: data.suppliersData,
    createdBy: createdBy
  };

  return Materials.createMaterial(materialData);
}

/**
 * Update material
 */
export async function updateMaterial(id, updates) {
  const updateData = {
    code: updates.code,
    name: updates.name,
    description: updates.description,
    type: updates.type,
    category: updates.category,
    subcategory: updates.subcategory,
    stock: updates.stock,
    reserved: updates.reserved,
    wipReserved: updates.wipReserved || updates.wip_reserved,
    reorderPoint: updates.reorderPoint || updates.reorder_point,
    maxStock: updates.maxStock || updates.max_stock,
    unit: updates.unit,
    costPrice: updates.costPrice || updates.cost_price,
    averageCost: updates.averageCost || updates.average_cost,
    currency: updates.currency,
    primarySupplierId: updates.primarySupplierId || updates.primary_supplier_id,
    barcode: updates.barcode,
    qrCode: updates.qrCode || updates.qr_code,
    status: updates.status,
    isActive: updates.isActive,
    scrapType: updates.scrapType,
    parentMaterial: updates.parentMaterial,
    specifications: updates.specifications,
    storage: updates.storage,
    productionHistory: updates.productionHistory,
    suppliersData: updates.suppliersData
  };

  // Remove undefined values
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) {
      delete updateData[key];
    }
  });

  return Materials.updateMaterial(id, updateData);
}

/**
 * Soft delete material
 */
export async function deleteMaterial(id) {
  return Materials.softDeleteMaterial(id);
}

/**
 * Permanent delete material
 */
export async function permanentDeleteMaterial(id) {
  return Materials.permanentDeleteMaterial(id);
}

/**
 * Batch create materials
 */
export async function batchCreateMaterials(materials, createdBy) {
  const results = {
    success: [],
    failed: []
  };

  for (const material of materials) {
    try {
      const created = await createMaterial(material, createdBy);
      results.success.push({
        code: material.code,
        id: created.id
      });
    } catch (error) {
      results.failed.push({
        code: material.code,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Get materials by category
 */
export async function getMaterialsByCategory(category) {
  return db('materials.materials')
    .where('category', category)
    .where('is_active', true)
    .orderBy('name');
}

/**
 * Get materials by supplier
 */
export async function getMaterialsBySupplier(supplierId) {
  const MaterialSupplierRelation = (await import('#db/models/materialSupplierRelation')).default;
  return MaterialSupplierRelation.getMaterialsForSupplier(supplierId);
}

/**
 * Get categories (distinct from materials)
 */
export async function getCategories() {
  const result = await db('materials.materials')
    .distinct('category')
    .whereNotNull('category')
    .where('is_active', true)
    .orderBy('category');
  
  return result.map(r => r.category);
}
