import db from '../connection.js';

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
        formulaExpression: formulaExpression,
        description,
        version,
        isActive: isActive,
        createdBy: createdBy,
        createdAt: db.fn.now(),
        updatedAt: db.fn.now()
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
      query = query.where('isActive', filters.isActive);
    }

    if (filters.code) {
      query = query.where('code', filters.code);
    }

    const formulas = await query.orderBy('createdAt', 'desc');
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
   * Get formula by setting ID
   */
  static async getBySettingId(settingId) {
    const formula = await db('quotes.price_formulas')
      .where('settingId', settingId)
      .where('isActive', true)
      .orderBy('version', 'desc')
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
      .where('isActive', true)
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
        formulaExpression: updates.formulaExpression,
        description: updates.description,
        isActive: updates.isActive,
        updatedAt: db.fn.now()
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
   * DEPRECATED: price_formula_parameters table removed in migration 021
   * Parameters are now parsed from formula_expression
   */
  static async addParameter({ formulaId, parameterId, sortOrder = 0 }) {
    // Table removed - this method is deprecated
    console.warn('DEPRECATED: PriceFormulas.addParameter() - price_formula_parameters table removed');
    return null;
    
    /* DEAD CODE - table removed
    const [link] = await db('quotes.price_formula_parameters')
      .insert({
        formulaId: formulaId,
        parameterId: parameterId,
        sortOrder: sortOrder,
        createdAt: db.fn.now(),
        updatedAt: db.fn.now()
      })
      .returning('*');
    
    return link;
    */
  }

  /**
   * Get all parameters for a formula
   * NOTE: price_formula_parameters table was removed in migration 021
   * Formula parameters are now parsed from formula_expression
   */
  static async getParameters(formulaId) {
    // Return empty array - parameters are parsed from formula expression
    // This method kept for backward compatibility
    return [];
  }

  /**
   * Remove parameter from formula
   * NOTE: This is deprecated - parameters are parsed from formula
   */
  static async removeParameter(formulaId, parameterId) {
    // No-op - kept for backward compatibility
    return false;
  }

  /**
   * Get formula with all its parameters
   * NOTE: Parameters returned as empty array (parsed from formula_expression instead)
   */
  static async getWithParameters(formulaId) {
    const formula = await this.getById(formulaId);
    
    if (!formula) {
      return null;
    }

    // Parameters are now parsed from formula_expression, not stored separately
    return {
      ...formula,
      parameters: []
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
        value = parseFloat(param.fixedValue);
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
            value = parseFloat(lookup.priceValue);
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
    let evaluatedFormula = formula.formulaExpression;
    try {
      // Replace parameter codes with their values in the formula
      
      // Remove leading equals sign if present (Excel-style formula)
      evaluatedFormula = evaluatedFormula.trim();
      if (evaluatedFormula.startsWith('=')) {
        evaluatedFormula = evaluatedFormula.substring(1).trim();
      }
      
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
      console.log('📐 Evaluating formula:', {
        original: formula.formulaExpression,
        evaluated: evaluatedFormula,
        parameterValues
      });
      
      // Check if there are any unreplaced identifiers (potential undefined variables)
      const identifierRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
      const unreplacedVars = evaluatedFormula.match(identifierRegex) || [];
      const mathConstants = ['Math', 'PI', 'E', 'abs', 'ceil', 'floor', 'round', 'max', 'min', 'pow', 'sqrt'];
      const hasUndefinedVars = unreplacedVars.some(v => !mathConstants.includes(v));
      
      if (hasUndefinedVars) {
        console.warn('⚠️  Formula contains undefined variables:', unreplacedVars.filter(v => !mathConstants.includes(v)));
        // Replace undefined variables with 0
        for (const varName of unreplacedVars) {
          if (!mathConstants.includes(varName)) {
            const regex = new RegExp(`\\b${varName}\\b`, 'g');
            evaluatedFormula = evaluatedFormula.replace(regex, '0');
          }
        }
        console.log('📐 Formula after replacing undefined vars:', evaluatedFormula);
      }
      
      const totalPrice = eval(evaluatedFormula);

      return {
        totalPrice,
        formula: formula.formulaExpression,
        evaluatedFormula,
        parameterValues,
        calculationDetails
      };
    } catch (error) {
      console.error('❌ Formula evaluation failed:', {
        originalFormula: formula.formulaExpression,
        evaluatedFormula,
        parameterValues,
        error: error.message
      });
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
          formulaExpression: formulaExpression,
          description,
          version: version || 1,
          isActive: isActive !== undefined ? isActive : true,
          createdBy: createdBy,
          createdAt: db.fn.now(),
          updatedAt: db.fn.now()
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
            formulaId: formula.id,
            parameterId: param.id,
            sortOrder: index,
            createdAt: db.fn.now(),
            updatedAt: db.fn.now()
          };
        });

        // NOTE: price_formula_parameters table removed - skip insert
        // await trx('quotes.price_formula_parameters').insert(links);
      }

      await trx.commit();
      return formula;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Create new version of a formula
   */
  static async createNewVersion(formulaId, { name, formulaExpression, description, createdBy }) {
    const trx = await db.transaction();
    
    try {
      // Get current formula
      const currentFormula = await trx('quotes.price_formulas')
        .where('id', formulaId)
        .first();
      
      if (!currentFormula) {
        throw new Error('Formula not found');
      }

      // Deactivate current formula
      await trx('quotes.price_formulas')
        .where('id', formulaId)
        .update({ isActive: false, updatedAt: db.fn.now() });

      // Create new version
      const [newFormula] = await trx('quotes.price_formulas')
        .insert({
          code: currentFormula.code,
          name: name || currentFormula.name,
          formulaExpression: formulaExpression || currentFormula.formulaExpression,
          description: description || currentFormula.description,
          version: currentFormula.version + 1,
          isActive: true,
          supersedesId: formulaId,
          createdBy: createdBy,
          createdAt: db.fn.now(),
          updatedAt: db.fn.now()
        })
        .returning('*');

      await trx.commit();
      return newFormula;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Get all versions of a formula
   */
  static async getVersions(code) {
    const versions = await db('quotes.price_formulas')
      .where('code', code)
      .orderBy('version', 'desc');
    
    return versions;
  }

  /**
   * Activate a specific version
   */
  static async activateVersion(formulaId) {
    const trx = await db.transaction();
    
    try {
      // Get the formula to activate
      const formula = await trx('quotes.price_formulas')
        .where('id', formulaId)
        .first();
      
      if (!formula) {
        throw new Error('Formula not found');
      }

      // Deactivate all other versions with same code
      await trx('quotes.price_formulas')
        .where('code', formula.code)
        .update({ isActive: false, updatedAt: db.fn.now() });

      // Activate this version
      await trx('quotes.price_formulas')
        .where('id', formulaId)
        .update({ isActive: true, updatedAt: db.fn.now() });

      await trx.commit();
      return await this.getById(formulaId);
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Parse parameter codes from formula expression
   */
  static parseParameters(formulaExpression) {
    // Match parameter placeholders like {param_name}
    const regex = /{([^}]+)}/g;
    const matches = [];
    let match;
    
    while ((match = regex.exec(formulaExpression)) !== null) {
      matches.push(match[1]);
    }
    
    return [...new Set(matches)]; // Remove duplicates
  }
}

export default PriceFormulas;
