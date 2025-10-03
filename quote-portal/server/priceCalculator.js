// Enhanced Server Price Calculator - Unified calculation engine with detailed breakdown

// Security validation functions
function validateAndSanitizeQuantity(value, fieldName = 'quantity') {
  // Convert to number
  const num = parseFloat(value);
  
  // Check if it's a valid number
  if (isNaN(num)) {
    throw new Error(`${fieldName} must be a valid number, received: ${value}`);
  }
  
  // Check for negative values (critical security issue)
  if (num < 0) {
    throw new Error(`${fieldName} cannot be negative: ${num}`);
  }
  
  // Check for extreme values (DoS attack prevention)
  if (num > 1000000) {
    throw new Error(`${fieldName} exceeds maximum limit (1,000,000): ${num}`);
  }
  
  // Sistem akışını bozma - sıfır değerlere izin ver ama logla
  if (num === 0) {
    console.log(`⚠️ Zero ${fieldName} detected but allowed for system compatibility`);
  }
  
  return num;
}

/**
 * Enhanced form field value extraction with multiple fallback strategies
 */
function extractFormFieldValue(quote, parameter) {
  const fieldId = parameter.formField
  let rawValue = null
  let source = 'not_found'
  
  // Strategy 1: customFields (primary)
  if (quote.customFields && quote.customFields[fieldId] !== undefined) {
    rawValue = quote.customFields[fieldId]
    source = 'customFields'
  }
  // Strategy 2: Direct field access (secondary)  
  else if (quote[fieldId] !== undefined) {
    rawValue = quote[fieldId]
    source = 'direct_field'
  }
  // Strategy 3: Try to find by field label (tertiary)
  else if (parameter.name && quote.customFields) {
    const matchingKey = Object.keys(quote.customFields).find(key => 
      key.toLowerCase().includes(parameter.name.toLowerCase()) ||
      parameter.name.toLowerCase().includes(key.toLowerCase())
    )
    if (matchingKey) {
      rawValue = quote.customFields[matchingKey]
      source = 'label_match'
    }
  }

  // Process the raw value
  let finalValue = 0
  
  if (rawValue !== null && rawValue !== undefined) {
    // Handle lookup table if exists
    if (parameter.lookupTable && Array.isArray(parameter.lookupTable)) {
      const lookupEntry = parameter.lookupTable.find(entry => entry.option === rawValue)
      if (lookupEntry) {
        finalValue = parseFloat(lookupEntry.value) || 0
        source = source + '_lookup'
      } else {
        console.warn(`⚠️ Lookup value "${rawValue}" not found in table for ${parameter.name}`)
        finalValue = parseFloat(rawValue) || 0
      }
    } else {
      // Direct numeric conversion
      finalValue = parseFloat(rawValue) || 0
    }
  }

  return {
    value: finalValue,
    rawValue: rawValue,
    source: source
  }
}

/**
 * Safe formula evaluation with comprehensive math context
 */
