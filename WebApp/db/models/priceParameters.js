import db from '../connection.js';
import PriceParameterLookups from './priceParameterLookups.js';

/**
 * PriceParameters Model
 * Manages pricing parameters
 * 
 * Updated for B0: settingId is now required (NOT NULL constraint)
 * Updated for Pre-D2-1: Lookup values now stored in price_parameter_lookups table
 *                       (replaces old form_field_options.priceValue approach)
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
   * Get lookup value for a parameter and optionCode
   * @param {number} parameterId - Price parameter ID
   * @param {string} optionCode - Form field option code (FFOC-XXXX)
   * @returns {number|null} Lookup value or null
   */
  static async getLookupValue(parameterId, optionCode) {
    return PriceParameterLookups.getValue(parameterId, optionCode);
  }

  /**
   * Get lookups for a parameter
   * @param {number} parameterId - Price parameter ID
   * @returns {Array} Lookup entries
   */
  static async getLookups(parameterId) {
    return PriceParameterLookups.getByParameterId(parameterId);
  }

  /**
   * Save lookups for a parameter
   * @param {number} parameterId - Price parameter ID
   * @param {Array} lookups - Array of { optionCode, value } objects
   */
  static async saveLookups(parameterId, lookups) {
    return PriceParameterLookups.bulkUpsert(parameterId, lookups);
  }

  /**
   * Get parameter with its lookup values
   */
  static async getWithLookups(parameterId) {
    const parameter = await this.getById(parameterId);
    if (!parameter) return null;

    const lookups = await PriceParameterLookups.getWithOptionDetails(parameterId);
    return {
      ...parameter,
      lookups
    };
  }

  /**
   * Get all form-based parameters with their lookups
   */
  static async getFormBasedParameters() {
    const parameters = await db('quotes.price_parameters as pp')
      .where('pp.type', 'form_lookup')
      .whereNotNull('pp.formFieldCode')
      .select('pp.*');

    // For each parameter, get lookups from price_parameter_lookups
    const parametersWithLookups = await Promise.all(
      parameters.map(async (param) => {
        const lookups = await PriceParameterLookups.getWithOptionDetails(param.id);
        return {
          ...param,
          lookups
        };
      })
    );

    return parametersWithLookups;
  }
}

export default PriceParameters;
