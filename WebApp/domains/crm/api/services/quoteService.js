/**
 * Quote Service
 * Handles quote business logic and database operations
 */

import Quotes from '../../../../db/models/quotes.js';
import FormTemplates from '../../../../db/models/formTemplates.js';
import PriceFormulas from '../../../../db/models/priceFormulas.js';
import Customers from '../../../../db/models/customers.js';

/**
 * Get all quotes with optional filters
 */
export async function getQuotes(filters = {}) {
  return Quotes.getAll(filters);
}

/**
 * Get quote by ID
 */
export async function getQuoteById(id) {
  return Quotes.getById(id);
}

/**
 * Get quote statistics
 */
export async function getQuoteStatistics(filters = {}) {
  return Quotes.getStatistics(filters);
}

/**
 * Create new quote
 */
export async function createQuote(data) {
  const quoteData = {
    customerName: data.customerName,
    customerEmail: data.customerEmail,
    customerPhone: data.customerPhone,
    customerCompany: data.customerCompany,
    customerAddress: data.customerAddress,
    formTemplateId: data.formTemplateId,
    priceFormulaId: data.priceFormulaId,
    notes: data.notes,
    formData: data.formData,
    deliveryDate: data.deliveryDate,
    isCustomer: data.isCustomer,
    customerId: data.customerId,
    createdBy: data.createdBy,
    status: data.status || 'draft'
  };

  return Quotes.create(quoteData);
}

/**
 * Create quote with new customer in a single operation
 * @param {Object} quoteData - Quote data
 * @param {Object} customerData - New customer data to create
 * @returns {Object} Created quote with customer reference
 */
export async function createQuoteWithCustomer(quoteData, customerData) {
  // First create the customer
  const customer = await Customers.create(customerData);
  
  // Then create the quote with customer reference
  const quote = await createQuote({
    ...quoteData,
    customerName: customer.name,
    customerEmail: customer.email || '',
    customerPhone: customer.phone || '',
    customerCompany: customer.company || '',
    customerAddress: customer.address || '',
    isCustomer: true,
    customerId: customer.id
  });

  return {
    quote,
    customer
  };
}

/**
 * Get quote edit status - check if quote can be edited
 * @param {number} quoteId - Quote ID
 * @returns {Object} Edit status with canEdit flag and details
 */
export async function getQuoteEditStatus(quoteId) {
  return Quotes.getEditStatus(quoteId);
}

/**
 * Update quote
 */
export async function updateQuote(id, updates) {
  return Quotes.update(id, updates);
}

/**
 * Delete quote
 */
export async function deleteQuote(id) {
  return Quotes.delete(id);
}

/**
 * Update quote status
 */
export async function updateQuoteStatus(id, status, updatedBy) {
  return Quotes.updateStatus(id, status, updatedBy);
}

/**
 * Set manual price
 */
export async function setManualPrice(id, manualPrice, reason, updatedBy) {
  return Quotes.setManualPrice(id, manualPrice, reason, updatedBy);
}

/**
 * Clear manual price
 */
export async function clearManualPrice(id, reason, updatedBy) {
  return Quotes.clearManualPrice(id, reason, updatedBy);
}

/**
 * Add file to quote
 */
export async function addFile(data) {
  return Quotes.addFile(data);
}

/**
 * Delete file from quote
 */
export async function deleteFile(fileId) {
  return Quotes.deleteFile(fileId);
}

/**
 * Get active form template
 */
export async function getActiveFormTemplate() {
  return FormTemplates.getActive();
}

/**
 * Get active price formula
 */
export async function getActivePriceFormula() {
  return PriceFormulas.getActive();
}

/**
 * Calculate quote price
 */
export async function calculateQuotePrice(quoteId) {
  const quote = await Quotes.getById(quoteId);
  if (!quote) {
    throw new Error('Quote not found');
  }

  // Get price formula
  const formula = await PriceFormulas.getById(quote.priceFormulaId);
  if (!formula) {
    throw new Error('Price formula not found');
  }

  // Calculate price using formula logic
  // TODO: Implement price calculation logic
  
  return {
    quoteId,
    calculatedPrice: 0,
    formula: formula
  };
}
