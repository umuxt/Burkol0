import db from '../connection.js';

/**
 * PriceParameters Model
 * Manages pricing parameters
 * Note: Lookup tables removed - prices now stored directly in form_field_options.price_value
 */

class PriceParameters {
  /**
   * Create a new price parameter
   */
  static async create({ code, name, type, formFieldCode, fixedValue, unit, description, isActive = true }) {
    const [parameter] = await db('quotes.price_parameters')
      .insert({
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
