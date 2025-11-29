/**
 * Shipment Service
 * Handles outgoing shipments to customers
 */

import db from '#db/connection';

const SHIPMENT_STATUSES = {
  PENDING: 'pending',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
};

const VALID_TRANSITIONS = {
  pending: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: []
};

/**
 * Create a new shipment with stock deduction
 */
export async function createShipment(data, user) {
  const { productCode, shipmentQuantity, planId, workOrderCode, quoteId, description } = data;
  
  const trx = await db.transaction();

  try {
    // Validate required fields
    if (!productCode || !shipmentQuantity) {
      await trx.rollback();
      const error = new Error('productCode ve shipmentQuantity zorunludur');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    if (shipmentQuantity <= 0) {
      await trx.rollback();
      const error = new Error('Miktar pozitif olmalıdır');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    // Get material details
    const material = await trx('materials.materials')
      .where({ code: productCode })
      .first();

    if (!material) {
      await trx.rollback();
      const error = new Error('Ürün bulunamadı');
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Check stock availability
    const availableStock = material.stock - (material.reserved || 0) - (material.wipReserved || 0);
    if (shipmentQuantity > availableStock) {
      await trx.rollback();
      const error = new Error(`Yetersiz stok. Mevcut: ${availableStock}, İstenen: ${shipmentQuantity}`);
      error.code = 'INSUFFICIENT_STOCK';
      throw error;
    }

    const previousStock = material.stock;
    const newStock = previousStock - shipmentQuantity;

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
        userId: user?.uid || 'system',
        userName: user?.email || 'system'
      })
      .returning('*');

    // 2. Update material stock
    await trx('materials.materials')
      .where({ id: material.id })
      .update({ stock: newStock });

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
        createdBy: user?.email || 'system',
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning('*');

    await trx.commit();

    return {
      shipment,
      stockMovement,
      previousStock,
      newStock
    };
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}

/**
 * Get all shipments with optional filters
 */
export async function getShipments(filters = {}) {
  const { productCode, status, planId, workOrderCode, quoteId, startDate, endDate, limit, offset } = filters;

  let query = db('materials.shipments')
    .select('*')
    .orderBy('createdAt', 'desc');

  if (productCode) {
    query = query.where('productCode', productCode);
  }
  if (status) {
    query = query.where('status', status);
  }
  if (planId) {
    query = query.where('planId', planId);
  }
  if (workOrderCode) {
    query = query.where('workOrderCode', workOrderCode);
  }
  if (quoteId) {
    query = query.where('quoteId', quoteId);
  }
  if (startDate) {
    query = query.where('createdAt', '>=', startDate);
  }
  if (endDate) {
    query = query.where('createdAt', '<=', endDate);
  }
  if (limit) {
    query = query.limit(parseInt(limit, 10));
  }
  if (offset) {
    query = query.offset(parseInt(offset, 10));
  }

  return query;
}

/**
 * Get shipment by ID
 */
export async function getShipmentById(id) {
  const shipment = await db('materials.shipments')
    .where('id', id)
    .first();

  if (!shipment) {
    const error = new Error('Shipment not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  return shipment;
}

/**
 * Update shipment
 */
export async function updateShipment(id, updates) {
  const shipment = await db('materials.shipments')
    .where('id', id)
    .first();

  if (!shipment) {
    const error = new Error('Shipment not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  // Can't update if delivered or cancelled
  if (shipment.status === SHIPMENT_STATUSES.DELIVERED || 
      shipment.status === SHIPMENT_STATUSES.CANCELLED) {
    const error = new Error('Cannot update completed shipment');
    error.code = 'INVALID_STATUS';
    throw error;
  }

  const updateData = {
    ...updates,
    updatedAt: new Date()
  };

  await db('materials.shipments')
    .where('id', id)
    .update(updateData);

  return getShipmentById(id);
}

/**
 * Update shipment status
 */
export async function updateShipmentStatus(id, newStatus, updatedBy) {
  const shipment = await db('materials.shipments')
    .where('id', id)
    .first();

  if (!shipment) {
    const error = new Error('Shipment not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const currentStatus = shipment.status;
  const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];

  if (!allowedTransitions.includes(newStatus)) {
    const error = new Error(`Cannot transition from ${currentStatus} to ${newStatus}`);
    error.code = 'INVALID_TRANSITION';
    throw error;
  }

  const updateData = {
    status: newStatus,
    updatedAt: new Date(),
    updatedBy: updatedBy
  };

  if (newStatus === SHIPMENT_STATUSES.SHIPPED) {
    updateData.shippedAt = new Date();
  } else if (newStatus === SHIPMENT_STATUSES.DELIVERED) {
    updateData.deliveredAt = new Date();
  } else if (newStatus === SHIPMENT_STATUSES.CANCELLED) {
    updateData.cancelledAt = new Date();
  }

  await db('materials.shipments')
    .where('id', id)
    .update(updateData);

  return getShipmentById(id);
}

/**
 * Cancel shipment
 */
export async function cancelShipment(id, reason, cancelledBy) {
  const shipment = await db('materials.shipments')
    .where('id', id)
    .first();

  if (!shipment) {
    const error = new Error('Shipment not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  if (shipment.status === SHIPMENT_STATUSES.DELIVERED) {
    const error = new Error('Cannot cancel delivered shipment');
    error.code = 'ALREADY_DELIVERED';
    throw error;
  }

  if (shipment.status === SHIPMENT_STATUSES.CANCELLED) {
    const error = new Error('Shipment already cancelled');
    error.code = 'ALREADY_CANCELLED';
    throw error;
  }

  await db('materials.shipments')
    .where('id', id)
    .update({
      status: SHIPMENT_STATUSES.CANCELLED,
      cancellationReason: reason,
      cancelledAt: new Date(),
      cancelledBy: cancelledBy,
      updatedAt: new Date()
    });

  return getShipmentById(id);
}

/**
 * Get approved quotes for shipment
 */
export async function getApprovedQuotesForShipment() {
  const quotes = await db('quotes.quotes')
    .select('id', 'customerName', 'customerCompany', 'workOrderCode', 'approvedAt')
    .where('status', 'approved')
    .orderBy('approvedAt', 'desc');

  return quotes.map(q => ({
    id: q.id,
    label: `${q.id} - ${q.customerName || q.customerCompany || 'Müşteri'}`,
    customerName: q.customerName,
    customerCompany: q.customerCompany,
    workOrderCode: q.workOrderCode,
    approvedAt: q.approvedAt
  }));
}

/**
 * Get completed work orders for shipment
 */
export async function getCompletedWorkOrdersForShipment() {
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
  `);

  return workOrders.rows.map(wo => ({
    code: wo.code,
    label: wo.code,
    quoteId: wo.quoteId,
    status: wo.status,
    productionState: wo.productionState,
    createdAt: wo.createdAt
  }));
}