function evaluateFormulaSafely(formula) {
  try {
    // Basic validation
    if (!formula || typeof formula !== 'string') {
      return 0
    }
    
    // Sanitize formula
    const sanitizedFormula = sanitizeFormula(formula)
    
    // Remove leading equals and clean formula
    let cleanFormula = sanitizedFormula.replace(/^=/, '').trim()
    
    if (!cleanFormula) {
      return 0
    }
    
    // Excel function compatibility
    cleanFormula = cleanFormula.replace(/\bMAX\s*\(/g, 'Math.max(')
    cleanFormula = cleanFormula.replace(/\bMIN\s*\(/g, 'Math.min(')
    cleanFormula = cleanFormula.replace(/\bABS\s*\(/g, 'Math.abs(')
    cleanFormula = cleanFormula.replace(/\bPOW\s*\(/g, 'Math.pow(')
    cleanFormula = cleanFormula.replace(/\bSQRT\s*\(/g, 'Math.sqrt(')
    cleanFormula = cleanFormula.replace(/\bROUND\s*\(/g, 'Math.round(')
    
    // Create comprehensive math context
    const mathContext = {
      // Basic Math Functions
      SQRT: Math.sqrt,
      ROUND: Math.round,
      MAX: Math.max,
      MIN: Math.min,
      ABS: Math.abs,
      POWER: Math.pow,
      POW: Math.pow,
      EXP: Math.exp,
      LN: Math.log,
      LOG: Math.log10,
      LOG10: Math.log10,
      
      // Trigonometric Functions
      SIN: Math.sin,
      COS: Math.cos,
      TAN: Math.tan,
      ASIN: Math.asin,
      ACOS: Math.acos,
      ATAN: Math.atan,
      ATAN2: Math.atan2,
      
      // Rounding Functions
      CEILING: Math.ceil,
      CEIL: Math.ceil,
      FLOOR: Math.floor,
      TRUNC: Math.trunc,
      ROUNDUP: (num, digits = 0) => Math.ceil(num * Math.pow(10, digits)) / Math.pow(10, digits),
      ROUNDDOWN: (num, digits = 0) => Math.floor(num * Math.pow(10, digits)) / Math.pow(10, digits),
      
      // Statistical Functions
      AVERAGE: (...args) => args.reduce((a, b) => a + b, 0) / args.length,
      SUM: (...args) => args.reduce((a, b) => a + b, 0),
      COUNT: (...args) => args.filter(x => typeof x === 'number' && !isNaN(x)).length,
      COUNTA: (...args) => args.filter(x => x != null && x !== '').length,
      
      // Logical Functions
      IF: (condition, trueValue, falseValue) => condition ? trueValue : falseValue,
      AND: (...args) => args.every(arg => Boolean(arg)),
      OR: (...args) => args.some(arg => Boolean(arg)),
      NOT: (value) => !Boolean(value),
      
      // Text Functions
      LEN: (text) => String(text || '').length,
      LEFT: (text, num) => String(text || '').substring(0, num),
      RIGHT: (text, num) => String(text || '').substring(String(text || '').length - num),
      MID: (text, start, num) => String(text || '').substring(start - 1, start - 1 + num),
      UPPER: (text) => String(text || '').toUpperCase(),
      LOWER: (text) => String(text || '').toLowerCase(),
      
      // Constants
      PI: Math.PI,
      E: Math.E,
      
      // Custom Business Functions
      MARGIN: (cost, markup) => cost * (1 + markup / 100),
      DISCOUNT: (price, discountPercent) => price * (1 - discountPercent / 100),
      VAT: (amount, vatRate) => amount * (1 + vatRate / 100),
      MARKUP: (cost, marginPercent) => cost / (1 - marginPercent / 100),
      
      // Range/Array Functions
      SUMPRODUCT: (...pairs) => {
        if (pairs.length % 2 !== 0) return 0;
        let sum = 0;
        for (let i = 0; i < pairs.length; i += 2) {
          sum += pairs[i] * pairs[i + 1];
        }
        return sum;
      }
    }
    
    // Safe evaluation with context
    const result = Function(
      'mathCtx', 
      'formula',
      `
      const {${Object.keys(mathContext).join(', ')}} = mathCtx;
      return (${cleanFormula});
      `
    )(mathContext, cleanFormula)
    
    if (isNaN(result) || !isFinite(result)) {
      console.warn(`⚠️ Formula evaluation resulted in invalid number: ${result}`)
      return 0
    }
    
    return Math.max(0, result) // Ensure non-negative price
    
  } catch (error) {
    console.error('❌ Formula evaluation error:', error.message)
    return 0
  }
}

function validateCalculatedPrice(price) {
  if (isNaN(price) || !isFinite(price)) {
    throw new Error(`Invalid price calculation result: ${price}`);
  }
  
  if (price < 0) {
    throw new Error(`Price cannot be negative: ${price}`);
  }
  
  // Business rule: maximum reasonable price (100M limit)
  if (price > 100000000) {
    throw new Error(`Calculated price exceeds reasonable business limits: ${price}`);
  }
  
  return price;
}

function sanitizeFormula(formula) {
  // Block dangerous patterns
  const dangerousPatterns = [
    /require\s*\(/i,
    /import\s+/i,
    /process\./i,
    /global\./i,
    /console\./i,
    /eval\s*\(/i,
    /Function\s*\(/i,
    /setTimeout/i,
    /setInterval/i,
    /fetch\s*\(/i,
    /XMLHttpRequest/i,
    /child_process/i,
    /fs\./i,
    /\.exec\s*\(/i
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(formula)) {
      throw new Error(`Formula contains unauthorized functions: ${pattern.source}`);
    }
  }
  
  return formula;
}

/**
 * Enhanced server-side price calculation with detailed breakdown
 * @param {Object} quote - Quote object with form data
 * @param {Object} priceSettings - Price settings with parameters and formula
 * @returns {Object} - Calculation result with breakdown
 */
export function calculatePriceServer(quote, priceSettings) {
  try {
    // Input validation
    if (!quote || !priceSettings) {
      console.error('❌ calculatePriceServer: Missing required inputs')
      return {
        success: false,
        price: quote?.price || 0,
        error: 'Missing quote or price settings',
        breakdown: {}
      }
    }

    if (!priceSettings.parameters || !priceSettings.formula) {
      console.warn('⚠️ calculatePriceServer: No parameters or formula defined')
      return {
        success: true,
        price: quote.price || 0,
        breakdown: { fallback: 'No pricing formula defined' },
        usedFallback: true
      }
    }

    console.log(`🔧 calculatePriceServer: Processing quote ${quote.id}`)
    
    // Extract parameter values with detailed logging
    const paramValues = {}
    const parameterBreakdown = {}
    
    priceSettings.parameters.forEach(param => {
      let value = 0
      let source = 'default'
      
      if (param.type === 'fixed') {
        value = parseFloat(param.value) || 0
        source = 'fixed'
        parameterBreakdown[param.id] = {
          name: param.name,
          type: 'fixed',
          value: value,
          source: 'parameter_setting'
        }
      } else if (param.type === 'form') {
        // Enhanced form field value extraction
        const fieldValue = extractFormFieldValue(quote, param)
        value = fieldValue.value
        source = fieldValue.source
        
        parameterBreakdown[param.id] = {
          name: param.name,
          type: 'form',
          value: value,
          source: source,
          fieldId: param.formField,
          rawValue: fieldValue.rawValue
        }
      }
      
      paramValues[param.id] = value
      console.log(`  � Parameter ${param.id} (${param.name}): ${value} [${source}]`)
    })

    // Enhanced formula evaluation
    let processedFormula = priceSettings.formula
    const replacements = {}
    
    // Replace parameter IDs with values
    Object.keys(paramValues).forEach(paramId => {
      const value = paramValues[paramId]
      const regex = new RegExp(`\\b${paramId}\\b`, 'g')
      processedFormula = processedFormula.replace(regex, value.toString())
      replacements[paramId] = value
    })

    console.log(`🧮 Formula evaluation: ${priceSettings.formula} → ${processedFormula}`)

    // Safe formula evaluation
    const calculatedPrice = evaluateFormulaSafely(processedFormula)
    
    const result = {
      success: true,
      price: calculatedPrice,
      breakdown: {
        originalFormula: priceSettings.formula,
        processedFormula: processedFormula,
        parameters: parameterBreakdown,
        replacements: replacements,
        finalPrice: calculatedPrice
      },
      usedParameters: Object.keys(paramValues),
      timestamp: new Date().toISOString()
    }

    console.log(`✅ calculatePriceServer result: ${calculatedPrice}`)
    return result

  } catch (error) {
    console.error('❌ calculatePriceServer error:', error)
    return {
      success: false,
      price: quote?.price || 0,
      error: error.message,
      breakdown: {},
      timestamp: new Date().toISOString()
    }
  }
}

/**
 * Legacy compatibility function - returns just the price for existing code
 */
export function calculatePriceServerLegacy(quote, settings) {
  const result = calculatePriceServer(quote, settings)
  return result.success ? result.price : (quote?.price || 0)
}