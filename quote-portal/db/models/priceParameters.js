import db from '../db.js';

/**
 * PriceParameters Model
 * Manages pricing parameters and their lookup tables
 */

class PriceParameters {
  /**
   * Create a new price parameter
   */
  static async create({ code, name, type, fixedValue, unit, description, isActive = true }) {
    const [parameter] = await db('quotes.price_parameters')
      .insert({
        code,
        name,
        type,
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
   * Add lookup value for form-based parameter
   */
  static async addLookup({ parameterId, formFieldCode, optionValue, priceValue, currency = 'TRY', validFrom, validTo, isActive = true }) {
    const [lookup] = await db('quotes.price_parameter_lookups')
      .insert({
        parameter_id: parameterId,
        form_field_code: formFieldCode,
        option_value: optionValue,
        price_value: priceValue,
        currency,
        valid_from: validFrom,
        valid_to: validTo,
        is_active: isActive,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      })
      .returning('*');
    
    return lookup;
  }

  /**
   * Get all lookups for a parameter
   */
  static async getLookups(parameterId, filters = {}) {
    let query = db('quotes.price_parameter_lookups')
      .where('parameter_id', parameterId);

    if (filters.isActive !== undefined) {
      query = query.where('is_active', filters.isActive);
    }

    if (filters.formFieldCode) {
      query = query.where('form_field_code', filters.formFieldCode);
    }

    // Filter by valid date range
    const now = new Date();
    if (filters.validNow) {
      query = query.where(function() {
        this.where('valid_from', '<=', now).orWhereNull('valid_from');
      }).where(function() {
        this.where('valid_to', '>=', now).orWhereNull('valid_to');
      });
    }

    const lookups = await query.orderBy('form_field_code').orderBy('option_value');
    return lookups;
  }

  /**
   * Get lookup value for specific form field value
   */
  static async getLookupValue(parameterId, formFieldCode, optionValue) {
    const now = new Date();
    
    const lookup = await db('quotes.price_parameter_lookups')
      .where({
        parameter_id: parameterId,
        form_field_code: formFieldCode,
        option_value: optionValue,
        is_active: true
      })
      .where(function() {
        this.where('valid_from', '<=', now).orWhereNull('valid_from');
      })
      .where(function() {
        this.where('valid_to', '>=', now).orWhereNull('valid_to');
      })
      .first();
    
    return lookup;
  }

  /**
   * Update lookup
   */
  static async updateLookup(lookupId, updates) {
    const [lookup] = await db('quotes.price_parameter_lookups')
      .where('id', lookupId)
      .update({
        option_value: updates.optionValue,
        price_value: updates.priceValue,
        currency: updates.currency,
        valid_from: updates.validFrom,
        valid_to: updates.validTo,
        is_active: updates.isActive,
        updated_at: db.fn.now()
      })
      .returning('*');
    
    return lookup;
  }

  /**
   * Delete lookup
   */
  static async deleteLookup(lookupId) {
    const count = await db('quotes.price_parameter_lookups')
      .where('id', lookupId)
      .delete();
    
    return count > 0;
  }

  /**
   * Get parameter with all its lookups
   */
  static async getWithLookups(parameterId) {
    const parameter = await this.getById(parameterId);
    
    if (!parameter) {
      return null;
    }

    const lookups = await this.getLookups(parameterId, { isActive: true, validNow: true });

    return {
      ...parameter,
      lookups
    };
  }

  /**
   * Bulk create lookups for a parameter
   */
  static async bulkCreateLookups(parameterId, lookupsData) {
    const lookupsToInsert = lookupsData.map(lookup => ({
      parameter_id: parameterId,
      form_field_code: lookup.formFieldCode,
      option_value: lookup.optionValue,
      price_value: lookup.priceValue,
      currency: lookup.currency || 'TRY',
      valid_from: lookup.validFrom,
      valid_to: lookup.validTo,
      is_active: lookup.isActive !== undefined ? lookup.isActive : true,
      created_at: db.fn.now(),
      updated_at: db.fn.now()
    }));

    const lookups = await db('quotes.price_parameter_lookups')
      .insert(lookupsToInsert)
      .returning('*');
    
    return lookups;
  }
}

export default PriceParameters;
