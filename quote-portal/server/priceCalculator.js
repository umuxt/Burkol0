// Server Price Calculator - Server-side price calculation with comprehensive math functions

export function calculatePriceServer(quote, settings) {
  if (!settings || !settings.parameters || !settings.formula) {
    return quote.price || 0
  }

  try {
    // Create parameter values map
    const paramValues = {}
    
    settings.parameters.forEach(param => {
      if (param.type === 'fixed') {
        paramValues[param.id] = parseFloat(param.value) || 0
      } else if (param.type === 'form') {
        let value = 0
        
        if (param.formField === 'qty') {
          value = parseFloat(quote.qty) || parseFloat(quote.customFields?.qty) || 0
        } else if (param.formField === 'thickness') {
          value = parseFloat(quote.thickness) || parseFloat(quote.customFields?.thickness) || 0
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
          // For fields with lookup table or arrays
          // Check both fixed fields and customFields for dynamic form compatibility
          let fieldValue = quote[param.formField]
          if (fieldValue === undefined && quote.customFields) {
            fieldValue = quote.customFields[param.formField]
          }
          
          if (Array.isArray(fieldValue)) {
            if (param.lookupTable && param.lookupTable.length > 0) {
              value = fieldValue.reduce((sum, opt) => {
                const found = param.lookupTable.find(item => item.option === opt)
                return sum + (found ? (parseFloat(found.value) || 0) : 0)
              }, 0)
            } else {
              value = fieldValue.length || 0
            }
          } else if (param.lookupTable && param.lookupTable.length > 0) {
            const lookupItem = param.lookupTable.find(item => item.option === fieldValue)
            value = lookupItem ? parseFloat(lookupItem.value) || 0 : 0
          } else {
            // Direct form value for fields without lookup
            value = parseFloat(fieldValue) || 0
          }
        }
        
        paramValues[param.id] = value
      }
    })

    // Evaluate formula with comprehensive math functions
    let formula = settings.formula.replace(/^=/, '') // Remove leading =
    
    // Replace parameter IDs with actual values
    Object.keys(paramValues).forEach(paramId => {
      const regex = new RegExp(`\\b${paramId}\\b`, 'g')
      formula = formula.replace(regex, paramValues[paramId])
    })

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
      
      return Number(result) || 0
    } catch (evalError) {
      console.error('Formula evaluation error:', evalError, 'Formula:', formula)
      return quote.price || 0
    }
    
  } catch (e) {
    console.error('Price calculation error:', e)
    return quote.price || 0
  }
}