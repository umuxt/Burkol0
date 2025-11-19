import db from '../db.js';

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
        form_field_code: formFieldCode,
        fixed_value: fixedValue,
        unit,
        description,
        is_active: isActive,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
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
      query = query.where('is_active', filters.isActive);
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
        form_field_code: updates.formFieldCode,
        fixed_value: updates.fixedValue,
        unit: updates.unit,
        description: updates.description,
        is_active: updates.isActive,
        updated_at: db.fn.now()
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
      .join('quotes.form_fields as ff', 'ff.id', 'ffo.field_id')
      .where({
        'ff.field_code': formFieldCode,
        'ffo.option_value': optionValue,
        'ffo.is_active': true
      })
      .select('ffo.price_value')
      .first();
    
    return option?.price_value || null;
  }

  /**
   * Get all form-based parameters with their price mappings
   */
  static async getFormBasedParameters() {
    const parameters = await db('quotes.price_parameters as pp')
      .where('pp.type', 'form')
      .whereNotNull('pp.form_field_code')
      .select('pp.*');

    // For each parameter, get the associated field options with prices
    const parametersWithPrices = await Promise.all(
      parameters.map(async (param) => {
        const options = await db('quotes.form_field_options as ffo')
          .join('quotes.form_fields as ff', 'ff.id', 'ffo.field_id')
          .where('ff.field_code', param.form_field_code)
          .where('ffo.is_active', true)
          .select(
            'ffo.id',
            'ffo.option_value',
            'ffo.option_label',
            'ffo.price_value'
          )
          .orderBy('ffo.sort_order');

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
