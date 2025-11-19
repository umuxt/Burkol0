// Materials Routes - PostgreSQL Integration
import Materials from '../db/models/materials.js'
import { requireAuth } from './auth.js'

// ================================
// MATERIALS CRUD OPERATIONS
// ================================

/**
 * GET /api/materials - Get active materials
 */
async function getMaterials(req, res) {
  try {
    const materials = await Materials.getActiveMaterials()
    res.json(materials)
  } catch (error) {
    console.error('Error getting materials:', error)
    res.status(500).json({ error: 'Failed to get materials' })
  }
}

/**
 * GET /api/materials/all - Get all materials (including inactive)
 */
async function getAllMaterials(req, res) {
  try {
    const materials = await Materials.getAllMaterials()
    res.json(materials)
  } catch (error) {
    console.error('Error getting all materials:', error)
    res.status(500).json({ error: 'Failed to get materials' })
  }
}

/**
 * GET /api/materials/active - Alias for /api/materials
 */
async function getActiveMaterials(req, res) {
  try {
    const materials = await Materials.getActiveMaterials()
    res.json(materials)
  } catch (error) {
    console.error('Error getting active materials:', error)
    res.status(500).json({ error: 'Failed to get materials' })
  }
}

/**
 * POST /api/materials - Create new material
 */
async function createMaterial(req, res) {
  try {
    const materialData = {
      code: req.body.code,
      name: req.body.name,
      description: req.body.description,
      type: req.body.type,
      category: req.body.category,
      subcategory: req.body.subcategory,
      stock: req.body.stock,
      reserved: req.body.reserved,
      wip_reserved: req.body.wip_reserved || req.body.wipReserved,
      reorder_point: req.body.reorder_point || req.body.reorderPoint,
      max_stock: req.body.max_stock || req.body.maxStock,
      unit: req.body.unit,
      cost_price: req.body.cost_price || req.body.costPrice,
      average_cost: req.body.average_cost || req.body.averageCost,
      currency: req.body.currency,
      primary_supplier_id: req.body.primary_supplier_id || req.body.primarySupplierId || req.body.supplier,
      barcode: req.body.barcode,
      qr_code: req.body.qr_code || req.body.qrCode,
      status: req.body.status,
      is_active: req.body.is_active !== false,
      scrap_type: req.body.scrap_type || req.body.scrapType,
      parent_material: req.body.parent_material || req.body.parentMaterial,
      specifications: req.body.specifications,
      storage: req.body.storage,
      production_history: req.body.production_history || req.body.productionHistory,
      suppliers_data: req.body.suppliers_data || req.body.suppliersData,
      created_by: req.body.created_by || req.body.createdBy || req.user?.email
    }

    const newMaterial = await Materials.createMaterial(materialData)
    res.status(201).json(newMaterial)
  } catch (error) {
    console.error('Error creating material:', error)
    res.status(500).json({ error: 'Failed to create material' })
  }
}

/**
 * PATCH /api/materials/:id - Update material
 */
async function updateMaterial(req, res) {
  try {
    const { id } = req.params
    const updates = {
      code: req.body.code,
      name: req.body.name,
      description: req.body.description,
      type: req.body.type,
      category: req.body.category,
      subcategory: req.body.subcategory,
      stock: req.body.stock,
      reserved: req.body.reserved,
      wip_reserved: req.body.wip_reserved || req.body.wipReserved,
      reorder_point: req.body.reorder_point || req.body.reorderPoint,
      max_stock: req.body.max_stock || req.body.maxStock,
      unit: req.body.unit,
      cost_price: req.body.cost_price || req.body.costPrice,
      average_cost: req.body.average_cost || req.body.averageCost,
      currency: req.body.currency,
      primary_supplier_id: req.body.primary_supplier_id || req.body.primarySupplierId || req.body.supplier,
      barcode: req.body.barcode,
      qr_code: req.body.qr_code || req.body.qrCode,
      status: req.body.status,
      is_active: req.body.is_active,
      scrap_type: req.body.scrap_type || req.body.scrapType,
      parent_material: req.body.parent_material || req.body.parentMaterial,
      specifications: req.body.specifications,
      storage: req.body.storage,
      production_history: req.body.production_history || req.body.productionHistory,
      suppliers_data: req.body.suppliers_data || req.body.suppliersData,
      updated_by: req.body.updated_by || req.body.updatedBy || req.user?.email
    }

    const updatedMaterial = await Materials.updateMaterial(id, updates)
    res.json(updatedMaterial)
  } catch (error) {
    console.error('Error updating material:', error)
    res.status(500).json({ error: 'Failed to update material' })
  }
}

