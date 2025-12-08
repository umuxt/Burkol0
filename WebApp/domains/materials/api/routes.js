/**
 * Materials Domain Routes
 * Consolidated route definitions for materials, stock, orders, suppliers, categories
 */

import express from 'express';
import multer from 'multer';
import { requireAuth } from '#server/auth';

// Multer config for import file upload (store in memory as buffer)
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  }
});

// Controllers
import * as materialController from './controllers/materialController.js';
import * as stockController from './controllers/stockController.js';
import * as shipmentController from './controllers/shipmentController.js';
import * as orderController from './controllers/orderController.js';
import * as supplierController from './controllers/supplierController.js';
import * as categoryController from './controllers/categoryController.js';
import * as lookupController from './controllers/lookupController.js';

const router = express.Router();

// ================================
// MATERIALS CRUD
// ================================
router.get('/materials', requireAuth, materialController.getMaterials);
router.get('/materials/all', requireAuth, materialController.getAllMaterials);
router.get('/materials/active', requireAuth, materialController.getActiveMaterials);
router.post('/materials', requireAuth, materialController.createMaterial);
router.patch('/materials/:id', requireAuth, materialController.updateMaterial);
router.delete('/materials/:id', requireAuth, materialController.deleteMaterial);
router.delete('/materials/:id/permanent', requireAuth, materialController.permanentDeleteMaterial);

// Batch operations
router.post('/materials/batch', requireAuth, materialController.batchCreateMaterials);

// Query operations
router.get('/materials/category/:category', requireAuth, materialController.getMaterialsByCategory);
router.get('/materials/supplier/:supplierId', requireAuth, materialController.getMaterialsBySupplier);

// Categories (from materials)
router.get('/categories', requireAuth, materialController.getCategories);

// ================================
// STOCK MANAGEMENT
// ================================
router.patch('/materials/:code/stock', requireAuth, stockController.updateStock);
router.get('/stock', requireAuth, stockController.getStockOverview);
router.get('/materials/:code/lots', requireAuth, stockController.getMaterialLots);
router.get('/stockMovements', requireAuth, stockController.getStockMovements);

// Stock reservations (used by production)
router.post('/materials/:code/reserve', requireAuth, stockController.reserveStock);
router.post('/materials/:code/release', requireAuth, stockController.releaseReservation);

// ================================
// SHIPMENTS (Outgoing to customers)
// ================================
// Helper data for dropdowns
router.get('/materials/shipments/approved-quotes', requireAuth, shipmentController.getApprovedQuotesForShipment);
router.get('/materials/shipments/completed-work-orders', requireAuth, shipmentController.getCompletedWorkOrdersForShipment);
router.get('/materials/shipments/available-materials', requireAuth, shipmentController.getMaterialsForShipment);
router.get('/materials/shipments/stats', requireAuth, shipmentController.getShipmentStats);
router.get('/materials/shipments/item-stats', requireAuth, shipmentController.getItemStats);

// Shipment CRUD (header)
router.post('/materials/shipments', requireAuth, shipmentController.createShipment);
router.post('/materials/shipments/quick', requireAuth, shipmentController.createQuickShipment); // For stock page
router.get('/materials/shipments', requireAuth, shipmentController.getShipments);
router.get('/materials/shipments/code/:code', requireAuth, shipmentController.getShipmentByCode);
router.get('/materials/shipments/:id', requireAuth, shipmentController.getShipmentById);
router.put('/materials/shipments/:id', requireAuth, shipmentController.updateShipment);
router.put('/materials/shipments/:id/status', requireAuth, shipmentController.updateShipmentStatus);
router.put('/materials/shipments/:id/cancel', requireAuth, shipmentController.cancelShipment);
router.post('/materials/shipments/:id/import', requireAuth, importUpload.single('file'), shipmentController.importShipmentConfirmation);
router.delete('/materials/shipments/:id', requireAuth, shipmentController.deleteShipment);

// Shipment Items CRUD
router.get('/materials/shipments/:id/items', requireAuth, shipmentController.getShipmentItems);
router.post('/materials/shipments/:id/items', requireAuth, shipmentController.addItemToShipment);
router.get('/materials/shipments/items/:itemId', requireAuth, shipmentController.getShipmentItemById);
router.put('/materials/shipments/items/:itemId/quantity', requireAuth, shipmentController.updateItemQuantity);
router.put('/materials/shipments/items/:itemId/notes', requireAuth, shipmentController.updateItemNotes);
router.delete('/materials/shipments/items/:itemId', requireAuth, shipmentController.removeItemFromShipment);

// Shipment history by material
router.get('/materials/:materialCode/shipments', requireAuth, shipmentController.getItemsByMaterial);

// ================================
// ORDERS (Purchase orders from suppliers)
// ================================
router.post('/orders', requireAuth, orderController.createOrder);
router.get('/orders', requireAuth, orderController.getOrders);
router.get('/orders/stats', requireAuth, orderController.getOrderStats);
router.get('/orders/materials/active', requireAuth, orderController.getActiveMaterials);
router.get('/orders/delivery-status', requireAuth, orderController.getDeliveryStatus);
router.get('/orders/:orderId', requireAuth, orderController.getOrderById);
router.get('/orders/:orderId/delivery-status', requireAuth, orderController.getOrderDeliveryStatus);
router.put('/orders/:orderId', requireAuth, orderController.updateOrder);
router.put('/orders/:orderId/items/:itemId', requireAuth, orderController.updateOrderItem);
router.put('/orders/:orderId/items/:itemId/deliver', requireAuth, orderController.deliverItem);

// ================================
// SUPPLIERS
// ================================
router.get('/suppliers', requireAuth, supplierController.getAllSuppliers);
router.post('/suppliers', requireAuth, supplierController.addSupplier);
router.patch('/suppliers/:id', requireAuth, supplierController.updateSupplier);
router.delete('/suppliers/:id', requireAuth, supplierController.deleteSupplier);
router.get('/suppliers/category/:category', requireAuth, supplierController.getSuppliersByCategory);

// Supplier-Material relationships
router.post('/suppliers/:supplierId/materials', requireAuth, supplierController.addMaterialToSupplier);
router.get('/materials/:materialId/suppliers', requireAuth, supplierController.getSuppliersForMaterial);
router.get('/suppliers/:supplierId/materials', requireAuth, supplierController.getMaterialsForSupplier);

// ================================
// MATERIAL CATEGORIES
// ================================
router.get('/material-categories', requireAuth, categoryController.getMaterialCategories);
router.post('/material-categories', requireAuth, categoryController.createMaterialCategory);
router.put('/material-categories/:id', requireAuth, categoryController.updateMaterialCategory);
router.delete('/material-categories/:id', requireAuth, categoryController.deleteMaterialCategory);
router.get('/material-categories/:id/usage', requireAuth, categoryController.getMaterialCategoryUsage);

// ================================
// LOOKUP DATA (Invoice/Export Integration)
// ================================
router.get('/vat-exemptions', requireAuth, lookupController.getVatExemptions);
router.get('/withholding-rates', requireAuth, lookupController.getWithholdingRates);
router.get('/settings', requireAuth, lookupController.getSettings);
router.put('/settings/:key', requireAuth, lookupController.updateSetting);
router.post('/settings', requireAuth, lookupController.createSetting);

export default router;
