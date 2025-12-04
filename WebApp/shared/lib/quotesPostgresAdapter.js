/**
 * Quotes PostgreSQL Adapter
 * 
 * Provides backward-compatible API methods for existing components
 * while using new PostgreSQL backend
 */

import { quotesApi, formsApi, priceApi } from '../../domains/crm/api/index.js';

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
      priceSettingId: quoteData.priceSettingId || quoteData.priceFormulaId, // Map legacy formula ID to setting ID
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
          type: param.type === 'fixed' ? 'fixed' : 'form'  // Map form_lookup back to form
        };

        if (param.type === 'fixed') {
          base.fixedValue = param.fixed_value;
        } else if (param.type === 'form_lookup') {
          // Note: Prices now stored in form_field_options.price_value
          base.formFieldId = param.form_field_code;
          base.lookupTable = (param.priceOptions || []).map(option => ({
            option: option.option_value,
            value: option.price_value
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
   * Note: Prices now stored directly in form_field_options.price_value
   * This method only saves parameters and formula, not price mappings
   */
  async savePriceSettings(settings) {
    try {
      const { parameters = [], formula = '' } = settings;
      
      // 1. Get existing parameters from database
      const existingParams = await priceApi.getParameters();
      const existingParamMap = new Map(existingParams.map(p => [p.code, p]));
      
      // 2. Get existing formulas
      const existingFormulas = await priceApi.getFormulas();
      
      // 3. Process parameters - create, update, or delete
      const currentParamCodes = new Set(parameters.map(p => p.id));
      
      // Delete parameters that no longer exist
      for (const existing of existingParams) {
        if (!currentParamCodes.has(existing.code)) {
          await priceApi.deleteParameter(existing.id);
        }
      }
      
      // Create or update parameters
      for (const param of parameters) {
        const existing = existingParamMap.get(param.id);
        
        // Map 'form' type to 'form_lookup' for database
        const dbType = param.type === 'form' ? 'form_lookup' : param.type;
        
        // Parse fixedValue properly - frontend uses 'value' field, not 'fixedValue'
        let fixedValue = null;
        if (param.type === 'fixed') {
          const valueToUse = param.fixedValue !== undefined ? param.fixedValue : param.value;
          if (valueToUse !== undefined && valueToUse !== null && valueToUse !== '') {
            fixedValue = parseFloat(valueToUse);
            if (isNaN(fixedValue)) {
              console.warn(`Invalid value for parameter ${param.id}:`, valueToUse);
              fixedValue = 0;
            }
          } else {
            fixedValue = 0;
          }
        }
        
        const paramData = {
          code: param.id,
          name: param.name,
          type: dbType,
          fixedValue: fixedValue,
          formFieldCode: param.type === 'form' ? param.id : null,
          isActive: true
        };
        
        console.log('🔍 Creating/updating parameter:', { 
          id: param.id, 
          type: param.type, 
          dbType, 
          originalValue: param.value,
          originalFixedValue: param.fixedValue,
          finalFixedValue: fixedValue,
          paramData 
        });
        
        if (existing) {
          // Update existing parameter
          await priceApi.updateParameter(existing.id, paramData);
        } else {
          // Create new parameter
          await priceApi.createParameter(paramData);
        }
      }
      
      // 4. Create new formula version (only if formula is not empty)
      if (formula && formula.trim()) {
        const formulaData = {
          code: 'MAIN_FORMULA',
          name: 'Main Pricing Formula',
          formulaExpression: formula,
          description: `Updated at ${new Date().toISOString()}`,
          isActive: true
        };
        
        const result = await priceApi.createFormula(formulaData);
        
        // Deactivate old formulas
        for (const oldFormula of existingFormulas) {
          if (oldFormula.id !== result.id && oldFormula.is_active) {
            await priceApi.updateFormula(oldFormula.id, { isActive: false });
          }
        }
        
        return {
          success: true,
          version: result.version || 1,
          message: 'Price settings saved successfully'
        };
      } else {
        // No formula provided - just save parameters
        return {
          success: true,
          version: 1,
          message: 'Price parameters saved successfully (no formula)'
        };
      }
    } catch (error) {
      console.error('savePriceSettings error:', error);
      throw error;
    }
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
