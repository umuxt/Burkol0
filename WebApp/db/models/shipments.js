/**
 * Shipments Model
 * Manages shipment header operations (like orders.js)
 * A shipment can contain multiple shipment_items
 */

import db from '../connection.js';

const Shipments = {
  /**
   * Generate shipment code using PostgreSQL function or fallback
   * Format: SHP-2025-0001
   */
  async generateShipmentCode(year = null) {
    const shipmentYear = year || new Date().getFullYear();

    try {
      // Try PostgreSQL function first (if exists)
      const result = await db.raw(
        'SELECT materials.generate_shipment_code(?) as code',
        [shipmentYear]
      );
      return result.rows[0].code;
    } catch (error) {
      // Fallback: manual sequence
      const [maxSeq] = await db('materials.shipments')
        .whereRaw('EXTRACT(YEAR FROM "createdAt") = ?', [shipmentYear])
        .max('shipmentSequence as maxSeq');

      const nextSeq = (maxSeq?.maxSeq || 0) + 1;
      return `SHP-${shipmentYear}-${String(nextSeq).padStart(4, '0')}`;
    }
  },

  /**
   * Create new shipment with items
   * @param {Object} shipmentData - Shipment header data
   * @param {Array} items - Array of shipment items
   * @param {Object} user - Current user
   * @returns {Object} Created shipment with items
   */
  async createShipment(shipmentData, items = [], user = {}) {
    const trx = await db.transaction();

    try {
      const {
        workOrderCode,
        quoteId,
        planId,
        customerName,
        customerCompany,
        deliveryAddress,
        notes,
        shipmentDate
      } = shipmentData;

      // Generate shipment code
      const shipmentYear = new Date(shipmentDate || new Date()).getFullYear();
      const shipmentCode = await this.generateShipmentCode(shipmentYear);

      // Extract sequence number from code (SHP-2025-0001 → 1)
      const shipmentSequence = parseInt(shipmentCode.split('-')[2], 10);

      // Insert shipment header
      const [shipment] = await trx('materials.shipments')
        .insert({
          shipmentCode,
          shipmentSequence,
          // Legacy references
          workOrderCode: workOrderCode || null,
          quoteId: quoteId || null,
          planId: planId || null,
          // Customer info
          customerId: shipmentData.customerId || null,
          customerSnapshot: shipmentData.customerSnapshot ? JSON.stringify(shipmentData.customerSnapshot) : null,
          customerName: customerName || shipmentData.customerSnapshot?.name || null,
          customerCompany: customerCompany || shipmentData.customerSnapshot?.company || null,
          deliveryAddress: deliveryAddress || shipmentData.customerSnapshot?.address || null,
          useAlternateDelivery: shipmentData.useAlternateDelivery || false,
          alternateDeliveryAddress: shipmentData.alternateDeliveryAddress ? JSON.stringify(shipmentData.alternateDeliveryAddress) : null,
          // Document settings
          documentType: shipmentData.documentType || 'waybill',
          includePrice: shipmentData.includePrice || false,
          // Currency
          currency: shipmentData.currency || 'TRY',
          exchangeRate: shipmentData.exchangeRate || 1.0,
          // Discount
          discountType: shipmentData.discountType || null,
          discountValue: shipmentData.discountValue || 0,
          // Export settings
          exportTarget: shipmentData.exportTarget || null,
          specialCode: shipmentData.specialCode || null,
          costCenter: shipmentData.costCenter || null,
          // Transport (P3.3)
          transport: shipmentData.transport ? JSON.stringify(shipmentData.transport) : '{}',
          // Waybill date (P3.3)
          waybillDate: shipmentData.waybillDate || null,
          // Related quote for 7-day rule (P3.3)
          relatedQuoteId: shipmentData.relatedQuoteId || null,
          // Status and metadata
          status: 'pending',
          notes: notes || null,
          documentNotes: shipmentData.documentNotes || null,
          createdBy: user?.email || 'system',
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning('*');

      // Add calculated fields to response
      const totalQuantity = items.reduce((sum, item) => sum + parseFloat(item.quantity || 0), 0);
      const itemCount = items.length;

      // Insert items and process stock
      let shipmentItems = [];
      if (items.length > 0) {
        // NOTE: StockMovements and Materials imports removed (P1.6.1)
        // Stock operations now only happen in importShipmentConfirmation

        for (let index = 0; index < items.length; index++) {
          const item = items[index];
          const itemCode = `${shipmentCode}-item-${String(index + 1).padStart(2, '0')}`;

          // Get material details
          const material = await trx('materials.materials')
            .where({ code: item.materialCode })
            .first();

          if (!material) {
            throw new Error(`Malzeme bulunamadı: ${item.materialCode}`);
          }

          // Check stock availability (but DON'T decrease stock yet - that happens on import/completion)
          const quantity = parseFloat(item.quantity);
          const availableStock = material.stock - (material.reserved || 0) - (material.wipReserved || 0);

          if (quantity > availableStock) {
            throw new Error(`Yetersiz stok: ${material.name}. Mevcut: ${availableStock}, İstenen: ${quantity}`);
          }

          // NOTE: Stock is NOT decreased here anymore (P1.6.1 fix)
          // Stock will be decreased when shipment is imported/completed via importShipmentConfirmation

          // Insert shipment item
          // Calculate price fields if includePrice is true
          const unitPrice = parseFloat(item.unitPrice || 0);
          const taxRate = parseFloat(item.taxRate || 20);
          const discountPercent = parseFloat(item.discountPercent || 0);

          const discountAmount = discountPercent > 0 ? (unitPrice * quantity * discountPercent / 100) : 0;
          const subtotal = (unitPrice * quantity) - discountAmount;
          const taxAmount = subtotal * (taxRate / 100);
          const withholdingAmount = parseFloat(item.withholdingAmount || 0);
          const totalAmount = subtotal + taxAmount - withholdingAmount;

          const [shipmentItem] = await trx('materials.shipment_items')
            .insert({
              itemCode,
              itemSequence: index + 1,
              shipmentId: shipment.id,
              shipmentCode,
              materialId: material.id,
              materialCode: material.code,
              materialName: material.name,
              quantity,
              unit: item.unit || material.unit || 'adet',
              stockMovementId: null, // Will be set on import/completion
              // Pricing (if includePrice)
              unitPrice: unitPrice,
              taxRate: taxRate,
              discountPercent: discountPercent,
              discountAmount: discountAmount,
              subtotal: subtotal,
              taxAmount: taxAmount,
              withholdingAmount: withholdingAmount,
              totalAmount: totalAmount,
              // Tax exemptions
              vatExemptionId: item.vatExemptionId || null,
              withholdingRateId: item.withholdingRateId || null,
              // Lot/Serial
              lotNumber: item.lotNumber || null,
              serialNumber: item.serialNumber || null,
              // Status & notes
              itemStatus: 'pending',
              notes: item.itemNotes || item.notes || null,
              createdAt: new Date(),
              updatedAt: new Date()
            })
            .returning('*');

          shipmentItems.push({
            ...shipmentItem
          });
        }
      }

      // Calculate shipment totals from items (if includePrice)
      if (shipmentData.includePrice && shipmentItems.length > 0) {
        const calculatedSubtotal = shipmentItems.reduce((sum, item) => sum + parseFloat(item.subtotal || 0), 0);
        const calculatedTaxTotal = shipmentItems.reduce((sum, item) => sum + parseFloat(item.taxAmount || 0), 0);
        const calculatedWithholdingTotal = shipmentItems.reduce((sum, item) => sum + parseFloat(item.withholdingAmount || 0), 0);
        const calculatedDiscountTotal = shipmentItems.reduce((sum, item) => sum + parseFloat(item.discountAmount || 0), 0);
        const calculatedGrandTotal = calculatedSubtotal + calculatedTaxTotal - calculatedWithholdingTotal;

        // Update shipment with calculated totals
        await trx('materials.shipments')
          .where({ id: shipment.id })
          .update({
            subtotal: calculatedSubtotal,
            taxTotal: calculatedTaxTotal,
            withholdingTotal: calculatedWithholdingTotal,
            discountTotal: calculatedDiscountTotal,
            grandTotal: calculatedGrandTotal,
            updatedAt: new Date()
          });

        // Update local shipment object for return
        shipment.subtotal = calculatedSubtotal;
        shipment.taxTotal = calculatedTaxTotal;
        shipment.withholdingTotal = calculatedWithholdingTotal;
        shipment.discountTotal = calculatedDiscountTotal;
        shipment.grandTotal = calculatedGrandTotal;
      }

      await trx.commit();

      return {
        ...shipment,
        itemCount,
        totalQuantity,
        items: shipmentItems
      };

    } catch (error) {
      await trx.rollback();
      console.error('Error creating shipment:', error);
      throw error;
    }
  },

  /**
   * Get all shipments with optional filtering
   * @param {Object} filters - Filter options
   * @returns {Array} Array of shipments with items
   */
  async getAllShipments(filters = {}) {
    const { status, workOrderCode, quoteId, startDate, endDate, includeItems = true, limit, offset } = filters;

    let query = db('materials.shipments')
      .select('*')
      .orderBy('createdAt', 'desc');

    if (status) {
      query = query.where('status', status);
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

    const shipments = await query;

    // Include items if requested
    if (includeItems && shipments.length > 0) {
      const shipmentIds = shipments.map(s => s.id);
      const items = await db('materials.shipment_items')
        .whereIn('shipmentId', shipmentIds)
        .orderBy('itemSequence');

      // Group items by shipment
      const itemsByShipment = items.reduce((acc, item) => {
        if (!acc[item.shipmentId]) acc[item.shipmentId] = [];
        acc[item.shipmentId].push(item);
        return acc;
      }, {});

      return shipments.map(shipment => ({
        ...shipment,
        // Parse JSON fields
        customerSnapshot: shipment.customerSnapshot ?
          (typeof shipment.customerSnapshot === 'string' ? JSON.parse(shipment.customerSnapshot) : shipment.customerSnapshot)
          : null,
        transport: shipment.transport ?
          (typeof shipment.transport === 'string' ? JSON.parse(shipment.transport) : shipment.transport)
          : {},
        alternateDeliveryAddress: shipment.alternateDeliveryAddress ?
          (typeof shipment.alternateDeliveryAddress === 'string' ? JSON.parse(shipment.alternateDeliveryAddress) : shipment.alternateDeliveryAddress)
          : null,
        items: itemsByShipment[shipment.id] || []
      }));
    }

    // Parse JSON fields for shipments without items too
    return shipments.map(shipment => ({
      ...shipment,
      customerSnapshot: shipment.customerSnapshot ?
        (typeof shipment.customerSnapshot === 'string' ? JSON.parse(shipment.customerSnapshot) : shipment.customerSnapshot)
        : null,
      transport: shipment.transport ?
        (typeof shipment.transport === 'string' ? JSON.parse(shipment.transport) : shipment.transport)
        : {},
      alternateDeliveryAddress: shipment.alternateDeliveryAddress ?
        (typeof shipment.alternateDeliveryAddress === 'string' ? JSON.parse(shipment.alternateDeliveryAddress) : shipment.alternateDeliveryAddress)
        : null
    }));
  },

  /**
   * Get shipment by ID
   * @param {number} shipmentId - Shipment ID
   * @returns {Object} Shipment with items
   */
  async getShipmentById(shipmentId) {
    const shipment = await db('materials.shipments')
      .where({ id: shipmentId })
      .first();

    if (!shipment) {
      const error = new Error('Shipment not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    const items = await db('materials.shipment_items')
      .where({ shipmentId: shipmentId })
      .orderBy('itemSequence');

    return {
      ...shipment,
      // Parse JSON fields
      customerSnapshot: shipment.customerSnapshot ?
        (typeof shipment.customerSnapshot === 'string' ? JSON.parse(shipment.customerSnapshot) : shipment.customerSnapshot)
        : null,
      transport: shipment.transport ?
        (typeof shipment.transport === 'string' ? JSON.parse(shipment.transport) : shipment.transport)
        : {},
      alternateDeliveryAddress: shipment.alternateDeliveryAddress ?
        (typeof shipment.alternateDeliveryAddress === 'string' ? JSON.parse(shipment.alternateDeliveryAddress) : shipment.alternateDeliveryAddress)
        : null,
      items
    };
  },

  /**
   * Get shipment by code
   * @param {string} shipmentCode - Shipment code
   * @returns {Object} Shipment with items
   */
  async getShipmentByCode(shipmentCode) {
    const shipment = await db('materials.shipments')
      .where({ shipmentCode })
      .first();

    if (!shipment) {
      const error = new Error('Shipment not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    const items = await db('materials.shipment_items')
      .where({ shipmentCode })
      .orderBy('itemSequence');

    return {
      ...shipment,
      items
    };
  },

  /**
   * Update shipment header
   * @param {number} shipmentId - Shipment ID
   * @param {Object} updates - Fields to update
   * @returns {Object} Updated shipment
   */
  async updateShipment(shipmentId, updates) {
    const shipment = await db('materials.shipments')
      .where({ id: shipmentId })
      .first();

    if (!shipment) {
      const error = new Error('Shipment not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    // Can't update if delivered or cancelled
    if (shipment.status === 'delivered' || shipment.status === 'cancelled') {
      const error = new Error('Cannot update completed shipment');
      error.code = 'INVALID_STATUS';
      throw error;
    }

    const allowedFields = [
      'workOrderCode',
      'quoteId',
      'planId',
      'customerName',
      'customerCompany',
      'deliveryAddress',
      'notes'
    ];

    const filteredUpdates = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        filteredUpdates[field] = updates[field];
      }
    }

    filteredUpdates.updatedAt = new Date();

    const [updated] = await db('materials.shipments')
      .where({ id: shipmentId })
      .update(filteredUpdates)
      .returning('*');

    return updated;
  },

  /**
   * Update shipment status
   * @param {number} shipmentId - Shipment ID
   * @param {string} newStatus - New status
   * @param {string} updatedBy - User making update
   * @returns {Object} Updated shipment
   */
  async updateShipmentStatus(shipmentId, newStatus, updatedBy) {
    const VALID_TRANSITIONS = {
      pending: ['shipped', 'cancelled'],
      shipped: ['delivered', 'cancelled'],
      delivered: [],
      cancelled: []
    };

    const shipment = await db('materials.shipments')
      .where({ id: shipmentId })
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

    if (newStatus === 'shipped') {
      updateData.shippedAt = new Date();
    } else if (newStatus === 'delivered') {
      updateData.deliveredAt = new Date();
    } else if (newStatus === 'cancelled') {
      updateData.cancelledAt = new Date();
    }

    await db('materials.shipments')
      .where({ id: shipmentId })
      .update(updateData);

    // Update item statuses too
    await db('materials.shipment_items')
      .where({ shipmentId })
      .update({
        itemStatus: newStatus,
        updatedAt: new Date()
      });

    return this.getShipmentById(shipmentId);
  },

  /**
   * Cancel shipment and restore stock
   * @param {number} shipmentId - Shipment ID
   * @param {string} reason - Cancellation reason
   * @param {string} cancelledBy - User cancelling
   * @returns {Object} Cancelled shipment
   */
  async cancelShipment(shipmentId, reason, cancelledBy) {
    const trx = await db.transaction();

    try {
      const shipment = await trx('materials.shipments')
        .where({ id: shipmentId })
        .first();

      if (!shipment) {
        const error = new Error('Shipment not found');
        error.code = 'NOT_FOUND';
        throw error;
      }

      if (shipment.status === 'delivered') {
        const error = new Error('Cannot cancel delivered shipment');
        error.code = 'ALREADY_DELIVERED';
        throw error;
      }

      if (shipment.status === 'cancelled') {
        const error = new Error('Shipment already cancelled');
        error.code = 'ALREADY_CANCELLED';
        throw error;
      }

      // Get items to restore stock
      const items = await trx('materials.shipment_items')
        .where({ shipmentId });

      // Only restore stock if shipment was completed (stock was already decreased on import)
      // For pending/exported shipments, stock was never decreased so nothing to restore (P1.6.1 fix)
      const shouldRestoreStock = shipment.status === 'completed';

      if (shouldRestoreStock) {
        // Restore stock for each item
        for (const item of items) {
          const material = await trx('materials.materials')
            .where({ code: item.materialCode })
            .first();

          if (material) {
            const newStock = parseFloat(material.stock) + parseFloat(item.quantity);

            // Update material stock
            await trx('materials.materials')
              .where({ id: material.id })
              .update({
                stock: newStock,
                updatedAt: new Date()
              });

            // Create reversal stock movement
            await trx('materials.stock_movements')
              .insert({
                materialId: material.id,
                materialCode: material.code,
                materialName: material.name,
                type: 'in',
                subType: 'shipment_cancellation',
                status: 'completed',
                quantity: item.quantity,
                unit: item.unit,
                stockBefore: material.stock,
                stockAfter: newStock,
                warehouse: 'Warehouse',
                location: material.storage || 'Main',
                notes: `Sevkiyat iptali: ${shipment.shipmentCode} - ${reason || 'No reason provided'}`,
                reason: 'Shipment cancellation',
                reference: shipment.shipmentCode,
                referenceType: 'shipment_cancellation',
                movementDate: new Date(),
                approved: true,
                userId: 'system',
                userName: cancelledBy || 'system'
              });
          }
        }
      }

      // Update shipment status
      await trx('materials.shipments')
        .where({ id: shipmentId })
        .update({
          status: 'cancelled',
          cancellationReason: reason,
          cancelledAt: new Date(),
          cancelledBy: cancelledBy,
          updatedAt: new Date()
        });

      // Update item statuses
      await trx('materials.shipment_items')
        .where({ shipmentId })
        .update({
          itemStatus: 'cancelled',
          updatedAt: new Date()
        });

      await trx.commit();

      return this.getShipmentById(shipmentId);

    } catch (error) {
      await trx.rollback();
      throw error;
    }
  },

  /**
   * Get shipment statistics
   * @returns {Object} Statistics summary
   */
  async getShipmentStats() {
    // Count by status
    const statusCounts = await db('materials.shipments')
      .select('status')
      .count('* as count')
      .groupBy('status');

    // Total shipments count
    const [shipmentCount] = await db('materials.shipments')
      .count('* as total_shipments');

    // Calculate totals from shipment_items
    const [itemTotals] = await db('materials.shipment_items')
      .sum('quantity as total_quantity')
      .count('* as total_items');

    // Recent shipments (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [recentStats] = await db('materials.shipments')
      .where('"createdAt"', '>=', thirtyDaysAgo)
      .count('* as recent_shipments');

    // Recent items quantity
    const [recentItems] = await db('materials.shipment_items as si')
      .join('materials.shipments as s', 's.id', 'si.shipmentId')
      .where('s.createdAt', '>=', thirtyDaysAgo)
      .sum('si.quantity as recent_quantity');

    return {
      byStatus: statusCounts.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count, 10);
        return acc;
      }, {}),
      totalShipments: parseInt(shipmentCount.total_shipments, 10),
      totalQuantity: parseFloat(itemTotals?.total_quantity || 0),
      totalItems: parseInt(itemTotals?.total_items || 0, 10),
      recentShipments: parseInt(recentStats.recent_shipments, 10),
      recentQuantity: parseFloat(recentItems?.recent_quantity || 0)
    };
  },

  /**
   * Delete shipment (only if pending)
   * @param {number} shipmentId - Shipment ID
   * @returns {boolean} Success
   */
  async deleteShipment(shipmentId) {
    const shipment = await db('materials.shipments')
      .where({ id: shipmentId })
      .first();

    if (!shipment) {
      const error = new Error('Shipment not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    if (shipment.status !== 'pending') {
      const error = new Error('Can only delete pending shipments');
      error.code = 'INVALID_STATUS';
      throw error;
    }

    // Use cancel logic to restore stock
    await this.cancelShipment(shipmentId, 'Deleted by user', 'system');

    // Then actually delete
    await db('materials.shipment_items').where({ shipmentId }).delete();
    await db('materials.shipments').where({ id: shipmentId }).delete();

    return true;
  }
};

export default Shipments;
