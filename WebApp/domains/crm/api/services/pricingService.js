/**
 * Pricing Service
 * Handles price parameters and calculations
 * 
 * Updated for B0: Removed PriceFormulas import
 * (price_formulas table merged into price_settings)
 * Use PriceSettings for formula-related operations
 */

import PriceParameters from '../../../../db/models/priceParameters.js';
import PriceSettings from './priceSettingsService.js';

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

// =========================================
// DEPRECATED: Price Formula Functions
// Use PriceSettings instead (formulaExpression merged into price_settings)
// =========================================

/**
 * @deprecated Use PriceSettings.getAll() instead
 * Price formulas are now stored in price_settings.formulaExpression
 */
export async function getPriceFormulas() {
  console.warn('getPriceFormulas is deprecated. Use PriceSettings.getAll() instead.');
  const settings = await PriceSettings.getAll();
  // Return in old format for backward compatibility
  return settings.map(s => ({
    id: s.id,
    settingId: s.id,
    code: s.code,
    name: s.name,
    formulaExpression: s.formulaExpression,
    description: s.description,
    isActive: s.isActive,
    version: s.version
  }));
}

/**
 * @deprecated Use PriceSettings.getById() instead
 */
export async function getPriceFormulaById(id) {
  console.warn('getPriceFormulaById is deprecated. Use PriceSettings.getById() instead.');
  const setting = await PriceSettings.getById(id);
  if (!setting) return null;
  return {
    id: setting.id,
    settingId: setting.id,
    code: setting.code,
    name: setting.name,
    formulaExpression: setting.formulaExpression,
    description: setting.description,
    isActive: setting.isActive,
    version: setting.version
  };
}

/**
 * @deprecated Use PriceSettings.create() instead
 */
export async function createPriceFormula(data) {
  console.warn('createPriceFormula is deprecated. Use PriceSettings.create() instead.');
  return PriceSettings.create({
    name: data.name,
    code: data.code || data.name.toUpperCase().replace(/\s+/g, '_'),
    description: data.description,
    formulaExpression: data.formula || data.formulaExpression,
    isActive: data.isActive !== undefined ? data.isActive : true
  });
}

/**
 * @deprecated Use PriceSettings.update() instead
 */
export async function updatePriceFormula(id, updates) {
  console.warn('updatePriceFormula is deprecated. Use PriceSettings.update() instead.');
  const updateData = { ...updates };
  if (updates.formula) {
    updateData.formulaExpression = updates.formula;
    delete updateData.formula;
  }
  return PriceSettings.update(id, updateData);
}

/**
 * @deprecated Use PriceSettings.delete() instead
 */
export async function deletePriceFormula(id) {
  console.warn('deletePriceFormula is deprecated. Use PriceSettings.delete() instead.');
  return PriceSettings.delete(id);
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
 * Calculate price using formula and parameters
 * Updated for B0: Can use PriceSettings.calculatePrice() for full calculation
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

/**
 * Calculate price using price setting ID
 * New method for B0: Uses PriceSettings.calculatePrice()
 */
export async function calculatePriceWithSetting(settingId, formData) {
  return PriceSettings.calculatePrice(settingId, formData);
}
