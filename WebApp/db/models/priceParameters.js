import db from '../connection.js';

/**
 * PriceParameters Model
 * Manages pricing parameters
 * 
 * Updated for B0: settingId is now required (NOT NULL constraint)
 * Note: Lookup tables removed - prices now stored directly in form_field_options.price_value
 */

class PriceParameters {
  /**
   * Create a new price parameter
   * @param {Object} data - Parameter data
   * @param {number} data.settingId - Required: Price setting ID
   * @param {string} data.code - Parameter code
   * @param {string} data.name - Parameter name
   * @param {string} data.type - Parameter type (fixed, form_lookup)
   * @param {string} [data.formFieldCode] - Form field code for form_lookup type
   * @param {number} [data.fixedValue] - Fixed value for fixed type
   * @param {string} [data.unit] - Unit of measurement
   * @param {string} [data.description] - Description
   * @param {boolean} [data.isActive=true] - Is active
   */
  static async create({ settingId, code, name, type, formFieldCode, fixedValue, unit, description, isActive = true }) {
    if (!settingId) {
      throw new Error('settingId is required for price parameters (B0 constraint)');
    }

    const [parameter] = await db('quotes.price_parameters')
      .insert({
        settingId,
        code,
        name,
        type,
        formFieldCode: formFieldCode,
        fixedValue: fixedValue,
        unit,
        description,
        isActive: isActive,
        createdAt: db.fn.now(),
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    return parameter;
  }

  /**
   * Get all price parameters
   */
  static async getAll(filters = {}) {
    let query = db('quotes.price_parameters');

    if (filters.settingId) {
      query = query.where('settingId', filters.settingId);
    }

    if (filters.isActive !== undefined) {
      query = query.where('isActive', filters.isActive);
    }

    if (filters.type) {
      query = query.where('type', filters.type);
    }

    const parameters = await query.orderBy('name');
    return parameters;
  }

  /**
   * Get parameters by setting ID
   */
  static async getBySettingId(settingId) {
    const parameters = await db('quotes.price_parameters')
      .where('settingId', settingId)
      .orderBy('name');
    
    return parameters;
  }

  /**
   * Get parameter by ID
   */
  static async getById(id) {
    const parameter = await db('quotes.price_parameters')
      .where('id', id)
      .first();
    
    return parameter;
  }

  /**
   * Get parameter by code
   */
  static async getByCode(code) {
    const parameter = await db('quotes.price_parameters')
      .where('code', code)
      .first();
    
    return parameter;
  }

  /**
   * Update price parameter
   */
  static async update(id, updates) {
    const [parameter] = await db('quotes.price_parameters')
      .where('id', id)
      .update({
        name: updates.name,
        type: updates.type,
        formFieldCode: updates.formFieldCode,
        fixedValue: updates.fixedValue,
        unit: updates.unit,
        description: updates.description,
        isActive: updates.isActive,
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    return parameter;
  }

  /**
   * Delete price parameter
   */
  static async delete(id) {
    const count = await db('quotes.price_parameters')
      .where('id', id)
      .delete();
    
    return count > 0;
  }

  /**
   * Get price value from form field option
   * This replaces the old lookup table approach
   */
  static async getPriceFromFormOption(formFieldCode, optionValue) {
    const option = await db('quotes.form_field_options as ffo')
      .join('quotes.form_fields as ff', 'ff.id', 'ffo.fieldId')
      .where({
        'ff.fieldCode': formFieldCode,
        'ffo.optionValue': optionValue,
        'ffo.isActive': true
      })
      .select('ffo.priceValue')
      .first();
    
    return option?.priceValue || null;
  }

  /**
   * Get all form-based parameters with their price mappings
   */
  static async getFormBasedParameters() {
    const parameters = await db('quotes.price_parameters as pp')
      .where('pp.type', 'form')
      .whereNotNull('pp.formFieldCode')
      .select('pp.*');

    // For each parameter, get the associated field options with prices
    const parametersWithPrices = await Promise.all(
      parameters.map(async (param) => {
        const options = await db('quotes.form_field_options as ffo')
          .join('quotes.form_fields as ff', 'ff.id', 'ffo.fieldId')
          .where('ff.fieldCode', param.formFieldCode)
          .where('ffo.isActive', true)
          .select(
            'ffo.id',
            'ffo.optionValue',
            'ffo.optionLabel',
            'ffo.priceValue'
          )
          .orderBy('ffo.sortOrder');

        return {
          ...param,
          priceOptions: options
        };
      })
    );

    return parametersWithPrices;
  }
}

export default PriceParameters;
