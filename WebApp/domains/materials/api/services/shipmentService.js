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
 * Create a new shipment
 */
export async function createShipment(data, createdBy) {
  const trx = await db.transaction();

  try {
    // Create shipment header
    const [shipment] = await trx('materials.shipments')
      .insert({
        work_order_code: data.workOrderCode,
        quote_id: data.quoteId,
        customer_name: data.customerName,
        customer_company: data.customerCompany,
        delivery_address: data.deliveryAddress,
        shipping_method: data.shippingMethod,
        tracking_number: data.trackingNumber,
        notes: data.notes,
        status: SHIPMENT_STATUSES.PENDING,
        created_by: createdBy,
        created_at: new Date()
      })
      .returning('*');

    // Create shipment items
    if (data.items && data.items.length > 0) {
      const items = data.items.map(item => ({
        shipment_id: shipment.id,
        material_code: item.materialCode,
        material_name: item.materialName,
        quantity: item.quantity,
        unit: item.unit,
        lot_number: item.lotNumber,
        created_at: new Date()
      }));

      await trx('materials.shipment_items').insert(items);
    }

    await trx.commit();

    return getShipmentById(shipment.id);
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}

/**
 * Get all shipments with optional filters
 */
export async function getShipments(filters = {}) {
  const { status, workOrderCode, startDate, endDate, limit = 100 } = filters;

  let query = db('materials.shipments as s')
    .select(
      's.*',
      db.raw('COALESCE(json_agg(si.*) FILTER (WHERE si.id IS NOT NULL), \'[]\') as items')
    )
    .leftJoin('materials.shipment_items as si', 's.id', 'si.shipment_id')
    .groupBy('s.id')
    .orderBy('s.created_at', 'desc');

  if (status) {
    query = query.where('s.status', status);
  }

  if (workOrderCode) {
    query = query.where('s.work_order_code', workOrderCode);
  }

  if (startDate) {
    query = query.where('s.created_at', '>=', startDate);
  }

  if (endDate) {
    query = query.where('s.created_at', '<=', endDate);
  }

  return query.limit(limit);
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

  const items = await db('materials.shipment_items')
    .where('shipment_id', id);

  return {
    ...shipment,
    items
  };
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
    customer_name: updates.customerName,
    customer_company: updates.customerCompany,
    delivery_address: updates.deliveryAddress,
    shipping_method: updates.shippingMethod,
    tracking_number: updates.trackingNumber,
    notes: updates.notes,
    updated_at: new Date()
  };

  // Remove undefined
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) delete updateData[key];
  });

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
    updated_at: new Date(),
    updated_by: updatedBy
  };

  if (newStatus === SHIPMENT_STATUSES.SHIPPED) {
    updateData.shipped_at = new Date();
  } else if (newStatus === SHIPMENT_STATUSES.DELIVERED) {
    updateData.delivered_at = new Date();
  } else if (newStatus === SHIPMENT_STATUSES.CANCELLED) {
    updateData.cancelled_at = new Date();
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
      cancellation_reason: reason,
      cancelled_at: new Date(),
      cancelled_by: cancelledBy,
      updated_at: new Date()
    });

  return getShipmentById(id);
}

/**
 * Get approved quotes for shipment (work orders ready to ship)
 */
export async function getApprovedQuotesForShipment() {
  const quotes = await db('quotes.quotes as q')
    .leftJoin('mes.work_orders as wo', 'q.id', 'wo.quote_id')
    .select(
      'q.id',
      'q.customer_name as customerName',
      'q.customer_company as customerCompany',
      'q.customer_email as customerEmail',
      'q.customer_phone as customerPhone',
      'q.delivery_date as deliveryDate',
      'q.delivery_address as deliveryAddress',
      'wo.code as workOrderCode',
      'wo.status as workOrderStatus',
      'wo.production_state as productionState'
    )
    .where('q.status', 'approved')
    .whereNotNull('wo.code')
    .orderBy('q.created_at', 'desc');

  return quotes;
}

/**
 * Get completed work orders for shipment
 */
export async function getCompletedWorkOrdersForShipment() {
  const workOrders = await db('mes.work_orders as wo')
    .leftJoin('quotes.quotes as q', 'wo.quote_id', 'q.id')
    .select(
      'wo.id',
      'wo.code as workOrderCode',
      'wo.status',
      'wo.production_state as productionState',
      'q.customer_name as customerName',
      'q.customer_company as customerCompany',
      'q.delivery_address as deliveryAddress'
    )
    .where('wo.production_state', 'Üretim Tamamlandı')
    .orderBy('wo.created_at', 'desc');

  return workOrders;
}