/**
 * DELETE /api/materials/:id - Soft delete material
 */
async function deleteMaterial(req, res) {
  try {
    const { id } = req.params
    await Materials.deleteMaterial(id)
    res.json({ message: 'Material deleted successfully' })
  } catch (error) {
    console.error('Error deleting material:', error)
    res.status(500).json({ error: 'Failed to delete material' })
  }
}

/**
 * DELETE /api/materials/:id/permanent - Hard delete material
 */
async function permanentDeleteMaterial(req, res) {
  try {
    const { id } = req.params
    await Materials.hardDeleteMaterial(id)
    res.json({ message: 'Material permanently deleted' })
  } catch (error) {
    console.error('Error permanently deleting material:', error)
    res.status(500).json({ error: 'Failed to permanently delete material' })
  }
}

// ================================
// STOCK MANAGEMENT
// ================================

/**
 * PATCH /api/materials/:code/stock - Update material stock
 */
async function updateStock(req, res) {
  try {
    const { code } = req.params
    const { stockChange, reservedChange, wipReservedChange, quantity, operation } = req.body

    console.log('📦 Stock update request:', { code, body: req.body })

    if (!code) {
      return res.status(400).json({ error: 'Material code is required' })
    }

    // Support both old format (stockChange) and new format (quantity + operation)
    let actualStockChange = stockChange || 0
    if (quantity !== undefined && operation) {
      actualStockChange = operation === 'add' ? Number(quantity) : -Number(quantity)
    }

    const updatedMaterial = await Materials.updateMaterialStock(
      code,
      actualStockChange,
      reservedChange || 0,
      wipReservedChange || 0
    )

    res.json({
      message: 'Stock updated successfully',
      material: updatedMaterial,
      previousStock: updatedMaterial.stock - actualStockChange,
      newStock: updatedMaterial.stock,
      quantityAdded: actualStockChange
    })
  } catch (error) {
    console.error('Error updating stock:', error)
    res.status(500).json({ error: 'Failed to update stock' })
  }
}

/**
 * GET /api/stock - Get stock overview
 */
async function getStockOverview(req, res) {
  try {
    const stats = await Materials.getMaterialStats()
    res.json(stats)
  } catch (error) {
    console.error('Error getting stock overview:', error)
    res.status(500).json({ error: 'Failed to get stock overview' })
  }
}

// ================================
// QUERY OPERATIONS
// ================================

/**
 * GET /api/materials/category/:category - Get materials by category
 */
async function getMaterialsByCategory(req, res) {
  try {
    const { category } = req.params
    const materials = await Materials.getMaterialsByCategory(category)
    res.json(materials)
  } catch (error) {
    console.error('Error getting materials by category:', error)
    res.status(500).json({ error: 'Failed to get materials' })
  }
}

/**
 * GET /api/materials/supplier/:supplierId - Get materials by supplier
 */
async function getMaterialsBySupplier(req, res) {
  try {
    const { supplierId } = req.params
    const materials = await Materials.getMaterialsBySupplier(supplierId)
    res.json(materials)
  } catch (error) {
    console.error('Error getting materials by supplier:', error)
    res.status(500).json({ error: 'Failed to get materials' })
  }
}

/**
 * GET /api/categories - Get all material categories
 */
async function getCategories(req, res) {
  try {
    const categories = await Materials.getAllCategories()
    res.json({ categories })
  } catch (error) {
    console.error('Error getting categories:', error)
    res.status(500).json({ error: 'Failed to get categories' })
  }
}

// ================================
// ROUTE SETUP
// ================================

export function setupMaterialsRoutes(app) {
  // Materials CRUD
  app.get('/api/materials', requireAuth, getMaterials)
  app.get('/api/materials/all', requireAuth, getAllMaterials)
  app.get('/api/materials/active', requireAuth, getActiveMaterials)
  app.post('/api/materials', requireAuth, createMaterial)
  app.patch('/api/materials/:id', requireAuth, updateMaterial)
  app.delete('/api/materials/:id', requireAuth, deleteMaterial)
  app.delete('/api/materials/:id/permanent', requireAuth, permanentDeleteMaterial)

  // Stock management
  app.patch('/api/materials/:code/stock', requireAuth, updateStock)
  app.get('/api/stock', requireAuth, getStockOverview)

  // Categories
  app.get('/api/categories', requireAuth, getCategories)

  // Query operations
  app.get('/api/materials/category/:category', requireAuth, getMaterialsByCategory)
  app.get('/api/materials/supplier/:supplierId', requireAuth, getMaterialsBySupplier)

  // TODO: Stock movements tracking (future enhancement)
  // app.get('/api/stockMovements', requireAuth, getStockMovements)
}
