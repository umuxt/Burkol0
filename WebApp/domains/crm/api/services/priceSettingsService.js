/**
 * PriceSettings Model - Master version control for pricing configurations
 * Updated for B0: price_formulas table removed, formulaExpression is now in price_settings
 */

import db from '../../../../db/connection.js';

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
        supersedesId: data.supersedesId || data.supersedes_id || null
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
   * Moved from priceFormulas.js (table removed in B0)
   */
  async calculatePrice(settingId, formData) {
    const settingWithDetails = await this.getWithDetails(settingId);
    
    if (!settingWithDetails) {
      throw new Error(`Price setting with ID ${settingId} not found`);
    }

    const { formulaExpression, parameters } = settingWithDetails;
    
    if (!formulaExpression) {
      return { totalPrice: 0, evaluatedFormula: '', parameterValues: {} };
    }

    const parameterValues = {};
    const calculationDetails = [];

    // Resolve each parameter value
    for (const param of parameters) {
      let value = null;
      let source = null;

      if (param.type === 'fixed') {
        value = parseFloat(param.fixedValue) || 0;
        source = 'fixed';
      } else if (param.type === 'form_lookup') {
        // Get value from form data using formFieldCode
        const fieldCode = param.formFieldCode || param.code;
        if (formData[fieldCode] !== undefined) {
          value = parseFloat(formData[fieldCode]) || 0;
          source = 'form';
        }
      }

      parameterValues[param.code] = value || 0;
      calculationDetails.push({
        parameterCode: param.code,
        parameterName: param.name,
        parameterValue: value || 0,
        source,
        unit: param.unit
      });
    }

    // Evaluate formula
    let evaluatedFormula = formulaExpression.trim();
    
    // Remove leading equals sign if present (Excel-style)
    if (evaluatedFormula.startsWith('=')) {
      evaluatedFormula = evaluatedFormula.substring(1).trim();
    }

    try {
      // Replace parameter codes with their values
      for (const [code, value] of Object.entries(parameterValues)) {
        const regex = new RegExp(`\\b${code}\\b`, 'g');
        evaluatedFormula = evaluatedFormula.replace(regex, value);
      }

      // Replace form field values that might be in the formula directly
      for (const [fieldCode, fieldValue] of Object.entries(formData)) {
        const regex = new RegExp(`\\b${fieldCode}\\b`, 'g');
        const numericValue = parseFloat(fieldValue) || 0;
        evaluatedFormula = evaluatedFormula.replace(regex, numericValue);
      }

      // Check for undefined variables and replace with 0
      const identifierRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
      const mathConstants = ['Math', 'PI', 'E', 'abs', 'ceil', 'floor', 'round', 'max', 'min', 'pow', 'sqrt'];
      const matches = evaluatedFormula.match(identifierRegex) || [];
      
      for (const varName of matches) {
        if (!mathConstants.includes(varName)) {
          const regex = new RegExp(`\\b${varName}\\b`, 'g');
          evaluatedFormula = evaluatedFormula.replace(regex, '0');
        }
      }

      // Evaluate the expression
      const totalPrice = eval(evaluatedFormula);

      return {
        totalPrice: isNaN(totalPrice) ? 0 : totalPrice,
        formula: formulaExpression,
        evaluatedFormula,
        parameterValues,
        calculationDetails
      };
    } catch (error) {
      console.error('Formula evaluation failed:', {
        originalFormula: formulaExpression,
        evaluatedFormula,
        parameterValues,
        error: error.message
      });
      return {
        totalPrice: 0,
        formula: formulaExpression,
        evaluatedFormula,
        parameterValues,
        calculationDetails,
        error: error.message
      };
    }
  }
};

export default PriceSettings;
