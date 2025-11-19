import db from '../db.js';

/**
 * PriceFormulas Model
 * Manages pricing formulas and their parameters
 */

class PriceFormulas {
  /**
   * Create a new price formula
   */
  static async create({ code, name, formulaExpression, description, version = 1, isActive = true, createdBy }) {
    const [formula] = await db('quotes.price_formulas')
      .insert({
        code,
        name,
        formula_expression: formulaExpression,
        description,
        version,
        is_active: isActive,
        created_by: createdBy,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      })
      .returning('*');
    
    return formula;
  }

  /**
   * Get all price formulas
   */
  static async getAll(filters = {}) {
    let query = db('quotes.price_formulas');

    if (filters.isActive !== undefined) {
      query = query.where('is_active', filters.isActive);
    }

    if (filters.code) {
      query = query.where('code', filters.code);
    }

    const formulas = await query.orderBy('created_at', 'desc');
    return formulas;
  }

  /**
   * Get formula by ID
   */
  static async getById(id) {
    const formula = await db('quotes.price_formulas')
      .where('id', id)
      .first();
    
    return formula;
  }

  /**
   * Get formula by code
   */
  static async getByCode(code) {
    const formula = await db('quotes.price_formulas')
      .where('code', code)
      .first();
    
    return formula;
  }

  /**
   * Get active formula
   */
  static async getActive() {
    const formula = await db('quotes.price_formulas')
      .where('is_active', true)
      .orderBy('version', 'desc')
      .first();
    
    return formula;
  }

  /**
   * Update price formula
   */
  static async update(id, updates) {
    const [formula] = await db('quotes.price_formulas')
      .where('id', id)
      .update({
        name: updates.name,
        formula_expression: updates.formulaExpression,
        description: updates.description,
        is_active: updates.isActive,
        updated_at: db.fn.now()
      })
      .returning('*');
    
    return formula;
  }

  /**
   * Delete price formula
   */
  static async delete(id) {
    const count = await db('quotes.price_formulas')
      .where('id', id)
      .delete();
    
    return count > 0;
  }

  /**
   * Link parameter to formula
   */
  static async addParameter({ formulaId, parameterId, sortOrder = 0 }) {
    const [link] = await db('quotes.price_formula_parameters')
      .insert({
        formula_id: formulaId,
        parameter_id: parameterId,
        sort_order: sortOrder,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      })
      .returning('*');
    
    return link;
  }

  /**
   * Get all parameters for a formula
   */
  static async getParameters(formulaId) {
    const parameters = await db('quotes.price_formula_parameters as pfp')
      .where('pfp.formula_id', formulaId)
      .join('quotes.price_parameters as pp', 'pp.id', 'pfp.parameter_id')
      .select(
        'pp.*',
        'pfp.sort_order'
      )
      .orderBy('pfp.sort_order');
    
    return parameters;
  }

  /**
   * Remove parameter from formula
   */
  static async removeParameter(formulaId, parameterId) {
    const count = await db('quotes.price_formula_parameters')
      .where({
        formula_id: formulaId,
        parameter_id: parameterId
      })
      .delete();
    
    return count > 0;
  }

  /**
   * Get formula with all its parameters
   */
  static async getWithParameters(formulaId) {
    const formula = await this.getById(formulaId);
    
    if (!formula) {
      return null;
    }

    const parameters = await this.getParameters(formulaId);

    return {
      ...formula,
      parameters
    };
  }

  /**
   * Calculate price based on formula and form data
   */
  static async calculatePrice(formulaId, formData) {
    const formula = await this.getWithParameters(formulaId);
    
    if (!formula) {
      throw new Error(`Formula with ID ${formulaId} not found`);
    }

    const parameters = formula.parameters;
    const parameterValues = {};
    const calculationDetails = [];

    // Resolve each parameter value
    for (const param of parameters) {
      let value = null;
      let source = null;

      if (param.type === 'fixed') {
        // Fixed value parameter
        value = parseFloat(param.fixed_value);
        source = 'fixed';
      } else if (param.type === 'form_lookup') {
        // Lookup value from form data
        const formFieldCode = param.code.replace('_cost', '').replace('_rate', '');
        const formValue = formData[formFieldCode];
        
        if (formValue) {
          // Get lookup value
          const PriceParameters = (await import('./priceParameters.js')).default;
          const lookup = await PriceParameters.getLookupValue(param.id, formFieldCode, formValue);
          
          if (lookup) {
            value = parseFloat(lookup.price_value);
            source = 'lookup';
          }
        }
      } else if (param.type === 'calculated') {
        // Get directly from form data
        const formFieldCode = param.code;
        if (formData[formFieldCode] !== undefined) {
          value = parseFloat(formData[formFieldCode]);
          source = 'form';
        }
      }

      // If still no value found, check if it's a direct form field reference (like 'qty')
      if (value === null) {
        if (formData[param.code] !== undefined) {
          value = parseFloat(formData[param.code]);
          source = 'form';
        }
      }

      parameterValues[param.code] = value || 0;
      calculationDetails.push({
        parameterId: param.id,
        parameterCode: param.code,
        parameterName: param.name,
        parameterValue: value || 0,
        source,
        unit: param.unit
      });
    }

    // Evaluate formula
    try {
      // Replace parameter codes with their values in the formula
      let evaluatedFormula = formula.formula_expression;
      
      // First, replace all parameter values
      for (const [code, value] of Object.entries(parameterValues)) {
        const regex = new RegExp(`\\b${code}\\b`, 'g');
        evaluatedFormula = evaluatedFormula.replace(regex, value);
      }

      // Then, replace any form field values that might be in the formula
      for (const [fieldCode, fieldValue] of Object.entries(formData)) {
        const regex = new RegExp(`\\b${fieldCode}\\b`, 'g');
        const numericValue = parseFloat(fieldValue) || 0;
        evaluatedFormula = evaluatedFormula.replace(regex, numericValue);
      }

      // Evaluate the expression (simple eval for now - can be replaced with safer parser)
      const totalPrice = eval(evaluatedFormula);

      return {
        totalPrice,
        formula: formula.formula_expression,
        evaluatedFormula,
        parameterValues,
        calculationDetails
      };
    } catch (error) {
      throw new Error(`Failed to evaluate formula: ${error.message}`);
    }
  }

  /**
   * Bulk create formula with parameters
   */
  static async createWithParameters({ code, name, formulaExpression, description, version, isActive, createdBy, parameterCodes }) {
    const trx = await db.transaction();
    
    try {
      // Create formula
      const [formula] = await trx('quotes.price_formulas')
        .insert({
          code,
          name,
          formula_expression: formulaExpression,
          description,
          version: version || 1,
          is_active: isActive !== undefined ? isActive : true,
          created_by: createdBy,
          created_at: db.fn.now(),
          updated_at: db.fn.now()
        })
        .returning('*');

      // Link parameters
      if (parameterCodes && parameterCodes.length > 0) {
        // Get parameter IDs from codes
        const parameters = await trx('quotes.price_parameters')
          .whereIn('code', parameterCodes)
          .select('id', 'code');

        const links = parameterCodes.map((code, index) => {
          const param = parameters.find(p => p.code === code);
          if (!param) {
            throw new Error(`Parameter with code ${code} not found`);
          }
          return {
            formula_id: formula.id,
            parameter_id: param.id,
            sort_order: index,
            created_at: db.fn.now(),
            updated_at: db.fn.now()
          };
        });

        await trx('quotes.price_formula_parameters').insert(links);
      }

      await trx.commit();
      return formula;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }
}

export default PriceFormulas;
