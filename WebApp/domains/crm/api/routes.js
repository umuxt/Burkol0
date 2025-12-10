/**
 * CRM API Routes
 * 
 * Centralized routing for CRM domain
 * Includes quotes, pricing, forms, and customer management
 */

import { setupQuotesRoutes } from './controllers/quoteController.js';
import { setupPriceRoutes } from './controllers/priceController.js';
import { setupFormRoutes } from './controllers/formController.js';
import { setupCustomerRoutes } from './controllers/customerController.js';
import { setupQuoteInvoiceRoutes } from './controllers/quoteInvoiceController.js';
import ServiceCardsController from './controllers/serviceCardsController.js';

/**
 * Setup all CRM routes
 */
export function setupCRMRoutes(app) {
  // Setup domain routes
  setupQuotesRoutes(app);
  setupPriceRoutes(app);
  setupFormRoutes(app);
  setupCustomerRoutes(app);
  setupQuoteInvoiceRoutes(app); // Invoice and quote items routes

  // Service Cards routes (for invoice line items)
  app.get('/api/service-cards', ServiceCardsController.getAllServiceCards);
  app.get('/api/service-cards/categories', ServiceCardsController.getCategories);
  app.get('/api/service-cards/:id', ServiceCardsController.getServiceCardById);
  app.post('/api/service-cards', ServiceCardsController.createServiceCard);
  app.patch('/api/service-cards/:id', ServiceCardsController.updateServiceCard);
  app.delete('/api/service-cards/:id', ServiceCardsController.deleteServiceCard);

  console.log('✓ CRM routes configured');
  console.log('✓ Service Cards routes configured');
}
