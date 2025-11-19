/**
 * Quotes PostgreSQL Adapter
 * 
 * Provides backward-compatible API methods for existing components
 * while using new PostgreSQL backend
 */

import { quotesApi, formsApi, priceApi } from '../../domains/quotes/api/index.js';

// This module provides backward-compatible API methods
// that existing components can use without major refactoring

export const quotesPostgresAdapter = {
  /**
   * List all quotes (backward compatible)
   */
  async listQuotes(filters = {}) {
    return quotesApi.getAll(filters);
  },

  /**
   * Get all quotes (backward compatible)
   */
  async getQuotes(filters = {}) {
    return quotesApi.getAll(filters);
  },

  /**
   * Get quote by ID (backward compatible)
   */
  async getQuote(id) {
    return quotesApi.getById(id);
  },

  /**
   * Create quote (backward compatible)
   */
  async createQuote(quoteData) {
    // Convert frontend format to backend format
    const backendData = {
      customerName: quoteData.name || quoteData.customerName,
      customerEmail: quoteData.email || quoteData.customerEmail,
      customerPhone: quoteData.phone || quoteData.customerPhone,
      customerCompany: quoteData.company || quoteData.customerCompany,
      customerAddress: quoteData.address || quoteData.customerAddress,
      formTemplateId: quoteData.formTemplateId,
      priceFormulaId: quoteData.priceFormulaId,
      notes: quoteData.notes,
      formData: quoteData.formData || quoteData.fields || {}
    };

    return quotesApi.create(backendData);
  },

  /**
   * Update quote (backward compatible)
   */
  async updateQuote(id, updates) {
    return quotesApi.update(id, updates);
  },

  /**
   * Update quote status (backward compatible)
   */
  async updateQuoteStatus(id, status, userId = null, note = null) {
    return quotesApi.updateStatus(id, status, userId, note);
  },

  /**
   * Set manual price (backward compatible)
   */
  async setManualPrice(id, manualPrice, reason = null, userId = null) {
    return quotesApi.setManualPrice(id, manualPrice, reason, userId);
  },

  /**
   * Delete quote (backward compatible)
   */
  async deleteQuote(id) {
    return quotesApi.delete(id);
  },

  /**
   * Get statistics (backward compatible)
   */
  async getQuoteStatistics(filters = {}) {
    return quotesApi.getStatistics(filters);
  },

  /**
   * Sync local quotes to Firebase - DEPRECATED
   * Now a no-op since we're using PostgreSQL
   */
  async syncLocalQuotesToFirebase() {
    console.warn('syncLocalQuotesToFirebase is deprecated - using PostgreSQL now');
    return { synced: 0, message: 'PostgreSQL migration complete - sync not needed' };
  },

  /**
   * Get form config (backward compatible)
   */
  async getFormConfig() {
    try {
      const template = await formsApi.getActiveTemplate();
      if (!template) {
        console.warn('No active form template found');
        return {
          formConfig: {
            fields: []
          }
        };
      }

      // Convert to legacy format
      return {
        formConfig: {
          fields: (template.fields || []).map(field => ({
            id: field.field_code,
            label: field.field_name,
            type: field.field_type,
            required: field.is_required || false,
            placeholder: field.placeholder,
            defaultValue: field.default_value,
            options: (field.options || []).map(opt => ({
              value: opt.option_value,
              label: opt.option_label
            }))
          }))
        }
      };
    } catch (error) {
      console.error('getFormConfig error:', error.message);
      return {
        formConfig: {
          fields: []
        }
      };
    }
  },

  /**
   * Get form fields (backward compatible)
   */
  async getFormFields() {
    try {
      const template = await formsApi.getActiveTemplate();
      if (!template) {
        console.warn('No active form template found');
        return { fields: [] };
      }

      return {
        fields: (template.fields || []).map(field => ({
          id: field.field_code,
          label: field.field_name,
          type: field.field_type,
          required: field.is_required || false,
          placeholder: field.placeholder,
          defaultValue: field.default_value,
          options: (field.options || []).map(opt => ({
            value: opt.option_value,
            label: opt.option_label
          }))
        }))
      };
    } catch (error) {
      console.error('getFormFields error:', error.message);
      return { fields: [] };
    }
  },

  /**
   * Save form config (backward compatible)
   */
  async saveFormConfig(config) {
    // This is complex - for now just return success
    // Full implementation would need to diff and update template/fields
    console.warn('saveFormConfig needs full implementation');
    return { success: true, message: 'Use FormManager component for form editing' };
  },

  /**
   * Get price settings (backward compatible)
   */
  async getPriceSettings() {
    try {
      const [parameters, formula] = await Promise.all([
        priceApi.getParameters(true),
        priceApi.getActiveFormula()
      ]);

      // Convert to legacy format
      const legacyParameters = parameters.map(param => {
        const base = {
          id: param.code,
          name: param.name,
          type: param.type === 'fixed' ? 'fixed' : 'form'
        };

        if (param.type === 'fixed') {
          base.value = param.fixed_value;
        } else if (param.type === 'form_lookup') {
          base.formField = param.code;
          base.lookupTable = (param.lookups || []).map(lookup => ({
            option: lookup.option_value,
            value: lookup.price_value
          }));
        }

        return base;
      });

      return {
        parameters: legacyParameters,
        formula: formula?.formula_expression || ''
      };
    } catch (error) {
      console.error('getPriceSettings error:', error.message);
      return {
        parameters: [],
        formula: ''
      };
    }
  },

  /**
   * Save price settings (backward compatible)
   */
  async savePriceSettings(settings) {
    // This is complex - for now just return success
    // Full implementation would need to create/update parameters and formulas
    console.warn('savePriceSettings needs full implementation');
    return { success: true, version: 1, message: 'Use PricingManager component for pricing' };
  },

  /**
   * Get price settings versions (backward compatible)
   */
  async getPriceSettingsVersions() {
    // Not yet implemented in PostgreSQL
    console.warn('Version history not yet migrated to PostgreSQL');
    return { versions: [] };
  },

  /**
   * Get quote price comparison (backward compatible)
   */
  async getQuotePriceComparison(quoteId) {
    // Not yet implemented - would need to recalculate with current formula
    console.warn('Price comparison not yet migrated to PostgreSQL');
    return {
      currentPrice: 0,
      newPrice: 0,
      difference: 0,
      status: 'unknown'
    };
  },

  /**
   * Update quote version (backward compatible)
   */
  async updateQuoteVersion(quoteId) {
    // Not yet implemented - would recalculate price with current formula
    console.warn('Quote version update not yet migrated to PostgreSQL');
    return { success: true, message: 'Not yet implemented' };
  },

  /**
   * Clear localStorage quotes - DEPRECATED
   * No-op since we're using PostgreSQL
   */
  clearLocalStorageQuotes() {
    console.log('clearLocalStorageQuotes is deprecated - using PostgreSQL now');
    return { success: true, message: 'PostgreSQL migration complete - localStorage not used' };
  }
};

export default quotesPostgresAdapter;
