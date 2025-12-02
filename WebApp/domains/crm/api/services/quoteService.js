/**
 * Quote Service
 * Handles quote business logic and database operations
 */

import Quotes from '../../../../db/models/quotes.js';
import FormTemplates from '../../../../db/models/formTemplates.js';
import PriceFormulas from '../../../../db/models/priceFormulas.js';

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
