/**
 * CRM API Routes
 * 
 * Centralized routing for CRM domain
 * Includes quotes, pricing, forms, and customer management
 */

import { setupQuotesRoutes } from './controllers/quoteController.js';
import { setupPriceRoutes } from './controllers/priceController.js';
import { setupFormRoutes } from './controllers/formController.js';

/**
 * Setup all CRM routes
 */
export function setupCRMRoutes(app) {
  // Setup domain routes
  setupQuotesRoutes(app);
  setupPriceRoutes(app);
  setupFormRoutes(app);
  
  console.log('✓ CRM routes configured');
}
