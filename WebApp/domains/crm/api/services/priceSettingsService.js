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
   * Updated for B0: price_formulas table removed
   * Updated for Pre-D2-2: includes lookups for each parameter
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

    // Pre-D2-2: Get lookups for each parameter
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
        version: data.version || 1,
        createdBy: data.createdBy || data.created_by,
        supersedesId: data.supersedesId || data.supersedes_id || null,
        linkedFormTemplateId: data.linkedFormTemplateId || null  // F1: Link with form template
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
   * Create new version from existing setting
   * Updated for B0: copies formulaExpression instead of separate formula record
   */
  async createNewVersion(currentSettingId, newName) {
    return db.transaction(async (trx) => {
      // Get current setting
      const currentSetting = await trx('quotes.price_settings')
        .where({ id: currentSettingId })
        .first();

      if (!currentSetting) {
        throw new Error('Current setting not found');
      }

      // Get max version for this code
      const maxVersionResult = await trx('quotes.price_settings')
        .where({ code: currentSetting.code })
        .max('version as maxVersion')
        .first();

      const nextVersion = (maxVersionResult.maxVersion || 0) + 1;

      // Create new setting with formula
      const [newSetting] = await trx('quotes.price_settings')
        .insert({
          code: currentSetting.code,
          name: newName || `${currentSetting.name} v${nextVersion}`,
          description: currentSetting.description,
          formulaExpression: currentSetting.formulaExpression,
          isActive: false,
          version: nextVersion,
          createdBy: currentSetting.createdBy,
          supersedesId: currentSettingId
        })
        .returning('*');

      // Copy parameters
      const currentParams = await trx('quotes.price_parameters')
        .where({ settingId: currentSettingId });

      if (currentParams.length > 0) {
        const newParams = currentParams.map(p => ({
          settingId: newSetting.id,
          code: p.code,
          name: p.name,
          type: p.type,
          fixedValue: p.fixedValue,
          formFieldCode: p.formFieldCode,
          unit: p.unit,
          description: p.description,
          isActive: p.isActive
        }));

        await trx('quotes.price_parameters').insert(newParams);
      }

      return newSetting;
    });
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
   * F1: Refactored to use calculatePriceServer for proper optionCode lookup support
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

    // F1: Convert parameters to calculatePriceServer format
    // DB format: { id, code, formFieldCode, fixedValue, lookups }
    // calculatePriceServer format: { id, formField, value, lookups }
    const convertedParams = (parameters || []).map(p => ({
      id: p.code || p.id, // Use code as ID for formula matching
      type: p.type,
      formField: p.formFieldCode || p.formField, // Map formFieldCode to formField
      value: p.fixedValue || p.value, // Map fixedValue to value
      lookups: p.lookups || []
    }));

    // F1: Build settings object for calculatePriceServer
    const priceSettings = {
      parameters: convertedParams,
      formula: formulaExpression
    };

    // F1: Build quote object for calculatePriceServer
    const quoteData = {
      customFields: formData || {},
      ...formData
    };

    try {
      // F1: Use unified calculation with proper optionCode lookup
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
