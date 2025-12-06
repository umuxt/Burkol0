// Server Price Calculator - Server-side price calculation with comprehensive math functions
// Uses optionCode for lookup values

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

export function calculatePriceServer(quote, settings) {
  if (!settings || !settings.parameters || !settings.formula) {
    return quote.price || 0
  }

  try {
    // Sanitize formula first
    const sanitizedFormula = sanitizeFormula(settings.formula);
    
    // Create parameter values map
    const paramValues = {}
    
    // Build lookup map from parameters
    // Each parameter can have its own lookup table: { optionCode: value }
    const parameterLookupMap = {}
    settings.parameters.forEach(param => {
      if (param.lookups && param.lookups.length > 0) {
        parameterLookupMap[param.id] = {}
        param.lookups.forEach(lookup => {
          parameterLookupMap[param.id][lookup.optionCode] = parseFloat(lookup.value) || 0
        })
      }
    })
    
    settings.parameters.forEach(param => {
      // Use parameter ID for consistency (formulas use IDs)
      const paramKey = param.id
      
      if (param.type === 'fixed') {
        paramValues[paramKey] = parseFloat(param.value) || 0
      } else if (param.type === 'form' || param.type === 'form_lookup') {
        let value = 0
        
        if (param.formField === 'qty') {
          // Orijinal sistem mantığını koru
          const rawQty = quote.qty || quote.customFields?.qty || 0;
          // Sadece güvenlik tehditleri için validasyon yap
          value = validateAndSanitizeQuantity(rawQty, 'quantity');
        } else if (param.formField === 'thickness') {
          // Orijinal sistem mantığını koru
          const rawThickness = quote.thickness || quote.customFields?.thickness || 0;  
          value = validateAndSanitizeQuantity(rawThickness, 'thickness');
        } else if (param.formField === 'dimensions') {
          // Calculate area from dimensions string or numeric values
          const l = parseFloat(quote.dimsL) || parseFloat(quote.customFields?.dimsL)
          const w = parseFloat(quote.dimsW) || parseFloat(quote.customFields?.dimsW)
          if (!isNaN(l) && !isNaN(w)) {
            value = l * w
          } else {
            const dims = quote.dims || quote.customFields?.dims || ''
            const match = String(dims).match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i)
            if (match) {
              value = (parseFloat(match[1]) || 0) * (parseFloat(match[2]) || 0)
            }
          }
        } else {
          // For custom form fields
          // Check both fixed fields and customFields for dynamic form compatibility
          let fieldValue = quote[param.formField]
          if (fieldValue === undefined && quote.customFields) {
            fieldValue = quote.customFields[param.formField]
          }
          
          // Use optionCode for lookup values
          const paramLookups = parameterLookupMap[param.id]
          
          if (Array.isArray(fieldValue)) {
            // Multi-select: sum up values for all selected options
            if (paramLookups) {
              value = fieldValue.reduce((sum, optionCode) => {
                const lookupValue = paramLookups[optionCode] || 0
                return sum + lookupValue
              }, 0)
            } else {
              value = fieldValue.length || 0
            }
          } else if (paramLookups) {
            // Single select: use optionCode to lookup value
            value = paramLookups[fieldValue] || 0
          } else {
            // Direct form value for fields without lookup (number fields, etc.)
            value = parseFloat(fieldValue) || 0
          }
        }
        
        paramValues[paramKey] = value
      }
    })

    // SERVER DEBUG: Critical debugging information
    console.log('🔍 SERVER PRICE CALCULATION DEBUG:', {
      quoteId: quote.id,
      paramValues: paramValues,
      originalFormula: settings.formula,
      customFields: quote.customFields
    })

    // Evaluate formula with comprehensive math functions
    let formula = sanitizedFormula.replace(/^=/, '') // Remove leading =
    
    // Excel fonksiyonlarını JavaScript fonksiyonlarına çevir (client ile uyumlu)
    formula = formula.replace(/\bMAX\s*\(/g, 'Math.max(')
    formula = formula.replace(/\bMIN\s*\(/g, 'Math.min(')
    formula = formula.replace(/\bABS\s*\(/g, 'Math.abs(')
    formula = formula.replace(/\bPOW\s*\(/g, 'Math.pow(')
    formula = formula.replace(/\bSQRT\s*\(/g, 'Math.sqrt(')
    
    // Replace parameter names with actual values (case-sensitive)
    Object.keys(paramValues).forEach(paramName => {
      // Use word boundaries and escape special regex characters in parameter names
      const escapedParamName = paramName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`\\b${escapedParamName}\\b`, 'g')
      formula = formula.replace(regex, paramValues[paramName])
    })

    console.log('🔍 SERVER FORMULA AFTER REPLACEMENT:', formula)

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

    // Safer evaluation using Function constructor
    try {
      const result = Function(
        'mathCtx', 
        'formula',
        `
        const {${Object.keys(mathContext).join(', ')}} = mathCtx;
        return (${formula});
        `
      )(mathContext, formula)
      
      // Validate the calculated price before returning
      const price = Number(result) || 0;
      return validateCalculatedPrice(price);
    } catch (evalError) {
      console.error('❌ Formula evaluation error:', evalError.message, 'Formula:', formula)
      throw new Error(`Price calculation failed: ${evalError.message}`);
    }
    
  } catch (e) {
    console.error('❌ Price calculation error:', e.message)
    // For security validation errors, throw them up to be handled by the API
    if (e.message.includes('exceeds maximum limit') || 
        e.message.includes('cannot be negative') || 
        e.message.includes('must be a valid number') ||
        e.message.includes('unauthorized functions')) {
      throw e;
    }
    return quote.price || 0
  }
}