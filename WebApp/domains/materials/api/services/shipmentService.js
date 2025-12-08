/**
 * Shipment Service (Refactored)
 * Handles outgoing shipments with multi-item support
 * Uses Shipments and ShipmentItems models
 * 
 * Updated for Invoice Export Integration (8 Aralık 2025)
 * - Added invoice/export related fields
 * - Stock validation (block if insufficient)
 * - Price validation for invoices
 */

import db from '#db/connection';
import Shipments from '#db/models/shipments';
import ShipmentItems from '#db/models/shipmentItems';

const SHIPMENT_STATUSES = {
  PENDING: 'pending',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  EXPORTED: 'exported',
  COMPLETED: 'completed'
};

const DOCUMENT_TYPES = {
  WAYBILL: 'waybill',    // İrsaliye (fiyatsız)
  INVOICE: 'invoice',     // Fatura (fiyatlı)
  BOTH: 'both'           // İkisi birden
};

const VALID_TRANSITIONS = {
  pending: ['shipped', 'exported', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  exported: ['completed', 'cancelled'],
  delivered: [],
  completed: [],
  cancelled: []
};

/**
 * Validate stock availability for all items
 * @param {Array} items - Items to check
 * @returns {Object} { valid: boolean, errors: Array }
 */
async function validateStockAvailability(items) {
  const errors = [];
  
  for (const item of items) {
    const material = await db('materials.materials')
      .select('id', 'code', 'name', 'stock', 'reserved', 'wipReserved', 'unit')
      .where('code', item.materialCode)
      .first();
    
    if (!material) {
      errors.push(`Malzeme bulunamadı: ${item.materialCode}`);
      continue;
    }
    
    const availableStock = parseFloat(material.stock || 0) 
      - parseFloat(material.reserved || 0) 
      - parseFloat(material.wipReserved || 0);
    
    const requestedQty = parseFloat(item.quantity);
    
    if (requestedQty > availableStock) {
      errors.push(
        `Yetersiz stok: ${material.name} (${material.code}) - ` +
        `İstenen: ${requestedQty}, Mevcut: ${availableStock.toFixed(2)} ${material.unit || 'adet'}`
      );
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate shipment data for invoice export
 * @param {Object} data - Shipment data
 * @returns {Object} { valid: boolean, errors: Array }
 */
function validateInvoiceExportData(data) {
  const errors = [];
  const { items = [], documentType, includePrice, currency, exchangeRate, customerSnapshot } = data;
  
  // 1. customerSnapshot zorunlu
  if (!customerSnapshot || typeof customerSnapshot !== 'object') {
    errors.push('Müşteri bilgisi (customerSnapshot) zorunludur');
  }
  
  // 2. documentType = 'invoice' veya 'both' ise includePrice = true olmalı
  if ((documentType === 'invoice' || documentType === 'both') && !includePrice) {
    errors.push('Fatura belgesi için fiyat dahil edilmeli (includePrice: true)');
  }
  
  // 3. includePrice = true ise tüm items'da unitPrice > 0 olmalı
  if (includePrice) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.unitPrice || parseFloat(item.unitPrice) <= 0) {
        errors.push(`Kalem ${i + 1}: Fiyat dahil seçildiğinde birim fiyat zorunludur (${item.materialCode})`);
      }
    }
  }
  
  // 4. currency != 'TRY' ise exchangeRate > 0 zorunlu
  if (currency && currency !== 'TRY') {
    if (!exchangeRate || parseFloat(exchangeRate) <= 0) {
      errors.push(`Döviz kullanıldığında kur belirtilmelidir (${currency})`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================
// SHIPMENT CRUD (Header)
// ============================================

/**
 * Create a new shipment with multiple items
 * Updated for Invoice Export Integration
 * 
 * @param {Object} data - Shipment data with items array
 * @param {Object} user - Current user
 * @returns {Object} Created shipment with items
 * 
 * New fields supported:
 * - customerId, customerSnapshot (müşteri bilgileri)
 * - documentType: 'waybill' | 'invoice' | 'both'
 * - includePrice: boolean
 * - useAlternateDelivery, alternateDeliveryAddress
 * - currency, exchangeRate
 * - discountType, discountValue
 * - exportTarget, specialCode, costCenter, documentNotes
 * - Item level: unitPrice, taxRate, discountPercent, vatExemptionId, withholdingRateId, serialNumber, itemNotes
 */
export async function createShipment(data, user) {
  const { items = [], ...shipmentData } = data;
  
  // 1. Basic validation - items required
  if (!items || items.length === 0) {
    const error = new Error('En az bir kalem gerekli');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  
  // 2. Validate each item has required fields
  for (const item of items) {
    if (!item.materialCode) {
      const error = new Error('Her kalem için malzeme kodu gerekli');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    if (!item.quantity || parseFloat(item.quantity) <= 0) {
      const error = new Error('Her kalem için pozitif miktar gerekli');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
  }
  
  // 3. Invoice/Export validation (if documentType is set)
  if (shipmentData.documentType) {
    const invoiceValidation = validateInvoiceExportData({ ...shipmentData, items });
    if (!invoiceValidation.valid) {
      const error = new Error(invoiceValidation.errors.join('\n'));
      error.code = 'VALIDATION_ERROR';
      error.details = invoiceValidation.errors;
      throw error;
    }
  }
  
  // 4. Stock availability check - BLOCK if insufficient
  const stockValidation = await validateStockAvailability(items);
  if (!stockValidation.valid) {
    const error = new Error('Yetersiz stok:\n' + stockValidation.errors.join('\n'));
    error.code = 'INSUFFICIENT_STOCK';
    error.details = stockValidation.errors;
    throw error;
  }
  
  // 5. Prepare shipment data with new fields
  const preparedShipmentData = {
    // Existing fields
    planId: shipmentData.planId,
    workOrderCode: shipmentData.workOrderCode,
    quoteId: shipmentData.quoteId,
    notes: shipmentData.notes,
    
    // Customer fields (new)
    customerId: shipmentData.customerId || null,
    customerSnapshot: shipmentData.customerSnapshot || null,
    customerName: shipmentData.customerSnapshot?.name || shipmentData.customerName,
    customerCompany: shipmentData.customerSnapshot?.company || shipmentData.customerCompany,
    deliveryAddress: shipmentData.customerSnapshot?.address || shipmentData.deliveryAddress,
    
    // Alternate delivery (new)
    useAlternateDelivery: shipmentData.useAlternateDelivery || false,
    alternateDeliveryAddress: shipmentData.alternateDeliveryAddress || null,
    
    // Document type (new)
    documentType: shipmentData.documentType || 'waybill',
    includePrice: shipmentData.includePrice || false,
    
    // Currency (new)
    currency: shipmentData.currency || 'TRY',
    exchangeRate: shipmentData.exchangeRate || 1.0,
    
    // Discount (new)
    discountType: shipmentData.discountType || null,
    discountValue: shipmentData.discountValue || 0,
    
    // Export (new)
    exportTarget: shipmentData.exportTarget || null,
    
    // Extra fields (new)
    specialCode: shipmentData.specialCode || null,
    costCenter: shipmentData.costCenter || null,
    documentNotes: shipmentData.documentNotes || null,
    
    // Transport fields (existing)
    transportType: shipmentData.transportType,
    driverName: shipmentData.driverName,
    driverTc: shipmentData.driverTc,
    plateNumber: shipmentData.plateNumber,
    carrierCompany: shipmentData.carrierCompany,
    carrierTcVkn: shipmentData.carrierTcVkn,
    
    // Weight/Package (existing)
    netWeight: shipmentData.netWeight,
    grossWeight: shipmentData.grossWeight,
    packageCount: shipmentData.packageCount,
    packageType: shipmentData.packageType
  };
  
  // 6. Prepare items with new fields
  const preparedItems = items.map(item => ({
    // Existing fields
    materialCode: item.materialCode,
    materialId: item.materialId,
    materialName: item.materialName,
    quantity: item.quantity,
    unit: item.unit,
    lotNumber: item.lotNumber,
    notes: item.notes,
    
    // Price fields (new/enhanced)
    unitPrice: item.unitPrice || null,
    taxRate: item.taxRate ?? 20, // Default 20% KDV
    discountPercent: item.discountPercent || 0,
    
    // VAT/Withholding (new)
    vatExemptionId: item.vatExemptionId || null,
    withholdingRateId: item.withholdingRateId || null,
    
    // Serial/Lot (new)
    serialNumber: item.serialNumber || null,
    itemNotes: item.itemNotes || null
  }));
  
  try {
    const result = await Shipments.createShipment(preparedShipmentData, preparedItems, user);
    return result;
  } catch (error) {
    // Re-throw with appropriate code
    if (!error.code) {
      error.code = 'CREATE_ERROR';
    }
    throw error;
  }
}

/**
 * Create a quick shipment from stock page (single item)
 * Backwards compatible with old single-item flow
 * @param {Object} data - Single item shipment data
 * @param {Object} user - Current user
 * @returns {Object} Created shipment
 */
export async function createQuickShipment(data, user) {
  const { productCode, shipmentQuantity, planId, workOrderCode, quoteId, description, lotNumber } = data;
  
  // Validate required fields
  if (!productCode || !shipmentQuantity) {
    const error = new Error('productCode ve shipmentQuantity zorunludur');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  
  if (parseFloat(shipmentQuantity) <= 0) {
    const error = new Error('Miktar pozitif olmalıdır');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  
  // Convert to multi-item format
  const shipmentDataObj = {
    planId,
    workOrderCode,
    quoteId,
    notes: description
  };
  
  const itemsArray = [{
    materialCode: productCode,
    quantity: shipmentQuantity,
    notes: description,
    lotNumber
  }];
  
  return createShipment({ ...shipmentDataObj, items: itemsArray }, user);
}

/**
 * Get all shipments with optional filters
 * @param {Object} filters - Filter options
 * @returns {Array} Shipments with items
 */
export async function getShipments(filters = {}) {
  return Shipments.getAllShipments(filters);
}

/**
 * Get shipment by ID
 * @param {number} id - Shipment ID
 * @returns {Object} Shipment with items
 */
export async function getShipmentById(id) {
  return Shipments.getShipmentById(id);
}

/**
 * Get shipment by code
 * @param {string} code - Shipment code
 * @returns {Object} Shipment with items
 */
export async function getShipmentByCode(code) {
  return Shipments.getShipmentByCode(code);
}

/**
 * Update shipment header
 * @param {number} id - Shipment ID
 * @param {Object} updates - Fields to update
 * @returns {Object} Updated shipment
 */
export async function updateShipment(id, updates) {
  return Shipments.updateShipment(id, updates);
}

/**
 * Update shipment status
 * @param {number} id - Shipment ID
 * @param {string} newStatus - New status
 * @param {string} updatedBy - User making update
 * @returns {Object} Updated shipment
 */
export async function updateShipmentStatus(id, newStatus, updatedBy) {
  return Shipments.updateShipmentStatus(id, newStatus, updatedBy);
}

/**
 * Cancel shipment and restore stock
 * @param {number} id - Shipment ID
 * @param {string} reason - Cancellation reason
 * @param {string} cancelledBy - User cancelling
 * @returns {Object} Cancelled shipment
 */
export async function cancelShipment(id, reason, cancelledBy) {
  return Shipments.cancelShipment(id, reason, cancelledBy);
}

/**
 * Delete shipment
 * @param {number} id - Shipment ID
 * @returns {boolean} Success
 */
export async function deleteShipment(id) {
  return Shipments.deleteShipment(id);
}

/**
 * Get shipment statistics
 * @returns {Object} Statistics
 */
export async function getShipmentStats() {
  return Shipments.getShipmentStats();
}

// ============================================
// SHIPMENT ITEMS CRUD
// ============================================

/**
 * Get items for a shipment
 * @param {number} shipmentId - Shipment ID
 * @returns {Array} Shipment items
 */
export async function getShipmentItems(shipmentId) {
  return ShipmentItems.getItemsByShipment(shipmentId);
}

/**
 * Get single item by ID
 * @param {number} itemId - Item ID
 * @returns {Object} Shipment item
 */
export async function getShipmentItemById(itemId) {
  return ShipmentItems.getItemById(itemId);
}

/**
 * Add item to existing shipment
 * @param {number} shipmentId - Shipment ID
 * @param {Object} itemData - Item data
 * @param {Object} user - Current user
 * @returns {Object} Created item
 */
export async function addItemToShipment(shipmentId, itemData, user) {
  // Validate
  if (!itemData.materialCode) {
    const error = new Error('Malzeme kodu gerekli');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  if (!itemData.quantity || parseFloat(itemData.quantity) <= 0) {
    const error = new Error('Pozitif miktar gerekli');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  
  return ShipmentItems.addItemToShipment(shipmentId, itemData, user);
}

/**
 * Remove item from shipment
 * @param {number} itemId - Item ID
 * @param {Object} user - Current user
 * @returns {boolean} Success
 */
export async function removeItemFromShipment(itemId, user) {
  return ShipmentItems.removeItemFromShipment(itemId, user);
}

/**
 * Update item quantity
 * @param {number} itemId - Item ID
 * @param {number} newQuantity - New quantity
 * @param {Object} user - Current user
 * @returns {Object} Updated item
 */
export async function updateItemQuantity(itemId, newQuantity, user) {
  if (!newQuantity || parseFloat(newQuantity) <= 0) {
    const error = new Error('Pozitif miktar gerekli');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  
  return ShipmentItems.updateItemQuantity(itemId, newQuantity, user);
}

/**
 * Update item notes
 * @param {number} itemId - Item ID
 * @param {string} notes - New notes
 * @returns {Object} Updated item
 */
export async function updateItemNotes(itemId, notes) {
  return ShipmentItems.updateItemNotes(itemId, notes);
}

/**
 * Get items by material code (shipment history)
 * @param {string} materialCode - Material code
 * @param {Object} filters - Optional filters
 * @returns {Array} Shipment items
 */
export async function getItemsByMaterial(materialCode, filters = {}) {
  return ShipmentItems.getItemsByMaterial(materialCode, filters);
}

/**
 * Get shipment item statistics
 * @param {Object} filters - Optional filters
 * @returns {Object} Statistics
 */
export async function getItemStats(filters = {}) {
  return ShipmentItems.getItemStats(filters);
}

// ============================================
// HELPER DATA (for dropdowns)
// ============================================

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

/**
 * Get materials for shipment (with stock > 0)
 */
export async function getMaterialsForShipment() {
  const materials = await db('materials.materials')
    .select('id', 'code', 'name', 'stock', 'reserved', 'wipReserved', 'unit')
    .where('stock', '>', 0)
    .orderBy('name');

  return materials.map(m => {
    const availableStock = parseFloat(m.stock) - parseFloat(m.reserved || 0) - parseFloat(m.wipReserved || 0);
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      label: `${m.code} - ${m.name}`,
      stock: parseFloat(m.stock),
      availableStock,
      unit: m.unit || 'adet'
    };
  }).filter(m => m.availableStock > 0);
}

// ============================================
// IMPORT (Complete shipment with external document)
// ============================================

/**
 * Import confirmation from external system (Logo/Zirve)
 * Sets status to completed and decreases stock
 * 
 * @param {number} shipmentId - Shipment ID
 * @param {Object} importData - Import data
 * @param {string} importData.externalDocNumber - External document number (Logo/Zirve)
 * @param {Buffer} importData.file - Uploaded file buffer (optional)
 * @param {string} importData.fileName - Original filename (optional)
 * @param {Object} user - Current user
 * @returns {Object} { shipment, stockUpdates }
 */
export async function importShipmentConfirmation(shipmentId, importData, user) {
  const { externalDocNumber, file, fileName } = importData;
  
  // 1. Get shipment with items
  const shipment = await Shipments.getShipmentById(shipmentId);
  if (!shipment) {
    const error = new Error('Sevkiyat bulunamadı');
    error.code = 'NOT_FOUND';
    throw error;
  }
  
  // 2. Check status - only exported or pending can be imported
  if (shipment.status === 'completed') {
    const error = new Error('Bu sevkiyat zaten tamamlanmış');
    error.code = 'ALREADY_COMPLETED';
    throw error;
  }
  
  if (shipment.status === 'cancelled') {
    const error = new Error('İptal edilmiş sevkiyat tamamlanamaz');
    error.code = 'INVALID_STATUS';
    throw error;
  }
  
  // 3. Validate externalDocNumber
  if (!externalDocNumber || externalDocNumber.trim() === '') {
    const error = new Error('Harici belge numarası zorunludur');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  
  const stockUpdates = [];
  
  try {
    // Use transaction for atomicity
    await db.transaction(async (trx) => {
      // 4. Decrease stock for each item
      for (const item of shipment.items || []) {
        const materialCode = item.materialCode;
        const quantity = parseFloat(item.quantity);
        
        // Get current material stock
        const material = await trx('materials.materials')
          .where('code', materialCode)
          .first();
        
        if (material) {
          const currentStock = parseFloat(material.stock || 0);
          const newStock = currentStock - quantity;
          
          // Update stock
          await trx('materials.materials')
            .where('code', materialCode)
            .update({
              stock: newStock,
              updatedAt: trx.fn.now()
            });
          
          // Create stock movement record
          await trx('materials.stock_movements').insert({
            materialId: material.id,
            materialCode: material.code,
            materialName: material.name,
            type: 'out',
            subType: 'shipment_completion',
            status: 'completed',
            quantity: quantity,
            unit: material.unit || 'adet',
            stockBefore: currentStock,
            stockAfter: newStock,
            warehouse: 'Warehouse',
            location: material.storage || 'Main',
            notes: `Sevkiyat tamamlandı: ${shipment.shipmentCode} → ${externalDocNumber}`,
            reason: 'Import completion',
            reference: shipment.shipmentCode,
            referenceType: 'shipment',
            movementDate: new Date(),
            approved: true,
            userId: user?.id || 'system',
            userName: user?.email || 'system'
          });
          
          stockUpdates.push({
            materialCode,
            materialName: material.name,
            change: -quantity,
            previousStock: currentStock,
            newStock: newStock
          });
          
          // Update shipment item status
          await trx('materials.shipment_items')
            .where('id', item.id)
            .update({
              itemStatus: 'completed',
              stockMovementId: material.id, // Reference to material
              updatedAt: trx.fn.now()
            });
        }
      }
      
      // 5. Update shipment record
      const updateData = {
        status: 'completed',
        externalDocNumber: externalDocNumber.trim(),
        importedAt: trx.fn.now(),
        importedBy: user?.id || null,
        shipmentCompletedAt: trx.fn.now(),
        updatedBy: user?.email || 'system',
        updatedAt: trx.fn.now()
      };
      
      // Store file if provided
      if (file && fileName) {
        updateData.importedFile = file;
        updateData.importedFileName = fileName;
      }
      
      await trx('materials.shipments')
        .where('id', shipmentId)
        .update(updateData);
    });
    
    // 6. Return updated shipment and stock changes
    const updatedShipment = await Shipments.getShipmentById(shipmentId);
    
    return {
      success: true,
      shipment: {
        id: updatedShipment.id,
        shipmentCode: updatedShipment.shipmentCode,
        status: updatedShipment.status,
        externalDocNumber: updatedShipment.externalDocNumber,
        importedAt: updatedShipment.importedAt,
        importedFileName: updatedShipment.importedFileName
      },
      stockUpdates
    };
    
  } catch (error) {
    console.error('Import error:', error);
    if (!error.code) {
      error.code = 'IMPORT_ERROR';
    }
    throw error;
  }
}

// Export constants
export { SHIPMENT_STATUSES, VALID_TRANSITIONS, DOCUMENT_TYPES };

// Export validation helpers for use in controllers
export { validateStockAvailability, validateInvoiceExportData };
