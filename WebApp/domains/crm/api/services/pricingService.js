/**
 * Pricing Service
 * Handles price parameters, formulas, and calculations
 */

import PriceParameters from '../../../../db/models/priceParameters.js';
import PriceFormulas from '../../../../db/models/priceFormulas.js';

/**
 * Get all price parameters
 */
export async function getPriceParameters(withPrices = false) {
  if (withPrices) {
    return PriceParameters.getAllWithPrices();
  }
  return PriceParameters.getAll();
}

/**
 * Get price parameter by ID
 */
export async function getPriceParameterById(id) {
  return PriceParameters.getById(id);
}

/**
 * Create price parameter
 */
export async function createPriceParameter(data) {
  const paramData = {
    name: data.name,
    code: data.code,
    unit: data.unit,
    category: data.category,
    description: data.description,
    isActive: data.isActive !== undefined ? data.isActive : true
  };

  return PriceParameters.create(paramData);
}

/**
 * Update price parameter
 */
export async function updatePriceParameter(id, updates) {
  return PriceParameters.update(id, updates);
}

/**
 * Delete price parameter
 */
export async function deletePriceParameter(id) {
  return PriceParameters.delete(id);
}

/**
 * Get all price formulas
 */
export async function getPriceFormulas() {
  return PriceFormulas.getAll();
}

/**
 * Get price formula by ID
 */
export async function getPriceFormulaById(id) {
  return PriceFormulas.getById(id);
}

/**
 * Create price formula
 */
export async function createPriceFormula(data) {
  const formulaData = {
    name: data.name,
    description: data.description,
    formula: data.formula,
    variables: data.variables,
    isActive: data.isActive !== undefined ? data.isActive : true
  };

  return PriceFormulas.create(formulaData);
}

/**
 * Update price formula
 */
export async function updatePriceFormula(id, updates) {
  return PriceFormulas.update(id, updates);
}

/**
 * Delete price formula
 */
export async function deletePriceFormula(id) {
  return PriceFormulas.delete(id);
}

/**
 * Validate price formula
 */
export function validatePriceFormula(formula) {
  try {
    // Basic validation - check if formula is valid JavaScript
    new Function('parameters', `return ${formula}`);
    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: error.message 
    };
  }
}

/**
 * Calculate price using formula
 */
export function calculatePrice(formula, parameters) {
  try {
    const calcFunction = new Function('parameters', `return ${formula}`);
    const result = calcFunction(parameters);
    return {
      success: true,
      result: result
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
