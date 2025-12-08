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

  console.log('✓ CRM routes configured');
}
