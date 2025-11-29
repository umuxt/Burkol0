/**
 * Materials Domain Routes
 * Consolidated route definitions for materials, stock, orders, suppliers, categories
 */

import express from 'express';
import { requireAuth } from '#server/auth';

// Controllers
import * as materialController from './controllers/materialController.js';
import * as stockController from './controllers/stockController.js';
import * as shipmentController from './controllers/shipmentController.js';
import * as orderController from './controllers/orderController.js';
import * as supplierController from './controllers/supplierController.js';
import * as categoryController from './controllers/categoryController.js';

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
router.get('/materials/shipments/approved-quotes', requireAuth, shipmentController.getApprovedQuotesForShipment);
router.get('/materials/shipments/completed-work-orders', requireAuth, shipmentController.getCompletedWorkOrdersForShipment);
router.post('/materials/shipments', requireAuth, shipmentController.createShipment);
router.get('/materials/shipments', requireAuth, shipmentController.getShipments);
router.get('/materials/shipments/:id', requireAuth, shipmentController.getShipmentById);
router.put('/materials/shipments/:id', requireAuth, shipmentController.updateShipment);
router.put('/materials/shipments/:id/status', requireAuth, shipmentController.updateShipmentStatus);
router.put('/materials/shipments/:id/cancel', requireAuth, shipmentController.cancelShipment);

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

export default router;
