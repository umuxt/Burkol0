/**
 * PriceSettings Model - Master version control for pricing configurations
 * Updated for B0: price_formulas table removed, formulaExpression is now in price_settings
 * Updated for F1: Uses calculatePriceServer for proper optionCode lookup support
 */

import db from '../../../../db/connection.js';
import { calculatePriceServer } from '../../../../server/priceCalculator.js';

const PriceSettings = {
  /**
   * Get all price settings (all versions)
   */
  async getAll() {
    return db('quotes.price_settings')
      .select('*')
      .orderBy('createdAt', 'desc');
  },

  /**
   * Get active price setting
   */
  async getActive() {
    return db('quotes.price_settings')
      .where({ isActive: true })
      .first();
  },

  /**
   * Get price setting with parameters (formula is now in price_settings)
   * Includes lookups for each parameter
   */
  async getWithDetails(id) {
    const setting = await db('quotes.price_settings')
      .where({ id })
      .first();

    if (!setting) {
      return null;
    }

    // Get parameters for this setting
    const parameters = await db('quotes.price_parameters')
      .where({ settingId: id })
      .select('*');

    // Get lookups for each parameter
    const parameterIds = parameters.map(p => p.id);
    let lookupsMap = {};
    
    if (parameterIds.length > 0) {
      const lookups = await db('quotes.price_parameter_lookups')
        .whereIn('parameterId', parameterIds)
        .select('*');
      
      // Group lookups by parameterId
      lookupsMap = lookups.reduce((acc, lookup) => {
        if (!acc[lookup.parameterId]) {
          acc[lookup.parameterId] = [];
        }
        acc[lookup.parameterId].push({
          id: lookup.id, // F1-C: Include ID for migration updates
          optionCode: lookup.optionCode,
          value: parseFloat(lookup.value) || 0
        });
        return acc;
      }, {});
    }

    // Attach lookups to each parameter
    const parametersWithLookups = parameters.map(p => ({
      ...p,
      lookups: lookupsMap[p.id] || []
    }));

    // Formula is now directly in price_settings
    return {
      ...setting,
      parameters: parametersWithLookups,
      formula: {
        id: setting.id,
        formulaExpression: setting.formulaExpression,
        isActive: setting.isActive
      }
    };
  },

  /**
   * Get active setting with all details
   */
  async getActiveWithDetails() {
    const activeSetting = await this.getActive();
    
    if (!activeSetting) {
      return null;
    }

    return this.getWithDetails(activeSetting.id);
  },

  /**
   * Create new price setting
   * Updated for B0: includes formulaExpression
   * Updated for F1: includes linkedFormTemplateId
   */
  async create(data) {
    const [setting] = await db('quotes.price_settings')
      .insert({
        code: data.code,
        name: data.name,
        description: data.description,
        formulaExpression: data.formulaExpression || null,
        isActive: data.isActive || data.is_active || false,
        createdBy: data.createdBy || data.created_by,
        linkedFormTemplateId: data.linkedFormTemplateId || null
      })
      .returning('*');

    return setting;
  },

  /**
   * Update price setting
   */
  async update(id, data) {
    const [setting] = await db('quotes.price_settings')
      .where({ id })
      .update({
        ...data,
        updatedAt: db.fn.now()
      })
      .returning('*');

    return setting;
  },

  /**
   * Activate a price setting (deactivate all others)
   */
  async activate(id) {
    await db.transaction(async (trx) => {
      // Deactivate all
      await trx('quotes.price_settings')
        .update({ isActive: false });

      // Activate selected
      await trx('quotes.price_settings')
        .where({ id })
        .update({ isActive: true });
    });

    return this.getWithDetails(id);
  },

  /**
   * Delete price setting (cascade deletes parameters)
   */
  async delete(id) {
    await db('quotes.price_settings')
      .where({ id })
      .delete();
  },

  /**
   * Calculate price using setting's formula and parameters
   * Uses calculatePriceServer for proper optionCode lookup support
   */
  async calculatePrice(settingId, formData) {
    const settingWithDetails = await this.getWithDetails(settingId);
    
    if (!settingWithDetails) {
      throw new Error(`Price setting with ID ${settingId} not found`);
    }

    const { formulaExpression, parameters } = settingWithDetails;
    
    if (!formulaExpression) {
      return { totalPrice: 0, formula: '', settingId };
    }

    // Convert parameters to calculatePriceServer format
    // DB format: { id, code, formFieldCode, fixedValue, lookups }
    // calculatePriceServer format: { id, formField, value, lookups }
    const convertedParams = (parameters || []).map(p => ({
      id: p.code || p.id,
      type: p.type,
      formField: p.formFieldCode || p.formField,
      value: p.fixedValue || p.value,
      lookups: p.lookups || []
    }));

    // Build settings object for calculatePriceServer
    const priceSettings = {
      parameters: convertedParams,
      formula: formulaExpression
    };

    // Build quote object for calculatePriceServer
    const quoteData = {
      customFields: formData || {},
      ...formData
    };

    try {
      // Use unified calculation with proper optionCode lookup
      const totalPrice = calculatePriceServer(quoteData, priceSettings);
      
      return {
        totalPrice: isNaN(totalPrice) ? 0 : totalPrice,
        formula: formulaExpression,
        settingId
      };
    } catch (error) {
      console.error('Price calculation failed:', {
        settingId,
        formula: formulaExpression,
        error: error.message
      });
      return {
        totalPrice: 0,
        formula: formulaExpression,
        settingId,
        error: error.message
      };
    }
  }
};

export default PriceSettings;
