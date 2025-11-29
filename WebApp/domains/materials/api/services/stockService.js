/**
 * Stock Service
 * Handles stock management, movements, and lot tracking
 */

import Materials from '#db/models/materials';
import StockMovements from '#db/models/stockMovements';
import db from '#db/connection';

/**
 * Update material stock
 */
export async function updateStock(code, stockUpdate, updatedBy) {
  const { 
    quantity, 
    reason, 
    type,
    notes,
    lotNumber,
    referenceId,
    referenceType
  } = stockUpdate;

  // Get current material
  const material = await Materials.getMaterialByCode(code);
  if (!material) {
    const error = new Error('Material not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const currentStock = parseFloat(material.stock) || 0;
  const changeQty = parseFloat(quantity) || 0;

  let newStock;
  let movementType = type || 'adjustment';

  switch (movementType) {
    case 'add':
    case 'receipt':
    case 'production_output':
      newStock = currentStock + Math.abs(changeQty);
      break;
    case 'remove':
    case 'consumption':
    case 'scrap':
      newStock = currentStock - Math.abs(changeQty);
      break;
    case 'set':
      newStock = changeQty;
      break;
    case 'adjustment':
    default:
      newStock = currentStock + changeQty;
      break;
  }

  // Prevent negative stock
  if (newStock < 0) {
    const error = new Error('Stock cannot be negative');
    error.code = 'NEGATIVE_STOCK';
    throw error;
  }

  // Update material stock
  await Materials.updateMaterial(material.id, { stock: newStock });

  // Record stock movement
  const movement = await StockMovements.createMovement({
    materialId: material.id,
    materialCode: code,
    movementType,
    quantity: changeQty,
    previousStock: currentStock,
    newStock,
    reason: reason || notes,
    lotNumber,
    referenceId,
    referenceType,
    createdBy: updatedBy
  });

  return {
    material: {
      code,
      previousStock: currentStock,
      newStock,
      change: changeQty
    },
    movement
  };
}

/**
 * Get stock overview
 */
export async function getStockOverview() {
  const materials = await Materials.getActiveMaterials();
  
  const overview = {
    totalMaterials: materials.length,
    totalValue: 0,
    lowStock: [],
    outOfStock: [],
    overStock: []
  };

  for (const mat of materials) {
    const stock = parseFloat(mat.stock) || 0;
    const reorderPoint = parseFloat(mat.reorderPoint) || 0;
    const maxStock = parseFloat(mat.maxStock) || Infinity;
    const costPrice = parseFloat(mat.costPrice) || 0;

    overview.totalValue += stock * costPrice;

    if (stock === 0) {
      overview.outOfStock.push(mat);
    } else if (stock <= reorderPoint) {
      overview.lowStock.push(mat);
    } else if (stock > maxStock) {
      overview.overStock.push(mat);
    }
  }

  return overview;
}

/**
 * Get material lots
 */
export async function getMaterialLots(code) {
  const material = await Materials.getMaterialByCode(code);
  if (!material) {
    const error = new Error('Material not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  // Get lots from material_lots table
  const lots = await db('materials.material_lots')
    .where('material_id', material.id)
    .where('status', 'active')
    .where('remaining_quantity', '>', 0)
    .orderBy('created_at', 'asc');

  return lots.map(lot => ({
    lotNumber: lot.lot_number,
    quantity: parseFloat(lot.remaining_quantity),
    originalQuantity: parseFloat(lot.original_quantity),
    receivedDate: lot.received_date,
    expiryDate: lot.expiry_date,
    manufacturingDate: lot.manufacturing_date,
    supplierLotCode: lot.supplier_lot_code,
    supplierId: lot.supplier_id,
    status: lot.status
  }));
}

/**
 * Get stock movements
 */
export async function getStockMovements(filters = {}) {
  const { 
    materialCode, 
    materialId,
    movementType, 
    startDate, 
    endDate, 
    limit = 100,
    offset = 0 
  } = filters;

  let query = db('materials.stock_movements as sm')
    .leftJoin('materials.materials as m', 'sm.materialId', 'm.id')
    .select(
      'sm.*',
      'm.name as materialName',
      'm.code as materialCode',
      'm.unit'
    )
    .orderBy('sm.createdAt', 'desc');

  if (materialCode) {
    query = query.where('sm.materialCode', materialCode);
  }

  if (materialId) {
    query = query.where('sm.materialId', materialId);
  }

  if (movementType) {
    query = query.where('sm.type', movementType);
  }

  if (startDate) {
    query = query.where('sm.createdAt', '>=', startDate);
  }

  if (endDate) {
    query = query.where('sm.createdAt', '<=', endDate);
  }

  const movements = await query.limit(limit).offset(offset);
  
  return { movements, total: movements.length };
}

/**
 * Reserve stock for production
 */
export async function reserveStock(code, quantity, referenceId, referenceType = 'production') {
  const material = await Materials.getMaterialByCode(code);
  if (!material) {
    const error = new Error('Material not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const currentReserved = parseFloat(material.reserved) || 0;
  const currentStock = parseFloat(material.stock) || 0;
  const reserveQty = parseFloat(quantity);

  const availableStock = currentStock - currentReserved;
  if (reserveQty > availableStock) {
    const error = new Error('Insufficient available stock');
    error.code = 'INSUFFICIENT_STOCK';
    throw error;
  }

  await Materials.updateMaterial(material.id, {
    reserved: currentReserved + reserveQty
  });

  return {
    code,
    reserved: reserveQty,
    totalReserved: currentReserved + reserveQty,
    availableStock: availableStock - reserveQty
  };
}

/**
 * Release reserved stock
 */
export async function releaseReservation(code, quantity) {
  const material = await Materials.getMaterialByCode(code);
  if (!material) {
    const error = new Error('Material not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const currentReserved = parseFloat(material.reserved) || 0;
  const releaseQty = Math.min(parseFloat(quantity), currentReserved);

  await Materials.updateMaterial(material.id, {
    reserved: currentReserved - releaseQty
  });

  return {
    code,
    released: releaseQty,
    totalReserved: currentReserved - releaseQty
  };
}
