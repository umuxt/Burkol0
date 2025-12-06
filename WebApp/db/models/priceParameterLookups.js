import db from '../connection.js';

/**
 * PriceParameterLookups Model
 * Manages lookup values for price parameters using optionCode
 * 
 * This table stores the mapping between price parameters and form field options via optionCode.
 * Each parameter can have multiple lookup entries (one per optionCode).
 * This allows the same form field option to have different values for different parameters.
 * 
 * Example:
 * - Parameter "Unit Price" + optionCode "FFOC-0001" (Steel) = 150
 * - Parameter "Labor Hours" + optionCode "FFOC-0001" (Steel) = 50
 * 
 * Table structure:
 * - parameterId: FK to price_parameters
 * - optionCode: Unique code from form_field_options (FFOC-XXXX format)
 * - value: Numeric value for this parameter+option combination
 */

class PriceParameterLookups {
  /**
   * Create a new lookup entry
   * @param {Object} data - Lookup data
   * @param {number} data.parameterId - Price parameter ID
   * @param {string} data.optionCode - Form field option code (FFOC-XXXX)
   * @param {number} data.value - Numeric value for this lookup
   */
  static async create({ parameterId, optionCode, value }) {
    const [lookup] = await db('quotes.price_parameter_lookups')
      .insert({
        parameterId,
        optionCode,
        value,
        createdAt: db.fn.now(),
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    return lookup;
  }

  /**
   * Get all lookups for a parameter
   * @param {number} parameterId - Price parameter ID
   * @returns {Array} Array of lookup entries
   */
  static async getByParameterId(parameterId) {
    const lookups = await db('quotes.price_parameter_lookups')
      .where('parameterId', parameterId)
      .select(
        'id',
        'parameterId',
        'optionCode',
        'value',
        'createdAt',
        'updatedAt'
      )
      .orderBy('optionCode');
    
    return lookups;
  }

  /**
   * Get lookups with option details (label from form_field_options)
   * @param {number} parameterId - Price parameter ID
   * @returns {Array} Array of lookup entries with optionLabel
   */
  static async getWithOptionDetails(parameterId) {
    const lookups = await db('quotes.price_parameter_lookups as ppl')
      .leftJoin('quotes.form_field_options as ffo', 'ppl.optionCode', 'ffo.optionCode')
      .where('ppl.parameterId', parameterId)
      .select(
        'ppl.id',
        'ppl.parameterId',
        'ppl.optionCode',
        'ppl.value',
        'ffo.optionLabel',
        'ffo.sortOrder',
        'ppl.createdAt',
        'ppl.updatedAt'
      )
      .orderBy('ffo.sortOrder');
    
    return lookups;
  }

  /**
   * Get lookup value for a specific parameter and optionCode
   * @param {number} parameterId - Price parameter ID
   * @param {string} optionCode - Form field option code (FFOC-XXXX)
   * @returns {number|null} Lookup value or null if not found
   */
  static async getValue(parameterId, optionCode) {
    const lookup = await db('quotes.price_parameter_lookups')
      .where({ parameterId, optionCode })
      .select('value')
      .first();
    
    return lookup?.value ?? null;
  }

  /**
   * Update or insert a lookup entry (upsert)
   * @param {Object} data - Lookup data
   * @param {number} data.parameterId - Price parameter ID
   * @param {string} data.optionCode - Form field option code (FFOC-XXXX)
   * @param {number} data.value - Numeric value
   */
  static async upsert({ parameterId, optionCode, value }) {
    const existing = await db('quotes.price_parameter_lookups')
      .where({ parameterId, optionCode })
      .first();

    if (existing) {
      const [updated] = await db('quotes.price_parameter_lookups')
        .where('id', existing.id)
        .update({
          value,
          updatedAt: db.fn.now()
        })
        .returning('*');
      return updated;
    } else {
      return this.create({ parameterId, optionCode, value });
    }
  }

  /**
   * Bulk upsert lookups for a parameter
   * @param {number} parameterId - Price parameter ID
   * @param {Array} lookups - Array of { optionCode, value } objects
   */
  static async bulkUpsert(parameterId, lookups) {
    const trx = await db.transaction();
    
    try {
      const results = [];
      
      for (const lookup of lookups) {
        const existing = await trx('quotes.price_parameter_lookups')
          .where({ 
            parameterId, 
            optionCode: lookup.optionCode 
          })
          .first();

        if (existing) {
          const [updated] = await trx('quotes.price_parameter_lookups')
            .where('id', existing.id)
            .update({
              value: lookup.value,
              updatedAt: db.fn.now()
            })
            .returning('*');
          results.push(updated);
        } else {
          const [created] = await trx('quotes.price_parameter_lookups')
            .insert({
              parameterId,
              optionCode: lookup.optionCode,
              value: lookup.value,
              createdAt: db.fn.now(),
              updatedAt: db.fn.now()
            })
            .returning('*');
          results.push(created);
        }
      }
      
      await trx.commit();
      return results;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Delete lookup entry by ID
   * @param {number} id - Lookup entry ID
   */
  static async delete(id) {
    const count = await db('quotes.price_parameter_lookups')
      .where('id', id)
      .delete();
    
    return count > 0;
  }

  /**
   * Delete lookup by parameter and optionCode
   * @param {number} parameterId - Price parameter ID
   * @param {string} optionCode - Option code (FFOC-XXXX)
   */
  static async deleteByParameterAndOption(parameterId, optionCode) {
    const count = await db('quotes.price_parameter_lookups')
      .where({ parameterId, optionCode })
      .delete();
    
    return count > 0;
  }

  /**
   * Delete all lookups for a parameter
   * @param {number} parameterId - Price parameter ID
   */
  static async deleteByParameterId(parameterId) {
    const count = await db('quotes.price_parameter_lookups')
      .where('parameterId', parameterId)
      .delete();
    
    return count;
  }

  /**
   * Get all lookups for multiple parameters (for price calculation)
   * @param {Array<number>} parameterIds - Array of parameter IDs
   * @returns {Object} Map of parameterId -> { optionCode -> value }
   */
  static async getByParameterIds(parameterIds) {
    if (!parameterIds || parameterIds.length === 0) {
      return {};
    }

    const lookups = await db('quotes.price_parameter_lookups')
      .whereIn('parameterId', parameterIds)
      .select('parameterId', 'optionCode', 'value');

    // Build lookup map: { parameterId: { optionCode: value } }
    const lookupMap = {};
    for (const lookup of lookups) {
      if (!lookupMap[lookup.parameterId]) {
        lookupMap[lookup.parameterId] = {};
      }
      lookupMap[lookup.parameterId][lookup.optionCode] = parseFloat(lookup.value) || 0;
    }

    return lookupMap;
  }

  /**
   * Replace all lookups for a parameter (delete and recreate)
   * @param {number} parameterId - Price parameter ID
   * @param {Array} lookups - Array of { optionCode, value } objects
   */
  static async replaceAll(parameterId, lookups) {
    const trx = await db.transaction();
    
    try {
      // Delete existing lookups
      await trx('quotes.price_parameter_lookups')
        .where('parameterId', parameterId)
        .delete();
      
      // Insert new lookups
      const results = [];
      for (const lookup of lookups) {
        const [created] = await trx('quotes.price_parameter_lookups')
          .insert({
            parameterId,
            optionCode: lookup.optionCode,
            value: lookup.value,
            createdAt: db.fn.now(),
            updatedAt: db.fn.now()
          })
          .returning('*');
        results.push(created);
      }
      
      await trx.commit();
      return results;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }
}

export default PriceParameterLookups;
