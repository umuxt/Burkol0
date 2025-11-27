// Materials Routes - PostgreSQL Integration
import Materials from '../db/models/materials.js'
import StockMovements from '../db/models/stockMovements.js'
import db from '../db/connection.js'
import { requireAuth } from './auth.js'

// ================================
// SHIPMENTS CONSTANTS
// ================================
const SHIPMENT_STATUSES = {
  PENDING: 'pending',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
}

// Valid status transitions
const VALID_TRANSITIONS = {
  pending: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],  // Final state
  cancelled: []   // Final state
}

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
      wipReserved: req.body.wipReserved || req.body.wip_reserved,
      reorderPoint: req.body.reorderPoint || req.body.reorder_point,
      maxStock: req.body.maxStock || req.body.max_stock,
      unit: req.body.unit,
      costPrice: req.body.costPrice || req.body.cost_price,
      averageCost: req.body.averageCost || req.body.average_cost,
      currency: req.body.currency,
      primarySupplierId: req.body.primarySupplierId || req.body.primary_supplier_id || req.body.supplier,
      barcode: req.body.barcode,
      qrCode: req.body.qrCode || req.body.qr_code,
      status: req.body.status,
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      scrapType: req.body.scrapType,
      parentMaterial: req.body.parentMaterial,
      specifications: req.body.specifications,
      storage: req.body.storage,
      productionHistory: req.body.productionHistory,
      suppliersData: req.body.suppliersData,
      createdBy: req.body.createdBy || req.user?.email
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
    
    // Get current material before update (for stock comparison)
    const currentMaterial = await Materials.getMaterialById(id)
    if (!currentMaterial) {
      return res.status(404).json({ error: 'Material not found' })
    }
    
    const updates = {
      code: req.body.code,
      name: req.body.name,
      description: req.body.description,
      type: req.body.type,
      category: req.body.category,
      subcategory: req.body.subcategory,
      stock: req.body.stock,
      reserved: req.body.reserved,
      wipReserved: req.body.wipReserved || req.body.wip_reserved,
      reorderPoint: req.body.reorderPoint || req.body.reorder_point,
      maxStock: req.body.maxStock || req.body.max_stock,
      unit: req.body.unit,
      costPrice: req.body.costPrice || req.body.cost_price,
      averageCost: req.body.averageCost || req.body.average_cost,
      currency: req.body.currency,
      primarySupplierId: req.body.primarySupplierId || req.body.primary_supplier_id || req.body.supplier,
      barcode: req.body.barcode,
      qrCode: req.body.qrCode || req.body.qr_code,
      status: req.body.status,
      isActive: req.body.isActive,
      scrapType: req.body.scrapType,
      parentMaterial: req.body.parentMaterial,
      specifications: req.body.specifications,
      storage: req.body.storage,
      productionHistory: req.body.productionHistory,
      suppliersData: req.body.suppliersData,
      updatedBy: req.body.updatedBy || req.user?.email
    }

    const updatedMaterial = await Materials.updateMaterial(id, updates)
    
    // ✅ Check if stock was manually changed
    const previousStock = currentMaterial.stock
    const newStock = updatedMaterial.stock
    const stockChanged = previousStock !== newStock
    
    if (stockChanged) {
      console.log('📦 Manual stock change detected:', {
        material: updatedMaterial.code,
        previousStock,
        newStock,
        change: newStock - previousStock
      })
      
      // Create stock movement record for manual adjustment
      try {
        const stockChange = newStock - previousStock
        const movementData = {
          materialId: updatedMaterial.id,
          materialCode: updatedMaterial.code,
          materialName: updatedMaterial.name,
          type: stockChange >= 0 ? 'in' : 'out',
          subType: 'manual_adjustment',
          status: 'completed',
          quantity: Math.abs(stockChange),
          unit: updatedMaterial.unit || 'adet',
          stockBefore: previousStock,
          stockAfter: newStock,
          warehouse: 'Warehouse',
          location: updatedMaterial.storage || 'Main',
          notes: `Manuel stok düzeltmesi: ${stockChange >= 0 ? '+' : ''}${stockChange} ${updatedMaterial.unit}`,
          reason: 'Manual stock adjustment via edit',
          movementDate: new Date(),
          approved: true,
          userId: req.user?.uid || 'system',
          userName: req.user?.email || updates.updated_by || 'system'
        }

        const movement = await StockMovements.createMovement(movementData)
        console.log('✅ Manual stock movement created:', movement.id)
      } catch (movementError) {
        console.error('❌ Failed to create stock movement:', movementError)
        // Don't fail the request if movement fails
      }
    }
    
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
    const { 
      stockChange, 
      reservedChange, 
      wipReservedChange, 
      quantity, 
      operation,
      orderId,
      orderCode,
      itemId,
      movementType,
      notes,
      reason
    } = req.body

    console.log('📦 Stock update request:', { code, body: req.body })

    if (!code) {
      return res.status(400).json({ error: 'Material code is required' })
    }

    // Get material details before update
    const material = await Materials.getMaterialByCode(code)
    if (!material) {
      return res.status(404).json({ error: 'Material not found' })
    }

    // Support both old format (stockChange) and new format (quantity + operation)
    let actualStockChange = stockChange || 0
    if (quantity !== undefined && operation) {
      actualStockChange = operation === 'add' ? Number(quantity) : -Number(quantity)
    }

    const previousStock = material.stock
    const newStock = previousStock + actualStockChange

    // Update stock
    const updatedMaterial = await Materials.updateMaterialStock(
      code,
      actualStockChange,
      reservedChange || 0,
      wipReservedChange || 0
    )

    // ✅ Create stock movement record
    try {
      const movementData = {
        materialId: material.id,
        materialCode: material.code,
        materialName: material.name,
        type: actualStockChange >= 0 ? 'in' : 'out',
        subType: movementType || (actualStockChange >= 0 ? 'manual_adjustment' : 'manual_adjustment'),
        status: 'completed',
        quantity: Math.abs(actualStockChange),
        unit: material.unit || 'adet',
        stockBefore: previousStock,
        stockAfter: newStock,
        warehouse: 'Warehouse',
        location: material.location || 'Main',
        notes: notes || `Stock ${operation || 'adjustment'}: ${actualStockChange >= 0 ? '+' : ''}${actualStockChange} ${material.unit}`,
        reason: reason || (orderCode ? `Order delivery: ${orderCode}` : 'Manual adjustment'),
        movementDate: new Date(),
        approved: true,
        userId: req.user?.uid || 'system',
        userName: req.user?.email || 'system'
      }

      // Add reference if order-related (use orderCode if available, otherwise orderId)
      if (orderCode) {
        movementData.reference = orderCode // ✅ Use full order code (ORD-2025-0007)
        movementData.referenceType = 'order_delivery'
      } else if (orderId) {
        movementData.reference = `ORD-${orderId}` // Fallback to old format
        movementData.referenceType = 'order_delivery'
      }

      const movement = await StockMovements.createMovement(movementData)
      console.log('✅ Stock movement created:', movement.id)

    } catch (movementError) {
      console.error('❌ Failed to create stock movement:', movementError)
      // Don't fail the request if movement fails, just log it
    }

    res.json({
      message: 'Stock updated successfully',
      material: updatedMaterial,
      previousStock: previousStock,
      newStock: newStock,
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

// ================================
// LOT TRACKING
// ================================

/**
 * GET /api/materials/:code/lots - Get lot inventory for a specific material
 * Returns all active lots with FIFO order, balance, and expiry status
 */
async function getMaterialLots(req, res) {
  try {
    const { code } = req.params
    
    console.log('📦 Fetching lots for material:', code)

    // Check if lotNumber column exists in stock_movements table
    // If not, return empty array (lot tracking not yet implemented)
    const columnCheckQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'materials' 
        AND table_name = 'stock_movements' 
        AND column_name = 'lotNumber'
    `
    
    const columnCheck = await db.raw(columnCheckQuery)
    
    if (columnCheck.rows.length === 0) {
      console.log('⚠️ Lot tracking not yet implemented (lotNumber column does not exist)')
      return res.json({ lots: [] })
    }

    // Query stock_movements for lot-level inventory using query builder
    const lots = await db('materials.stock_movements')
      .select(
        'lotNumber',
        'lotDate',
        'supplierLotCode',
        'manufacturingDate',
        'expiryDate'
      )
      .select(db.raw('SUM(CASE WHEN type = ? THEN quantity ELSE -quantity END) as balance', ['in']))
      .select(db.raw(`
        CASE
          WHEN "expiryDate" < CURRENT_DATE THEN 'expired'
          WHEN "expiryDate" < CURRENT_DATE + INTERVAL '30 days' THEN 'expiring_soon'
          ELSE 'active'
        END as status
      `))
      .where('materialCode', code)
      .whereNotNull('lotNumber')
      .groupBy('lotNumber', 'lotDate', 'supplierLotCode', 'manufacturingDate', 'expiryDate')
      .havingRaw('SUM(CASE WHEN type = ? THEN quantity ELSE -quantity END) > 0', ['in'])
      .orderBy('lotDate', 'asc')

    console.log(`✅ Found ${lots.length} active lots for material ${code}`)

    res.json({ lots })
  } catch (error) {
    console.error('❌ Error getting material lots:', error)
    res.status(500).json({ error: 'Failed to get material lots' })
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

/**
 * GET /api/stockMovements - Get stock movements for a material
 * Query params: materialCode, type, subType, startDate, endDate, limit
 */
async function getStockMovements(req, res) {
  try {
    const { materialCode, type, subType, startDate, endDate, limit } = req.query

    if (!materialCode) {
      return res.status(400).json({ error: 'materialCode is required' })
    }

    console.log(`📊 Fetching stock movements for material: ${materialCode}`)

    // Build the query
    let query = db('materials.stock_movements')
      .where({ materialCode })
      .orderBy('movementDate', 'desc')

    // Apply filters
    if (type) {
      query = query.where('type', type)
    }

    if (subType) {
      query = query.where('subType', subType)
    }

    if (startDate) {
      query = query.where('movementDate', '>=', startDate)
    }

    if (endDate) {
      query = query.where('movementDate', '<=', endDate)
    }

    if (limit) {
      query = query.limit(parseInt(limit, 10))
    }

    const movements = await query

    console.log(`✅ Found ${movements.length} stock movements for ${materialCode}`)

    res.json({ movements })
  } catch (error) {
    console.error('Error getting stock movements:', error)
    res.status(500).json({ error: 'Failed to get stock movements' })
  }
}

// ================================
// MES HELPER FUNCTIONS (used by mesRoutes.js)
// ================================

/**
 * Adjust material stock (add/subtract)
 * TODO: Phase 2 - Full implementation with lot tracking
 */
export async function adjustMaterialStock(materialCode, quantity, options = {}) {
  console.log(`🚧 STUB: adjustMaterialStock(${materialCode}, ${quantity})`)
  // Temporary stub - will be implemented in Phase 2
  return {
    materialCode,
    materialName: materialCode,
    quantity,
    newStock: 0,
    success: true
  }
}

/**
 * Consume materials from stock (batch operation)
 * TODO: Phase 2 - Full implementation with FIFO lot tracking
 */
export async function consumeMaterials(consumptionList, options = {}) {
  console.log(`🚧 STUB: consumeMaterials(${consumptionList.length} materials)`)
  // Temporary stub - will be implemented in Phase 2
  return {
    consumed: consumptionList.map(item => ({
      material: item.code,
      qty: item.qty,
      success: true,
      isWIP: false
    })),
    failed: []
  }
}

// ================================
// SHIPMENTS OPERATIONS
// ================================

/**
 * POST /api/materials/shipments - Create new shipment
 * Creates shipment + stock_movement + updates material stock
 */
async function createShipment(req, res) {
  const trx = await db.transaction()
  
  try {
    const { productCode, shipmentQuantity, planId, workOrderCode, quoteId, description } = req.body

    // Validate required fields
    if (!productCode || !shipmentQuantity) {
      await trx.rollback()
      return res.status(400).json({ error: 'productCode ve shipmentQuantity zorunludur' })
    }

    if (shipmentQuantity <= 0) {
      await trx.rollback()
      return res.status(400).json({ error: 'Miktar pozitif olmalıdır' })
    }

    // Get material details
    const material = await trx('materials.materials')
      .where({ code: productCode })
      .first()

    if (!material) {
      await trx.rollback()
      return res.status(404).json({ error: 'Ürün bulunamadı' })
    }

    // Check stock availability
    const availableStock = material.stock - (material.reserved || 0) - (material.wip_reserved || 0)
    if (shipmentQuantity > availableStock) {
      await trx.rollback()
      return res.status(400).json({ 
        error: `Yetersiz stok. Mevcut: ${availableStock}, İstenen: ${shipmentQuantity}` 
      })
    }

    const previousStock = material.stock
    const newStock = previousStock - shipmentQuantity

    // 1. Create stock movement (out - shipment)
    const [stockMovement] = await trx('materials.stock_movements')
      .insert({
        materialId: material.id,
        materialCode: material.code,
        materialName: material.name,
        type: 'out',
        subType: 'shipment',
        status: 'completed',
        quantity: shipmentQuantity,
        unit: material.unit || 'adet',
        stockBefore: previousStock,
        stockAfter: newStock,
        warehouse: 'Warehouse',
        location: material.storage || 'Main',
        notes: description || `Sevkiyat: ${shipmentQuantity} ${material.unit}`,
        reason: workOrderCode ? `Work Order: ${workOrderCode}` : 'Shipment',
        movementDate: new Date(),
        approved: true,
        userId: req.user?.uid || 'system',
        userName: req.user?.email || 'system'
      })
      .returning('*')

    console.log('✅ Stock movement created for shipment:', stockMovement.id)

    // 2. Update material stock
    await trx('materials.materials')
      .where({ id: material.id })
      .update({
        stock: newStock
      })

    console.log(`✅ Material stock updated: ${previousStock} -> ${newStock}`)

    // 3. Create shipment record
    const [shipment] = await trx('materials.shipments')
      .insert({
        productCode: productCode,
        productName: material.name,
        shipmentQuantity: shipmentQuantity,
        unit: material.unit || 'adet',
        status: 'pending',
        planId: planId || null,
        workOrderCode: workOrderCode || null,
        quoteId: quoteId || null,
        stockMovementId: stockMovement.id,
        description: description || null,
        createdBy: req.user?.email || 'system',
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning('*')

    console.log('✅ Shipment created:', shipment.id)

    await trx.commit()

    res.status(201).json({
      shipment,
      stockMovement,
      previousStock,
      newStock
    })

  } catch (error) {
    await trx.rollback()
    console.error('❌ Error creating shipment:', error)
    res.status(500).json({ error: 'Sevkiyat oluşturulamadı: ' + error.message })
  }
}

/**
 * GET /api/materials/shipments - List shipments with filters
 */
async function getShipments(req, res) {
  try {
    const { productCode, status, planId, workOrderCode, quoteId, startDate, endDate, limit, offset } = req.query

    let query = db('materials.shipments')
      .select('*')
      .orderBy('createdAt', 'desc')

    // Apply filters
    if (productCode) {
      query = query.where('productCode', productCode)
    }
    if (status) {
      query = query.where('status', status)
    }
    if (planId) {
      query = query.where('planId', planId)
    }
    if (workOrderCode) {
      query = query.where('workOrderCode', workOrderCode)
    }
    if (quoteId) {
      query = query.where('quoteId', quoteId)
    }
    if (startDate) {
      query = query.where('createdAt', '>=', startDate)
    }
    if (endDate) {
      query = query.where('createdAt', '<=', endDate)
    }
    if (limit) {
      query = query.limit(parseInt(limit, 10))
    }
    if (offset) {
      query = query.offset(parseInt(offset, 10))
    }

    const shipments = await query

    res.json(shipments)
  } catch (error) {
    console.error('❌ Error getting shipments:', error)
    res.status(500).json({ error: 'Sevkiyatlar getirilemedi' })
  }
}

/**
 * GET /api/materials/shipments/:id - Get single shipment
 */
async function getShipmentById(req, res) {
  try {
    const { id } = req.params

    const shipment = await db('materials.shipments')
      .where({ id: parseInt(id, 10) })
      .first()

    if (!shipment) {
      return res.status(404).json({ error: 'Sevkiyat bulunamadı' })
    }

    // Also get related stock movement
    let stockMovement = null
    if (shipment.stockMovementId) {
      stockMovement = await db('materials.stock_movements')
        .where({ id: shipment.stockMovementId })
        .first()
    }

    res.json({
      ...shipment,
      stockMovement
    })
  } catch (error) {
    console.error('❌ Error getting shipment:', error)
    res.status(500).json({ error: 'Sevkiyat getirilemedi' })
  }
}

/**
 * PUT /api/materials/shipments/:id/status - Update shipment status
 * Valid transitions: pending -> shipped -> delivered (or cancelled at any point)
 */
async function updateShipmentStatus(req, res) {
  try {
    const { id } = req.params
    const { status: newStatus } = req.body

    if (!newStatus) {
      return res.status(400).json({ error: 'Yeni durum belirtilmeli' })
    }

    // Validate status value
    const validStatuses = Object.values(SHIPMENT_STATUSES)
    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({ 
        error: `Geçersiz durum. Geçerli değerler: ${validStatuses.join(', ')}` 
      })
    }

    // Get current shipment
    const shipment = await db('materials.shipments')
      .where({ id: parseInt(id, 10) })
      .first()

    if (!shipment) {
      return res.status(404).json({ error: 'Sevkiyat bulunamadı' })
    }

    // Check valid transition
    const allowedTransitions = VALID_TRANSITIONS[shipment.status] || []
    if (!allowedTransitions.includes(newStatus)) {
      return res.status(400).json({ 
        error: `${shipment.status} durumundan ${newStatus} durumuna geçiş yapılamaz` 
      })
    }

    // Update status
    const [updated] = await db('materials.shipments')
      .where({ id: parseInt(id, 10) })
      .update({
        status: newStatus,
        updatedBy: req.user?.email || 'system',
        updatedAt: new Date()
      })
      .returning('*')

    console.log(`✅ Shipment ${id} status updated: ${shipment.status} -> ${newStatus}`)

    res.json(updated)
  } catch (error) {
    console.error('❌ Error updating shipment status:', error)
    res.status(500).json({ error: 'Sevkiyat durumu güncellenemedi' })
  }
}

/**
 * PUT /api/materials/shipments/:id/cancel - Cancel shipment and restore stock
 */
async function cancelShipment(req, res) {
  const trx = await db.transaction()
  
  try {
    const { id } = req.params
    const { reason } = req.body

    // Get shipment
    const shipment = await trx('materials.shipments')
      .where({ id: parseInt(id, 10) })
      .first()

    if (!shipment) {
      await trx.rollback()
      return res.status(404).json({ error: 'Sevkiyat bulunamadı' })
    }

    // Check if already cancelled or delivered
    if (shipment.status === 'cancelled') {
      await trx.rollback()
      return res.status(400).json({ error: 'Sevkiyat zaten iptal edilmiş' })
    }

    if (shipment.status === 'delivered') {
      await trx.rollback()
      return res.status(400).json({ error: 'Teslim edilmiş sevkiyat iptal edilemez' })
    }

    // Get material
    const material = await trx('materials.materials')
      .where({ code: shipment.productCode })
      .first()

    if (!material) {
      await trx.rollback()
      return res.status(404).json({ error: 'Ürün bulunamadı' })
    }

    const previousStock = material.stock
    const newStock = previousStock + parseFloat(shipment.shipmentQuantity)

    // 1. Create reversal stock movement (in - cancel)
    const [reversalMovement] = await trx('materials.stock_movements')
      .insert({
        materialId: material.id,
        materialCode: material.code,
        materialName: material.name,
        type: 'in',
        subType: 'shipment_cancel',
        status: 'completed',
        quantity: shipment.shipmentQuantity,
        unit: material.unit || 'adet',
        stockBefore: previousStock,
        stockAfter: newStock,
        warehouse: 'Warehouse',
        location: material.storage || 'Main',
        notes: reason || `Sevkiyat iptali: Shipment #${shipment.id}`,
        reason: `Shipment #${shipment.id} cancelled`,
        reference: `SHIP-${shipment.id}`,
        referenceType: 'shipment_cancel',
        movementDate: new Date(),
        approved: true,
        userId: req.user?.uid || 'system',
        userName: req.user?.email || 'system'
      })
      .returning('*')

    console.log('✅ Reversal stock movement created:', reversalMovement.id)

    // 2. Update material stock
    await trx('materials.materials')
      .where({ id: material.id })
      .update({
        stock: newStock
      })

    console.log(`✅ Material stock restored: ${previousStock} -> ${newStock}`)

    // 3. Update shipment status to cancelled
    const [updated] = await trx('materials.shipments')
      .where({ id: parseInt(id, 10) })
      .update({
        status: 'cancelled',
        description: shipment.description 
          ? `${shipment.description}\n[İptal sebebi: ${reason || 'Belirtilmedi'}]`
          : `[İptal sebebi: ${reason || 'Belirtilmedi'}]`,
        updatedBy: req.user?.email || 'system',
        updatedAt: new Date()
      })
      .returning('*')

    console.log(`✅ Shipment ${id} cancelled`)

    await trx.commit()

    res.json({
      shipment: updated,
      reversalMovement,
      previousStock,
      newStock,
      message: 'Sevkiyat iptal edildi ve stok geri eklendi'
    })

  } catch (error) {
    await trx.rollback()
    console.error('❌ Error cancelling shipment:', error)
    res.status(500).json({ error: 'Sevkiyat iptal edilemedi: ' + error.message })
  }
}

/**
 * GET /api/materials/shipments/approved-quotes - Onaylı teklifleri getir
 * quotes.quotes WHERE status='approved'
 */
async function getApprovedQuotesForShipment(req, res) {
  try {
    const quotes = await db('quotes.quotes')
      .select('id', 'customerName', 'customerCompany', 'workOrderCode', 'approvedAt')
      .where('status', 'approved')
      .orderBy('approvedAt', 'desc')

    const result = quotes.map(q => ({
      id: q.id,
      label: `${q.id} - ${q.customerName || q.customerCompany || 'Müşteri'}`,
      customerName: q.customerName,
      customerCompany: q.customerCompany,
      workOrderCode: q.workOrderCode,
      approvedAt: q.approvedAt
    }))

    res.json(result)
  } catch (error) {
    console.error('❌ Error getting approved quotes:', error)
    res.status(500).json({ error: 'Onaylı teklifler getirilemedi' })
  }
}

/**
 * GET /api/materials/shipments/completed-work-orders - Tamamlanmış iş emirlerini getir
 * mes.work_orders WHERE tüm node'ları tamamlanmış (iş paketleri)
 */
async function getCompletedWorkOrdersForShipment(req, res) {
  try {
    // Get work orders where all nodes are completed
    // A work order is considered complete when:
    // 1. It has nodes in production_plan_nodes
    // 2. All its nodes have status = 'completed' in worker_assignments OR no pending assignments
    
    const workOrders = await db.raw(`
      SELECT DISTINCT 
        wo.code,
        wo."quoteId",
        wo.status,
        wo."productionState",
        wo."createdAt"
      FROM mes.work_orders wo
      WHERE wo."productionState" = 'completed'
         OR wo.status = 'completed'
      ORDER BY wo."createdAt" DESC
    `)

    const result = workOrders.rows.map(wo => ({
      code: wo.code,
      label: wo.code,
      quoteId: wo.quoteId,
      status: wo.status,
      productionState: wo.productionState,
      createdAt: wo.createdAt
    }))

    res.json(result)
  } catch (error) {
    console.error('❌ Error getting completed work orders:', error)
    res.status(500).json({ error: 'Tamamlanmış iş emirleri getirilemedi' })
  }
}

// ================================
// ROUTE SETUP
// ================================
// BATCH OPERATIONS
// ================================

/**
 * POST /api/materials/batch - Batch create materials
 * Used for creating multiple output materials from production plans
 */
async function batchCreateMaterials(req, res) {
  try {
    const { materials } = req.body

    if (!Array.isArray(materials) || materials.length === 0) {
      return res.status(400).json({ error: 'Materials array required' })
    }

    const created = []
    const errors = []

    for (const materialData of materials) {
      try {
        // Validate required fields
        // Category is optional for processed and scrap types
        const requiresCategory = !['processed', 'scrap'].includes(materialData.type);
        
        if (!materialData.code || !materialData.name || (requiresCategory && !materialData.category)) {
          errors.push({
            code: materialData.code || 'UNKNOWN',
            error: `Missing required fields (code, name${requiresCategory ? ', category' : ''})`
          })
          continue
        }

        // Check if already exists
        const existing = await Materials.getMaterialByCode(materialData.code)
        if (existing) {
          errors.push({
            code: materialData.code,
            error: 'Material already exists'
          })
          continue
        }

        // Create material
        const newMaterial = await Materials.createMaterial({
          ...materialData,
          createdBy: req.user?.email || 'system'
        })
        created.push(newMaterial)

      } catch (err) {
        console.error(`Error creating material ${materialData.code}:`, err)
        errors.push({
          code: materialData.code || 'UNKNOWN',
          error: err.message
        })
      }
    }

    res.json({
      created: created.length,
      failed: errors.length,
      materials: created,
      errors
    })

  } catch (error) {
    console.error('Batch create materials error:', error)
    res.status(500).json({ error: error.message })
  }
}

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

  // Batch operations
  app.post('/api/materials/batch', requireAuth, batchCreateMaterials)

  // Stock management
  app.patch('/api/materials/:code/stock', requireAuth, updateStock)
  app.get('/api/stock', requireAuth, getStockOverview)

  // Categories
  app.get('/api/categories', requireAuth, getCategories)

  // Query operations
  app.get('/api/materials/category/:category', requireAuth, getMaterialsByCategory)
  app.get('/api/materials/supplier/:supplierId', requireAuth, getMaterialsBySupplier)

  // Lot inventory
  app.get('/api/materials/:code/lots', requireAuth, getMaterialLots)

  // Stock movements tracking
  app.get('/api/stockMovements', requireAuth, getStockMovements)

  // ================================
  // SHIPMENTS ROUTES
  // ================================
  app.get('/api/materials/shipments/approved-quotes', requireAuth, getApprovedQuotesForShipment)
  app.get('/api/materials/shipments/completed-work-orders', requireAuth, getCompletedWorkOrdersForShipment)
  app.post('/api/materials/shipments', requireAuth, createShipment)
  app.get('/api/materials/shipments', requireAuth, getShipments)
  app.get('/api/materials/shipments/:id', requireAuth, getShipmentById)
  app.put('/api/materials/shipments/:id/status', requireAuth, updateShipmentStatus)
  app.put('/api/materials/shipments/:id/cancel', requireAuth, cancelShipment)
}
